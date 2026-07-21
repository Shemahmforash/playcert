'use client';

import { useEffect, useRef, useState } from 'react';
import type { TimeWindow } from '../lib/types';
import { WINDOWS } from '../lib/urlState';

/**
 * WindowChips — the three time windows as selectable box-office chips.
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §1.2 (chip = Inter, 12px,
 * `--radius-chip 2px`). Reusable + fully controlled: the parent owns `value` and
 * is told about changes via `onChange`. Used by the landing CityPicker (Task 2.7)
 * and re-used on the playlist page (Task 2.11), so it carries zero routing logic.
 *
 * Task 2.11 adds a `collapsed` mode: while the radio is Playing the chips fold
 * down to just the active chip (to stay out of the way). Tapping it expands to
 * all three; selecting one — or tapping/keyboarding away — folds it back.
 */

export const WINDOW_CHIP_LABELS: Record<TimeWindow, string> = {
  tonight: 'Tonight',
  'this-weekend': 'This weekend',
  'next-14-days': 'Next 14 days',
};

const CHIP_CLASS = [
  // `relative` anchors the hit-slop overlay; `whitespace-nowrap` keeps
  // "This weekend" / "Next 14 days" from breaking mid-label so the row stays
  // one stable line at ~390px (the wrap-unevenly bug).
  'relative whitespace-nowrap rounded-[2px] px-3 py-1.5 text-xs font-medium tracking-wide transition-colors',
  // ~44px effective hit area without inflating the compact ~28px pill: a
  // centred, transparent overlay (part of the <button>, so taps still count as
  // the button) extends the touch target vertically to h-11 (44px).
  'after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[\'\']',
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri',
];

function chipClass(selected: boolean): string {
  return [
    ...CHIP_CLASS,
    selected
      // Selected — stays the loudest: raised stub + full-strength ink.
      ? 'bg-surface-raised text-ink ring-1 ring-inset ring-line'
      // Unselected — a quiet-but-tappable resting pill: a hairline --line ring
      // and a subtle --surface fill give a visible affordance so it reads as a
      // control, not inert ash text — quieter than, yet distinct from, selected.
      : 'bg-surface text-ash ring-1 ring-inset ring-line hover:bg-surface-raised hover:text-ink',
  ].join(' ');
}

export interface WindowChipsProps {
  value: TimeWindow;
  onChange: (window: TimeWindow) => void;
  /** aria-label for the radiogroup wrapper. */
  label?: string;
  /**
   * Collapsed mode (Task 2.11): show ONLY the active chip until tapped. Driven by
   * the playlist page's `state.playing`. When false, all three chips always show.
   */
  collapsed?: boolean;
}

export function WindowChips({
  value,
  onChange,
  label = 'Time window',
  collapsed = false,
}: WindowChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // If we leave collapsed mode (radio pauses), drop any expanded state so the
  // full row isn't left half-open.
  useEffect(() => {
    if (!collapsed) setExpanded(false);
  }, [collapsed]);

  // Collapsed + not yet expanded → a single chip that expands on tap.
  if (collapsed && !expanded) {
    return (
      <div ref={rootRef} role="group" aria-label={label} className="flex flex-nowrap gap-2">
        <button
          type="button"
          aria-pressed
          aria-expanded={false}
          onClick={() => setExpanded(true)}
          className={chipClass(true)}
        >
          {WINDOW_CHIP_LABELS[value]}
        </button>
      </div>
    );
  }

  // Full row — either always-on (not collapsed) or the expanded collapsed state.
  const collapseAfterSelect = () => {
    if (collapsed) setExpanded(false);
  };

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className="flex flex-nowrap gap-2"
      onBlur={(e) => {
        // Tapping/keyboarding away (focus leaves the group) folds it back.
        if (collapsed && !rootRef.current?.contains(e.relatedTarget as Node | null)) {
          setExpanded(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') collapseAfterSelect();
      }}
    >
      {WINDOWS.map((w) => {
        const selected = w === value;
        return (
          <button
            key={w}
            type="button"
            aria-pressed={selected}
            onClick={() => {
              onChange(w);
              collapseAfterSelect();
            }}
            className={chipClass(selected)}
          >
            {WINDOW_CHIP_LABELS[w]}
          </button>
        );
      })}
    </div>
  );
}
