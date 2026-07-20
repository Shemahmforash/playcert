import { notFound } from 'next/navigation';
import { cacheLife } from 'next/cache';
import { geoForCity } from '../api/geo';
import type { TimeWindow } from '../types';
import type { BuildDeps } from './buildBundle';
import { fetchShowsWithWiden } from './fetchShows';
import { extractArtists } from './extractArtists';
import { resolveTracks } from './resolveTracks';
import { fetchAllEvents } from '../api/ticketmaster';
import { searchArtistTracks, type ItunesCandidate } from '../api/itunes';
import { crossCheckArtist } from '../api/musicbrainz';
import { itunesQueue } from '../queue';

function windowRange(w: TimeWindow) {
  const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');
  const now = new Date();
  const days = w === 'tonight' ? 1 : w === 'this-weekend' ? 3 : 14;
  return { startISO: iso(now), endISO: iso(new Date(now.getTime() + days * 864e5)) };
}

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
    fetchShows: (g, w) =>
      fetchShowsWithWiden(g, w, {
        query: async (gg, radiusKm, ww) => {
          const { startISO, endISO } = windowRange(ww);
          return fetchAllEvents({
            apikey: process.env.TICKETMASTER_KEY!,
            latlong: `${gg.lat},${gg.lng}`,
            radiusKm,
            startDateTime: startISO,
            endDateTime: endISO,
          });
        },
      }),
    extract: extractArtists,
    resolveArtist: (a) =>
      resolveTracks([a], {
        searchTracks: (n) => cachedItunesSearch(n),
        crossCheck: (n) => crossCheckArtist(n, ctx),
      }),
    now: () => Date.now(),
  } satisfies BuildDeps;
}
