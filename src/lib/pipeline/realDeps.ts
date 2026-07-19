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
 * Durable per-artist ListenBrainz listen-count cache (keyed on the MB-confirmed
 * mbid). ListenBrainz is a keyless ~1-req/s courtesy queue with NO caching of its
 * own, so without this every bundle rebuild re-ran the queue serially over every
 * artist — on a busy market that alone was 60-90s. A durable cache turns warm
 * rebuilds into hits (no queue slot), so prominence FILLS OUT over reloads.
 */
async function cachedListenCount(mbid: string): Promise<number | null> {
  'use cache: remote';
  cacheLife({ stale: 3600, revalidate: 7 * DAY, expire: 30 * DAY });
  try {
    return await getArtistListenCount({ mbid, name: '' });
  } catch {
    return null;
  }
}

// Hard wall-clock cap on ListenBrainz gathering, mirroring the resolution budget
// (R4). It can NEVER blow up a build: whatever we reach fills in; the rest stay
// null (→ prominence contribution 0, strictly non-fatal).
const SIGNALS_BUDGET_MS = 12_000;

/**
 * Gather prominence signals AFTER resolution, for the RESOLVED artists only
 * (buildBundle passes just those — see its note). Strictly NON-FATAL: a listens
 * miss, a releaseCount miss, or a thrown error all collapse to null.
 *
 * releaseCount is a warm iTunes-cache hit for every resolved artist (resolution
 * just populated it), so it runs in parallel and is cheap. ListenBrainz is the
 * expensive, rate-limited leg, so we walk it SEQUENTIALLY under a hard budget and
 * lean on `cachedListenCount` — bounding one build while the durable cache lets
 * successive rebuilds hit and complete.
 */
async function getSignals(artists: Artist[]): Promise<Record<string, ProminenceSignals>> {
  const out: Record<string, ProminenceSignals> = {};
  await Promise.all(
    artists.map(async (artist) => {
      out[artist.id] = { listens: null, releaseCount: await releaseCountFor(artist) };
    }),
  );
  const deadline = Date.now() + SIGNALS_BUDGET_MS;
  for (const artist of artists) {
    if (Date.now() >= deadline) break; // budget spent → the rest stay null
    if (!artist.mbid) continue; // need an mbid to query LB at all
    out[artist.id].listens = await cachedListenCount(artist.mbid);
  }
  return out;
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
