import { describe, it, expect, vi } from 'vitest';
import { buildBundle, buildBundleCached, type BuildDeps } from '../../src/lib/pipeline/buildBundle';
import { bundleCacheProfile } from '../../src/lib/cache';
import type { Artist, Show, Track } from '../../src/lib/types';

const geo = { lat: 41.55, lng: -8.42, displayName: 'Braga', countryCode: 'PT', tz: 'Europe/Lisbon' };

// A show with attractions in billed order (slot 0 = opener … last = headliner).
const mkShow = (id: string, startsAt: string, acts: string[]): Show => ({
  id,
  name: acts.join(' + '),
  startsAt,
  venue: { name: 'V', city: 'Braga' },
  ticketUrl: `https://tm/${id}`,
  attractions: acts.map((name, i) => ({ id: `${id}-${i}`, name })),
  artistIds: [],
});

// Minimal fake track for an artist.
const trackFor = (a: Artist): Track => ({
  artistId: a.id,
  itunesTrackId: Math.abs(hash(a.id)),
  title: `${a.normalizedName} hit`,
  previewUrl: 'p',
  artworkUrl: 'aw',
  itunesUrl: 'iu',
  confidence: 'exact',
});

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);

// Real extractor is deterministic; import it so slugs match the resolution keying.
import { extractArtists } from '../../src/lib/pipeline/extractArtists';

const baseDeps = (over: Partial<BuildDeps> = {}): BuildDeps => ({
  geocode: async () => geo,
  fetchShows: async () => ({ shows: [] }),
  extract: extractArtists,
  resolveArtist: async (a) => [trackFor(a)],
  now: () => 1_000,
  ...over,
});

describe('buildBundle (R3/R4)', () => {
  it('resolves in (show.startsAt, slot) ascending order — first gig first, opener before headliner', async () => {
    // Two gigs. Earlier gig (10:00) has [openerA, headlinerA]; later gig (20:00) has [openerB, headlinerB].
    const shows = [
      mkShow('tm:late', '2026-07-20T20:00:00Z', ['Opener B', 'Headliner B']),
      mkShow('tm:early', '2026-07-20T10:00:00Z', ['Opener A', 'Headliner A']),
    ];
    const seen: string[] = [];
    const deps = baseDeps({
      fetchShows: async () => ({ shows }),
      resolveArtist: async (a) => {
        seen.push(a.id);
        return [trackFor(a)];
      },
    });
    await buildBundle('braga', 'tonight', deps);
    expect(seen).toEqual(['opener-a', 'headliner-a', 'opener-b', 'headliner-b']);
  });

  it('stops resolving once the 25s budget is exceeded → partial bundle + belowBar', async () => {
    const shows = [
      mkShow('tm:1', '2026-07-20T10:00:00Z', ['A1', 'A2']),
      mkShow('tm:2', '2026-07-20T11:00:00Z', ['B1', 'B2']),
      mkShow('tm:3', '2026-07-20T12:00:00Z', ['C1', 'C2']),
    ];
    const start = 1_000;
    let calls = 0;
    // Clock: within budget until two artists have resolved, then jumps past the budget.
    const now = vi.fn(() => (calls < 2 ? start : start + 25_001));
    const resolveArtist = vi.fn(async (a: Artist) => {
      calls++;
      return [trackFor(a)];
    });
    const deps = baseDeps({ fetchShows: async () => ({ shows }), resolveArtist, now });
    const bundle = await buildBundle('braga', 'tonight', deps);
    // 6 artists total; only the first two resolved before the clock blew the budget.
    expect(resolveArtist).toHaveBeenCalledTimes(2);
    expect(bundle.tracks.length).toBe(2);
    expect(bundle.belowBar).toBe(true);
    expect(bundle.posterCount).toBe(3);
  });

  it('bundleCacheProfile matches belowBar: 120s degraded for partial, 3600s for full', async () => {
    // Partial bundle (2 tracks).
    const partial = await buildBundle('braga', 'tonight', baseDeps({
      fetchShows: async () => ({ shows: [mkShow('tm:1', '2026-07-20T10:00:00Z', ['X', 'Y'])] }),
    }));
    expect(partial.belowBar).toBe(true);
    expect(bundleCacheProfile(partial.tracks.length)).toEqual({ revalidate: 21_600 });

    // Full bundle (8 acts → 8 tracks).
    const eight = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const full = await buildBundle('braga', 'tonight', baseDeps({
      fetchShows: async () => ({ shows: [mkShow('tm:big', '2026-07-20T10:00:00Z', eight)] }),
    }));
    expect(full.tracks.length).toBe(8);
    expect(full.belowBar).toBe(false);
    expect(bundleCacheProfile(full.tracks.length)).toEqual({ revalidate: 86_400 });
  });

  it('buildBundleCached coalesces concurrent calls for the same key into ONE build', async () => {
    const shows = [
      mkShow('tm:1', '2026-07-20T10:00:00Z', ['A1', 'A2', 'A3']),
      mkShow('tm:2', '2026-07-20T11:00:00Z', ['B1', 'B2']),
    ];
    const resolveArtist = vi.fn(async (a: Artist) => {
      await new Promise((r) => setTimeout(r, 5)); // keep the build in-flight so both callers coalesce
      return [trackFor(a)];
    });
    const deps = baseDeps({ fetchShows: async () => ({ shows }), resolveArtist });
    const [b1, b2] = await Promise.all([
      buildBundleCached('braga', 'tonight', deps),
      buildBundleCached('braga', 'tonight', deps),
    ]);
    expect(b1).toBe(b2); // same promise result → same object
    // 5 artists in ONE build; a doubled build would be 10.
    expect(resolveArtist).toHaveBeenCalledTimes(5);
  });

  it('scores prominence/tier from OBJECTIVE billing order (headliner → arena, opener → small-print)', async () => {
    // One 2-act show: opener (slot 0) + headliner (slot 1, top slot). Prominence
    // comes straight from the billed order via the real extract + scoreArtists —
    // no signals injected.
    const shows = [mkShow('tm:1', '2026-07-20T20:00:00Z', ['Opener', 'Headliner'])];
    const bundle = await buildBundle('braga', 'tonight', baseDeps({ fetchShows: async () => ({ shows }) }));
    const headliner = bundle.artists['headliner'];
    const opener = bundle.artists['opener'];
    expect(headliner.prominence).toBe(1); // top of the bill
    expect(headliner.tier).toBe('arena');
    expect(opener.prominence).toBe(0); // bottom of the bill
    expect(opener.tier).toBe('small-print');
  });
});
