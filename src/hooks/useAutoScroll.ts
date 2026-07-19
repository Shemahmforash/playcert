'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * useAutoScroll — keep the playing row in view without fighting the user.
 *
 * Task 2.4. When `activeIndex` changes (the player advances) the active row is
 * scrolled into view. But the moment the listener touches the list themselves —
 * a manual scroll OR keyboard row-focus — auto-scroll is suppressed for a grace
 * window (default 5s) so the page doesn't yank back under them. After the window
 * lapses, auto-scroll resumes on the next `activeIndex` change.
 *
 * The suppression must ignore the scroll events that OUR OWN `scrollIntoView`
 * induces (smooth scrolling emits a burst of `scroll` events); we timestamp the
 * programmatic scroll and treat any `scroll` within a short settle window as
 * self-induced rather than manual.
 *
 * SSR/jsdom-safe: every DOM access is guarded, and `scrollIntoView` is only
 * invoked when it exists as a function on the target element.
 */

export interface UseAutoScrollOptions {
  /** Grace window (ms) after a manual interaction during which auto-scroll is suppressed. */
  suppressMs?: number;
  /** Passed straight to `scrollIntoView`. */
  behavior?: ScrollBehavior;
  /** `scrollIntoView` block alignment. */
  block?: ScrollLogicalPosition;
}

const DEFAULT_SUPPRESS_MS = 5000;
// Scroll events within this window of a programmatic scroll are treated as
// self-induced (smooth-scroll tail), not a manual interaction.
const PROGRAMMATIC_SETTLE_MS = 400;

export function useAutoScroll<
  C extends HTMLElement = HTMLElement,
  I extends HTMLElement = HTMLElement,
>(activeIndex: number, opts: UseAutoScrollOptions = {}) {
  const { suppressMs = DEFAULT_SUPPRESS_MS, behavior = 'smooth', block = 'nearest' } =
    opts;

  const containerRef = useRef<C | null>(null);
  const itemRef = useRef<I | null>(null);

  // Timestamp (ms) until which auto-scroll is suppressed by a manual interaction.
  const suppressUntilRef = useRef(0);
  // Timestamp of the last programmatic scroll — starts at -Infinity so the very
  // first manual scroll (at t≈0 under fake timers) is never mistaken for ours.
  const lastProgrammaticRef = useRef(Number.NEGATIVE_INFINITY);

  const armSuppression = useCallback(() => {
    // Ignore the scroll tail our own scrollIntoView produces.
    if (Date.now() - lastProgrammaticRef.current < PROGRAMMATIC_SETTLE_MS) return;
    suppressUntilRef.current = Date.now() + suppressMs;
  }, [suppressMs]);

  // Attach manual-interaction listeners to the scroll container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // `focusin` bubbles (unlike `focus`), so keyboard-tabbing onto any row fires it.
    container.addEventListener('scroll', armSuppression, { passive: true });
    container.addEventListener('focusin', armSuppression);
    return () => {
      container.removeEventListener('scroll', armSuppression);
      container.removeEventListener('focusin', armSuppression);
    };
  }, [armSuppression]);

  // Scroll the active row into view when the active index changes, unless the
  // listener recently interacted with the list.
  useEffect(() => {
    if (activeIndex < 0) return;
    if (Date.now() < suppressUntilRef.current) return;
    const el = itemRef.current;
    if (!el || typeof el.scrollIntoView !== 'function') return; // SSR/jsdom guard
    lastProgrammaticRef.current = Date.now();
    el.scrollIntoView({ behavior, block });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  return { containerRef, itemRef };
}
