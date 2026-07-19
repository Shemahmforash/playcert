'use client';

/**
 * NowPlayingTicker — the box-office thermal-ticket readout in the RadioPlayer
 * (Task 2.5).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.3 / §4. The scrolling
 * marquee is the mono box-office voice (`--font-mono`) and is `aria-hidden` — a
 * separate `aria-live="polite"` region announces track changes as a static,
 * screen-reader-friendly sentence, throttled to track boundaries by the parent
 * only re-rendering it when the track actually changes. Meaning is never
 * conveyed by the marquee alone.
 */

export interface NowPlayingTickerProps {
  /** The mono marquee line, e.g. `KHRUANGBIN — Talero · plays FRI 18 · EartH`. */
  text: string;
  /** The static sentence read aloud by assistive tech (differs in wording). */
  liveSentence: string;
}

export function NowPlayingTicker({ text, liveSentence }: NowPlayingTickerProps) {
  return (
    <div className="min-w-0 flex-1 overflow-hidden">
      {/* Visual marquee — decorative, hidden from the a11y tree. */}
      <div
        aria-hidden
        className="truncate font-mono text-xs"
        style={{ color: 'var(--ink)', letterSpacing: '0.02em' }}
      >
        {text}
      </div>
      {/* Static, politely-announced sentence for screen readers. */}
      <div className="sr-only" role="status" aria-live="polite">
        {liveSentence}
      </div>
    </div>
  );
}
