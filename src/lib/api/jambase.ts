import { z } from 'zod';
import type { Show, TimeWindow, WidenMeta } from '@/lib/types';
import type { Geo } from './geo';
import { jambaseQueue } from '../queue';

// ---------------------------------------------------------------------------
// JamBase v3 events adapter — mirrors the Ticketmaster client's shape so the
// pipeline stays source-agnostic. Schemas are NON-strict (tolerate missing
// fields exactly like the TM schema) so JamBase can add/omit keys freely and
// parsing never throws on real data.
//
// Validated against the live spike + tests/fixtures/jambase/events-sample.json.
// ---------------------------------------------------------------------------

const performerSchema = z.object({
  name: z.string().optional(),
  'x-isHeadliner': z.boolean().optional(),
});

const offerSchema = z.object({
  url: z.string().optional(),
  category: z.string().optional(),
  // seller is unused by toShow and comes back as either a string or an object
  // depending on tier — accept anything so parsing never throws.
  seller: z.unknown().optional(),
});

const locationSchema = z.object({
  name: z.string().optional(),
  address: z.object({ addressLocality: z.string().optional() }).optional(),
  geo: z.unknown().optional(),
});

const eventSchema = z.object({
  identifier: z.string().optional(),
  name: z.string().optional(),
  startDate: z.string().optional(),
  url: z.string().optional(),
  location: locationSchema.optional(),
  offers: z.array(offerSchema).optional(),
  performer: z.array(performerSchema).optional(),
});

const eventsEnvelopeSchema = z.object({
  events: z.array(eventSchema).optional(),
  pagination: z.unknown().optional(),
});

export type JambaseEvent = z.infer<typeof eventSchema>;

/**
 * Typed error thrown by fetchJambaseShows on a non-2xx / quota (403) response.
 * The page catches this by name to degrade gracefully to <ErrorState /> while
 * the edge serves stale.
 */
export class JambaseError extends Error {
  name = 'JambaseError';
  constructor(msg: string) {
    super(msg);
  }
}

export function toShow(event: JambaseEvent): Show {
  const rawId = event.identifier ?? '';
  const id = `jb:${rawId.replace(/^jambase:/, '')}`;

  // ticketUrl: prefer the primary ticketing offer, else first offer, else the
  // jambase linkback. Any utm_source=jambase attribution query is kept intact.
  const offers = event.offers ?? [];
  const ticketUrl =
    offers.find((o) => o.category === 'ticketingLinkPrimary')?.url ??
    offers[0]?.url ??
    event.url ??
    '';

  // Billing order is LOAD-BEARING: the slot model needs opener-first,
  // headliner-LAST. JamBase's performer[] is NOT guaranteed in that order but
  // flags headliners via x-isHeadliner. Build non-headliners first (given
  // order), then headliner(s) last. Drop performers with empty names.
  const performers = (event.performer ?? []).filter((p) => (p.name ?? '').trim() !== '');
  const nonHeadliners = performers.filter((p) => p['x-isHeadliner'] !== true);
  const headliners = performers.filter((p) => p['x-isHeadliner'] === true);
  const attractions = [...nonHeadliners, ...headliners].map((p) => ({
    id: p.name!, // extractArtists re-slugifies, so the raw name is a fine stable id
    name: p.name!,
  }));

  return {
    id,
    name: event.name ?? '',
    startsAt: event.startDate ?? '',
    venue: {
      name: event.location?.name ?? '',
      city: event.location?.address?.addressLocality ?? '',
      address: undefined,
    },
    ticketUrl,
    attractions,
    artistIds: [], // filled by extractArtists
  };
}

/**
 * Parse a JamBase `{ events }` envelope into Show[]. Zod-validated; never throws
 * on real data. Empty/absent events → [].
 */
export function parseJambaseEvents(json: unknown): Show[] {
  const env = eventsEnvelopeSchema.parse(json);
  return (env.events ?? []).map(toShow);
}

// --- call-minimised fetch --------------------------------------------------

const EVENTS_URL = 'https://api.data.jambase.com/v3/events';
const GEO_RADIUS_KM = 50;
const PER_PAGE = 50;
const MIN_VIABLE_SHOWS = 8;

// window → number of days from today the window covers (mirror realDeps'
// windowRange): tonight=1, this-weekend=3, next-14-days=14.
function windowDays(w: TimeWindow): number {
  return w === 'tonight' ? 1 : w === 'this-weekend' ? 3 : 14;
}

const dateOnly = (d: Date) => d.toISOString().slice(0, 10); // YYYY-MM-DD

export interface FetchJambaseDeps {
  apiKey?: string;
  now?: () => Date;
  // Injection hook so tests never hit the network. Receives the query params
  // and must resolve to the raw JSON envelope (or throw to simulate an error).
  rawFetch?: (params: Record<string, string>) => Promise<unknown>;
}

/**
 * Fetch the WIDE, window-INDEPENDENT JamBase envelope with EXACTLY ONE network
 * call, returning the raw next-14-days Show[]. THIS is the one-call invariant: it
 * takes NO window, so the same wide fetch serves every window — the single paid
 * JamBase call now lives here and here only.
 *
 * COST CONTROL (hard constraint — 1k calls/month free tier): we fetch the
 * WIDEST useful envelope once (radius 50km, the full next-14-days range, 50/page
 * sorted by date asc). Narrower windows are satisfied purely by LOCAL filtering
 * downstream (see `filterShowsToWindow`) — there is never an escalating second
 * widen call, and re-keying the cache on CITY only (realDeps) means this fires
 * once per city, not once per (city × window).
 */
export async function fetchJambaseShows(
  geo: Geo,
  deps: FetchJambaseDeps = {},
): Promise<Show[]> {
  const now = deps.now ? deps.now() : new Date();
  const from = dateOnly(now);
  const to = dateOnly(new Date(now.getTime() + 14 * 864e5));

  const params: Record<string, string> = {
    geoLatitude: String(geo.lat),
    geoLongitude: String(geo.lng),
    geoRadiusAmount: String(GEO_RADIUS_KM),
    geoRadiusUnits: 'km',
    eventDateFrom: from,
    eventDateTo: to,
    perPage: String(PER_PAGE),
    sort: 'eventDate', // ascending by date (JamBase's `sort` enum: eventDate | -eventDate)
  };

  const json = await fetchOnce(params, deps);
  return parseJambaseEvents(json); // full next-14-days set
}

/**
 * PURE, network-free window filter over an already-fetched wide Show[] (the
 * output of `fetchJambaseShows`). Makes ZERO network calls — it only slices the
 * wide envelope to the requested window by startsAt DATE and derives the widen
 * meta for SparseNotice. Split out from the fetch so the (city-only) cache can
 * store the wide set once and every window re-derives its slice for free.
 */
export function filterShowsToWindow(
  all: Show[],
  window: TimeWindow,
  now: Date = new Date(),
): { shows: Show[]; widened?: WidenMeta } {
  const from = dateOnly(now);

  // Locally filter to the requested window by startsAt DATE.
  const windowEnd = dateOnly(new Date(now.getTime() + windowDays(window) * 864e5));
  const windowed = all.filter((s) => {
    const d = s.startsAt.slice(0, 10);
    return d >= from && d <= windowEnd;
  });

  // widened meta for SparseNotice — no network calls, pure local logic.
  if (windowed.length < MIN_VIABLE_SHOWS && all.length >= MIN_VIABLE_SHOWS) {
    // narrow window is thin but the 14-day envelope is rich → widen the window.
    return { shows: all, widened: { window: 'next-14-days' } };
  }
  if (all.length < MIN_VIABLE_SHOWS) {
    // genuinely sparse even across the full radius + 14 days.
    return { shows: all, widened: { radiusKm: GEO_RADIUS_KM } };
  }
  return { shows: windowed };
}

async function fetchOnce(
  params: Record<string, string>,
  deps: FetchJambaseDeps,
): Promise<unknown> {
  if (deps.rawFetch) return deps.rawFetch(params);

  const apiKey = deps.apiKey ?? process.env.JAMBASE_KEY;
  if (!apiKey) throw new JambaseError('JamBase: missing JAMBASE_KEY');

  return jambaseQueue.schedule(async () => {
    const q = new URLSearchParams(params);
    // Auth via header ONLY — never put the key in the URL/query (it can get
    // echoed back in error bodies).
    const res = await fetch(`${EVENTS_URL}?${q.toString()}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      throw new JambaseError(`JamBase ${res.status}: ${await res.text()}`);
    }
    return res.json();
  });
}
