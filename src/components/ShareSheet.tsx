'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { FontStop, TimeWindow } from '../lib/types';
import { formatCanonicalPath } from '../lib/urlState';
import { UseMyLocation } from './UseMyLocation';

/**
 * ShareSheet — the earned share sheet (Task 4.2, §B S11), folding in the
 * "Hear your own city" growth CTA (the old Task 4.4).
 *
 * PRESENTATIONAL + handlers only. Sharing is EARNED, never a wall before first
 * sound: the parent (`PlaylistScreen`) passes `earned` from `useShareThreshold`.
 *   • When `!earned` this renders NOTHING (so it never disturbs the pre-earn UI
 *     or the existing PlaylistScreen tests).
 *   • When `earned` a quiet "Take it with you" GRABBER appears ~24px above the
 *     sticky player. It NEVER auto-opens — tapping it opens the sheet.
 *
 * The sheet is a focus-trapped dialog (role="dialog" aria-modal): ESC + backdrop
 * close, focus returns to the grabber on close, `prefers-reduced-motion` respected.
 *
 * The canonical URL is built at CLICK time from `location.origin` + the canonical
 * path — never from geo/headers.
 */

export interface ShareSheetTrack {
  artist: string;
  title: string;
}

export interface ShareSheetProps {
  /** From `useShareThreshold`. Grabber + sheet exist only when true. */
  earned: boolean;
  /** Canonical-URL deps. */
  city: string;
  window: TimeWindow;
  fontStop: FontStop;
  /** The CURRENT track, for the Spotify/Apple search deep-links. */
  currentTrack: ShareSheetTrack | null;
  className?: string;
}

const SHARE_TEXT = 'ok which of these are we going to 👀';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Absolute canonical URL, read from `location.origin` at call time. */
function canonicalUrl(city: string, window: TimeWindow, fontStop: FontStop): string {
  const path = formatCanonicalPath({ city, window, fontStop });
  const origin =
    typeof globalThis !== 'undefined' && globalThis.location
      ? globalThis.location.origin
      : '';
  return origin + path;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

export function ShareSheet({
  earned,
  city,
  window: timeWindow,
  fontStop,
  currentTrack,
  className,
}: ShareSheetProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const grabberRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const closeSheet = useCallback(() => {
    setOpen(false);
    // Return focus to the grabber that opened us (it stays mounted while earned).
    grabberRef.current?.focus();
  }, []);

  // Focus trap + ESC, active only while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus INTO the dialog on open.
    (focusables()[0] ?? dialog).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [open, closeSheet]);

  // Re-earning is sticky; but if a redraw ever drops `earned`, keep the sheet sane.
  useEffect(() => {
    if (!earned && open) setOpen(false);
  }, [earned, open]);

  if (!earned) return null;

  const url = () => canonicalUrl(city, timeWindow, fontStop);

  async function copyText(text: string): Promise<boolean> {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // fall through — never throw from a share action
    }
    return false;
  }

  async function handleCopyLink() {
    const ok = await copyText(url());
    if (ok) setCopied(true);
  }

  async function handleShare() {
    const link = url();
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ text: SHARE_TEXT, url: link });
        return;
      } catch {
        // user dismissed / unavailable — fall back to copy below
      }
    }
    // Fallback: copy the text + url together.
    await copyText(`${SHARE_TEXT} ${link}`);
  }

  const searchTerm = currentTrack
    ? encodeURIComponent(`${currentTrack.artist} ${currentTrack.title}`)
    : '';
  const spotifyHref = `https://open.spotify.com/search/${searchTerm}`;
  const appleHref = `https://music.apple.com/search?term=${searchTerm}`;

  const reduced = prefersReducedMotion();

  return (
    <div className={className}>
      {/* GRABBER — quiet tab ~24px above the sticky player. Shown only when earned;
          never auto-opens the sheet. */}
      <div
        className="sticky z-20 flex justify-center"
        style={{ bottom: 'calc(3.5rem + env(safe-area-inset-bottom))' }}
      >
        <button
          ref={grabberRef}
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rounded-full px-3 py-1 font-mono text-xs leading-none shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            background: 'var(--surface-raised)',
            color: 'var(--ash)',
            border: '1px solid var(--line)',
            outlineColor: 'var(--admission)',
            transform: 'translateY(-24px)',
          }}
        >
          Take it with you ↗
        </button>
      </div>

      {open ? (
        <>
          {/* Backdrop — click to close. */}
          <div
            data-testid="share-sheet-backdrop"
            onClick={closeSheet}
            // z-40/z-50 — the SAME ladder as the LineupPoster overlay: backdrop
            // covers the z-40 player bar (an aria-modal dialog must not leave
            // Play/Skip clickable behind it), dialog above the backdrop. At
            // z-40/DOM-order the player painted OVER the sheet's bottom rows.
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.4)' }}
            aria-hidden
          />
          {/* The dialog itself. max-h + overflow so short viewports scroll the
              sheet instead of clipping the growth CTA at the bottom. */}
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Take it with you"
            tabIndex={-1}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl p-5"
            style={{
              background: 'var(--surface-raised)',
              borderTop: '1px solid var(--line)',
              paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
              transition: reduced ? 'none' : 'transform 200ms ease-out',
            }}
          >
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                Take it with you
              </h2>
              <button
                type="button"
                onClick={closeSheet}
                aria-label="Close"
                className="rounded-full px-2 text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: 'var(--ash)', outlineColor: 'var(--admission)' }}
              >
                ✕
              </button>
            </div>

            {/* 1) Copy link — same mix for everyone. */}
            <button
              type="button"
              onClick={handleCopyLink}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                border: '1px solid var(--line)',
                color: 'var(--ink)',
                outlineColor: 'var(--admission)',
              }}
            >
              <span>{copied ? 'Copied — same mix for everyone' : 'Copy link'}</span>
              <span aria-hidden>{copied ? '✓' : '⧉'}</span>
            </button>

            {/* 2) Share via the native sheet (falls back to copy-with-text). */}
            <button
              type="button"
              onClick={handleShare}
              className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                border: '1px solid var(--line)',
                color: 'var(--ink)',
                outlineColor: 'var(--admission)',
              }}
            >
              <span>Share</span>
              <span aria-hidden>↗</span>
            </button>

            {/* 3) SEARCH deep-links for the CURRENT track — the label names it,
                so it can't read as playlist-level links beside Copy/Share. */}
            {currentTrack ? (
              <div className="flex flex-col gap-2">
                <p className="font-mono text-xs" style={{ color: 'var(--ash)' }}>
                  Hear {currentTrack.artist} — {currentTrack.title} in full
                </p>
                <div className="flex gap-2">
                  <a
                    href={spotifyHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-lg px-3 py-2 text-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      border: '1px solid var(--line)',
                      color: 'var(--ink)',
                      outlineColor: 'var(--admission)',
                    }}
                  >
                    Spotify
                  </a>
                  <a
                    href={appleHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 rounded-lg px-3 py-2 text-center text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      border: '1px solid var(--line)',
                      color: 'var(--ink)',
                      outlineColor: 'var(--admission)',
                    }}
                  >
                    Apple Music
                  </a>
                </div>
              </div>
            ) : null}

            {/* 4) Hear your own city → — the folded-in growth CTA (was Task 4.4). */}
            <div
              className="flex flex-col gap-2 rounded-lg p-3"
              style={{ border: '1px dashed var(--line)' }}
            >
              <p className="text-sm" style={{ color: 'var(--ink)' }}>
                Landed here from a friend? Hear your own city →
              </p>
              <UseMyLocation window={timeWindow} />
              <a
                href="/?pick=1"
                className="text-xs underline underline-offset-4"
                style={{ color: 'var(--ash)' }}
              >
                Pick a city
              </a>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
