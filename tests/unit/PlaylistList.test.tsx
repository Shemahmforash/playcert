import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistList } from '../../src/components/PlaylistList';
import type { PlaylistEntry } from '../../src/lib/pipeline/order';
import type { Artist, Show, Track } from '../../src/lib/types';

// vitest globals are disabled → register RTL cleanup by hand.
afterEach(cleanup);

// ---- fixture helpers -------------------------------------------------------
const mkArtist = (id: string, name: string, prominence = 0.5): Artist => ({
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
  venue: { name: `V-${id}`, city: 'Lisboa' },
  ticketUrl: `https://t/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

const artists: Record<string, Artist> = {
  a1: mkArtist('a1', 'ALPHA', 0.4),
  a2: mkArtist('a2', 'BETA', 0.7),
  a3: mkArtist('a3', 'GAMMA', 0.6),
  aOpen: mkArtist('aOpen', 'OPENER', 0.3),
  aHead: mkArtist('aHead', 'HEADLINER', 0.9),
};

// Two shows on 2026-08-01 (SAT 1), one on 2026-08-02 (SUN 2).
const s1 = mkShow('s1', '2026-08-01T20:00:00', ['a1']);
const s2 = mkShow('s2', '2026-08-01T22:00:00', ['a2']);
const s3 = mkShow('s3', '2026-08-02T21:00:00', ['a3']);

const entries: PlaylistEntry[] = [
  { track: mkTrack('a1', 1), show: s1, isEncore: false }, // index 0
  { track: mkTrack('a2', 2), show: s2, isEncore: false }, // index 1
  { track: mkTrack('a3', 3), show: s3, isEncore: false }, // index 2
];

function renderList(overrides: Partial<React.ComponentProps<typeof PlaylistList>> = {}) {
  return render(
    <PlaylistList
      entries={entries}
      artists={artists}
      currentIndex={-1}
      playing={false}
      city="lisbon"
      window="next-14-days"
      onPlayIndex={() => {}}
      {...overrides}
    />,
  );
}

describe('PlaylistList — structure', () => {
  it('renders a semantic <ol> with day dividers and rows in order', () => {
    const { container } = renderList();
    expect(container.querySelector('ol')).toBeTruthy();

    // Both day dividers present (the divider is the first cell of each day —
    // the labels also appear inside inert stub-back faces, so assert on text).
    expect(container.textContent).toContain('SAT 1');
    expect(container.textContent).toContain('SUN 2');

    // Rows render each artist's fame-line name (unique exact front-face text).
    expect(screen.getByText('ALPHA')).toBeTruthy();
    expect(screen.getByText('BETA')).toBeTruthy();
    expect(screen.getByText('GAMMA')).toBeTruthy();

    // Document order: SAT 1 → ALPHA → BETA → SUN 2 → GAMMA.
    const text = container.textContent ?? '';
    const order = ['SAT 1', 'ALPHA', 'BETA', 'SUN 2', 'GAMMA'].map((t) =>
      text.indexOf(t),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every((i) => i >= 0)).toBe(true);
  });
});

describe('PlaylistList — playback state mapping', () => {
  it('marks the row at currentIndex as playing when playing=true', () => {
    renderList({ currentIndex: 1, playing: true });
    const beta = screen.getByRole('button', { name: 'Play preview of BETA' });
    expect(beta.getAttribute('aria-pressed')).toBe('true');
    const alpha = screen.getByRole('button', { name: 'Play preview of ALPHA' });
    expect(alpha.getAttribute('aria-pressed')).toBe('false');
  });

  it('does not mark currentIndex playing when playing=false', () => {
    renderList({ currentIndex: 1, playing: false });
    const beta = screen.getByRole('button', { name: 'Play preview of BETA' });
    expect(beta.getAttribute('aria-pressed')).toBe('false');
  });

  it('dims already-played rows (index < currentIndex) to 60% opacity', () => {
    renderList({ currentIndex: 2, playing: true });
    expect(screen.getByText('ALPHA').style.opacity).toBe('0.6'); // 0 < 2
    expect(screen.getByText('BETA').style.opacity).toBe('0.6'); // 1 < 2
    expect(screen.getByText('GAMMA').style.opacity).not.toBe('0.6'); // 2 == current
  });
});

describe('PlaylistList — Play wiring', () => {
  it('calls onPlayIndex with the correct FLAT index for each row', () => {
    const onPlayIndex = vi.fn();
    renderList({ onPlayIndex });

    fireEvent.click(screen.getByRole('button', { name: 'Play preview of GAMMA' }));
    expect(onPlayIndex).toHaveBeenLastCalledWith(2);

    fireEvent.click(screen.getByRole('button', { name: 'Play preview of ALPHA' }));
    expect(onPlayIndex).toHaveBeenLastCalledWith(0);
  });
});

describe('PlaylistList — flip exclusivity (parent owns one-open-at-a-time)', () => {
  it('opening one row closes any other open row', () => {
    renderList();

    // Open ALPHA's gig chip (venue V-S1) → its Tickets link appears.
    fireEvent.click(screen.getByRole('button', { name: /V-S1/ }));
    let links = screen.getAllByRole('link', { name: /tickets/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://t/s1');

    // Open BETA's gig chip (venue V-S2) → ALPHA closes, only one stub open.
    fireEvent.click(screen.getByRole('button', { name: /V-S2/ }));
    links = screen.getAllByRole('link', { name: /tickets/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://t/s2');
  });
});

describe('PlaylistList — billing + same-bill derivation', () => {
  // A single show with an opener billed before the headliner (last id wins).
  const billShow = mkShow('sb', '2026-08-04T20:00:00', ['aOpen', 'aHead']);
  const billEntries: PlaylistEntry[] = [
    { track: mkTrack('aOpen', 10), show: billShow, isEncore: false }, // index 0
    { track: mkTrack('aHead', 11), show: billShow, isEncore: false }, // index 1
  ];

  it('bills the opener as "opening for {headliner}" and links the co-billed headliner', () => {
    const onPlayIndex = vi.fn();
    render(
      <PlaylistList
        entries={billEntries}
        artists={artists}
        currentIndex={-1}
        playing={false}
        city="lisbon"
        window="next-14-days"
        onPlayIndex={onPlayIndex}
      />,
    );
    // Both rows share show 'sb' (same venue chip); the opener bills first.
    fireEvent.click(screen.getAllByRole('button', { name: /V-SB/ })[0]);

    // Only the opener's back face reads "opening for" (headliner reads "— headlining").
    expect(screen.getByText(/opening for/i)).toBeTruthy();

    // The same-bill mini-row jumps to the co-billed headliner's FLAT index (1).
    const sameBill = screen.getByRole('button', { name: '▸ HEADLINER' });
    fireEvent.click(sameBill);
    expect(onPlayIndex).toHaveBeenLastCalledWith(1);
  });

  it('never lists an act as its own same-bill row (headliner 2nd track at Marquee)', () => {
    // One show, one artist, TWO tracks — exactly the Marquee 2nd-headliner-track
    // case. The same-bill list must be EMPTY, not a self-referential play row
    // (that stray full-width button sat right above Tickets and played the song).
    const soloShow = mkShow('solo', '2026-08-05T20:00:00', ['aHead']);
    const soloEntries: PlaylistEntry[] = [
      { track: mkTrack('aHead', 20), show: soloShow, isEncore: false },
      { track: mkTrack('aHead', 21), show: soloShow, isEncore: false },
    ];
    render(
      <PlaylistList
        entries={soloEntries}
        artists={artists}
        currentIndex={-1}
        playing={false}
        city="lisbon"
        window="next-14-days"
        onPlayIndex={vi.fn()}
      />,
    );
    // Flip the first row open, then assert there's no self same-bill button.
    fireEvent.click(screen.getAllByRole('button', { name: /V-SOLO/ })[0]);
    expect(screen.getAllByText(/headlining/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '▸ HEADLINER' })).toBeNull();
  });
});
