import type { CityWindowBundle } from '../types';
import type { PlaylistEntry } from './order';
import { applyFontStop } from './applyFontStop';

/**
 * "Small Print runs dry" predicate (Task 3.7, §2.6 "Sparse").
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6 —
 *   "If Small Print leaves < 8 shows: `Small Print runs dry here — try No Arenas`
 *    with a one-tap dial link (not just prose)."
 *
 * The point is to fire ONLY when the Small Print stop is what emptied the bill —
 * the escape hatch is "you filtered too hard, back off the dial", NOT "it's a
 * quiet week" (which is the SparseNotice's job). So we compare two distinct-SHOW
 * counts derived purely from the already-client-side bundle:
 *   - the Small Print set (`applyFontStop(bundle, 'small-print')`), and
 *   - the whole, unfiltered bill (`applyFontStop(bundle, 'everything')`).
 *
 * We count DISTINCT `show.id` (a poster / gig), never tracks — the copy speaks in
 * shows. Pure; no React.
 */

const DRY_SHOW_THRESHOLD = 8;

/** Distinct shows (posters) behind an ordered playlist — a shared definition. */
export function distinctShowCount(entries: PlaylistEntry[]): number {
  return new Set(entries.map((e) => e.show.id)).size;
}

/**
 * True IFF the Small Print stop leaves `< 8` distinct shows AND the whole bill
 * has `>= 8` distinct shows. The second clause is what guarantees it can never
 * fire on a genuinely quiet week (few shows overall): if the unfiltered bill is
 * itself below 8, the dryness isn't the stop's fault and we stay silent.
 */
export function smallPrintRunsDry(bundle: CityWindowBundle): boolean {
  const smallPrintShows = distinctShowCount(applyFontStop(bundle, 'small-print'));
  const wholeBillShows = distinctShowCount(applyFontStop(bundle, 'everything'));
  return smallPrintShows < DRY_SHOW_THRESHOLD && wholeBillShows >= DRY_SHOW_THRESHOLD;
}
