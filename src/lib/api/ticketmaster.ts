import { z } from 'zod';
import type { Show } from '@/lib/types';
import { tmQueue } from '../queue';

// ---------------------------------------------------------------------------
// Zod schema, adapted to the REAL recorded fixtures (spike Task 0.2).
//
// Reality vs the original plan (fields the plan assumed present but the live
// Madrid data proves optional/absent):
//   - dates.start.dateTime: present in the current fixtures, but TM omits it
//                           for TBA-time events (only localDate given) -> optional,
//                           with a localDate fallback so parsing never throws.
//   - _embedded (venues/attractions): can be missing -> optional, defaulted.
//   - venue.city / venue.address: frequently sparse -> optional.
//   - url: treated as optional for safety (empty string fallback).
// Unknown keys are ignored (schemas are non-strict) so TM can add fields freely.
// ---------------------------------------------------------------------------

const attractionSchema = z.object({
  id: z.string(),
  name: z.string(),
});

const venueSchema = z.object({
  name: z.string().optional(),
  address: z.object({ line1: z.string().optional() }).optional(),
  city: z.object({ name: z.string().optional() }).optional(),
});

const eventSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().optional(),
  dates: z
    .object({
      start: z
        .object({
          dateTime: z.string().optional(),
          localDate: z.string().optional(),
          localTime: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  _embedded: z
    .object({
      venues: z.array(venueSchema).optional(),
      attractions: z.array(attractionSchema).optional(),
    })
    .optional(),
});

const eventsPageSchema = z.object({
  _embedded: z
    .object({
      events: z.array(eventSchema).optional(),
    })
    .optional(),
  page: z
    .object({
      size: z.number().optional(),
      totalElements: z.number().optional(),
      totalPages: z.number().optional(),
      number: z.number().optional(),
    })
    .optional(),
});

export type EventsPage = z.infer<typeof eventsPageSchema>;

function toShow(event: z.infer<typeof eventSchema>): Show {
  const venue = event._embedded?.venues?.[0];
  const start = event.dates?.start;
  // Prefer full venue-local dateTime; fall back to localDate(+localTime) for
  // TBA-time events so startsAt is always a string.
  const startsAt =
    start?.dateTime ??
    (start?.localDate
      ? start.localTime
        ? `${start.localDate}T${start.localTime}`
        : start.localDate
      : '');

  // Attraction order is preserved EXACTLY as TM returns it. Spike finding:
  // attractions[] is HEADLINER-FIRST (index 0 == headliner named in event.name,
  // later indices == openers/support).
  const attractions = (event._embedded?.attractions ?? []).map((a) => ({
    id: a.id,
    name: a.name,
  }));

  return {
    id: `tm:${event.id}`,
    name: event.name,
    startsAt,
    venue: {
      name: venue?.name ?? '',
      city: venue?.city?.name ?? '',
      address: venue?.address?.line1,
    },
    ticketUrl: event.url ?? '',
    attractions,
    artistIds: [], // filled by extractArtists in Phase 1
  };
}

/**
 * Parse one Ticketmaster Discovery `events.json` page into Show[].
 * Zod-validated against the recorded fixture shape; never throws on the real
 * data. An empty/no-event page (e.g. Lisbon — TM has no Portugal coverage)
 * yields [].
 */
export function parseEventsPage(json: unknown): Show[] {
  const page = eventsPageSchema.parse(json);
  const events = page._embedded?.events ?? [];
  return events.map(toShow);
}

export interface FetchEventsParams {
  apikey: string;
  latlong: string; // "lat,long"
  radiusKm?: number;
  startDateTime?: string; // ISO, seconds precision, e.g. 2026-07-19T11:00:00Z
  endDateTime?: string;
  size?: number;
  page?: number;
}

const DISCOVERY_URL =
  'https://app.ticketmaster.com/discovery/v2/events.json';

/**
 * Fetch a single page of music events from the Ticketmaster Discovery API and
 * parse it into Show[]. Throws on non-2xx (caller decides on 429 backoff).
 */
export async function fetchEventsPage(
  params: FetchEventsParams,
): Promise<{ shows: Show[]; page: EventsPage['page'] }> {
  const q = new URLSearchParams({
    apikey: params.apikey,
    latlong: params.latlong,
    radius: String(params.radiusKm ?? 30),
    unit: 'km',
    classificationName: 'Music',
    size: String(params.size ?? 100),
    sort: 'date,asc',
  });
  if (params.startDateTime) q.set('startDateTime', params.startDateTime);
  if (params.endDateTime) q.set('endDateTime', params.endDateTime);
  if (params.page != null) q.set('page', String(params.page));

  const res = await fetch(`${DISCOVERY_URL}?${q.toString()}`);
  if (!res.ok) {
    throw new Error(`Ticketmaster ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  const parsed = eventsPageSchema.parse(json);
  return { shows: (parsed._embedded?.events ?? []).map(toShow), page: parsed.page };
}

/**
 * Typed error thrown by fetchAllEvents when a page fetch fails even after its
 * single 429 retry. Callers (fetchShows widen ladder, Task 1.5) can catch this
 * by name to distinguish TM failures from other exceptions.
 */
export class TicketmasterError extends Error {
  name = 'TicketmasterError';
  constructor(msg: string) {
    super(msg);
  }
}

// The Discovery API hard-caps deep pagination at 1000 results (size 100 x 10
// pages). Requesting page index >= 10 returns an error, so we stop after
// page index 9 regardless of the reported totalPages.
const MAX_RESULTS = 1000;
const PAGE_SIZE = 100;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FetchAllDeps {
  rawFetch?: (p: FetchEventsParams & { page?: number }) => Promise<unknown>;
  backoffMs?: number;
}

/**
 * Fetch every page of music events for the given params and stitch them into a
 * single Show[]. Pagination is queued through tmQueue (250ms spacing) on the
 * real network path; tests inject `deps.rawFetch` to bypass the network.
 *
 * Stops when the current page index reaches the reported totalPages OR the
 * 1000-result Discovery cap is reached (whichever comes first). Each page fetch
 * gets a SINGLE jittered retry on HTTP 429; if the retry also fails, a
 * TicketmasterError is thrown.
 */
export async function fetchAllEvents(
  params: FetchEventsParams,
  deps: FetchAllDeps = {},
): Promise<Show[]> {
  const { rawFetch, backoffMs } = deps;

  // The default (network) fetcher routes through the rate queue so callers get
  // TM-friendly spacing for free. Injected fetchers are called directly.
  const fetchPage = (p: FetchEventsParams & { page?: number }): Promise<unknown> =>
    rawFetch
      ? rawFetch(p)
      : tmQueue.schedule(async () => {
          const q = new URLSearchParams({
            apikey: p.apikey,
            latlong: p.latlong,
            radius: String(p.radiusKm ?? 30),
            unit: 'km',
            classificationName: 'Music',
            size: String(p.size ?? PAGE_SIZE),
            sort: 'date,asc',
          });
          if (p.startDateTime) q.set('startDateTime', p.startDateTime);
          if (p.endDateTime) q.set('endDateTime', p.endDateTime);
          if (p.page != null) q.set('page', String(p.page));
          const res = await fetch(`${DISCOVERY_URL}?${q.toString()}`);
          if (!res.ok) {
            throw Object.assign(
              new Error(`Ticketmaster ${res.status}: ${await res.text()}`),
              { status: res.status },
            );
          }
          return res.json();
        });

  // Fetch a page with a single retry on 429. Any surviving failure becomes a
  // typed TicketmasterError.
  const fetchWithRetry = async (page: number): Promise<unknown> => {
    try {
      return await fetchPage({ ...params, page });
    } catch (err) {
      if ((err as { status?: number })?.status === 429) {
        await sleep(backoffMs ?? 1000 + Math.random() * 1000);
        try {
          return await fetchPage({ ...params, page });
        } catch (retryErr) {
          throw new TicketmasterError(
            `Ticketmaster page ${page} failed after 429 retry: ${
              (retryErr as Error)?.message ?? retryErr
            }`,
          );
        }
      }
      throw err instanceof TicketmasterError
        ? err
        : new TicketmasterError(
            `Ticketmaster page ${page} failed: ${(err as Error)?.message ?? err}`,
          );
    }
  };

  const shows: Show[] = [];
  for (let page = 0; ; page++) {
    const json = await fetchWithRetry(page);
    const parsed = eventsPageSchema.parse(json);
    shows.push(...(parsed._embedded?.events ?? []).map(toShow));

    const totalPages = parsed.page?.totalPages ?? 1;
    const atLastPage = page + 1 >= totalPages;
    const atCap = (page + 1) * PAGE_SIZE >= MAX_RESULTS; // stop after page index 9
    if (atLastPage || atCap) break;
  }

  return shows;
}
