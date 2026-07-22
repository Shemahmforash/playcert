import { z } from 'zod';
import { safeHttpUrl } from '../safeUrl';

// ---------------------------------------------------------------------------
// KEYLESS iTunes Search API client (spike Task 0.3).
//   GET https://itunes.apple.com/search?term={name}&entity=musicTrack&limit=25
//
// Zod schema adapted to the REAL recorded fixture (tests/fixtures/itunes/
// exact-hit.json, "Joe Bonamassa"). Reality vs the original plan:
//   - The result rows carry MANY fields (collection*, disc*, *Explicitness,
//     genre, prices…). We validate only the ones we consume and let the schema
//     be non-strict so Apple can add/drop fields freely.
//   - previewUrl / trackName / artworkUrl100 / trackViewUrl / artistViewUrl are
//     all technically optional on the wire (music-video and some non-song rows
//     omit previewUrl). parseSearch FILTERS OUT any row lacking a previewUrl, so
//     an ItunesCandidate always has a playable stream — parseSearch never throws.
//   - artistId/trackId arrive as NUMBERS. artistId is coerced to string to match
//     the Track.artistId contract; itunesTrackId stays numeric.
// ---------------------------------------------------------------------------

const resultSchema = z.object({
  wrapperType: z.string().optional(),
  kind: z.string().optional(),
  artistId: z.number().optional(),
  trackId: z.number().optional(),
  collectionId: z.number().optional(), // album id — R6 catalog-depth proxy (distinct count)
  artistName: z.string().optional(),
  trackName: z.string().optional(),
  previewUrl: z.string().optional(),
  artworkUrl100: z.string().optional(),
  trackViewUrl: z.string().optional(),
  artistViewUrl: z.string().optional(),
});

const searchResponseSchema = z.object({
  resultCount: z.number().optional(),
  results: z.array(resultSchema).optional(),
});

export interface ItunesCandidate {
  artistId: string;
  itunesTrackId: number;
  collectionId?: number; // album id, when present — powers the R6 release-count proxy
  artistName: string;
  title: string;
  previewUrl: string;
  artworkUrl: string;
  itunesUrl: string;
}

/**
 * Validate a raw iTunes Search response and project it into candidates.
 * Only rows that HAVE a previewUrl (a playable 30s stream) and the minimal
 * identifying fields are kept. Never throws on the real fixture shape.
 */
export function parseSearch(json: unknown): ItunesCandidate[] {
  const parsed = searchResponseSchema.parse(json);
  const results = parsed.results ?? [];
  const out: ItunesCandidate[] = [];
  for (const r of results) {
    // safeHttpUrl drops any non-http(s) scheme before these URLs reach the
    // client's <audio src>/<img src>/<a href>. A row whose previewUrl is not a
    // playable http(s) stream is dropped entirely (same as a missing preview).
    const previewUrl = safeHttpUrl(r.previewUrl);
    if (!previewUrl) continue; // must be a playable http(s) stream
    if (r.trackId == null || r.artistName == null) continue;
    out.push({
      artistId: r.artistId != null ? String(r.artistId) : '',
      itunesTrackId: r.trackId,
      collectionId: r.collectionId,
      artistName: r.artistName,
      title: r.trackName ?? '',
      previewUrl,
      artworkUrl: safeHttpUrl(r.artworkUrl100),
      // Apple linkback (ToS): prefer the track view, fall back to artist view.
      itunesUrl: safeHttpUrl(r.trackViewUrl ?? r.artistViewUrl ?? ''),
    });
  }
  return out;
}

/**
 * Return the first candidate whose artistName is a case-insensitive, trimmed
 * EXACT match for `normalizedName`; null if none. This is the strict picker —
 * fuzzy/MusicBrainz confirmation is a Phase 1 concern, deliberately not here.
 */
export function pickExact(
  candidates: ItunesCandidate[],
  normalizedName: string,
): ItunesCandidate | null {
  const target = normalizedName.trim().toLowerCase();
  for (const c of candidates) {
    if (c.artistName.trim().toLowerCase() === target) return c;
  }
  return null;
}

const SEARCH_URL = 'https://itunes.apple.com/search';

/**
 * Live keyless search for an artist's tracks. 10s timeout. Throws on non-2xx
 * (caller decides on 403/429 backoff — the unofficial limit is ~20 req/min).
 */
export async function searchArtistTracks(
  name: string,
): Promise<ItunesCandidate[]> {
  const q = new URLSearchParams({
    term: name,
    entity: 'musicTrack',
    limit: '25',
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(`${SEARCH_URL}?${q.toString()}`, {
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`iTunes ${res.status}: ${await res.text()}`);
    }
    return parseSearch(await res.json());
  } finally {
    clearTimeout(timeout);
  }
}
