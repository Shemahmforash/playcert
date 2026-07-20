import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, act } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 4.7 — the Lineup Poster trigger + peel. A 500ms long-press (early release
 * cancels) OR a plain click on the poster icon button opens the poster overlay;
 * the audio + player bar stay mounted; ✕ closes and returns focus to the trigger.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  vi.useFakeTimers();
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

// ---- fixture ---------------------------------------------------------------
const mkArtist = (id: string, name: string, prominence: number): Artist => ({
  id,
  rawNames: [name],
  normalizedName: name,
  isTribute: false,
  prominence,
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
  venue: { name: `V-${id}`, city: 'London' },
  ticketUrl: `https://t/${id}`,
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

const artists: Record<string, Artist> = {
  a1: mkArtist('a1', 'ALPHA', 1),
  a2: mkArtist('a2', 'BETA', 0.4),
};
const bundle: CityWindowBundle = {
  key: { city: 'london', window: 'tonight' },
  builtAt: '2026-07-20T00:00:00.000Z',
  geo,
  shows: [mkShow('s1', '2026-07-20T20:00:00Z', ['a1', 'a2'])],
  artists,
  tracks: [mkTrack('a1', 1), mkTrack('a2', 2)],
  posterCount: 1,
  belowBar: true,
};

function renderScreen() {
  let utils!: ReturnType<typeof render>;
  act(() => {
    utils = render(
      <PlaylistScreen bundle={bundle} fontStop="everything" city="london" window="tonight" />,
    );
  });
  return utils;
}

const trigger = () => screen.getByRole('button', { name: /make a poster/i });
const posterQuery = () => screen.queryByRole('dialog', { name: /london week fest/i });

describe('Lineup Poster trigger + peel (Task 4.7)', () => {
  it('release BEFORE 500ms does NOT open the poster', () => {
    renderScreen();
    const btn = trigger();

    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(400);
    });
    fireEvent.pointerUp(btn); // released early → the timer is cancelled
    act(() => {
      vi.advanceTimersByTime(400); // even past the original 500ms, nothing opens
    });

    expect(posterQuery()).toBeNull();
  });

  it('holding ≥500ms opens the poster', () => {
    renderScreen();
    const btn = trigger();

    fireEvent.pointerDown(btn);
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(posterQuery()).not.toBeNull();
  });

  it('a plain click on the icon button opens the poster directly', () => {
    renderScreen();
    fireEvent.click(trigger());
    expect(posterQuery()).not.toBeNull();
  });

  it('the audio element + player bar stay mounted while the poster is open', () => {
    const { container } = renderScreen();
    expect(container.querySelector('audio')).not.toBeNull();

    fireEvent.click(trigger());

    // Poster is open, yet the radio's <audio> and the player toggle persist.
    expect(posterQuery()).not.toBeNull();
    expect(container.querySelector('audio')).not.toBeNull();
    expect(screen.getByRole('button', { name: /cueing/i })).toBeTruthy();
  });

  it('✕ closes the poster and returns focus to the trigger', () => {
    renderScreen();
    const btn = trigger();

    fireEvent.click(btn);
    expect(posterQuery()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /close poster/i }));

    expect(posterQuery()).toBeNull();
    expect(document.activeElement).toBe(btn);
  });
});
