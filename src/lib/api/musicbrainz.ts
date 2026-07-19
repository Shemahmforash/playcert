import { z } from 'zod';
import { mbQueue } from '../queue';

const USER_AGENT = 'Earshot/1.0 (https://earshot.fm; contact@earshot.fm)'; // MANDATORY per MB ToS

const MbSearch = z.object({
  artists: z.array(z.object({
    id: z.string(),
    name: z.string(),
    score: z.number().optional(),
    area: z.object({ name: z.string() }).optional(),
    country: z.string().optional(),
    tags: z.array(z.object({ name: z.string() })).optional(),
  })),
});

export type CrossCheck = { status: 'confirmed'; mbid: string } | { status: 'unconfident' };
export interface EventContext { countryCode: string; genreHints: string[] }

export async function crossCheckArtist(
  name: string,
  ctx: EventContext,
  deps?: { rawFetch?: () => Promise<unknown> },
): Promise<CrossCheck> {
  try {
    const json = deps?.rawFetch
      ? await deps.rawFetch()
      : await mbQueue.schedule(async () => {
          const res = await fetch(
            `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json&limit=5`,
            { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(8000) },
          );
          if (!res.ok) throw new Error(`mb:${res.status}`);
          return res.json();
        });
    const { artists } = MbSearch.parse(json);
    const top = artists.find((a) => a.name.toLowerCase() === name.toLowerCase()) ?? artists[0];
    if (!top) return { status: 'unconfident' };
    const areaOk = top.country?.toUpperCase() === ctx.countryCode.toUpperCase();
    const tagNames = (top.tags ?? []).map((t) => t.name.toLowerCase());
    const genreOk = ctx.genreHints.some((g) => tagNames.some((t) => t.includes(g.toLowerCase())));
    return areaOk || genreOk ? { status: 'confirmed', mbid: top.id } : { status: 'unconfident' };
  } catch {
    return { status: 'unconfident' };
  }
}
