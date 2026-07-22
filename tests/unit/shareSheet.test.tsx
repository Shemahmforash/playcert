import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ShareSheet } from '../../src/components/ShareSheet';

/**
 * Task 4.2 — the earned ShareSheet (grabber + focus-trapped dialog) and its
 * folded-in "Hear your own city" CTA.
 *
 * Sharing is EARNED: the grabber is hidden until `earned`, and the sheet NEVER
 * auto-opens — a tap on the grabber opens it. The canonical URL is built from
 * `location.origin` at click time.
 */

// vitest globals are disabled → register RTL cleanup + router mock by hand
// (UseMyLocation, folded into the sheet, calls useRouter).
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const writeText = vi.fn().mockResolvedValue(undefined);
const share = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });
});

afterEach(() => {
  cleanup();
  push.mockReset();
  writeText.mockClear();
  share.mockClear();
  // @ts-expect-error — tear down injected mocks between tests.
  delete globalThis.navigator.clipboard;
  // @ts-expect-error
  delete globalThis.navigator.share;
});

const baseProps = {
  city: 'london',
  window: 'tonight' as const,
  fontStop: 'everything' as const,
  currentTrack: { artist: 'THE BAND', title: 'Loud Song' },
};

function open() {
  fireEvent.click(screen.getByRole('button', { name: /take it with you/i }));
}

describe('ShareSheet', () => {
  it('renders nothing (no grabber) when not earned', () => {
    render(<ShareSheet earned={false} {...baseProps} />);
    expect(screen.queryByRole('button', { name: /take it with you/i })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows the grabber when earned but does NOT auto-open the sheet', () => {
    render(<ShareSheet earned {...baseProps} />);
    expect(
      screen.getByRole('button', { name: /take it with you/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opening the grabber shows Copy link, Share, Spotify/Apple search links + the Hear-your-own-city CTA', () => {
    render(<ShareSheet earned {...baseProps} />);
    open();

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^share$/i })).toBeTruthy();

    // The section labels WHICH track the deep-links search for (the current
    // one) — "the full versions" read as playlist-level links next to the
    // page-level Copy/Share actions.
    expect(screen.getByText(/hear THE BAND — Loud Song in full/i)).toBeTruthy();

    const term = encodeURIComponent('THE BAND Loud Song');
    const spotify = screen.getByRole('link', { name: /spotify/i });
    const apple = screen.getByRole('link', { name: /apple music/i });
    expect(spotify.getAttribute('href')).toBe(
      `https://open.spotify.com/search/${term}`,
    );
    expect(apple.getAttribute('href')).toBe(
      `https://music.apple.com/search?term=${term}`,
    );
    expect(spotify.getAttribute('target')).toBe('_blank');
    expect(spotify.getAttribute('rel')).toBe('noopener noreferrer');

    // The folded-in growth CTA.
    expect(screen.getByText(/hear your own city/i)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /use my exact location/i }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: /pick a city/i }).getAttribute('href')).toBe(
      '/?pick=1',
    );
  });

  it('Copy link copies the canonical URL (location.origin + path) and flips the row copy', async () => {
    render(<ShareSheet earned {...baseProps} />);
    open();

    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/london/tonight`,
      ),
    );
    expect(
      await screen.findByText(/copied — same mix for everyone/i),
    ).toBeTruthy();
  });

  it('a non-everything stop is included in the canonical URL', async () => {
    render(<ShareSheet earned {...baseProps} fontStop="small-print" />);
    open();
    fireEvent.click(screen.getByRole('button', { name: /copy link/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/london/tonight/small-print`,
      ),
    );
  });

  it('Share uses navigator.share when available', async () => {
    Object.defineProperty(globalThis.navigator, 'share', {
      configurable: true,
      value: share,
    });
    render(<ShareSheet earned {...baseProps} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        text: 'ok which of these are we going to 👀',
        url: `${window.location.origin}/london/tonight`,
      }),
    );
  });

  it('Share falls back to copy-with-text when navigator.share is absent', async () => {
    render(<ShareSheet earned {...baseProps} />);
    open();
    fireEvent.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        `ok which of these are we going to 👀 ${window.location.origin}/london/tonight`,
      ),
    );
  });

  it('is a focus-trapped dialog: ESC closes and returns focus to the grabber', () => {
    render(<ShareSheet earned {...baseProps} />);
    const grabber = screen.getByRole('button', { name: /take it with you/i });
    fireEvent.click(grabber);
    const dialog = screen.getByRole('dialog');

    // Focus moved into the dialog on open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(grabber);
  });

  it('clicking the backdrop closes the sheet', () => {
    render(<ShareSheet earned {...baseProps} />);
    open();
    fireEvent.click(screen.getByTestId('share-sheet-backdrop'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
