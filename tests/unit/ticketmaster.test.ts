import { describe, it, expect } from 'vitest';
import { parseEventsPage } from '../../src/lib/api/ticketmaster';
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
