import { useState } from 'react';
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
 *     `onWillPlay` first so the screen can pause the main radio; pausing a
 *     stub and tapping it again RESUMES (never reloads from 0:00);
 *   • every stub carries a per-song Apple Music linkback (design Part 3 +
 *     Apple ToS); a dead previewUrl stamps the stub and retargets its play
 *     tap at Apple Music, synchronously in-gesture (popup blockers swallow
 *     the async onError window.open — the stamp + link are the honest path);
 *   • Copy list emits `Artist — Title · itunesUrl` lines (clipboard denied →
 *     a selectable text box), feedback is announced via a live region, and
 *     both the "Copied" claim and the box track the LIVE list;
 *   • Share hands the same text to navigator.share; a user cancel (AbortError)
 *     is a no-op, never a clipboard clobber;
 *   • ✕-unheart needs no confirmation — and unhearting the focused ✕ never
 *     kills the trap: focus returns to the dialog, Esc/Tab keep working;
 *   • Esc/✕/backdrop all close; the empty state still opens as a sheet.
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

/**
 * A stateful harness for tests where an unheart must actually SHRINK the list
 * (the plain renderShelf mock leaves the songs prop frozen) — focus recovery
 * and stale-takeaway coverage both need the real unmount to happen.
 */
function StatefulShelf({
  initial,
  onClose = () => {},
}: {
  initial: HeartedSong[];
  onClose?: () => void;
}) {
  const [songs, setSongs] = useState(initial);
  return (
    <HeartedShelf
      songs={songs}
      onUnheart={(s) =>
        setSongs((prev) => prev.filter((x) => x.itunesTrackId !== s.itunesTrackId))
      }
      onWillPlay={() => {}}
      onClose={onClose}
    />
  );
}

// Mirrors the component's FOCUSABLE roster — used to walk the trap in tests.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

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

  it('a dead preview stamps the stub; the play tap then opens Apple Music in-gesture', () => {
    // The popup-blocked case: window.open from the ASYNC error event returns
    // null (Safari default-on; Chromium once transient activation expires).
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { container } = renderShelf([newer]);

    fireEvent.click(
      screen.getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' }),
    );
    fireEvent.error(container.querySelector('audio')!);

    // Best-effort direct open is still attempted (design: "play falls back to
    // opening itunesUrl")…
    expect(open).toHaveBeenCalledWith('https://music.apple.example/1', '_blank', 'noopener');
    // …but because that open can be silently popup-blocked, the tap must land
    // on USER-VISIBLE feedback either way: the stamp, in the stamp voice.
    expect(screen.getByText('PREVIEW UNAVAILABLE')).toBeTruthy();

    // The play control now honestly targets Apple Music, and a fresh tap opens
    // it SYNCHRONOUSLY inside the gesture — where popup blockers never bite.
    open.mockClear();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Open FONTAINES D.C. — Starburster on Apple Music (preview unavailable)',
      }),
    );
    expect(open).toHaveBeenCalledWith('https://music.apple.example/1', '_blank', 'noopener');
  });

  it('every stub carries a per-song Apple Music linkback (design Part 3 + Apple ToS)', () => {
    renderShelf([older, newer]);
    const links = screen.getAllByRole('link', { name: /on Apple Music$/ });
    expect(links).toHaveLength(2);
    // Newest-first, so the first linkback belongs to the newer heart.
    expect(links[0].getAttribute('href')).toBe('https://music.apple.example/1');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toContain('noopener');
    expect(links[1].getAttribute('href')).toBe('https://music.apple.example/2');
  });

  it('the tour + Apple links print in --ash: riso-blue misses the 4.5:1 floor at 12px', () => {
    renderShelf([newer]);
    const tour = screen.getByRole('link', { name: 'Full tour dates for FONTAINES D.C.' });
    expect((tour as HTMLElement).style.color).toBe('var(--ash)');
    const apple = screen.getByRole('link', {
      name: 'Open FONTAINES D.C. — Starburster on Apple Music',
    });
    expect((apple as HTMLElement).style.color).toBe('var(--ash)');
  });

  it('pause then play again RESUMES the preview — src is never reassigned (no restart at 0:00)', () => {
    // Instrument the src setter: assigning el.src (even the identical URL)
    // re-runs the media load algorithm and resets currentTime to 0 — the
    // "pause that replays" bug the main screen's playIndex guards against.
    const proto = window.HTMLMediaElement.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'src')!;
    const srcSets: string[] = [];
    Object.defineProperty(proto, 'src', {
      configurable: true,
      get: desc.get,
      set(value: string) {
        srcSets.push(value);
        desc.set!.call(this, value);
      },
    });
    try {
      const { onWillPlay } = renderShelf([newer]);
      fireEvent.click(
        screen.getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Pause FONTAINES D.C. — Starburster' }),
      );
      fireEvent.click(
        screen.getByRole('button', { name: 'Play FONTAINES D.C. — Starburster' }),
      );
      // Loaded exactly once — the second tap resumed, not reloaded.
      expect(srcSets).toEqual(['https://audio.example/1.m4a']);
      expect(
        screen.getByRole('button', { name: 'Pause FONTAINES D.C. — Starburster' }),
      ).toBeTruthy();
      // Resume still re-pauses the main radio (it may have restarted meanwhile).
      expect(onWillPlay).toHaveBeenCalledTimes(2);
    } finally {
      Object.defineProperty(proto, 'src', desc);
    }
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
    expect(await screen.findByText('Copied — one line per song')).toBeTruthy();
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

  it('cancelling the native share sheet is a NO-OP — nothing copied, no Copied claim', async () => {
    // iOS: the user taps Share, then swipes the OS sheet away → AbortError.
    // That is a decision, not a failure — falling through to copy would clobber
    // the user's clipboard right after they said "no thanks".
    const share = vi.fn().mockRejectedValue(new DOMException('user cancelled', 'AbortError'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderShelf([newer]);

    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(writeText).not.toHaveBeenCalled();
    expect(screen.queryByText(/copied/i)).toBeNull();
  });

  it('a REAL share failure (not a cancel) still falls back to copy', async () => {
    const share = vi.fn().mockRejectedValue(new TypeError('share failed'));
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'share', { configurable: true, value: share });
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderShelf([newer]);

    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        'FONTAINES D.C. — Starburster · https://music.apple.example/1',
      ),
    );
  });

  it('copy feedback is announced via a polite live region (success and denied)', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderShelf([newer]);

    // The region exists BEFORE the update (a live region only announces
    // changes to content it was already watching), and it is polite.
    const live = screen.getByTestId('hearted-copy-live');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /copy list/i }));
    await waitFor(() => expect(live.textContent).toContain('List copied'));
  });

  it('the clipboard-denied fallback is announced too', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    renderShelf([newer]);

    fireEvent.click(screen.getByRole('button', { name: /copy list/i }));
    await waitFor(() =>
      expect(screen.getByTestId('hearted-copy-live').textContent).toContain(
        'Copy unavailable',
      ),
    );
  });

  it('an unheart refreshes the fallback box — never a hand-copyable stale list', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<StatefulShelf initial={[older, newer]} />);

    fireEvent.click(screen.getByRole('button', { name: /copy list/i }));
    const box = await screen.findByRole('textbox', { name: 'Your hearted list' });
    expect((box as HTMLTextAreaElement).value).toBe(
      'FONTAINES D.C. — Starburster · https://music.apple.example/1\n' +
        'BETA — Favourite · https://music.apple.example/2',
    );

    // Unheart BETA — the box must drop its line, not keep serving it by hand.
    fireEvent.click(screen.getByRole('button', { name: 'Unheart BETA — Favourite' }));
    await waitFor(() =>
      expect((box as HTMLTextAreaElement).value).toBe(
        'FONTAINES D.C. — Starburster · https://music.apple.example/1',
      ),
    );
  });

  it('the "Copied" claim resets when the list changes under it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<StatefulShelf initial={[older, newer]} />);

    fireEvent.click(screen.getByRole('button', { name: /copy list/i }));
    expect(await screen.findByText('Copied — one line per song')).toBeTruthy();

    // The clipboard now holds a two-line list; unhearting one makes that claim
    // false, so the button must fall back to a plain "Copy list".
    fireEvent.click(screen.getByRole('button', { name: 'Unheart BETA — Favourite' }));
    await waitFor(() =>
      expect(screen.queryByText('Copied — one line per song')).toBeNull(),
    );
    expect(screen.getByText('Copy list')).toBeTruthy();
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

  it('Tab wraps last→first and Shift+Tab first→last inside the trap', () => {
    // jsdom computes offsetParent as null for everything, which empties the
    // component's visibility filter — give it a real-ish answer so the trap
    // walks actual focusables instead of falling through to the dialog node.
    const offsetParent = vi
      .spyOn(HTMLElement.prototype, 'offsetParent', 'get')
      .mockImplementation(function (this: HTMLElement) {
        return this.parentElement;
      });
    try {
      renderShelf([newer]);
      const dialog = screen.getByRole('dialog', { name: 'Your hearted songs' });
      const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE));
      expect(items.length).toBeGreaterThan(1);
      const first = items[0];
      const last = items[items.length - 1];

      last.focus();
      fireEvent.keyDown(last, { key: 'Tab' });
      expect(document.activeElement).toBe(first);

      fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
      expect(document.activeElement).toBe(last);
    } finally {
      offsetParent.mockRestore();
    }
  });

  it('unhearting the focused ✕ keeps the modal keyboard alive: focus returns, Esc still closes', () => {
    const onClose = vi.fn();
    render(<StatefulShelf initial={[older, newer]} onClose={onClose} />);
    const dialog = screen.getByRole('dialog', { name: 'Your hearted songs' });

    // Keyboard path: focus the ✕, activate it — its <li> unmounts and focus
    // would fall to <body>, outside the aria-modal dialog.
    const unheart = screen.getByRole('button', { name: 'Unheart BETA — Favourite' });
    unheart.focus();
    fireEvent.click(unheart);

    // Focus is pulled back INSIDE the dialog…
    expect(dialog.contains(document.activeElement)).toBe(true);

    // …and even if focus DOES end up on <body> (stray click on inert sheet
    // content), Esc still reaches the document-scoped handler and closes.
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
