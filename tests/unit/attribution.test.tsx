import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, within } from '@testing-library/react';
import { AttributionFooter } from '../../src/components/AttributionFooter';
import { EmptyState } from '../../src/components/EmptyState';
import { ErrorState } from '../../src/components/ErrorState';
import { StubBack } from '../../src/components/StubBack';
import { PlaylistList } from '../../src/components/PlaylistList';
import { CityPicker } from '../../src/components/CityPicker';
import type { PlaylistEntry } from '../../src/lib/pipeline/order';
import type { Artist, Show, Track } from '../../src/lib/types';

/**
 * attribution.test.tsx — the linkback AUDIT (Task 5.1), a legal/ToS ship-blocker.
 *
 * These are enforcement contracts, not a review checklist: a rendered surface
 * missing a required JamBase/Apple linkback, or a rendered track missing its
 * per-track Apple `itunesUrl` linkback, or a stub missing its ticket deep-link,
 * FAILS CI here. The AttributionFooter is mounted once in the root layout, so it
 * ships with every surface's content; each surface case asserts the footer's two
 * required provider linkbacks are present alongside that surface's own content.
 */

// vitest globals are disabled → register RTL cleanup by hand (matches siblings).
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
afterEach(() => {
  cleanup();
  push.mockReset();
});

const JAMBASE_HREF = 'https://www.jambase.com';
const APPLE_HREF = 'https://music.apple.com';

/** The site-wide required provider linkbacks (JamBase + Apple), by href. */
function expectFooterLinkbacks(root: HTMLElement) {
  const jambase = root.querySelector(`a[href="${JAMBASE_HREF}"]`);
  const apple = root.querySelector(`a[href="${APPLE_HREF}"]`);
  expect(jambase, 'JamBase concert-data linkback must be present').toBeTruthy();
  expect(apple, 'Apple previews/artwork linkback must be present').toBeTruthy();
  // Both open safely in a new tab (rel carries noopener) per the providers' terms.
  for (const a of [jambase!, apple!]) {
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
  }
}

// ---- fixture helpers (mirror PlaylistList.test.tsx) -------------------------
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
  itunesUrl: `https://music.apple.com/track/${n}`,
  confidence: 'exact',
});

const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `V-${id}`, city: 'Lisboa' },
  ticketUrl: `https://tickets.example/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

const artists: Record<string, Artist> = {
  a1: mkArtist('a1', 'ALPHA', 0.4),
  a2: mkArtist('a2', 'BETA', 0.7),
  a3: mkArtist('a3', 'GAMMA', 0.6),
};

const s1 = mkShow('s1', '2026-08-01T20:00:00', ['a1']);
const s2 = mkShow('s2', '2026-08-01T22:00:00', ['a2']);
const s3 = mkShow('s3', '2026-08-02T21:00:00', ['a3']);

const entries: PlaylistEntry[] = [
  { track: mkTrack('a1', 1), show: s1, isEncore: false }, // index 0
  { track: mkTrack('a2', 2), show: s2, isEncore: false }, // index 1
  { track: mkTrack('a3', 3), show: s3, isEncore: false }, // index 2
];

function renderList() {
  return render(
    <PlaylistList
      entries={entries}
      artists={artists}
      currentIndex={-1}
      playing={false}
      city="lisbon"
      window="next-14-days"
      onPlayIndex={() => {}}
    />,
  );
}

// ── The AttributionFooter itself: both required provider linkbacks + copy ─────
describe('AttributionFooter — required provider linkbacks', () => {
  it('links JamBase (concert data) and Apple Music (previews/artwork) with correct hrefs', () => {
    const { container } = render(<AttributionFooter />);
    expectFooterLinkbacks(container);

    // Named credit text, not a bare URL.
    expect(screen.getByRole('link', { name: 'JamBase' }).getAttribute('href')).toBe(
      JAMBASE_HREF,
    );
    expect(screen.getByRole('link', { name: 'Apple Music' }).getAttribute('href')).toBe(
      APPLE_HREF,
    );
    // The coverage-honesty line.
    expect(container.textContent).toContain('the smallest rooms may not be here yet');
  });
});

// ── Every surface ships the footer linkbacks (mounted via the root layout) ────
describe('AttributionFooter renders on every surface', () => {
  it('landing (city picker) surface carries both linkbacks', () => {
    const { container } = render(
      <>
        <CityPicker prefill={{ displayName: 'London', slug: 'london' }} />
        <AttributionFooter />
      </>,
    );
    expect(screen.getByRole('button', { name: /Play London/i })).toBeTruthy();
    expectFooterLinkbacks(container);
  });

  it('playlist surface carries both linkbacks', () => {
    const { container } = render(
      <>
        <PlaylistList
          entries={entries}
          artists={artists}
          currentIndex={-1}
          playing={false}
          city="lisbon"
          window="next-14-days"
          onPlayIndex={() => {}}
        />
        <AttributionFooter />
      </>,
    );
    expect(screen.getByText('ALPHA')).toBeTruthy();
    expectFooterLinkbacks(container);
  });

  it('empty surface carries both linkbacks', () => {
    const { container } = render(
      <>
        <EmptyState city="braga" window="next-14-days" actions={[]} />
        <AttributionFooter />
      </>,
    );
    expect(screen.getByText('Nothing on the poster.')).toBeTruthy();
    expectFooterLinkbacks(container);
  });

  it('error surface carries both linkbacks', () => {
    const { container } = render(
      <>
        <ErrorState />
        <AttributionFooter />
      </>,
    );
    expect(screen.getByText('The poster wall is down.')).toBeTruthy();
    expectFooterLinkbacks(container);
  });
});

// ── Per-track Apple linkback (itunesUrl) — the enforcement contract ───────────
describe('per-track Apple linkback (itunesUrl)', () => {
  it('exposes a track-specific Apple linkback on the opened stub back', () => {
    render(
      <StubBack
        artist="ALPHA"
        venue="Musicbox"
        dateLabel="SAT 1"
        ticketUrl="https://tickets.example/s1"
        itunesUrl="https://music.apple.com/track/42"
        onClose={() => {}}
      />,
    );
    const apple = screen.getByRole('link', { name: /apple music/i });
    expect(apple.getAttribute('href')).toBe('https://music.apple.com/track/42');
    expect(apple.getAttribute('target')).toBe('_blank');
    expect(apple.getAttribute('rel')).toContain('noopener');
  });

  it('ENFORCEMENT: every rendered track exposes an anchor to its own itunesUrl', () => {
    renderList();

    // Open each row's stub in turn (parent enforces one-open-at-a-time) and
    // assert its exact itunesUrl anchor is reachable. Any track missing its
    // per-track Apple linkback fails here — the ship-blocker, not a review note.
    for (const entry of entries) {
      const chip = screen.getByRole('button', {
        name: new RegExp(entry.show.venue.name, 'i'),
      });
      fireEvent.click(chip);

      const href = entry.track.itunesUrl;
      const apple = document.querySelector(`a[href="${href}"]`);
      expect(
        apple,
        `track ${entry.track.itunesTrackId} is missing its Apple linkback (${href})`,
      ).toBeTruthy();
      expect(apple!.textContent?.toLowerCase()).toContain('apple music');
    }
  });
});

// ── Ticket deep-link — the JamBase offer/seller linkback stays present ────────
describe('ticket deep-link (JamBase offer linkback)', () => {
  it('points each opened stub Tickets anchor at the show ticketUrl', () => {
    renderList();

    for (const entry of entries) {
      const chip = screen.getByRole('button', {
        name: new RegExp(entry.show.venue.name, 'i'),
      });
      fireEvent.click(chip);

      const tickets = screen.getByRole('link', { name: /tickets/i });
      expect(tickets.getAttribute('href')).toBe(entry.show.ticketUrl);
      expect(tickets.getAttribute('target')).toBe('_blank');
      expect(tickets.getAttribute('rel')).toContain('noopener');
    }
  });

  it('a single opened stub carries BOTH its ticket link and its Apple linkback', () => {
    render(
      <StubBack
        artist="ALPHA"
        venue="Musicbox"
        dateLabel="SAT 1"
        ticketUrl="https://tickets.example/deep-link"
        itunesUrl="https://music.apple.com/track/7"
        onClose={() => {}}
      />,
    );
    const back = screen.getByRole('link', { name: /tickets/i }).closest('div')!;
    expect(within(back).getByRole('link', { name: /tickets/i }).getAttribute('href')).toBe(
      'https://tickets.example/deep-link',
    );
    expect(screen.getByRole('link', { name: /apple music/i }).getAttribute('href')).toBe(
      'https://music.apple.com/track/7',
    );
  });
});
