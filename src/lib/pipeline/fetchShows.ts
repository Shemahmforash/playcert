import type { Show, TimeWindow } from '../types';
import type { Geo } from '../api/geo';

export const MIN_VIABLE_SHOWS = 8;
const NEXT_WINDOW: Record<TimeWindow, TimeWindow | null> = {
  tonight: 'this-weekend',
  'this-weekend': 'next-14-days',
  'next-14-days': null,
};

export interface WidenMeta { radiusKm?: number; window?: TimeWindow }
type Query = (geo: Geo, radiusKm: number, window: TimeWindow) => Promise<Show[]>;

export async function fetchShowsWithWiden(
  geo: Geo, window: TimeWindow, deps: { query: Query },
): Promise<{ shows: Show[]; widened?: WidenMeta }> {
  let shows = await deps.query(geo, 30, window);
  if (shows.length >= MIN_VIABLE_SHOWS) return { shows };

  shows = await deps.query(geo, 50, window);
  if (shows.length >= MIN_VIABLE_SHOWS) return { shows, widened: { radiusKm: 50 } };

  let w: TimeWindow | null = window;
  while ((w = NEXT_WINDOW[w])) {
    shows = await deps.query(geo, 50, w);
    if (shows.length >= MIN_VIABLE_SHOWS) return { shows, widened: { radiusKm: 50, window: w } };
  }
  const widened: WidenMeta = { radiusKm: 50 };
  if (window !== 'next-14-days') widened.window = 'next-14-days';
  return { shows, widened };
}
