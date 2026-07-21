import type { TimeWindow, FontStop } from './types';

export const WINDOWS = ['tonight', 'this-weekend', 'next-14-days'] as const;
export const FONT_STOPS = ['everything', 'no-arenas', 'small-print'] as const;

/**
 * Human-facing labels for the three dial stops — the SINGLE source of truth so
 * the dial, the "runs dry" escape hatch, the rebuild announcement and the empty-
 * state recovery link never drift apart (e.g. the dial saying TRIMMED while a
 * notice still said "No Arenas"). Title case; consumers uppercase as needed —
 * the dial renders them uppercased.
 */
export const FONT_STOP_LABELS: Record<FontStop, string> = {
  everything: 'Marquee',
  'no-arenas': 'Trimmed',
  'small-print': 'Small Print',
};
export const SLUG_RE = /^[a-z0-9-]{2,40}$/;

export interface RequestKey { city: string; window: TimeWindow; fontStop: FontStop }
export type ParseResult =
  | { ok: true; key: RequestKey }
  | { ok: false; reason: 'city' | 'window' | 'fontStop' };

export function parseUrlState(city: string, window: string, fontStop: string[] | undefined): ParseResult {
  if (!SLUG_RE.test(city)) return { ok: false, reason: 'city' };
  if (!(WINDOWS as readonly string[]).includes(window)) return { ok: false, reason: 'window' };
  if (fontStop && fontStop.length > 1) return { ok: false, reason: 'fontStop' };
  const stop = fontStop?.[0] ?? 'everything';
  if (!(FONT_STOPS as readonly string[]).includes(stop)) return { ok: false, reason: 'fontStop' };
  return { ok: true, key: { city, window: window as TimeWindow, fontStop: stop as FontStop } };
}

export function formatCanonicalPath(key: RequestKey): string {
  const base = `/${key.city}/${key.window}`;
  return key.fontStop === 'everything' ? base : `${base}/${key.fontStop}`;
}
