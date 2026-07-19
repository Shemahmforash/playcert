import type { PlaylistEntry } from './pipeline/order';

/**
 * Day-grouping for the itinerary list (Task 2.4).
 *
 * The playlist arrives already chronologically ordered (see `orderPlaylist`).
 * The list renders one `DateDivider` per calendar day followed by that day's
 * ticket-stub rows, but the player still addresses tracks by their ORIGINAL
 * flat index — so grouping must carry each entry's original position through.
 *
 * All day math reads only the leading `YYYY-MM-DD` portion of `startsAt` and
 * pins it to UTC, so a trailing timezone offset can never shift an entry across
 * a midnight boundary (mirrors `dayAccentHue`). Two cities listing the same
 * wall-calendar night therefore share a day key, label and accent.
 */

// getUTCDay: 0 = Sunday … 6 = Saturday.
const WEEKDAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

/** Parse the leading calendar-date portion of an ISO string, offset-agnostic. */
function calendarParts(iso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) {
    throw new Error(`playlistGrouping: unrecognized date string "${iso}"`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Timezone-stable `YYYY-MM-DD` key for an ISO datetime string. */
export function dayKeyFor(iso: string): string {
  const { year, month, day } = calendarParts(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * The divider label, e.g. `SAT 20` — weekday abbrev + day-of-month, uppercase.
 * The day number is unpadded (`SAT 5`, not `SAT 05`).
 */
export function dateLabelFor(iso: string): string {
  const { year, month, day } = calendarParts(iso);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${WEEKDAY_ABBR[weekday]} ${day}`;
}

export interface DayGroupEntry {
  entry: PlaylistEntry;
  /** The entry's ORIGINAL flat index in the input array (player `currentIndex`). */
  index: number;
}

export interface DayGroup {
  /** Timezone-stable `YYYY-MM-DD` — stable React key + `dayAccentHue` input. */
  dayKey: string;
  /** e.g. `SAT 20`. */
  dateLabel: string;
  entries: DayGroupEntry[];
}

/**
 * Group already-chronological entries into consecutive-by-calendar-day buckets,
 * preserving each entry's original flat index.
 */
export function groupByDay(entries: PlaylistEntry[]): DayGroup[] {
  const groups: DayGroup[] = [];
  let current: DayGroup | null = null;

  entries.forEach((entry, index) => {
    const iso = entry.show.startsAt;
    const dayKey = dayKeyFor(iso);
    if (!current || current.dayKey !== dayKey) {
      current = { dayKey, dateLabel: dateLabelFor(iso), entries: [] };
      groups.push(current);
    }
    current.entries.push({ entry, index });
  });

  return groups;
}
