import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { RadioPlayer, type RadioPlayerProps } from '../../src/components/RadioPlayer';
import { TrackRow } from '../../src/components/TrackRow';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 2.12 — accessibility lock (design doc §4 "ACCESSIBILITY FLOOR").
 *
 * Asserts the binding a11y contract: player region + label, stateful controls
 * carry aria-pressed, the now-playing live region is polite while the marquee is
 * aria-hidden, hearts are stateful toggle buttons, the flip chip points at its
 * back face via aria-controls, and the global keyboard shortcuts (Space =
 * play/pause, N / → = skip) fire from the playlist screen.
 */

// vitest globals are disabled → register RTL cleanup + router mock by hand.
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// jsdom has no real media element — stub play/pause so toggle can drive state.
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => {
  cleanup();
  push.mockReset();
});

// ---- fixtures --------------------------------------------------------------
const show: Show = {
  id: 'tm:1',
  name: 'Khruangbin at EartH',
  startsAt: '2026-09-18T20:00:00',
  venue: { name: 'EartH', city: 'London' },
  ticketUrl: 'https://t/1',
  attractions: [{ id: 'khruangbin', name: 'Khruangbin' }],
  artistIds: ['khruangbin'],
};

function radioProps(overrides: Partial<RadioPlayerProps> = {}): RadioPlayerProps {
  return {
    track: { artist: 'Khruangbin', title: 'Talero' },
    show,
    playing: false,
    index: 0,
    total: 1,
    progress: 0,
    onToggle: () => {},
    onSkip: () => {},
    ...overrides,
  };
}

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
// applyFontStop('everything') orders these chronologically → ALPHA (index 0)
// then BETA (index 1), matching the keyboard-shortcut expectations below.
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

// ── Player semantics ────────────────────────────────────────────────────────
describe('a11y — RadioPlayer semantics', () => {
  it('exposes a labelled region', () => {
    render(<RadioPlayer {...radioProps()} />);
    expect(screen.getByRole('region', { name: 'Radio player' })).toBeTruthy();
  });

  it('play/pause stamp reflects state via aria-pressed', () => {
    const { rerender } = render(<RadioPlayer {...radioProps({ playing: false })} />);
    expect(screen.getByRole('button', { name: 'Play' }).getAttribute('aria-pressed')).toBe('false');
    rerender(<RadioPlayer {...radioProps({ playing: true })} />);
    expect(screen.getByRole('button', { name: 'Pause' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('announces track changes in a polite live region while the marquee is aria-hidden', () => {
    const { container } = render(<RadioPlayer {...radioProps()} />);
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Khruangbin');
    expect(live.textContent).toContain('Talero');

    // The scrolling marquee line is decorative → hidden from the a11y tree.
    const marquee = container.querySelector('[aria-hidden="true"]');
    expect(marquee).toBeTruthy();
    expect(
      Array.from(container.querySelectorAll('[aria-hidden="true"]')).some((el) =>
        el.textContent?.includes('Khruangbin — Talero'),
      ),
    ).toBe(true);
  });

  it('keeps the live sentence static across progress ticks (announces only at track boundaries)', () => {
    const { rerender } = render(<RadioPlayer {...radioProps({ index: 0, progress: 0 })} />);
    const before = screen.getByRole('status').textContent;
    rerender(<RadioPlayer {...radioProps({ index: 0, progress: 0.9 })} />);
    // Same track, later progress → identical sentence → no re-announcement.
    expect(screen.getByRole('status').textContent).toBe(before);
  });
});

// ── Row semantics ───────────────────────────────────────────────────────────
describe('a11y — TrackRow controls', () => {
  it('heart is a stateful toggle button (aria-pressed)', () => {
    const { rerender } = render(<TrackRow {...rowProps({ hearted: false })} />);
    const heart = screen.getByRole('button', { name: 'Heart ALPHA' });
    expect(heart.getAttribute('aria-pressed')).toBe('false');
    rerender(<TrackRow {...rowProps({ hearted: true })} />);
    expect(screen.getByRole('button', { name: 'Unheart ALPHA' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('play button is a stateful toggle button (aria-pressed)', () => {
    render(<TrackRow {...rowProps({ state: 'playing' })} />);
    expect(
      screen.getByRole('button', { name: 'Play preview of ALPHA' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('the flip chip declares aria-expanded and points at the back face via aria-controls', () => {
    render(<TrackRow {...rowProps()} />);
    const chip = screen.getByRole('button', { name: /V-S1/ });
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    const controls = chip.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    // aria-controls must resolve to a real element in the row.
    expect(document.getElementById(controls as string)).toBeTruthy();
  });
});

function rowProps(overrides: Partial<React.ComponentProps<typeof TrackRow>> = {}): React.ComponentProps<typeof TrackRow> {
  return {
    artist: 'ALPHA',
    title: 'a1-title-1',
    venue: 'V-S1',
    dateLabel: 'SAT 1',
    ticketUrl: 'https://t/s1',
    state: 'idle',
    ...overrides,
  };
}

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
describe('a11y — global keyboard shortcuts on the playlist screen', () => {
  it('Space toggles play/pause when focus is not in a text field', () => {
    renderScreen();
    // Starts paused (Cueing… until ready, but always the play control).
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();

    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    // Toggled → now the Pause control (aria-pressed true).
    const pause = screen.getByRole('button', { name: 'Pause' });
    expect(pause.getAttribute('aria-pressed')).toBe('true');

    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
  });

  it('N advances to the next track (skip)', () => {
    renderScreen();
    // index 0 → live sentence names track 1 of 2 (ALPHA).
    expect(screen.getByRole('status').textContent).toContain('ALPHA');
    fireEvent.keyDown(document.body, { key: 'n' });
    // Skip → index 1 → BETA now announced.
    expect(screen.getByRole('status').textContent).toContain('BETA');
  });

  it('ArrowRight advances to the next track (skip)', () => {
    renderScreen();
    expect(screen.getByRole('status').textContent).toContain('ALPHA');
    fireEvent.keyDown(document.body, { key: 'ArrowRight' });
    expect(screen.getByRole('status').textContent).toContain('BETA');
  });

  it('ignores Space typed into an input (no toggle)', () => {
    renderScreen();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(input, { key: ' ', code: 'Space' });
    expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull();
    input.remove();
  });
});
