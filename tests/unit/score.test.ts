import { describe, it, expect } from 'vitest';
import { scoreArtists, type ProminenceSignals } from '../../src/lib/pipeline/score';
import type { Artist } from '../../src/lib/types';

// Minimal artist factory; only the fields scoring reads matter.
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

/**
 * Hand-computed fixture (all logs are natural, log1p(x) = ln(1+x)):
 *
 *   lbTerms:  A ln(1000)=6.907755  B ln(1)=0           C ln(100)=4.605170
 *             lbMin=0 (B), lbMax=ln(1000) (A)
 *             mm_lb: A=1  B=0  C=ln(100)/ln(1000)=2/3
 *   itTerms:  A ln(100)=4.605170   B ln(10)=2.302585   C ln(1)=0
 *             itMin=0 (C), itMax=ln(100) (A)
 *             mm_it: A=1  B=ln(10)/ln(100)=1/2  C=0
 *
 *   prominence = 0.6*mm_lb + 0.4*mm_it
 *     A = 0.6*1     + 0.4*1   = 1.0
 *     B = 0.6*0     + 0.4*0.5 = 0.2
 *     C = 0.6*(2/3) + 0.4*0   = 0.4
 */
const A = mkArtist('a', [{ showId: 's1', slot: 1, ofSlots: 2 }]); // top slot (1 == 2-1)
const B = mkArtist('b', [{ showId: 's1', slot: 0, ofSlots: 2 }]); // NOT top slot
const C = mkArtist('c', [{ showId: 's2', slot: 0, ofSlots: 1 }]); // top slot (solo, 0 == 1-1)

const signals: Record<string, ProminenceSignals> = {
  a: { listens: 999, releaseCount: 99 },
  b: { listens: null, releaseCount: 9 }, // null listens → contributes 0 pre-normalization
  c: { listens: 99, releaseCount: null },
};

describe('scoreArtists (R6)', () => {
  it('assigns EXACT hand-computed prominence values', () => {
    const artists = [A, B, C].map((a) => ({ ...a }));
    scoreArtists(artists, signals);
    expect(artists[0].prominence).toBeCloseTo(1.0, 12);
    expect(artists[1].prominence).toBeCloseTo(0.2, 12);
    expect(artists[2].prominence).toBeCloseTo(0.4, 12);
  });

  it('assigns tiers per the arena/mid/small-print rules', () => {
    const artists = [A, B, C].map((a) => ({ ...a }));
    scoreArtists(artists, signals);
    // A: 1.0 >= 0.75 AND top slot → arena
    expect(artists[0].tier).toBe('arena');
    // B: 0.2 <= 0.35 → small-print (also not top slot)
    expect(artists[1].tier).toBe('small-print');
    // C: 0.4 (between) AND top slot → mid
    expect(artists[2].tier).toBe('mid');
  });

  it('a high-prominence artist NOT on any top slot is small-print (never arena)', () => {
    // Swap A off its top slot. Arena requires top slot; and "never top slot"
    // is itself a small-print trigger, so a 1.0-prominence non-headliner is
    // small-print — the R6 rule that keeps openers out of the arena tier.
    const nonTopA = mkArtist('a', [{ showId: 's1', slot: 0, ofSlots: 2 }]);
    const artists = [nonTopA, { ...B }, { ...C }];
    scoreArtists(artists, signals);
    expect(artists[0].prominence).toBeCloseTo(1.0, 12);
    expect(artists[0].tier).toBe('small-print'); // 1.0 but no top slot → not arena, not mid
  });

  it('a null-signals artist contributes 0 to its raw terms', () => {
    const artists = [
      mkArtist('x', [{ showId: 's', slot: 1, ofSlots: 2 }]),
      mkArtist('y', [{ showId: 's', slot: 0, ofSlots: 2 }]),
    ];
    scoreArtists(artists, {
      x: { listens: 999, releaseCount: 99 },
      y: { listens: null, releaseCount: null }, // fully unknown
    });
    // y's terms are both log1p(0)=0 = the min → mm 0 → prominence 0.
    expect(artists[1].prominence).toBe(0);
    expect(artists[1].tier).toBe('small-print');
    // x is the sole non-zero → mm 1 on both → prominence 1.
    expect(artists[0].prominence).toBeCloseTo(1.0, 12);
  });

  it('is deterministic — two runs deep-equal', () => {
    const run = () => {
      const artists = [A, B, C].map((a) => ({ ...a }));
      scoreArtists(artists, signals);
      return artists.map((a) => ({ prominence: a.prominence, tier: a.tier }));
    };
    expect(run()).toEqual(run());
  });

  it('single-artist degenerate case: max===min → mm 0 → prominence 0 → small-print', () => {
    // Even though this lone artist IS top-slot, prominence collapses to 0 (no
    // spread to normalize against), and 0 <= 0.35 → small-print.
    const solo = [mkArtist('solo', [{ showId: 's', slot: 0, ofSlots: 1 }])]; // top slot
    scoreArtists(solo, { solo: { listens: 5_000, releaseCount: 200 } });
    expect(solo[0].prominence).toBe(0);
    expect(solo[0].tier).toBe('small-print'); // 0 <= 0.35 wins over top-slot
  });
});
