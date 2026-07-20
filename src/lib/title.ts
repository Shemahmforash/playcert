// src/lib/title.ts
// PURE, URL-derived page-title + date-range helpers for canonical metadata and
// the OpenGraph card. Derives everything from the URL params (city slug +
// window) — NEVER from the bundle / JamBase — so social crawlers hitting the OG
// image can't trigger a paid data fetch. `now` is always passed in (never
// `new Date()` here) so the derivation is deterministic and unit-testable.
import type { TimeWindow } from './types';
import { geoForCity } from './api/geo';

const MONTHS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
] as const;

// EN DASH (U+2013) — a range separator, not a hyphen.
const EN_DASH = '–';

// Inclusive span in days added to `now` for each window's end day. `tonight` is
// a single day (span 0); `this-weekend` covers today..+3d; `next-14-days` is a
// 14-day inclusive window → today..+13d.
const WINDOW_SPAN_DAYS: Record<TimeWindow, number> = {
  tonight: 0,
  'this-weekend': 3,
  'next-14-days': 13,
};

/** Midnight-UTC date `days` after the UTC calendar day of `base` (handles month/year rollover). */
function addUtcDays(base: Date, days: number): Date {
  return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + days));
}

/**
 * The covered city's `displayName` (e.g. `london` → `London`), else a
 * title-cased slug fallback (`sao-paulo` → `Sao Paulo`) for cities not yet in
 * the covered table.
 */
export function cityDisplay(citySlug: string): string {
  const geo = geoForCity(citySlug);
  if (geo) return geo.displayName;
  return citySlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Human date range for a window relative to `now`, `MON D` uppercase:
 *  - single-day (`tonight`)          → `JUL 20`
 *  - same-month range                → `JUL 20–31` (end day only)
 *  - month-crossing range            → `JUL 25–AUG 7` (month on both ends)
 * Uses UTC calendar fields so the output is stable regardless of server TZ.
 */
export function dateRangeLabel(window: TimeWindow, now: Date): string {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const span = WINDOW_SPAN_DAYS[window];
  const startMon = MONTHS[start.getUTCMonth()];
  const startDay = start.getUTCDate();

  if (span === 0) return `${startMon} ${startDay}`;

  const end = addUtcDays(start, span);
  const endMon = MONTHS[end.getUTCMonth()];
  const endDay = end.getUTCDate();

  return startMon === endMon
    ? `${startMon} ${startDay}${EN_DASH}${endDay}`
    : `${startMon} ${startDay}${EN_DASH}${endMon} ${endDay}`;
}

/** e.g. `LONDON · JUL 20–AUG 2`. City uppercased; date range from the window. */
export function pageTitle(citySlug: string, window: TimeWindow, now: Date): string {
  return `${cityDisplay(citySlug).toUpperCase()} · ${dateRangeLabel(window, now)}`;
}

/** One honest description line for search + social unfurls. */
export function pageDescription(citySlug: string): string {
  return `Concerts near ${cityDisplay(citySlug)}, read bottom-up — hear the openers before the headliners.`;
}
