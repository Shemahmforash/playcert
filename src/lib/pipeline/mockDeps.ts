import type { Artist, Show, Track } from '../types';
import type { BuildDeps } from './buildBundle';
import { geoForCity, type Geo } from '../api/geo';
import { extractArtists } from './extractArtists';

/**
 * Deterministic, ZERO-NETWORK BuildDeps used when `MOCK_APIS=1` (see deps.ts).
 *
 * It exists so the ONE Playwright e2e smoke test (tests/e2e/smoke.spec.ts) can
 * drive the whole product — city page → rows → Play → dial to Small Print —
 * against `next start` with no JamBase/iTunes/MusicBrainz calls whatsoever, and
 * so `tests/unit/mockDeps.test.ts` can assert the pipeline end-to-end offline.
 *
 * The billing order below is LOAD-BEARING: openers sit in the low slots and
 * headliners in the top (last) slot, exactly as the real JamBase adapter emits
 * (opener-first, headliner-last). buildBundle runs the real `scoreArtists`, so a
 * top-billed act scores `tier: 'arena'` and an opener `tier: 'small-print'`.
 * That is what makes dragging the dial to SMALL PRINT visibly DROP the headliner
 * rows — the e2e test asserts precisely that.
 */

// Fixed clock (ms). buildBundle stamps `builtAt` from this and checks the resolve
// budget against it, so a constant keeps the whole bundle byte-for-byte stable.
const FIXED_NOW = Date.parse('2026-07-20T12:00:00.000Z');

// Fallback geo for any city not in the covered table, so the mock never 404s.
const LONDON: Geo = {
  lat: 51.5074,
  lng: -0.1278,
  displayName: 'London',
  countryCode: 'GB',
  tz: 'Europe/London',
};

// A show with attractions in BILLED order: slot 0 = opener … last slot = headliner.
const mkShow = (id: string, startsAt: string, venue: string, acts: string[]): Show => ({
  id,
  name: acts.join(' + '),
  startsAt,
  venue: { name: venue, city: 'London' },
  ticketUrl: `https://mock.local/tickets/${id}`,
  attractions: acts.map((name) => ({ id: name, name })),
  artistIds: [], // filled by extractArtists
});

// Three fixed shows mirroring tests/fixtures/jambase/events-sample.json (the
// multi-act "Matt Berninger + Ronboy" and the solo "Juanes"), plus one more
// multi-act gig so SMALL PRINT keeps MORE THAN ONE support-act row.
const MOCK_SHOWS: Show[] = [
  mkShow('jb:mock-berninger', '2026-07-21T19:00:00', 'Electric Ballroom', ['Ronboy', 'Matt Berninger']),
  mkShow('jb:mock-juanes', '2026-07-22T19:00:00', 'O2 Forum Kentish Town', ['Juanes']),
  mkShow('jb:mock-bridgers', '2026-07-23T19:00:00', 'Roundhouse', ['Muna', 'Phoebe Bridgers']),
];

// Stable positive int per artist id, so `itunesTrackId` is deterministic.
const hashId = (s: string): number =>
  Math.abs([...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7));

// A multi-act headliner (top slot of a show with >1 act) — same rule the real
// resolveTracks uses to decide who earns a 2nd (isSecondHeadlinerTrack) track.
const isMultiActHeadliner = (a: Artist): boolean =>
  a.billingSlots.some((b) => b.slot === b.ofSlots - 1 && b.ofSlots > 1);

const trackFor = (a: Artist, suffix = ''): Track => {
  const id = `${a.id}${suffix}`;
  return {
    artistId: a.id,
    itunesTrackId: hashId(id),
    title: `${a.normalizedName}${suffix ? ' — Encore' : ' — Signature Song'}`,
    previewUrl: `https://mock.local/${id}.m4a`,
    artworkUrl: `https://mock.local/${id}.jpg`,
    itunesUrl: `https://mock.local/itunes/${id}`,
    confidence: 'exact',
  };
};

/** Fully deterministic, network-free BuildDeps for MOCK_APIS=1. */
export function mockDeps(city: string): BuildDeps {
  return {
    geocode: async () => geoForCity(city) ?? LONDON,
    fetchShows: async () => ({ shows: MOCK_SHOWS.map((s) => ({ ...s, artistIds: [] })) }),
    extract: extractArtists,
    resolveArtist: async (artist) => {
      const tracks: Track[] = [trackFor(artist)];
      // Give the multi-act headliner a SECOND (isSecondHeadlinerTrack) track so
      // the dial's three stops (Marquee / No Arenas / Small Print) each differ.
      if (isMultiActHeadliner(artist)) {
        tracks.push({ ...trackFor(artist, '-2'), isSecondHeadlinerTrack: true });
      }
      return tracks;
    },
    now: () => FIXED_NOW,
  } satisfies BuildDeps;
}
