'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * useShareThreshold — the growth core's gate (Task 4.2, §B S11).
 *
 * Sharing is EARNED, never a wall before first sound. This hook decides when the
 * quiet "Take it with you" grabber is allowed to appear. The rule is deliberately
 * small and PURE so it can be unit-tested without a DOM: feed it signals, read
 * `earned`.
 *
 * RULE — earned when EITHER:
 *   • TWO DISTINCT previews have each been played ≥15s (deduped by preview index —
 *     the same index reaching 15s twice does NOT count as two), OR
 *   • ≥20s of active interaction has accrued (noteInteraction).
 *
 * Once `earned` flips true it STAYS true for the pageview (sticky, in-memory only —
 * NO localStorage/cookies; a reload resets it). Counting is gated to "while playing"
 * at the CALL SITE — the player only calls these while playing.
 *
 * `suppressed` (thin/empty playlists — belowBar; Task 4.5 extends this to the Empty
 * state) forces the RETURNED `earned` to stay false regardless of accrued signals.
 * The internal sticky flag is still tracked, so lifting suppression later reveals it.
 */

/** A preview must reach this many seconds to count toward the two-preview rule. */
export const PREVIEW_EARN_SECONDS = 15;
/** How many DISTINCT previews (each ≥PREVIEW_EARN_SECONDS) earn sharing. */
export const REQUIRED_DISTINCT_PREVIEWS = 2;
/** Active-interaction seconds that alternatively earn sharing. */
export const INTERACTION_EARN_SECONDS = 20;

export interface ShareThresholdState {
  /** Distinct preview indices that have each reached PREVIEW_EARN_SECONDS. */
  previews: number[];
  /** Accrued active-interaction seconds. */
  interactionSeconds: number;
  /** Sticky: once true it never returns to false within the pageview. */
  earned: boolean;
}

export type ShareThresholdSignal =
  | { type: 'preview'; index: number; seconds: number }
  | { type: 'interaction'; seconds: number };

export function initialShareThresholdState(): ShareThresholdState {
  return { previews: [], interactionSeconds: 0, earned: false };
}

/** Pure, DOM-free core. Extracted so the earn rule is directly unit-testable. */
export function shareThresholdReducer(
  state: ShareThresholdState,
  signal: ShareThresholdSignal,
): ShareThresholdState {
  let previews = state.previews;
  let interactionSeconds = state.interactionSeconds;

  if (signal.type === 'preview') {
    // Only a preview that has actually reached the threshold counts, and only
    // once per distinct index (a 14s preview is ignored; the same index twice
    // does not satisfy "two distinct").
    if (
      signal.seconds >= PREVIEW_EARN_SECONDS &&
      !state.previews.includes(signal.index)
    ) {
      previews = [...state.previews, signal.index];
    }
  } else {
    // Accrue active-interaction time (clamped to non-negative additions).
    interactionSeconds = state.interactionSeconds + Math.max(0, signal.seconds);
  }

  const earned =
    state.earned ||
    previews.length >= REQUIRED_DISTINCT_PREVIEWS ||
    interactionSeconds >= INTERACTION_EARN_SECONDS;

  return { previews, interactionSeconds, earned };
}

export interface UseShareThresholdOptions {
  /** Forces the returned `earned` to stay false (thin/empty playlists). */
  suppressed?: boolean;
}

export interface ShareThreshold {
  /** True only once sharing is earned AND not suppressed. */
  earned: boolean;
  /** Mark that preview `index` has reached `seconds` of playback. */
  notePreviewProgress: (index: number, seconds: number) => void;
  /** Accrue active-interaction time (default 1s per genuine gesture). */
  noteInteraction: (seconds?: number) => void;
}

export function useShareThreshold({
  suppressed = false,
}: UseShareThresholdOptions = {}): ShareThreshold {
  // The accrued signals live in a ref (no re-render per timeupdate tick); a tiny
  // boolean state exists only to re-render the ONE time `earned` flips true.
  const stateRef = useRef<ShareThresholdState>(initialShareThresholdState());
  const [earnedInternal, setEarnedInternal] = useState(false);

  const apply = useCallback((signal: ShareThresholdSignal) => {
    if (stateRef.current.earned) return; // already sticky-earned; nothing to do
    stateRef.current = shareThresholdReducer(stateRef.current, signal);
    if (stateRef.current.earned) setEarnedInternal(true);
  }, []);

  const notePreviewProgress = useCallback(
    (index: number, seconds: number) => apply({ type: 'preview', index, seconds }),
    [apply],
  );

  const noteInteraction = useCallback(
    (seconds = 1) => apply({ type: 'interaction', seconds }),
    [apply],
  );

  return {
    earned: !suppressed && earnedInternal,
    notePreviewProgress,
    noteInteraction,
  };
}
