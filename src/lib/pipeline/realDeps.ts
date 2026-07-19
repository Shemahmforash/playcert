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
import { getArtistListenCount } from '../api/listenbrainz';
import type { Artist } from '../types';
import type { ProminenceSignals } from './score';
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

/**
 * R6 release-count proxy: iTunes catalog depth = number of DISTINCT albums
 * (collectionId) the artist appears on across the already-fetched search
 * candidates. PIGGYBACKED — cachedItunesSearch was populated for this exact
 * (normalized) name during resolution, so this is a durable-cache HIT and
 * consumes NO extra queue slot. Non-fatal: any failure / no albums → null.
 */
async function releaseCountFor(artist: Artist): Promise<number | null> {
  try {
    const candidates = await cachedItunesSearch(artist.normalizedName);
    if (candidates.length === 0) return null;
    const target = artist.normalizedName.trim().toLowerCase();
    // Prefer the artist's own rows; fall back to the whole result set if the
    // iTunes artistName never matches the normalized name exactly.
    const own = candidates.filter((c) => c.artistName.trim().toLowerCase() === target);
    const pool = own.length > 0 ? own : candidates;
    const albums = new Set<number>();
    for (const c of pool) if (c.collectionId != null) albums.add(c.collectionId);
    return albums.size > 0 ? albums.size : null;
  } catch {
    return null;
  }
}

/**
 * Gather prominence signals AFTER resolution. Strictly NON-FATAL per artist:
 * a listens miss, a releaseCount miss, or a thrown error all collapse to null
 * (→ contributes 0 in scoreArtists). Runs in parallel and leans on the durable
 * iTunes cache, so it does not materially extend the 25s resolution budget:
 * ListenBrainz only fires for MB-confirmed artists (those with an mbid), and
 * releaseCount is a cache hit for every artist that was resolved.
 */
async function getSignals(artists: Artist[]): Promise<Record<string, ProminenceSignals>> {
  const entries = await Promise.all(
    artists.map(async (artist): Promise<[string, ProminenceSignals]> => {
      const [listens, releaseCount] = await Promise.all([
        // Only mbid-bearing (mb-confirmed) artists get a real count; else null.
        getArtistListenCount({ mbid: artist.mbid, name: artist.normalizedName }).catch(() => null),
        releaseCountFor(artist),
      ]);
      return [artist.id, { listens, releaseCount }];
    }),
  );
  return Object.fromEntries(entries);
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
    getSignals,
    now: () => Date.now(),
  } satisfies BuildDeps;
}
