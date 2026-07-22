import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import { TASTE_STORAGE_KEY } from '../../src/hooks/useTasteMemory';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Hearted Shelf step 3 — the shelf mounted behind the dock heart, wired to the
 * screen's audio.
 *
 * Locks the two audio invariants the design insists on:
 *   1. OPENING the shelf never touches the main audio element — the radio keeps
 *      playing behind the overlay.
 *   2. PLAYING a shelf preview pauses the main radio (the `onWillPlay` wiring),
 *      because two previews at once is noise, not a feature.
 * Plus the round trip: stubs render from taste memory, and an in-shelf unheart
 * empties the shelf, the dock count and the row heart together.
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

// ---- fixtures (mirrors playlistScreenHearts.test.tsx) ----------------------
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
const tracks: Track[] = [mkTrack('a1', 1), mkTrack('a2', 2)];
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

/** Heart ALPHA's row, then open the shelf via the dock heart. */
function heartAndOpen() {
  fireEvent.click(screen.getByRole('button', { name: 'Heart ALPHA — a1-title-1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Your hearted songs (1)' }));
  return screen.getByRole('dialog', { name: 'Your hearted songs' });
}

describe('PlaylistScreen — the Hearted shelf (step 3)', () => {
  it('the dock heart opens the shelf with stubs from taste memory; ✕ closes it', () => {
    renderScreen();
    const dialog = heartAndOpen();

    // The stub renders the stored snapshot — title, gig venue, tour link.
    expect(within(dialog).getByText('YOUR HEARTED')).toBeTruthy();
    expect(within(dialog).getByText('a1-title-1')).toBeTruthy();
    const gig = within(dialog)
      .getAllByRole('link')
      .find((a) => a.getAttribute('href') === 'https://t/s1');
    expect(gig?.textContent).toContain('V-S1');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: 'Your hearted songs' })).toBeNull();
  });

  it('opening the shelf never touches the main radio; a shelf preview pauses it', () => {
    renderScreen();

    // Start the main radio from ALPHA's row.
    fireEvent.click(screen.getByRole('button', { name: 'Play preview of ALPHA' }));
    expect(
      screen
        .getByRole('button', { name: 'Play preview of ALPHA' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    // Opening the shelf leaves it playing (invariant 1).
    const dialog = heartAndOpen();
    expect(
      screen
        .getByRole('button', { name: 'Play preview of ALPHA' })
        .getAttribute('aria-pressed'),
    ).toBe('true');

    // A shelf preview pauses the main radio (invariant 2 — onWillPlay wiring).
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Play ALPHA — a1-title-1' }),
    );
    expect(
      screen
        .getByRole('button', { name: 'Play preview of ALPHA' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('global Space/N shortcuts go deaf while the shelf is open — nothing drives the radio behind the modal', () => {
    renderScreen();
    const dialog = heartAndOpen();

    // Space with focus fallen to <body> (post-unheart, or a stray click on
    // inert sheet content) must NOT start the radio behind the aria-modal shelf.
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();

    // N / ArrowRight must not skip the hidden radio — and must not record a
    // phantom taste-skip for an artist the user never interacted with.
    fireEvent.keyDown(document.body, { key: 'n' });
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('ALPHA');
    const stored = JSON.parse(
      window.localStorage.getItem(TASTE_STORAGE_KEY) as string,
    );
    expect(stored.skipped).toEqual([]);

    // Closing the shelf re-arms the shortcuts.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
  });

  it('the dock heart is a 44px touch target, like every other control in the feature', () => {
    renderScreen();
    const heart = screen.getByRole('button', { name: 'Your hearted songs (0)' });
    expect(heart.style.minWidth).toBe('44px');
    expect(heart.style.minHeight).toBe('44px');
  });

  it('an in-shelf unheart empties the shelf, the dock count and the row heart together', () => {
    renderScreen();
    const dialog = heartAndOpen();

    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Unheart ALPHA — a1-title-1' }),
    );

    // Shelf → empty state; dock → honest zero; row heart → un-hearted again.
    expect(
      within(dialog).getByText('Heart a song on the bill and it’s kept here — with its gig.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Your hearted songs (0)' })).toBeTruthy();
    expect(
      screen
        .getByRole('button', { name: 'Heart ALPHA — a1-title-1' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
