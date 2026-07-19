'use client';

import { useEffect, useState } from 'react';

/**
 * LoadingTheater — the crate-digging `<Suspense>` fallback (Task 2.6, §2.5).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.5 ("Loading — the
 * crate-digging theater, never a spinner"). Our streaming reality: the bundle
 * arrives as a SINGLE blob when the server build resolves — there are no server
 * progress events — so this fallback is INDETERMINATE. It shows "Reading the
 * small print…" in tiny mono that slowly grows, an ambient motif (faint poster
 * strips shimmering + a rule slowly filling + a box-office caret), and a hard
 * 45s client timeout that swaps the copy to an honest "still reading" line.
 *
 * Reduced motion (handled in globals.css): no growth, no shimmer, no fill — a
 * static, readable resting state.
 */

// Hard client timeout (§2.5 "45s hard timeout"). Exported for the test.
export const LOADING_TIMEOUT_MS = 45_000;

const READING_COPY = 'Reading the small print…';
const TIMEOUT_COPY =
  'Still reading — the poster wall is slow today. Give it a moment or reload.';

export interface LoadingTheaterProps {
  /** Fired once when the 45s client timeout elapses while still mounted. */
  onTimeout?: () => void;
}

export function LoadingTheater({ onTimeout }: LoadingTheaterProps) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setTimedOut(true);
      onTimeout?.();
    }, LOADING_TIMEOUT_MS);
    // Clear on unmount → no state update after the fallback is torn down when
    // Suspense resolves.
    return () => clearTimeout(id);
  }, [onTimeout]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-4 py-8"
      style={{ color: 'var(--ash)' }}
    >
      {/* Faint poster strips shimmering in the crate. */}
      <div aria-hidden className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className="sf-strip"
            style={{
              display: 'block',
              height: '2.25rem',
              flex: 1,
              borderRadius: 'var(--radius-stub, 3px)',
              background: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              animationDelay: `${i * 300}ms`,
            }}
          />
        ))}
      </div>

      {/* The indeterminate point-size gauge — tiny mono that slowly grows. */}
      <p className="font-mono uppercase" style={{ minHeight: '1.4rem' }}>
        <span className={timedOut ? undefined : 'sf-grow'}>
          {timedOut ? TIMEOUT_COPY : READING_COPY}
        </span>
        <span aria-hidden className="sf-cursor" style={{ marginLeft: '0.15em' }}>
          ▍
        </span>
      </p>

      {/* The rule slowly filling — an ambient "still digging" gauge. */}
      <div
        aria-hidden
        style={{
          height: '2px',
          background: 'var(--line)',
          overflow: 'hidden',
          borderRadius: '1px',
        }}
      >
        <div
          className="sf-rule-fill"
          style={{ height: '100%', width: '100%', background: 'var(--ash-quiet)' }}
        />
      </div>
    </div>
  );
}
