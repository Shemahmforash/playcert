import type { Geo } from './api/geo';

export type TimeWindow = 'tonight' | 'this-weekend' | 'next-14-days';
export type FontStop = 'everything' | 'no-arenas' | 'small-print';

/**
 * Widen metadata surfaced on a bundle when the bill had to reach past the
 * requested radius and/or window to stay viable. Drives SparseNotice's honest
 * banner. Lives here (not in the pipeline) now that the escalating widen ladder
 * is gone — `filterShowsToWindow` (jambase.ts) derives it purely and locally.
 */
export interface WidenMeta { radiusKm?: number; window?: TimeWindow }

export interface Show {
  id: string; // "jb:{eventId}" — source-prefixed (JamBase) for a future multi-source merge
  name: string;
  startsAt: string; // ISO 8601, venue-local when JamBase provides it
  venue: { name: string; city: string; address?: string };
  ticketUrl: string; // JamBase event deep link — attribution is a ToS requirement
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
  prominence: number;        // 0..1, from objective billing order (score.ts); 0 only if unbilled
  tier: ProminenceTier;      // derived from billing order (score.ts)
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
