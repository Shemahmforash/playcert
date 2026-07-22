import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import { TASTE_STORAGE_KEY } from '../../src/hooks/useTasteMemory';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Hearted Shelf step 2 — per-song hearts wired through PlaylistScreen.
 *
 * Locks the three contract-critical behaviours of the wiring:
 *   1. A heart tap builds the FULL self-contained `HeartedSong` snapshot at
 *      heart-time (track + gig + artist name) and persists it under the v2
 *      key — the shelf must later render from storage with ZERO fetches.
 *   2. Hearts are keyed by `itunesTrackId`, NOT artistId: hearting one of an
 *      artist's two rows must not light up the other.
 *   3. The dock heart button ticks its count with every heart/unheart and
 *      keeps an honest aria-label; empty → no count.
 */

// vitest globals are disabled → register RTL cleanup + router mock by hand.
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

beforeEach(() => {
  window.localStorage.clear();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => {
  cleanup();
  push.mockReset();
  vi.restoreAllMocks();
});

// ---- fixtures --------------------------------------------------------------
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

const artists: Record<string, Artist> = {
  a1: mkArtist('a1', 'ALPHA'),
  a2: mkArtist('a2', 'BETA'),
};
const s1 = mkShow('s1', '2026-08-01T20:00:00', ['a1']);
const s2 = mkShow('s2', '2026-08-02T21:00:00', ['a2']);
// ALPHA carries TWO tracks on the same show (ids 1 and 3) — the per-song
// keying assertion needs an artist with more than one row on the bill.
const tracks: Track[] = [mkTrack('a1', 1), mkTrack('a1', 3), mkTrack('a2', 2)];
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
  shows: [s1, s2],
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

function storedSongs(): unknown[] {
  const raw = window.localStorage.getItem(TASTE_STORAGE_KEY);
  if (!raw) return [];
  return (JSON.parse(raw) as { heartedSongs: unknown[] }).heartedSongs;
}

describe('PlaylistScreen — per-song hearts (Hearted Shelf step 2)', () => {
  it('a heart tap stores the FULL HeartedSong snapshot under the v2 key, keyed per song', () => {
    renderScreen();

    // Heart ALPHA's FIRST track only.
    fireEvent.click(screen.getByRole('button', { name: 'Heart ALPHA — a1-title-1' }));

    // The tapped row is hearted…
    const hearted = screen.getByRole('button', { name: 'Unheart ALPHA — a1-title-1' });
    expect(hearted.getAttribute('aria-pressed')).toBe('true');
    // …but the SAME ARTIST's other row is not — hearts key on itunesTrackId.
    const sibling = screen.getByRole('button', { name: 'Heart ALPHA — a1-title-3' });
    expect(sibling.getAttribute('aria-pressed')).toBe('false');

    // Persisted: one snapshot, complete enough to survive the strict
    // isHeartedSong reload validator (every field, gig included).
    const songs = storedSongs();
    expect(songs).toHaveLength(1);
    expect(songs[0]).toMatchObject({
      itunesTrackId: 1,
      title: 'a1-title-1',
      artist: 'ALPHA',
      artistId: 'a1',
      previewUrl: 'https://audio.example/1.m4a',
      artworkUrl: 'https://art.example/1.jpg',
      itunesUrl: 'https://itunes.example/1',
      gig: {
        venue: 'V-s1',
        city: 'Lisboa',
        startsAt: '2026-08-01T20:00:00',
        ticketUrl: 'https://t/s1',
      },
    });
    // heartedAt is a real ISO timestamp captured at heart-time.
    const { heartedAt } = songs[0] as { heartedAt: string };
    expect(Number.isNaN(Date.parse(heartedAt))).toBe(false);

    // Re-tapping unhearts and clears storage (toggle by itunesTrackId).
    fireEvent.click(hearted);
    expect(
      screen.getByRole('button', { name: 'Heart ALPHA — a1-title-1' }).getAttribute('aria-pressed'),
    ).toBe('false');
    expect(storedSongs()).toHaveLength(0);
  });

  it('the dock heart ticks its count with every heart/unheart and stays quiet when empty', () => {
    renderScreen();

    // Empty: quiet outline, NO count, honest zero in the label.
    const dock = screen.getByRole('button', { name: 'Your hearted songs (0)' });
    expect(dock.textContent).toBe('');

    // Two hearts → count 2, in the riso-pink mono stamp.
    fireEvent.click(screen.getByRole('button', { name: 'Heart ALPHA — a1-title-1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Heart BETA — a2-title-2' }));
    const dock2 = screen.getByRole('button', { name: 'Your hearted songs (2)' });
    expect(dock2.textContent).toBe('2');
    const count = dock2.querySelector('span');
    expect(count?.style.color).toBe('var(--riso-pink)');

    // Unheart one → the count ticks back down.
    fireEvent.click(screen.getByRole('button', { name: 'Unheart BETA — a2-title-2' }));
    expect(screen.getByRole('button', { name: 'Your hearted songs (1)' }).textContent).toBe('1');
  });
});
