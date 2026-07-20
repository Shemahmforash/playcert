import { describe, it, expect, vi } from 'vitest';
import {
  parseJambaseEvents,
  fetchJambaseShows,
  JambaseError,
} from '../../src/lib/api/jambase';
import { extractArtists } from '../../src/lib/pipeline/extractArtists';
import type { Geo } from '../../src/lib/api/geo';
import fixture from '../fixtures/jambase/events-sample.json';

const geo: Geo = {
  lat: 51.5074,
  lng: -0.1278,
  displayName: 'London',
  countryCode: 'GB',
  tz: 'Europe/London',
};

// The fixture events are dated 2026-07-20, so pin "today" there for windowing.
const now = () => new Date('2026-07-20T09:00:00Z');

describe('parseJambaseEvents', () => {
  const shows = parseJambaseEvents(fixture);

  it('maps the envelope to 2 Shows', () => {
    expect(shows.length).toBe(2);
  });

  it('orders attractions opener-first / headliner-LAST (billing contract)', () => {
    const berninger = shows.find((s) => s.name.startsWith('Matt Berninger'))!;
    expect(berninger.attractions.map((a) => a.name)).toEqual([
      'Ronboy', // non-headliner → slot 0 (opener)
      'Matt Berninger', // x-isHeadliner → LAST (headliner)
    ]);
  });

  it('extractArtists makes the headliner the top slot and the opener slot 0', () => {
    const berninger = shows.find((s) => s.name.startsWith('Matt Berninger'))!;
    const artists = extractArtists([berninger]); // mutates attraction → artistIds

    const ofSlots = berninger.attractions.length;
    const headliner = Object.values(artists).find((a) => a.normalizedName === 'Matt Berninger')!;
    const opener = Object.values(artists).find((a) => a.normalizedName === 'Ronboy')!;

    expect(headliner.billingSlots[0]).toMatchObject({ slot: ofSlots - 1, ofSlots });
    expect(opener.billingSlots[0]).toMatchObject({ slot: 0, ofSlots });
  });

  it('takes ticketUrl from the primary offer (DICE link, utm intact)', () => {
    const berninger = shows.find((s) => s.name.startsWith('Matt Berninger'))!;
    expect(berninger.ticketUrl).toBe(
      'https://link.dice.fm/z196523f6dcb?utm_source=jambase',
    );
  });

  it('maps a solo event to 1 attraction with jb: id and venue name/city', () => {
    const juanes = shows.find((s) => s.name.startsWith('Juanes'))!;
    expect(juanes.attractions.map((a) => a.name)).toEqual(['Juanes']);
    expect(juanes.id).toBe('jb:15668838');
    expect(juanes.venue.name).toBe('O2 Forum Kentish Town');
    expect(juanes.venue.city).toBe('London');
  });

  it('empty envelope → []', () => {
    expect(parseJambaseEvents({ events: [] })).toEqual([]);
  });

  it('does not throw on a garbage/missing-field event (non-strict)', () => {
    const junk = { events: [{ identifier: 'jambase:1' }, { foo: 'bar' }] };
    expect(() => parseJambaseEvents(junk)).not.toThrow();
    const shows = parseJambaseEvents(junk);
    expect(shows.length).toBe(2);
    expect(shows[0].id).toBe('jb:1');
    expect(shows[0].attractions).toEqual([]);
  });
});

describe('fetchJambaseShows (call-minimised)', () => {
  it('makes EXACTLY ONE fetch call and filters by window', async () => {
    const rawFetch = vi.fn(async () => fixture);
    const { shows } = await fetchJambaseShows(geo, 'tonight', { rawFetch, now });

    expect(rawFetch).toHaveBeenCalledTimes(1);
    // both fixture events are on today → present in the tonight window
    expect(shows.length).toBe(2);
    expect(shows.every((s) => s.id.startsWith('jb:'))).toBe(true);
  });

  it('sends one wide request covering the full next-14-days range', async () => {
    const rawFetch = vi.fn(async (_params: Record<string, string>) => ({ events: [] }));
    await fetchJambaseShows(geo, 'tonight', { rawFetch, now });

    const params = rawFetch.mock.calls[0][0];
    expect(params.geoRadiusAmount).toBe('50');
    expect(params.geoRadiusUnits).toBe('km');
    expect(params.perPage).toBe('50');
    expect(params.eventDateFrom).toBe('2026-07-20');
    expect(params.eventDateTo).toBe('2026-08-03'); // +14 days
    expect(rawFetch).toHaveBeenCalledTimes(1);
  });

  it('flags genuinely sparse results (radiusKm) when even 14d is below 8', async () => {
    const rawFetch = vi.fn(async () => fixture); // only 2 events
    const { widened } = await fetchJambaseShows(geo, 'next-14-days', { rawFetch, now });
    expect(widened).toEqual({ radiusKm: 50 });
  });

  it('widens the window when the narrow window thins below 8 but 14d is rich', async () => {
    // 10 events: 2 today, 8 later this month → tonight is thin, 14d is rich.
    const mkEvent = (i: number, date: string) => ({
      identifier: `jambase:${i}`,
      name: `Act ${i}`,
      startDate: `${date}T20:00:00`,
      performer: [{ name: `Act ${i}`, 'x-isHeadliner': true }],
    });
    const events = [
      mkEvent(1, '2026-07-20'),
      mkEvent(2, '2026-07-20'),
      ...Array.from({ length: 8 }, (_, k) => mkEvent(10 + k, '2026-07-28')),
    ];
    const rawFetch = vi.fn(async () => ({ events }));
    const { shows, widened } = await fetchJambaseShows(geo, 'tonight', { rawFetch, now });

    expect(rawFetch).toHaveBeenCalledTimes(1);
    expect(widened).toEqual({ window: 'next-14-days' });
    expect(shows.length).toBe(10); // returns the wider 14-day set
  });

  it('throws JambaseError when the injected fetcher rejects with one', async () => {
    const rawFetch = vi.fn(async () => {
      throw new JambaseError('JamBase 403: quota');
    });
    await expect(fetchJambaseShows(geo, 'tonight', { rawFetch, now })).rejects.toBeInstanceOf(
      JambaseError,
    );
  });
});
