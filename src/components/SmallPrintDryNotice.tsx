'use client';

import { FONT_STOP_LABELS } from '../lib/urlState';

/**
 * SmallPrintDryNotice — the "Small Print runs dry" escape hatch (Task 3.7, §2.6).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6 "Sparse":
 *   "If Small Print leaves < 8 shows: `Small Print runs dry here — try {next stop}`
 *    with a one-tap dial link (not just prose)."
 *
 * The suggested stop's LABEL comes from FONT_STOP_LABELS (single source of truth)
 * so this link never drifts from the dial's own label (it used to read the stale
 * "No Arenas" after the middle stop was renamed to "Trimmed").
 *
 * Visually this mirrors SparseNotice's amber rubber-stamp overprint (`--stamp-amber`
 * wash + border, rounded stub, `role="status"`) so the two sparse notices read as
 * one family. Unlike SparseNotice it is NOT dismissible — it is an actionable
 * escape hatch: a real `<button>` (the "one-tap dial link, not just prose"
 * requirement) that moves the dial off Small Print on click.
 */

export interface SmallPrintDryNoticeProps {
  /** Moves the dial one stop up, to Trimmed (updates URL + rebuilds). Wired to handleDialChange. */
  onTryTrimmed: () => void;
}

export function SmallPrintDryNotice({ onTryTrimmed }: SmallPrintDryNoticeProps) {
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-1 gap-y-1 rounded-[var(--radius-stub,4px)] px-3 py-2 text-sm"
      style={{
        color: 'var(--stamp-amber)',
        border: '1px solid var(--stamp-amber)',
        // Faint amber wash so it reads as an overprinted rubber-stamp tag.
        background: 'color-mix(in srgb, var(--stamp-amber) 10%, transparent)',
      }}
    >
      <span>Small Print runs dry here —</span>
      <button
        type="button"
        onClick={onTryTrimmed}
        className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri hover:opacity-80"
        style={{ color: 'var(--stamp-amber)' }}
      >
        try {FONT_STOP_LABELS['no-arenas']}
      </button>
    </div>
  );
}
