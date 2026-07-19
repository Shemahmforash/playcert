import { notFound } from 'next/navigation';
import { geoForCity } from '../api/geo';
import type { TimeWindow } from '../types';
import type { BuildDeps } from './buildBundle';
import { fetchShowsWithWiden } from './fetchShows';
import { extractArtists, slugify } from './extractArtists';
import { resolveTracks } from './resolveTracks';
import { fetchAllEvents } from '../api/ticketmaster';
import { searchArtistTracks, type ItunesCandidate } from '../api/itunes';
import { crossCheckArtist } from '../api/musicbrainz';
import { itunesQueue } from '../queue';
import { cacheKeys } from '../cache';

function windowRange(w: TimeWindow) {
  const iso = (d: Date) => d.toISOString().replace(/\.\d+Z$/, 'Z');
  const now = new Date();
  const days = w === 'tonight' ? 1 : w === 'this-weekend' ? 3 : 14;
  return { startISO: iso(now), endISO: iso(new Date(now.getTime() + days * 864e5)) };
}

// Request-scoped iTunes de-dupe: one in-flight promise per artist slug so the
// same act billed on multiple shows only costs one queued search per build.
const _itunesCache = new Map<string, Promise<ItunesCandidate[]>>();
function cachedItunesSearch(name: string) {
  const key = cacheKeys.itunes(slugify(name));
  let p = _itunesCache.get(key);
  if (!p) {
    p = itunesQueue.schedule(() => searchArtistTracks(name));
    _itunesCache.set(key, p);
  }
  return p;
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
