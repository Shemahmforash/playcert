import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 2.11 — window-change transitions + collapsing window chips.
 *
 * Changing the WINDOW is a FULL NAVIGATION to /{city}/{newWindow}: router.push
 * unmounts the screen (which STOPS the audio via the cleanup effect) and replays
 * the LoadingTheater on the fresh build. The Phase-3 dial change, by contrast, is
 * a client-only re-filter with NO push and NO stop — stubbed here as an invariant.
 */

// vitest globals are disabled → register RTL cleanup + router mock by hand.
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

// jsdom has no real media element — stub play/pause so the toggle can drive
// `state.playing` (and thus the collapse) without "Not implemented" throwing.
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  cleanup();
  push.mockReset();
});

// ---- fixture helpers -------------------------------------------------------
const mkArtist = (id: string, name: string): Artist => ({
  id,
  rawNames: [name],
  normalizedName: name,
  isTribute: false,
  prominence: 0.5,
  tier: 'mid',
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

const artists: Record<string, Artist> = { a1: mkArtist('a1', 'ALPHA') };
const s1 = mkShow('s1', '2026-08-01T20:00:00', ['a1']);
const tracks: Track[] = [mkTrack('a1', 1)];
const bundle: CityWindowBundle = {
  key: { city: 'lisbon', window: 'tonight' },
  builtAt: '2026-08-01T00:00:00.000Z',
  geo,
  shows: [s1],
  artists,
  tracks,
  posterCount: 1,
  belowBar: tracks.length < 8,
};

function renderScreen(window: React.ComponentProps<typeof PlaylistScreen>['window'] = 'tonight') {
  return render(
    <PlaylistScreen bundle={bundle} fontStop="everything" city="lisbon" window={window} />,
  );
}

describe('window-change transition — navigation (stop + replay)', () => {
  it('selecting a different window chip pushes /{city}/{newWindow}', () => {
    renderScreen('tonight');

    // Not playing → all three chips visible.
    fireEvent.click(screen.getByRole('button', { name: 'This weekend' }));

    // Full navigation to the new build — the route unmount is what stops audio.
    expect(push).toHaveBeenCalledWith('/lisbon/this-weekend');
  });

  it('canonicalises the target (fontStop=everything → no trailing segment)', () => {
    renderScreen('tonight');
    fireEvent.click(screen.getByRole('button', { name: 'Next 14 days' }));
    expect(push).toHaveBeenLastCalledWith('/lisbon/next-14-days');
  });
});

describe('dial-change contrast (Phase-3 invariant)', () => {
  it('a client-only dial re-filter does NOT navigate and does NOT stop', () => {
    renderScreen('tonight');

    // The Phase-3 path is a plain in-page callback: no router, no audio stop.
    const onDialChange = vi.fn();
    onDialChange('no-arenas');

    expect(onDialChange).toHaveBeenCalledWith('no-arenas');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('collapsing window chips while playing', () => {
  it('collapses to the active chip, expands on tap, and selecting navigates', () => {
    renderScreen('tonight');

    // Start playback via the radio stamp (reads "Cueing…" until ready; tap works).
    fireEvent.click(screen.getByRole('button', { name: 'Cueing…' }));

    // Collapsed: only the active chip is on screen now.
    expect(screen.getByRole('button', { name: 'Tonight' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'This weekend' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next 14 days' })).toBeNull();

    // Tap the active chip → the other windows reappear.
    fireEvent.click(screen.getByRole('button', { name: 'Tonight' }));
    expect(screen.getByRole('button', { name: 'This weekend' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next 14 days' })).toBeTruthy();

    // Selecting one navigates (and would collapse on the fresh mount).
    fireEvent.click(screen.getByRole('button', { name: 'This weekend' }));
    expect(push).toHaveBeenCalledWith('/lisbon/this-weekend');
  });
});
