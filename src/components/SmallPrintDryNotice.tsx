'use client';

/**
 * SmallPrintDryNotice — the "Small Print runs dry" escape hatch (Task 3.7, §2.6).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6 "Sparse":
 *   "If Small Print leaves < 8 shows: `Small Print runs dry here — try No Arenas`
 *    with a one-tap dial link (not just prose)."
 *
 * Visually this mirrors SparseNotice's amber rubber-stamp overprint (`--stamp-amber`
 * wash + border, rounded stub, `role="status"`) so the two sparse notices read as
 * one family. Unlike SparseNotice it is NOT dismissible — it is an actionable
 * escape hatch, so `try No Arenas` is a real `<button>` (the "one-tap dial link,
 * not just prose" requirement) that moves the dial off Small Print on click.
 */

export interface SmallPrintDryNoticeProps {
  /** Moves the dial to No Arenas (updates URL + rebuilds). Wired to handleDialChange. */
  onTryNoArenas: () => void;
}

export function SmallPrintDryNotice({ onTryNoArenas }: SmallPrintDryNoticeProps) {
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
        onClick={onTryNoArenas}
        className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri hover:opacity-80"
        style={{ color: 'var(--stamp-amber)' }}
      >
        try No Arenas
      </button>
    </div>
  );
}
