// Weekday ink ledger — the 7-hue structural cycle from the Phase 2 design system
// (docs/design/2026-07-19-phase2-design-system.md §1.1). Desaturated riso values,
// identical in dark and light contexts. Used only for perforation-glow, date stamps,
// active-row rules and low-opacity washes — never as a fill, never on type.
//
// Index 0 = Monday … 6 = Sunday (ISO weekday ordering).
const WEEKDAY_HUES = [
  '#5AA9E6', // Mon
  '#E68A5A', // Tue
  '#7FB25A', // Wed
  '#B27ADE', // Thu
  '#E6C15A', // Fri
  '#E67A9E', // Sat
  '#5AE6D0', // Sun
] as const;

/**
 * Returns the weekday's ink hue for a given date.
 *
 * The weekday is derived deterministically from the calendar day only. When a
 * string is passed we read just the `YYYY-MM-DD` portion and pin it to UTC, so
 * the same wall-calendar date resolves to the same hue regardless of the time or
 * timezone offset attached to it (two cities on the same date share an accent).
 */
export function dayAccentHue(isoDateOrDate: string | Date): string {
  let year: number;
  let month: number;
  let day: number;

  if (typeof isoDateOrDate === 'string') {
    // Parse only the leading calendar-date portion; ignore any time/offset that
    // could otherwise shift the day across a midnight boundary.
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDateOrDate.trim());
    if (!match) {
      throw new Error(`dayAccentHue: unrecognized date string "${isoDateOrDate}"`);
    }
    year = Number(match[1]);
    month = Number(match[2]);
    day = Number(match[3]);
  } else {
    // Derive from the Date's UTC calendar day for the same timezone-stability.
    year = isoDateOrDate.getUTCFullYear();
    month = isoDateOrDate.getUTCMonth() + 1;
    day = isoDateOrDate.getUTCDate();
  }

  // getUTCDay: 0 = Sunday … 6 = Saturday. Remap to 0 = Monday … 6 = Sunday.
  const utcDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isoIndex = (utcDay + 6) % 7;
  return WEEKDAY_HUES[isoIndex];
}
