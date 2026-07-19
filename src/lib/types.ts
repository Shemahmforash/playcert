export type TimeWindow = 'tonight' | 'this-weekend' | 'next-14-days';
export type FontStop = 'everything' | 'no-arenas' | 'small-print';

export interface Show {
  id: string; // "tm:{eventId}" — source-prefixed for the v1.1 SeatGeek merge
  name: string;
  startsAt: string; // ISO 8601, venue-local when TM provides it
  venue: { name: string; city: string; address?: string };
  priceFrom?: { amount: number; currency: string };
  ticketUrl: string; // TM deep link — attribution is a ToS requirement
  attractions: Array<{ id: string; name: string }>; // billed order preserved
  artistIds: string[]; // filled by extractArtists in Phase 1
}
