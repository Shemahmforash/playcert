import { describe, it, expect } from 'vitest';
import { smallPrintRunsDry, distinctShowCount } from '../../src/lib/pipeline/smallPrintDry';
import { applyFontStop } from '../../src/lib/pipeline/applyFontStop';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Task 3.7 — the `smallPrintRunsDry` predicate (§2.6 "Sparse").
 *
 * Fires IFF distinct SHOWS after the Small Print stop is < 8 AND the whole bill
 * (everything) has >= 8 distinct shows — i.e. the stop, not a quiet week, is what
 * emptied the bill. Fixtures use arena-tier headliners so `small-print` actually
 * drops shows down to nothing.
 */

// ---- fixture helpers -------------------------------------------------------
let seq = 9000;
const mkArtist = (id: string, tier: Artist['tier']): Artist => ({
  id,
  rawNames: [id],
  normalizedName: id,
  isTribute: false,
  prominence: tier === 'arena' ? 0.9 : 0.2,
  tier,
  billingSlots: [],
});

const mkTrack = (artistId: string): Track => {
  const n = seq++;
  return {
    artistId,
    itunesTrackId: n,
    title: `${artistId}-song-${n}`,
    previewUrl: `https://audio.example/${n}.m4a`,
    artworkUrl: `https://art.example/${n}.jpg`,
    itunesUrl: `https://itunes.example/${n}`,
    confidence: 'exact',
  };
};

const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `Venue ${id}`, city: 'London' },
  ticketUrl: `https://tm.example/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

const geo: Geo = {
  lat: 51.5,
  lng: -0.12,
  displayName: 'London',
  countryCode: 'GB',
  tz: 'Europe/London',
};

const mkBundle = (
  artists: Record<string, Artist>,
  shows: Show[],
  tracks: Track[],
): CityWindowBundle => ({
  key: { city: 'London', window: 'tonight' },
  builtAt: '2026-08-01T00:00:00.000Z',
  geo,
  shows,
  artists,
  tracks,
  posterCount: shows.length,
  belowBar: tracks.length < 8,
});

/**
 * Build a bundle of `nArena` arena-headliner shows and `nSmall` small-print shows,
 * one artist + one primary track per show. Small Print keeps only the small-print
 * shows; Everything keeps them all — so counts are exactly (nSmall, nArena+nSmall).
 */
const mkMix = (nArena: number, nSmall: number): CityWindowBundle => {
  const artists: Record<string, Artist> = {};
  const shows: Show[] = [];
  const tracks: Track[] = [];
  let day = 1;
  for (let i = 0; i < nArena; i++) {
    const id = `arena${i}`;
    artists[id] = mkArtist(id, 'arena');
    const startsAt = `2026-08-${String(day++).padStart(2, '0')}T20:00:00`;
    shows.push(mkShow(`A${i}`, startsAt, [id]));
    tracks.push(mkTrack(id));
  }
  for (let i = 0; i < nSmall; i++) {
    const id = `sp${i}`;
    artists[id] = mkArtist(id, 'small-print');
    const startsAt = `2026-08-${String(day++).padStart(2, '0')}T20:00:00`;
    shows.push(mkShow(`S${i}`, startsAt, [id]));
    tracks.push(mkTrack(id));
  }
  return mkBundle(artists, shows, tracks);
};

describe('smallPrintRunsDry (Task 3.7 predicate)', () => {
  it('(a) unfiltered >= 8 shows but small-print < 8 → true', () => {
    const bundle = mkMix(6, 3); // everything = 9 shows; small-print = 3 shows
    expect(distinctShowCount(applyFontStop(bundle, 'everything'))).toBe(9);
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(3);
    expect(smallPrintRunsDry(bundle)).toBe(true);
  });

  it('(b) genuinely quiet week (unfiltered < 8) → false even when small-print is tiny', () => {
    const bundle = mkMix(4, 1); // everything = 5 shows; small-print = 1 show
    expect(distinctShowCount(applyFontStop(bundle, 'everything'))).toBe(5);
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(1);
    expect(smallPrintRunsDry(bundle)).toBe(false);
  });

  it('(c) small-print still >= 8 → false (the stop did not run dry)', () => {
    const bundle = mkMix(2, 9); // everything = 11 shows; small-print = 9 shows
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(9);
    expect(smallPrintRunsDry(bundle)).toBe(false);
  });

  it('(d) boundary: small-print == 8 → false', () => {
    const bundle = mkMix(3, 8); // everything = 11; small-print = 8
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(8);
    expect(smallPrintRunsDry(bundle)).toBe(false);
  });

  it('(d) boundary: small-print == 7 with unfiltered >= 8 → true', () => {
    const bundle = mkMix(3, 7); // everything = 10; small-print = 7
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(7);
    expect(smallPrintRunsDry(bundle)).toBe(true);
  });

  it('(d) boundary: unfiltered == 8 counts as "not quiet" → dry fires when small-print < 8', () => {
    const bundle = mkMix(5, 3); // everything = 8; small-print = 3
    expect(distinctShowCount(applyFontStop(bundle, 'everything'))).toBe(8);
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(3);
    expect(smallPrintRunsDry(bundle)).toBe(true);
  });

  it('small-print filters all the way to 0 shows (all arena) with unfiltered >= 8 → true', () => {
    const bundle = mkMix(9, 0); // everything = 9; small-print = 0
    expect(distinctShowCount(applyFontStop(bundle, 'small-print'))).toBe(0);
    expect(smallPrintRunsDry(bundle)).toBe(true);
  });
});
