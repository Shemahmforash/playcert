import { describe, it, expect, vi } from 'vitest';
import { parseEventsPage, fetchAllEvents } from '../../src/lib/api/ticketmaster';
import type { FetchEventsParams } from '../../src/lib/api/ticketmaster';
import fixture from '../fixtures/ticketmaster/madrid-120d.json';

describe('parseEventsPage', () => {
  const shows = parseEventsPage(fixture);

  it('parses shows from the recorded fixture', () => {
    expect(shows.length).toBeGreaterThan(0);
  });

  it('produces source-prefixed ids, venue, ISO startsAt and an http ticket url', () => {
    for (const show of shows) {
      expect(show.id).toMatch(/^tm:/);
      expect(show.venue.name).toBeTruthy();
      expect(typeof show.startsAt).toBe('string');
      expect(show.ticketUrl).toContain('http');
    }
  });

  it('preserves the raw _embedded.attractions billing order', () => {
    const raw = (fixture as any)._embedded.events as any[];
    for (const event of raw) {
      const rawAttractions: any[] = event._embedded?.attractions ?? [];
      if (rawAttractions.length === 0) continue;
      const show = shows.find((s) => s.id === `tm:${event.id}`);
      expect(show).toBeDefined();
      expect(show!.attractions.map((a) => a.name)).toEqual(
        rawAttractions.map((a) => a.name),
      );
    }
  });
});

// ---------------------------------------------------------------------------
// fetchAllEvents — queued pagination, single 429 retry, typed error.
//
// Page fixtures are built from the REAL Madrid page (48 events), NOT Lisbon
// (which is empty). We clone madrid-120d.json and slice its events into two
// halves so the stitched result count is a real, non-trivial number.
// ---------------------------------------------------------------------------
const allEvents = (fixture as any)._embedded.events as any[];
const half = Math.ceil(allEvents.length / 2);

function makePageFixture(
  events: any[],
  opts: { totalPages: number; number: number },
): unknown {
  const clone = structuredClone(fixture) as any;
  clone._embedded.events = events;
  clone.page = {
    size: 100,
    totalElements: allEvents.length,
    totalPages: opts.totalPages,
    number: opts.number,
  };
  return clone;
}

function countOf(fixtureLike: unknown): number {
  return ((fixtureLike as any)._embedded?.events ?? []).length;
}

// Two-page pair for the stitching test (totalPages = 2 each).
const page0Fixture = makePageFixture(allEvents.slice(0, half), {
  totalPages: 2,
  number: 0,
});
const page1Fixture = makePageFixture(allEvents.slice(half), {
  totalPages: 2,
  number: 1,
});

// Single-page fixture for the 429 tests (totalPages = 1 -> stops after one
// successful page, so the fetcher is called exactly twice: 1 reject + 1 resolve).
const singlePageFixture = makePageFixture(allEvents.slice(0, half), {
  totalPages: 1,
  number: 0,
});

const baseParams: FetchEventsParams = {
  apikey: 'test',
  latlong: '40.4,-3.7',
  radiusKm: 30,
  size: 100,
};

describe('fetchAllEvents', () => {
  it('stitches multi-page results and stops at totalPages', async () => {
    const pages = [page0Fixture, page1Fixture];
    const fetcher = vi.fn(async ({ page = 0 }: { page?: number }) => pages[page]);
    const shows = await fetchAllEvents(baseParams, { rawFetch: fetcher });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(shows.length).toBe(countOf(page0Fixture) + countOf(page1Fixture));
  });

  it('retries once on 429 with backoff, then succeeds', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('tm:429'), { status: 429 }))
      .mockResolvedValueOnce(singlePageFixture);
    const shows = await fetchAllEvents(baseParams, { rawFetch: fetcher, backoffMs: 1 });
    expect(shows.length).toBeGreaterThan(0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('throws a typed error when the retry also fails', async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('tm:429'), { status: 429 }));
    await expect(
      fetchAllEvents(baseParams, { rawFetch: fetcher, backoffMs: 1 }),
    ).rejects.toMatchObject({ name: 'TicketmasterError' });
  });
});
