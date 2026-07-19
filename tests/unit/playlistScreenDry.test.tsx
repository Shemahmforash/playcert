import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 3.7 — the "Small Print runs dry" notice wired into PlaylistScreen.
 *
 * Locks:
 *   1. At small-print with a DRY bundle (whole bill >= 8 shows, small-print < 8),
 *      the notice renders and its "try No Arenas" button drives
 *      handleDialChange('no-arenas'): the URL pushState moves off small-print to
 *      /city/window/no-arenas AND the list changes (arena rows return).
 *   2. At everything / no-arenas the notice is absent.
 *   3. A genuinely-quiet bundle (whole bill < 8) at small-print shows NO notice.
 */

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => {
  cleanup();
  push.mockReset();
  vi.restoreAllMocks();
});

// ---- fixtures --------------------------------------------------------------
const mkArtist = (id: string, name: string, tier: Artist['tier']): Artist => ({
  id,
  rawNames: [name],
  normalizedName: name,
  isTribute: false,
  prominence: tier === 'arena' ? 0.95 : 0.2,
  tier,
  billingSlots: [],
});
const mkTrack = (artistId: string, n: number): Track => ({
  artistId,
  itunesTrackId: n,
  title: `${artistId}-title-${n}`,
  previewUrl: `https://audio.example/${n}.m4a`,
  artworkUrl: `https://art.example/${n}.jpg`,
  itunesUrl: `https://itunes.example/${n}`,
  confidence: 'exact',
});
const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `V-${id}`, city: 'Lisboa' },
  ticketUrl: `https://t/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});
const geo: Geo = {
  lat: 38.72,
  lng: -9.14,
  displayName: 'Lisboa',
  countryCode: 'PT',
  tz: 'Europe/Lisbon',
};

/**
 * `nArena` arena-headliner shows + `nSmall` small-print shows, one artist/track
 * per show. Small Print keeps only the small-print shows; Everything keeps all.
 */
const mkMix = (nArena: number, nSmall: number): CityWindowBundle => {
  const artists: Record<string, Artist> = {};
  const shows: Show[] = [];
  const tracks: Track[] = [];
  let day = 1;
  let n = 1;
  for (let i = 0; i < nArena; i++) {
    const id = `arena${i}`;
    artists[id] = mkArtist(id, `ARENA${i}`, 'arena');
    shows.push(mkShow(`A${i}`, `2026-08-${String(day++).padStart(2, '0')}T20:00:00`, [id]));
    tracks.push(mkTrack(id, n++));
  }
  for (let i = 0; i < nSmall; i++) {
    const id = `sp${i}`;
    artists[id] = mkArtist(id, `OPENER${i}`, 'small-print');
    shows.push(mkShow(`S${i}`, `2026-08-${String(day++).padStart(2, '0')}T20:00:00`, [id]));
    tracks.push(mkTrack(id, n++));
  }
  return {
    key: { city: 'lisbon', window: 'tonight' },
    builtAt: '2026-08-01T00:00:00.000Z',
    geo,
    shows,
    artists,
    tracks,
    posterCount: shows.length,
    belowBar: tracks.length < 8,
  };
};

const DRY_NOTICE = 'Small Print runs dry here —';

describe('PlaylistScreen — Small Print runs dry notice (Task 3.7)', () => {
  it('at small-print (dry bundle) the notice renders and its button moves the dial to No Arenas', () => {
    const bundle = mkMix(6, 3); // everything = 9 shows; small-print = 3 shows → dry
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    render(
      <PlaylistScreen bundle={bundle} fontStop="small-print" city="lisbon" window="tonight" />,
    );

    // Notice is present; arena rows are filtered out at small-print.
    expect(screen.getByText(DRY_NOTICE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Play preview of ARENA0' })).toBeNull();

    // One tap on the real button → handleDialChange('no-arenas').
    fireEvent.click(screen.getByRole('button', { name: 'try No Arenas' }));

    // Dial moved off small-print, canonical pushState to /…/no-arenas.
    expect(pushStateSpy).toHaveBeenCalled();
    const lastPath = pushStateSpy.mock.calls.at(-1)?.[2];
    expect(lastPath).toBe('/lisbon/tonight/no-arenas');
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('1');

    // The list changed: arena rows are back, and the notice is gone.
    expect(screen.getByRole('button', { name: 'Play preview of ARENA0' })).toBeTruthy();
    expect(screen.queryByText(DRY_NOTICE)).toBeNull();

    // No fetch/navigation for a stop change.
    expect(push).not.toHaveBeenCalled();
  });

  it('the notice is absent at everything and at no-arenas even for a dry bundle', () => {
    const bundle = mkMix(6, 3);
    render(
      <PlaylistScreen bundle={bundle} fontStop="everything" city="lisbon" window="tonight" />,
    );
    expect(screen.queryByText(DRY_NOTICE)).toBeNull();

    cleanup();
    render(
      <PlaylistScreen bundle={bundle} fontStop="no-arenas" city="lisbon" window="tonight" />,
    );
    expect(screen.queryByText(DRY_NOTICE)).toBeNull();
  });

  it('a genuinely-quiet bundle at small-print shows NO dry notice', () => {
    const quiet = mkMix(4, 1); // everything = 5 shows (< 8) → quiet, not dry
    render(
      <PlaylistScreen bundle={quiet} fontStop="small-print" city="lisbon" window="tonight" />,
    );
    expect(screen.queryByText(DRY_NOTICE)).toBeNull();
  });

  it('when small-print empties the bill to 0 rows the notice still surfaces the escape hatch', () => {
    const allArena = mkMix(9, 0); // everything = 9 shows; small-print = 0 rows → dry + empty
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    render(
      <PlaylistScreen bundle={allArena} fontStop="small-print" city="lisbon" window="tonight" />,
    );

    // Empty list, but the actionable escape hatch is shown (not just the bare fallback).
    expect(screen.getByText(DRY_NOTICE)).toBeTruthy();
    const btn = screen.getByRole('button', { name: 'try No Arenas' });

    fireEvent.click(btn);
    const lastPath = pushStateSpy.mock.calls.at(-1)?.[2];
    expect(lastPath).toBe('/lisbon/tonight/no-arenas');
  });
});
