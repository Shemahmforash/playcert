import type { Artist, CityWindowBundle, Show, TimeWindow, Track } from '../types';
import type { Geo } from '../api/geo';
import type { WidenMeta } from './fetchShows';
import { memoInFlight, cacheKeys } from '../cache';
import { scoreArtists, type ProminenceSignals } from './score';

export type { CityWindowBundle } from '../types';

export interface BuildDeps {
  geocode: (city: string) => Promise<Geo>;
  fetchShows: (geo: Geo, window: TimeWindow) => Promise<{ shows: Show[]; widened?: WidenMeta }>;
  extract: (shows: Show[]) => Record<string, Artist>; // mutates shows[].artistIds
  resolveArtist: (artist: Artist) => Promise<Track[]>; // PER-ARTIST so the budget can be checked between artists
  // Prominence signals (R6), gathered AFTER resolution. Optional: default → {}
  // so all prominence collapses to 0 and existing behaviour is unaffected.
  getSignals?: (artists: Artist[]) => Promise<Record<string, ProminenceSignals>>;
  now: () => number; // injectable clock (ms)
  budgetMs?: number; // default 25_000 (R4)
}

const DEFAULT_BUDGET_MS = 25_000;

/**
 * Resolution priority (R4): resolve each artist by the EARLIEST slot they play.
 * The earliest slot is the min over the artist's billingSlots of the tuple
 * (startsAt of that show, slot). Sorting ascending puts the first gig's acts
 * first, and within a gig the opener (lower slot) before the headliner.
 */
function priorityOrder(artists: Artist[], shows: Show[]): Artist[] {
  const startsAtById = new Map(shows.map((s) => [s.id, s.startsAt]));
  const earliest = new Map<string, { startsAt: string; slot: number }>();
  for (const a of artists) {
    let best: { startsAt: string; slot: number } | undefined;
    for (const b of a.billingSlots) {
      const startsAt = startsAtById.get(b.showId) ?? '';
      if (!best || startsAt < best.startsAt || (startsAt === best.startsAt && b.slot < best.slot)) {
        best = { startsAt, slot: b.slot };
      }
    }
    earliest.set(a.id, best ?? { startsAt: '', slot: 0 });
  }
  return [...artists].sort((x, y) => {
    const ex = earliest.get(x.id)!;
    const ey = earliest.get(y.id)!;
    if (ex.startsAt !== ey.startsAt) return ex.startsAt < ey.startsAt ? -1 : 1;
    return ex.slot - ey.slot;
  });
}

export async function buildBundle(
  city: string,
  window: TimeWindow,
  deps: BuildDeps,
): Promise<CityWindowBundle> {
  const geo = await deps.geocode(city);
  const { shows, widened } = await deps.fetchShows(geo, window);
  const artists = deps.extract(shows); // fills shows[].artistIds in billed order

  const ordered = priorityOrder(Object.values(artists), shows);

  const start = deps.now();
  const budget = deps.budgetMs ?? DEFAULT_BUDGET_MS;
  const tracks: Track[] = [];
  for (const artist of ordered) {
    if (deps.now() - start >= budget) break; // over budget → partial bundle, stop resolving
    tracks.push(...(await deps.resolveArtist(artist)));
  }

  // R6 prominence scoring: gather signals (non-fatal, post-resolution) then
  // mutate each artist's prominence/tier. No getSignals → {} → all prominence 0.
  const allArtists = Object.values(artists);
  const signals = deps.getSignals ? await deps.getSignals(allArtists) : {};
  scoreArtists(allArtists, signals);

  const belowBar = tracks.length < 8;
  return {
    key: { city, window },
    builtAt: new Date(deps.now()).toISOString(),
    geo,
    widened,
    shows,
    artists,
    tracks,
    posterCount: shows.length,
    belowBar,
  };
}

const inFlight = memoInFlight<CityWindowBundle>();

/** Coalesces concurrent builds for the same (city, window) key into one in-flight build. */
export function buildBundleCached(
  city: string,
  window: TimeWindow,
  deps: BuildDeps,
): Promise<CityWindowBundle> {
  return inFlight(cacheKeys.bundle(city, window), () => buildBundle(city, window, deps));
}
