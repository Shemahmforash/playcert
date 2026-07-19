import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 3.5 — the EarshotDial wired into PlaylistScreen.
 *
 * Locks the two contract-critical behaviours of the wiring:
 *   1. Driving the dial to `small-print` PURELY re-derives `entries` (the
 *      arena-tier row drops) with ZERO fetches — `router.push` is never called
 *      for a stop change (it stays reserved for window navigation).
 *   2. The stop change updates the URL via `history.pushState` with a CANONICAL
 *      path — and `everything` is omitted from the path (R11).
 */

// vitest globals are disabled → register RTL cleanup + router mock by hand.
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

const artists: Record<string, Artist> = {
  arena1: mkArtist('arena1', 'ARENABAND', 'arena'),
  sp1: mkArtist('sp1', 'OPENERACT', 'small-print'),
};
const shows: Show[] = [
  mkShow('sA', '2026-08-01T20:00:00', ['arena1']),
  mkShow('sB', '2026-08-02T20:00:00', ['sp1']),
];
const tracks: Track[] = [mkTrack('arena1', 1), mkTrack('sp1', 2)];
const geo: Geo = {
  lat: 38.72,
  lng: -9.14,
  displayName: 'Lisboa',
  countryCode: 'PT',
  tz: 'Europe/Lisbon',
};
const bundle: CityWindowBundle = {
  key: { city: 'lisbon', window: 'tonight' },
  builtAt: '2026-08-01T00:00:00.000Z',
  geo,
  shows,
  artists,
  tracks,
  posterCount: 2,
  belowBar: tracks.length < 8,
};

function renderScreen() {
  return render(
    <PlaylistScreen bundle={bundle} fontStop="everything" city="lisbon" window="tonight" />,
  );
}

describe('PlaylistScreen — EarshotDial wiring (Task 3.5)', () => {
  it('driving the dial to small-print drops the arena row + pushState omits /everything, with NO fetch/navigation', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    renderScreen();

    // everything: both the arena row and the opener row are present.
    expect(
      screen.getByRole('button', { name: 'Play preview of ARENABAND' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Play preview of OPENERACT' }),
    ).toBeTruthy();

    // Drive the dial to Small Print via its detent label.
    fireEvent.click(screen.getByText('SMALL PRINT'));

    // The arena-tier row is re-derived OUT; the opener survives (fewer rows).
    expect(
      screen.queryByRole('button', { name: 'Play preview of ARENABAND' }),
    ).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Play preview of OPENERACT' }),
    ).toBeTruthy();

    // The dial reflects the new stop.
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('2');

    // URL updated via history.pushState to the canonical path — no /everything.
    expect(pushStateSpy).toHaveBeenCalledTimes(1);
    const path = pushStateSpy.mock.calls[0][2];
    expect(path).toBe('/lisbon/tonight/small-print');
    expect(String(path)).not.toContain('/everything');

    // ZERO fetch / navigation: the router is untouched for a stop change.
    expect(push).not.toHaveBeenCalled();
  });

  it('a popstate to a bare /city/window path walks the dial back to everything', () => {
    renderScreen();

    // Move off everything first.
    fireEvent.click(screen.getByText('SMALL PRINT'));
    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('2');

    // Simulate Back to the everything URL (no stop segment).
    window.history.pushState(null, '', '/lisbon/tonight');
    fireEvent(window, new PopStateEvent('popstate'));

    expect(screen.getByRole('slider').getAttribute('aria-valuenow')).toBe('0');
    expect(
      screen.getByRole('button', { name: 'Play preview of ARENABAND' }),
    ).toBeTruthy();
  });
});
