import { notFound } from 'next/navigation';
import { cacheLife } from 'next/cache';
import { geoForCity } from '../api/geo';
import type { BuildDeps } from './buildBundle';
import { extractArtists } from './extractArtists';
import { resolveTracks } from './resolveTracks';
import { fetchJambaseShows, filterShowsToWindow } from '../api/jambase';
import { searchArtistTracks, type ItunesCandidate } from '../api/itunes';
import { crossCheckArtist } from '../api/musicbrainz';
import { itunesQueue } from '../queue';
import { TTL } from '../cache';

const DAY = 60 * 60 * 24;

/**
 * The JamBase show-fetch, in its OWN durable 72h 'use cache: remote' layer keyed
 * by CITY ONLY — NOT the window, NOT fontStop, NOT the dial. This is the single
 * seam that decouples the (paid, quota-limited) JamBase call from the bundle's
 * resolution: the ONE JamBase network call now lives exclusively inside this
 * 72h-cached function, and — because the fetch is window-INDEPENDENT (it returns
 * the raw wide next-14-days Show[]) — it fires at most ~once per 72h per CITY,
 * NOT once per (city × window). The three windows now SHARE one cached wide fetch
 * and each derive their slice locally (see `filterShowsToWindow`), cutting the
 * JamBase call count by 3× (1,680 → 560/month worst case at the 56-city table).
 *
 * Because the outer `getBundle` can then run a SHORT TTL, a bundle rebuild reuses
 * this cached Show[] (zero new JamBase calls) and only re-runs the free iTunes
 * resolution — filling the bill out further each pass off the 30-day iTunes
 * cache. This is exactly the `cachedItunesSearch` pattern, one level up.
 *
 * Keyed on the city SLUG (not the resolved Geo object) so the cache key stays a
 * small, stable string; the geo is re-derived deterministically inside.
 *
 * VERIFIED (spike 5.5, `next start`, bundle TTL forced to 30s): across a cold
 * build + 4 rebuilds the JamBase call fired EXACTLY ONCE while the free iTunes
 * re-resolution filled the bill out 12 → 24 → 30 songs.
 */
async function getShows(city: string) {
  'use cache: remote';
  cacheLife({ stale: 3600, revalidate: TTL.SHOWS, expire: 2 * TTL.SHOWS });
  const geo = geoForCity(city);
  if (!geo) notFound();
  return fetchJambaseShows(geo);
}

// Durable per-artist iTunes cache in Next's Data Cache, keyed on the (already
// normalized) artist name. Because it survives across serverless instances and
// bundle revalidations, a below-bar playlist genuinely FILLS OUT over successive
// bundle rebuilds (3h, 2h degraded) — each rebuild's first artists are cache hits (no queue
// slot), so the 25s budget reaches further down the bill. Only cold misses hit
// the rate queue, so iTunes' ~20/min limit is still respected.
async function cachedItunesSearch(name: string): Promise<ItunesCandidate[]> {
  'use cache: remote';
  cacheLife({ stale: 3600, revalidate: 30 * DAY, expire: 60 * DAY });
  return itunesQueue.schedule(() => searchArtistTracks(name));
}

/** Wires the hardened pipeline to the real JamBase/iTunes/MB clients for a given city slug. */
export function realDeps(city: string): BuildDeps {
  const geo = geoForCity(city);
  const ctx = { countryCode: geo?.countryCode ?? '', genreHints: [] as string[] };
  return {
    geocode: async () => {
      if (!geo) notFound();
      return geo!;
    },
    // JamBase is the primary source. Exactly ONE network call per COLD show-fetch:
    // a wide, window-INDEPENDENT fetch (50km / next-14-days) — no escalating widen
    // calls — to stay inside the 1k-calls/month free tier. The call is wrapped in
    // the 72h `getShows` cache above, keyed on CITY ONLY, so all three windows
    // share it and short bundle rebuilds make ZERO new JamBase calls. Here we take
    // the cached wide Show[] and apply the PURE (network-free) window filter,
    // returning the same { shows, widened } shape buildBundle expects. The passed
    // geo is ignored (getShows re-resolves it from the slug for a stable cache key).
    fetchShows: async (_g, w) => filterShowsToWindow(await getShows(city), w),
    extract: extractArtists,
    resolveArtist: (a) =>
      resolveTracks([a], {
        searchTracks: (n) => cachedItunesSearch(n),
        crossCheck: (n) => crossCheckArtist(n, ctx),
      }),
    now: () => Date.now(),
  } satisfies BuildDeps;
}
