import type { Artist } from '../types';

/**
 * Objective billing position of a single slot on its show.
 *   opener   (slot 0)                     → 0
 *   headliner (slot === ofSlots - 1)      → 1
 *   a SOLO act (ofSlots 1)                → 1 (top of its own one-act bill)
 * Linear in between: slot / (ofSlots - 1).
 */
function billingPosition(slot: number, ofSlots: number): number {
  return ofSlots <= 1 ? 1 : slot / (ofSlots - 1);
}

/**
 * Prominence/tier scoring driven purely by OBJECTIVE billing order — straight
 * off the poster, no external signals. MUTATES each artist's `prominence` and
 * `tier` in place.
 *
 *   prominence = best billing position across every show the artist plays
 *              = max over billingSlots of slot / (ofSlots - 1)   (0 if none)
 *
 * Tiers (thresholds unchanged from the old fame scorer, still coherent):
 *   arena       iff prominence >= 0.75 AND top-billed on ≥1 show
 *   small-print iff prominence <= 0.35 OR never top-billed on any show
 *   mid         otherwise
 *
 * With billing, a top-slot artist has prominence 1.0 → arena; a non-top artist
 * → small-print; 'mid' is effectively unreachable (a top-billed act always
 * reaches 1.0). The branch is kept for completeness.
 */
export function scoreArtists(artists: Artist[]): void {
  for (const artist of artists) {
    const prominence = artist.billingSlots.length
      ? Math.max(...artist.billingSlots.map((b) => billingPosition(b.slot, b.ofSlots)))
      : 0;
    const top = artist.billingSlots.some((b) => b.slot === b.ofSlots - 1);

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
  }
}
