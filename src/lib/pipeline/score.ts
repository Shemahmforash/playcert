import type { Artist } from '../types';

/**
 * Prominence signals per artist (keyed by Artist.id in the map passed to
 * scoreArtists). Both are nullable: null means "unknown" and contributes 0
 * to the raw term BEFORE normalization (never NaN, never skewing min/max as
 * a negative).
 */
export type ProminenceSignals = {
  listens: number | null;
  releaseCount: number | null;
};

/**
 * Min-max normalize `x` against the bundle's [min, max] range.
 * DEGENERATE: when max === min (single artist, or all-equal terms) there is no
 * spread to normalize against, so mm ≡ 0 for every artist. This is deliberate:
 * a lone artist has no relative fame within its bundle → prominence 0.
 */
function mm(x: number, min: number, max: number): number {
  if (max === min) return 0;
  return (x - min) / (max - min);
}

/** log1p(v ?? 0): missing signal collapses to log1p(0) = 0 before normalization. */
function rawTerm(v: number | null): number {
  return Math.log1p(v ?? 0);
}

/** Top-billed on ≥1 show iff any billing slot is the last slot of its show. */
function isTopSlot(artist: Artist): boolean {
  return artist.billingSlots.some((b) => b.slot === b.ofSlots - 1);
}

/**
 * R6 prominence scoring. MUTATES each artist's `prominence` and `tier` in place.
 *
 *   prominence = 0.6 * mm(log1p(listens))  +  0.4 * mm(log1p(releaseCount))
 *
 * where mm normalizes each raw term across ALL artists in the bundle. Missing
 * signals → 0 before normalization.
 *
 * Tiers:
 *   arena       iff prominence >= 0.75 AND top-slot on ≥1 show
 *   small-print iff prominence <= 0.35 OR never top-slot on any show
 *   mid         otherwise
 */
export function scoreArtists(
  artists: Artist[],
  signalsById: Record<string, ProminenceSignals>,
): void {
  const lbTerms = artists.map((a) => rawTerm(signalsById[a.id]?.listens ?? null));
  const itTerms = artists.map((a) => rawTerm(signalsById[a.id]?.releaseCount ?? null));

  const lbMin = Math.min(...lbTerms);
  const lbMax = Math.max(...lbTerms);
  const itMin = Math.min(...itTerms);
  const itMax = Math.max(...itTerms);

  artists.forEach((artist, i) => {
    const prominence = 0.6 * mm(lbTerms[i], lbMin, lbMax) + 0.4 * mm(itTerms[i], itMin, itMax);
    const top = isTopSlot(artist);

    let tier: Artist['tier'];
    if (prominence >= 0.75 && top) {
      tier = 'arena';
    } else if (prominence <= 0.35 || !top) {
      tier = 'small-print';
    } else {
      tier = 'mid';
    }

    artist.prominence = prominence;
    artist.tier = tier;
  });
}
