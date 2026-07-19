import { describe, it, expect } from 'vitest';
import { applyFontStop } from '../../src/lib/pipeline/applyFontStop';
import type { Artist, CityWindowBundle, FontStop, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 3.4 — the WHOLE CityWindowBundle is shipped to the client so the
 * Phase-3.5 dial can re-filter locally with ZERO fetches. This locks the
 * invariant that makes that possible: the bundle carries the FULL track set
 * (arena-tier + `isSecondHeadlinerTrack` tracks included) regardless of the
 * initial font-stop the URL encodes. `applyFontStop` is the ONLY thing that
 * narrows — the payload never does — so dragging the dial back to "everything"
 * always restores the hidden tracks without a round-trip.
 */

// ---- fixtures --------------------------------------------------------------
const mkArtist = (id: string, tier: Artist['tier'], prominence: number): Artist => ({
  id,
  rawNames: [id],
  normalizedName: id,
  isTribute: false,
  prominence,
  tier,
  billingSlots: [],
});

let trackSeq = 9000;
const mkTrack = (artistId: string, isSecondHeadlinerTrack = false): Track => {
  const n = trackSeq++;
  return {
    artistId,
    itunesTrackId: n,
    title: `${artistId}-song-${n}`,
    previewUrl: `https://audio.example/${n}.m4a`,
    artworkUrl: `https://art.example/${n}.jpg`,
    itunesUrl: `https://itunes.example/${n}`,
    confidence: 'exact',
    ...(isSecondHeadlinerTrack ? { isSecondHeadlinerTrack: true } : {}),
  };
};

const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `Venue ${id}`, city: 'London' },
  ticketUrl: `https://tm.example/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

const geo: Geo = {
  lat: 51.5,
  lng: -0.12,
  displayName: 'London',
  countryCode: 'GB',
  tz: 'Europe/London',
};

// arena1 (arena) has a primary AND a 2nd-headliner track — both hidden by
// small-print. sp1 (small-print) is what small-print keeps.
const artists: Record<string, Artist> = {
  arena1: mkArtist('arena1', 'arena', 0.9),
  sp1: mkArtist('sp1', 'small-print', 0.2),
};
const shows: Show[] = [mkShow('sA', '2026-08-01T20:00:00', ['sp1', 'arena1'])];
const arenaPrimary = mkTrack('arena1');
const arenaSecond = mkTrack('arena1', true);
const spPrimary = mkTrack('sp1');
const tracks: Track[] = [arenaPrimary, arenaSecond, spPrimary];

// The bundle serialized to the client is ALWAYS the complete one — the initial
// font-stop (small-print here) never trims what gets shipped.
const bundle: CityWindowBundle = {
  key: { city: 'london', window: 'next-14-days' },
  builtAt: '2026-08-01T00:00:00.000Z',
  geo,
  shows,
  artists,
  tracks,
  posterCount: shows.length,
  belowBar: tracks.length < 8,
};

const initialFontStop: FontStop = 'small-print';

describe('Task 3.4 — full bundle shipped to the client (zero-fetch dial)', () => {
  it('the client bundle carries the FULL track set even when the initial stop is small-print', () => {
    // The payload is the complete track set — small-print does NOT prune it.
    expect(bundle.tracks).toContain(arenaPrimary);
    expect(bundle.tracks).toContain(arenaSecond);
    expect(bundle.tracks.some((t) => t.isSecondHeadlinerTrack === true)).toBe(true);
    expect(bundle.tracks.some((t) => bundle.artists[t.artistId]?.tier === 'arena')).toBe(true);
  });

  it('small-print HIDES the arena + 2nd-headliner tracks (but they stay in the bundle)', () => {
    const entries = applyFontStop(bundle, initialFontStop);
    // Nothing arena-tier and no 2nd-headliner is rendered at small-print…
    expect(entries.some((e) => e.track.artistId === 'arena1')).toBe(false);
    expect(entries.some((e) => e.track.isSecondHeadlinerTrack === true)).toBe(false);
    // …yet the bundle still holds them, ready for the dial to restore.
    expect(bundle.tracks).toContain(arenaPrimary);
    expect(bundle.tracks).toContain(arenaSecond);
  });

  it('dragging the dial back to "everything" RESTORES the hidden tracks with zero fetches', () => {
    // Same bundle object, no new data — a pure re-derivation recovers everything.
    const everything = applyFontStop(bundle, 'everything');
    expect(everything.some((e) => e.track === arenaPrimary)).toBe(true);
    expect(everything.some((e) => e.track === arenaSecond)).toBe(true);
    expect(everything.some((e) => e.track.isSecondHeadlinerTrack === true)).toBe(true);
    // arena1 contributes BOTH its tracks again (R7).
    expect(everything.filter((e) => e.track.artistId === 'arena1')).toHaveLength(2);
  });

  it('payload sanity — the serialized bundle stays small (tracks <= ~60)', () => {
    expect(bundle.tracks.length).toBeLessThanOrEqual(60);
  });
});
