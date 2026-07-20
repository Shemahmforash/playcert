import { describe, it, expect } from 'vitest';
import { scoreArtists } from '../../src/lib/pipeline/score';
import type { Artist } from '../../src/lib/types';

// Minimal artist factory; only the fields scoring reads (billingSlots) matter.
const mkArtist = (
  id: string,
  billingSlots: Artist['billingSlots'],
): Artist => ({
  id,
  rawNames: [id],
  normalizedName: id,
  isTribute: false,
  prominence: -1, // sentinel: proves scoreArtists overwrote it
  tier: 'mid',
  billingSlots,
});

// Objective billing fixtures — position straight off the poster's billed order.
const opener = mkArtist('opener', [{ showId: 's1', slot: 0, ofSlots: 2 }]);      // bottom of a 2-act bill
const headliner = mkArtist('headliner', [{ showId: 's1', slot: 1, ofSlots: 2 }]); // top of a 2-act bill
const solo = mkArtist('solo', [{ showId: 's2', slot: 0, ofSlots: 1 }]);           // top of its own 1-act bill
const midAct = mkArtist('mid', [{ showId: 's3', slot: 1, ofSlots: 3 }]);          // middle of a 3-act bill, never top

describe('scoreArtists (billing-based)', () => {
  it('headliner → prominence 1, tier arena', () => {
    const a = { ...headliner };
    scoreArtists([a]);
    expect(a.prominence).toBe(1);
    expect(a.tier).toBe('arena');
  });

  it('solo act → prominence 1, tier arena (top of its own bill)', () => {
    const a = { ...solo };
    scoreArtists([a]);
    expect(a.prominence).toBe(1);
    expect(a.tier).toBe('arena');
  });

  it('opener → prominence 0, tier small-print', () => {
    const a = { ...opener };
    scoreArtists([a]);
    expect(a.prominence).toBe(0);
    expect(a.tier).toBe('small-print');
  });

  it('a never-top mid act → tier small-print', () => {
    // slot 1 of 3 → position 0.5, but never top-billed → small-print.
    const a = { ...midAct };
    scoreArtists([a]);
    expect(a.prominence).toBeCloseTo(0.5, 12);
    expect(a.tier).toBe('small-print');
  });

  it('prominence is the BEST billing position across the artist\'s shows', () => {
    // Same act opens one gig (0) and headlines another (1) → best is 1 → arena.
    const a = mkArtist('crossover', [
      { showId: 's1', slot: 0, ofSlots: 2 },
      { showId: 's2', slot: 1, ofSlots: 2 },
    ]);
    scoreArtists([a]);
    expect(a.prominence).toBe(1);
    expect(a.tier).toBe('arena');
  });

  it('an artist with no billing slots → prominence 0, small-print', () => {
    const a = mkArtist('ghost', []);
    scoreArtists([a]);
    expect(a.prominence).toBe(0);
    expect(a.tier).toBe('small-print');
  });

  it('scores a whole bundle in one pass and mutates in place', () => {
    const artists = [{ ...opener }, { ...headliner }, { ...solo }, { ...midAct }];
    scoreArtists(artists);
    expect(artists.map((a) => a.tier)).toEqual(['small-print', 'arena', 'arena', 'small-print']);
    // Sentinel prominence (-1) was overwritten for every artist.
    expect(artists.every((a) => a.prominence >= 0)).toBe(true);
  });

  it('is deterministic — two runs deep-equal', () => {
    const run = () => {
      const artists = [{ ...opener }, { ...headliner }, { ...solo }, { ...midAct }];
      scoreArtists(artists);
      return artists.map((a) => ({ prominence: a.prominence, tier: a.tier }));
    };
    expect(run()).toEqual(run());
  });
});
