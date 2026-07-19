import { z } from 'zod';
import type { Show } from '@/lib/types';

// ---------------------------------------------------------------------------
// Zod schema, adapted to the REAL recorded fixtures (spike Task 0.2).
//
// Reality vs the original plan (fields the plan assumed present but the live
// Madrid data proves optional/absent):
//   - priceRanges:        ABSENT in 100% of recorded events -> optional.
//   - dates.start.dateTime: present in the current fixtures, but TM omits it
//                           for TBA-time events (only localDate given) -> optional,
//                           with a localDate fallback so parsing never throws.
//   - _embedded (venues/attractions): can be missing -> optional, defaulted.
//   - venue.city / venue.address: frequently sparse -> optional.
//   - url: treated as optional for safety (empty string fallback).
// Unknown keys are ignored (schemas are non-strict) so TM can add fields freely.
// ---------------------------------------------------------------------------

const priceRangeSchema = z.object({
  currency: z.string().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

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
  priceRanges: z.array(priceRangeSchema).optional(),
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

  const priceRange = event.priceRanges?.[0];
  const priceFrom =
    priceRange && typeof priceRange.min === 'number'
      ? { amount: priceRange.min, currency: priceRange.currency ?? 'EUR' }
      : undefined;

  return {
    id: `tm:${event.id}`,
    name: event.name,
    startsAt,
    venue: {
      name: venue?.name ?? '',
      city: venue?.city?.name ?? '',
      address: venue?.address?.line1,
    },
    priceFrom,
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
