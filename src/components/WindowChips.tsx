import type { TimeWindow } from '../lib/types';
import { WINDOWS } from '../lib/urlState';

/**
 * WindowChips — the three time windows as selectable box-office chips.
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §1.2 (chip = Inter, 12px,
 * `--radius-chip 2px`). Reusable + fully controlled: the parent owns `value` and
 * is told about changes via `onChange`. Used by the landing CityPicker (Task 2.7)
 * and re-used on the playlist page (Task 2.11), so it carries zero routing logic.
 */

export const WINDOW_CHIP_LABELS: Record<TimeWindow, string> = {
  tonight: 'Tonight',
  'this-weekend': 'This weekend',
  'next-14-days': 'Next 14 days',
};

export interface WindowChipsProps {
  value: TimeWindow;
  onChange: (window: TimeWindow) => void;
  /** aria-label for the radiogroup wrapper. */
  label?: string;
}

export function WindowChips({ value, onChange, label = 'Time window' }: WindowChipsProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {WINDOWS.map((w) => {
        const selected = w === value;
        return (
          <button
            key={w}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(w)}
            className={[
              'rounded-[2px] px-3 py-1.5 text-xs font-medium tracking-wide transition-colors',
              'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri',
              selected
                ? 'bg-surface-raised text-ink ring-1 ring-inset ring-line'
                : 'text-ash hover:text-ink',
            ].join(' ')}
          >
            {WINDOW_CHIP_LABELS[w]}
          </button>
        );
      })}
    </div>
  );
}
