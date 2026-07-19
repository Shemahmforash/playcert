import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 3.6 — the dial rebuild choreography wired into PlaylistScreen.
 *
 * Locks: (1) a SURVIVING playing track keeps the SAME <audio> src (uninterrupted)
 * across a stop change; (2) a filtered-out playing current RETARGETS to the
 * nearest following survivor; (3) the polite live region shows "Rebuilding: …"
 * then "{n} tracks, {m} shows."; (4) exit rows carry the collapse class during
 * the window and are gone after the settle timer; (5) reduced motion adds no
 * travel class.
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
  // Ensure no reduced-motion stub leaks into the next test.
  // @ts-expect-error — jsdom has no matchMedia by default; remove any stub.
  delete window.matchMedia;
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
  sp1: mkArtist('sp1', 'OPENERONE', 'small-print'),
  sp2: mkArtist('sp2', 'OPENERTWO', 'small-print'),
};
const shows: Show[] = [
  mkShow('sA', '2026-08-01T20:00:00', ['arena1']),
  mkShow('sB', '2026-08-02T20:00:00', ['sp1']),
  mkShow('sC', '2026-08-03T20:00:00', ['sp2']),
];
const tracks: Track[] = [mkTrack('arena1', 1), mkTrack('sp1', 2), mkTrack('sp2', 3)];
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
  posterCount: 3,
  belowBar: tracks.length < 8,
};

// everything order → [ARENABAND(0), OPENERONE(1), OPENERTWO(2)].
// small-print    → [OPENERONE(0), OPENERTWO(1)] (arena dropped).
const SP1_URL = 'https://audio.example/2.m4a';

function renderScreen() {
  return render(
    <PlaylistScreen bundle={bundle} fontStop="everything" city="lisbon" window="tonight" />,
  );
}

function audioEl(container: HTMLElement): HTMLAudioElement {
  const el = container.querySelector('audio');
  if (!el) throw new Error('no <audio> element rendered');
  return el as HTMLAudioElement;
}

describe('PlaylistScreen rebuild — playback continuity (real timers)', () => {
  it('a SURVIVING playing track keeps the same <audio> src across the rebuild', () => {
    const { container } = renderScreen();

    // Start playback on OPENERONE (index 1) — a track that survives small-print.
    fireEvent.click(screen.getByRole('button', { name: 'Play preview of OPENERONE' }));
    expect(audioEl(container).getAttribute('src')).toBe(SP1_URL);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy(); // playing

    // Land the dial on Small Print — ARENABAND is filtered out, OPENERONE survives.
    fireEvent.click(screen.getByText('SMALL PRINT'));

    // Same source → the element never reloaded → playback uninterrupted.
    expect(audioEl(container).getAttribute('src')).toBe(SP1_URL);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('a FILTERED-OUT playing current retargets to the nearest following survivor', () => {
    const { container } = renderScreen();

    // Play ARENABAND (index 0) — it will be filtered out at small-print.
    fireEvent.click(screen.getByRole('button', { name: 'Play preview of ARENABAND' }));

    fireEvent.click(screen.getByText('SMALL PRINT'));

    // Needle moved to the nearest following survivor OPENERONE (its src).
    expect(audioEl(container).getAttribute('src')).toBe(SP1_URL);
    // Still playing (retarget carried playing:true).
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });
});

describe('PlaylistScreen rebuild — announcement + exit collapse (fake timers)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('announces "Rebuilding: …" then the settled tally, and collapses exit rows then unmounts them', () => {
    const { container } = renderScreen();

    act(() => {
      fireEvent.click(screen.getByText('SMALL PRINT'));
    });

    // Step 1 announcement fires immediately on landing.
    const live = screen.getByTestId('rebuild-live');
    expect(live.textContent).toBe('Rebuilding: Small Print.');

    // The removed arena row is a collapsing ghost during the window.
    const ghost = container.querySelector('.sf-row-collapse');
    expect(ghost).toBeTruthy();
    expect(ghost?.textContent).toContain('ARENABAND');
    // …and it is inert (aria-hidden, not a queryable button).
    expect(screen.queryByRole('button', { name: 'Play preview of ARENABAND' })).toBeNull();

    // Advance past both the settle (320ms) and the announce step-2 (450ms).
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // Exit ghost unmounted; final tally announced (2 tracks across 2 shows).
    expect(container.querySelector('.sf-row-collapse')).toBeNull();
    expect(screen.getByTestId('rebuild-live').textContent).toBe('2 tracks, 2 shows.');
  });
});

describe('PlaylistScreen rebuild — reduced motion (no travel class)', () => {
  beforeEach(() => {
    // Stub prefers-reduced-motion: reduce.
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  });

  it('exit rows cross-fade in place (sf-row-fade) with no shrink-collapse or drop travel', () => {
    const { container } = renderScreen();

    fireEvent.click(screen.getByText('SMALL PRINT'));

    // Fade ghost present; neither the collapse-travel nor the drop-thud class is used.
    expect(container.querySelector('.sf-row-fade')).toBeTruthy();
    expect(container.querySelector('.sf-row-collapse')).toBeNull();
    expect(container.querySelector('.sf-row-drop')).toBeNull();
  });
});
