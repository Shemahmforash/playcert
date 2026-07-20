import { notFound } from 'next/navigation';
import { cacheLife } from 'next/cache';
import { geoForCity } from '../api/geo';
import type { BuildDeps } from './buildBundle';
import { extractArtists } from './extractArtists';
import { resolveTracks } from './resolveTracks';
import { fetchJambaseShows } from '../api/jambase';
import { searchArtistTracks, type ItunesCandidate } from '../api/itunes';
import { crossCheckArtist } from '../api/musicbrainz';
import { itunesQueue } from '../queue';

const DAY = 60 * 60 * 24;

// Durable per-artist iTunes cache in Next's Data Cache, keyed on the (already
// normalized) artist name. Because it survives across serverless instances and
// bundle revalidations, a below-bar playlist genuinely FILLS OUT over successive
// 120s bundle rebuilds — each rebuild's first artists are cache hits (no queue
// slot), so the 25s budget reaches further down the bill. Only cold misses hit
// the rate queue, so iTunes' ~20/min limit is still respected.
async function cachedItunesSearch(name: string): Promise<ItunesCandidate[]> {
  'use cache: remote';
  cacheLife({ stale: 3600, revalidate: 30 * DAY, expire: 60 * DAY });
  return itunesQueue.schedule(() => searchArtistTracks(name));
}

/** Wires the hardened pipeline to the real TM/iTunes/MB clients for a given city slug. */
export function realDeps(city: string): BuildDeps {
  const geo = geoForCity(city);
  const ctx = { countryCode: geo?.countryCode ?? '', genreHints: [] as string[] };
  return {
    geocode: async () => {
      if (!geo) notFound();
      return geo!;
    },
    // JamBase is the primary source. Exactly ONE network call per build: a wide
    // fetch (50km / next-14-days) with local window filtering — no escalating
    // widen calls — to stay inside the 1k-calls/month free tier.
    fetchShows: (g, w) => fetchJambaseShows(g, w),
    extract: extractArtists,
    resolveArtist: (a) =>
      resolveTracks([a], {
        searchTracks: (n) => cachedItunesSearch(n),
        crossCheck: (n) => crossCheckArtist(n, ctx),
      }),
    now: () => Date.now(),
  } satisfies BuildDeps;
}
