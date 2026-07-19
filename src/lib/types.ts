import type { Geo } from './api/geo';
import type { WidenMeta } from './pipeline/fetchShows';

export type TimeWindow = 'tonight' | 'this-weekend' | 'next-14-days';
export type FontStop = 'everything' | 'no-arenas' | 'small-print';

export interface Show {
  id: string; // "tm:{eventId}" — source-prefixed for the v1.1 SeatGeek merge
  name: string;
  startsAt: string; // ISO 8601, venue-local when TM provides it
  venue: { name: string; city: string; address?: string };
  ticketUrl: string; // TM deep link — attribution is a ToS requirement
  attractions: Array<{ id: string; name: string }>; // billed order preserved
  artistIds: string[]; // filled by extractArtists in Phase 1
}

export type ProminenceTier = 'arena' | 'mid' | 'small-print';
export interface Artist {
  id: string;                // slug of normalizedName
  rawNames: string[];
  normalizedName: string;
  isTribute: boolean;
  mbid?: string;
  prominence: number;        // 0..1 (Phase 3 fills; 0 until then)
  tier: ProminenceTier;      // 'mid' until Phase 3 scores
  billingSlots: Array<{ showId: string; slot: number; ofSlots: number }>;
}

export interface CityWindowBundle {
  key: { city: string; window: TimeWindow };
  builtAt: string; // new Date(deps.now()).toISOString() — deterministic under the fake clock
  geo: Geo;
  widened?: WidenMeta;
  shows: Show[];
  artists: Record<string, Artist>;
  tracks: Track[];
  posterCount: number; // = shows.length ("Reading the small print on N gig posters…")
  belowBar: boolean; // tracks.length < 8 → degraded cache TTL + honest partial copy
}

export interface Track {
  artistId: string;
  itunesTrackId: number;
  title: string;
  previewUrl: string;   // Apple-hosted 30s stream — NEVER proxied
  artworkUrl: string;
  itunesUrl: string;    // Apple linkback (ToS requirement)
  confidence: 'exact' | 'mb-confirmed';
  isSecondHeadlinerTrack?: boolean; // R7: always present in bundle, stop-filtered
}
