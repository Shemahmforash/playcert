import { dayAccentHue } from '../lib/dayAccent';

/**
 * DateDivider — the day header that breaks the itinerary into calendar days
 * (Task 2.4).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §1.1. The day's weekday
 * ink (from `dayAccentHue`) drives everything here and nowhere else on the row:
 * a top rule in the accent, the `--font-display` condensed-caps date label in
 * the accent, and a faint accent tint wash seating behind the day's stubs. The
 * accent is never used as a fill or on the stub type itself — only structure.
 */

export interface DateDividerProps {
  /** ISO datetime of the day (only the `YYYY-MM-DD` portion is read). */
  iso: string;
  /** Pre-formatted label, e.g. `SAT 20`. */
  label: string;
}

export function DateDivider({ iso, label }: DateDividerProps) {
  const accent = dayAccentHue(iso);

  return (
    <div
      className="px-3 pb-1 pt-4"
      style={{
        borderTop: `2px solid ${accent}`,
        // Faint accent wash (~8% alpha via 8-digit hex) behind the day's rows.
        background: `${accent}14`,
      }}
    >
      <span
        className="font-display uppercase"
        style={{
          color: accent,
          fontSize: '13px',
          letterSpacing: '0.12em',
          fontVariationSettings: "'wght' 700, 'wdth' 75, 'opsz' 20",
        }}
      >
        {label}
      </span>
    </div>
  );
}
