import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { HeartedShelf } from '../../src/components/HeartedShelf';
import { dateLabelFor } from '../../src/lib/playlistGrouping';
import type { HeartedSong } from '../../src/hooks/useTasteMemory';

/**
 * Hearted Shelf step 3 — the slide-over shelf itself (design Parts 2–3).
 *
 * Locks the shelf's contract:
 *   • stubs render newest-first from the stored snapshots (zero fetches);
 *   • the shelf plays previews on its OWN audio element and always fires
 *     `onWillPlay` first so the screen can pause the main radio;
 *   • a dead previewUrl falls back to opening the song on Apple Music;
 *   • Copy list emits `Artist — Title · itunesUrl` lines (clipboard denied →
 *     a selectable text box), Share hands the same text to navigator.share;
 *   • ✕-unheart needs no confirmation; Esc/✕/backdrop all close;
 *   • the empty state still opens as a sheet.
 */

// vitest globals are disabled → register RTL cleanup by hand.
beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  // @ts-expect-error — tear down injected navigator mocks between tests.
  delete globalThis.navigator.clipboard;
  // @ts-expect-error
  delete globalThis.navigator.share;
});

// ---- fixtures --------------------------------------------------------------
const mkSong = (over: Partial<HeartedSong> = {}): HeartedSong => ({
  itunesTrackId: 1,
  title: 'Starburster',
  artist: 'FONTAINES D.C.',
  artistId: 'a1',
  previewUrl: 'https://audio.example/1.m4a',
  artworkUrl: 'https://art.example/1.jpg',
  itunesUrl: 'https://music.apple.example/1',
  heartedAt: '2026-07-20T12:00:00.000Z',
  gig: {
    venue: 'Paradise',
    city: 'Lisbon',
    // Far-future so the default fixture never trips the past-gig branch.
    startsAt: '2100-08-01T20:00:00',
    ticketUrl: 'https://t/s1',
  },
  ...over,
});

// An OLDER second heart by a second artist — ordering + copy-list fixtures.
const older = mkSong({
  itunesTrackId: 2,
  title: 'Favourite',
  artist: 'BETA',
  artistId: 'a2',
  previewUrl: 'https://audio.example/2.m4a',
  artworkUrl: 'https://art.example/2.jpg',
  itunesUrl: 'https://music.apple.example/2',
  heartedAt: '2026-07-01T12:00:00.000Z',
  gig: {
    venue: 'Vega',
    city: 'Porto',
    startsAt: '2100-09-01T21:00:00',
    ticketUrl: 'https://t/s2',
  },
});
const newer = mkSong();

function renderShelf(songs: HeartedSong[]) {
  const onUnheart = vi.fn();
  const onWillPlay = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <HeartedShelf
      songs={songs}
      onUnheart={onUnheart}
      onWillPlay={onWillPlay}
      onClose={onClose}
    />,
  );
  return { onUnheart, onWillPlay, onClose, ...utils };
}

describe('HeartedShelf', () => {
  it('renders a stub per song, newest-first, with gig line + per-artist tour link', () => {
    renderShelf([older, newer]);

    // A modal dialog in the print voice, with the count tally.
    const dialog = screen.getByRole('dialog', { name: 'Your hearted songs' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByText('YOUR HEARTED')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();

    // Newest-first by heartedAt, regardless of input order.
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Starburster');
    expect(items[1].textContent).toContain('Favourite');

    // The gig line: mono `SAT 20 · VENUE · CITY`, linking to the ticketUrl.
    const links = screen.getAllByRole('link');
    const gig = links.find((a) => a.getAttribute('href') === 'https://t/s1');
    expect(gig).toBeTruthy();
    expect(gig!.textContent).toContain(dateLabelFor('2100-08-01T20:00:00'));
    expect(gig!.textContent).toContain('PARADISE');
    expect(gig!.textContent).toContain('LISBON');

    // Per-artist "full tour →" outbound link — JamBase search, new tab, noopener.
    const tour = screen.getByRole('link', { name: 'Full tour dates for FONTAINES D.C.' });
    expect(tour.getAttribute('href')).toBe(
      `https://www.jambase.com/search?q=${encodeURIComponent('FONTAINES D.C.')}`,
    );
    expect(tour.getAttribute('target')).toBe('_blank');
    expect(tour.getAttribute('rel')).toContain('noopener');
  });

  it('a past gig gets a struck-through date and a PLAYED stamp; a future gig does not', () => {
    const past = mkSong({
      itunesTrackId: 3,
      gig: {
        venue: 'Paradise',
        city: 'Lisbon',
        startsAt: '2020-01-10T20:00:00',
        ticketUrl: 'https://t/past',
      },
    });
    renderShelf([past, older]);

    // Exactly ONE stamp — only the past gig earns it.
    expect(screen.getAllByText('PLAYED')).toHaveLength(1);

    // The past date is struck through; the future one is untouched.
    const pastDate = screen.getByText(dateLabelFor('2020-01-10T20:00:00'));
    expect((pastDate as HTMLElement).style.textDecoration).toBe('line-through');
    const futureDate = screen.getByText(dateLabelFor('2100-09-01T21:00:00'));
    expect((futureDate as HTMLElement).style.textDecoration).not.toBe('line-through');
  });

  it('playing a stub fires onWillPlay (main-radio pause) and uses the shelf audio', () => {
    const { onWillPlay, container } = renderShelf([newer]);
    const play = window.HTMLMediaElement.prototype.play;

    fireEvent.click(
      screen.getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' }),
    );

    // The screen's callback fires BEFORE our preview sounds…
    expect(onWillPlay).toHaveBeenCalledTimes(1);
    // …and the shelf's own element carries the stored previewUrl.
    const audio = container.querySelector('audio');
    expect(audio?.src).toBe('https://audio.example/1.m4a');
    expect(play).toHaveBeenCalled();

    // The button flips to a pause control; tapping again pauses.
    const pauseBtn = screen.getByRole('button', {
      name: 'Pause FONTAINES D.C. — Starburster',
    });
    expect(pauseBtn.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(pauseBtn);
    expect(window.HTMLMediaElement.prototype.pause).toHaveBeenCalled();
    expect(
      screen
        .getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('a failing preview falls back to opening the song on Apple Music', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { container } = renderShelf([newer]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' }),
    );
    fireEvent.error(container.querySelector('audio')!);

    expect(open).toHaveBeenCalledWith('https://music.apple.example/1', '_blank', 'noopener');
    // The stub settles back to its playable state.
    expect(
      screen
        .getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' })
        .getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('Copy list writes one `Artist — Title · itunesUrl` line per song, newest-first', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderShelf([older, newer]);

    fireEvent.click(screen.getByRole('button', { name: /copy list/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'FONTAINES D.C. — Starburster · https://music.apple.example/1\n' +
          'BETA — Favourite · https://music.apple.example/2',
      ),
    );
    expect(await screen.findByText(/copied/i)).toBeTruthy();
  });

  it('clipboard denied → the list appears in a selectable text box instead', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderShelf([newer]);

    fireEvent.click(screen.getByRole('button', { name: /copy list/i }));
    const box = await screen.findByRole('textbox', { name: 'Your hearted list' });
    expect((box as HTMLTextAreaElement).value).toBe(
      'FONTAINES D.C. — Starburster · https://music.apple.example/1',
    );
  });

  it('Share hands the same list text to navigator.share where available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', {
      configurable: true,
      value: share,
    });
    renderShelf([newer]);

    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        text: 'FONTAINES D.C. — Starburster · https://music.apple.example/1',
      }),
    );
  });

  it('✕-unheart hands the song back with no confirmation', () => {
    const { onUnheart } = renderShelf([newer]);
    fireEvent.click(
      screen.getByRole('button', { name: 'Unheart FONTAINES D.C. — Starburster' }),
    );
    expect(onUnheart).toHaveBeenCalledWith(
      expect.objectContaining({ itunesTrackId: 1 }),
    );
  });

  it('the empty state still opens as a sheet, without footer actions', () => {
    renderShelf([]);
    expect(screen.getByRole('dialog', { name: 'Your hearted songs' })).toBeTruthy();
    expect(
      screen.getByText('Heart a song on the bill and it’s kept here — with its gig.'),
    ).toBeTruthy();
    // Nothing to copy/share yet.
    expect(screen.queryByRole('button', { name: /copy list/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /^share$/i })).toBeNull();
  });

  it('Esc, the ✕ and the backdrop all close; focus lands inside on open', () => {
    const { onClose } = renderShelf([newer]);
    const dialog = screen.getByRole('dialog', { name: 'Your hearted songs' });

    // Focus moved INTO the focus-trapped dialog on open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByTestId('hearted-shelf-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
