import { z } from 'zod';
import { lbQueue } from '../queue';

const USER_AGENT = 'Earshot/1.0 (https://earshot.fm; contact@earshot.fm)'; // MANDATORY courtesy header (keyless API)

// ListenBrainz popularity endpoint returns an array of per-MBID stats.
// See NOTES.md — exact endpoint + response shape need a later live-verification spike.
const LbPopularity = z.array(
  z.object({
    artist_mbid: z.string().optional(),
    total_listen_count: z.number().nullable().optional(),
    total_user_count: z.number().nullable().optional(),
  }),
);

/**
 * Keyless ListenBrainz listen-count signal for prominence scoring.
 * MBID-centric: without an MBID we can't reliably query, so we return null
 * ("unknown" → the scorer contributes 0 pre-normalization). Strictly NON-FATAL:
 * any non-2xx / timeout / parse-failure / missing count → null, never throws.
 */
export async function getArtistListenCount(
  params: { mbid?: string; name: string },
  deps?: { rawFetch?: () => Promise<unknown> },
): Promise<number | null> {
  // Can't query by name reliably in v1 — need an MBID (from the MB cross-check).
  if (!params.mbid && !deps?.rawFetch) return null;
  try {
    const json = deps?.rawFetch
      ? await deps.rawFetch()
      : await lbQueue.schedule(async () => {
          const res = await fetch(
            `https://api.listenbrainz.org/1/popularity/artist?artist_mbids=${encodeURIComponent(params.mbid!)}`,
            { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) },
          );
          if (!res.ok) throw new Error(`lb:${res.status}`);
          return res.json();
        });
    const rows = LbPopularity.parse(json);
    const row = params.mbid
      ? (rows.find((r) => r.artist_mbid === params.mbid) ?? rows[0])
      : rows[0];
    const count = row?.total_listen_count;
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}
