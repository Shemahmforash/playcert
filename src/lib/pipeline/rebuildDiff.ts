import type { PlaylistEntry } from './order';

/**
 * The rebuild diff + playback-continuity engine (Task 3.6) — PURE, no React.
 *
 * When the Earshot dial lands on a new font-stop, `applyFontStop` re-derives the
 * playlist in place. This module answers the two questions the choreography and
 * the player ask of that re-derivation, from the OLD and NEW entry lists alone:
 *
 *   1. Which rows survived, which left, which arrived? (`diffEntries`) — drives
 *      the visual re-typeset (survivors stay put, removed collapse, added drop).
 *   2. Where should the radio needle land so playback stays continuous?
 *      (`resolveContinuity`) — a surviving current track keeps playing at its new
 *      index; a filtered-out current retargets to the nearest FOLLOWING survivor
 *      (then, failing that, the nearest preceding), so the mix never goes silent.
 *
 * Everything keys off `entryKey`, a stable, collision-free identity for an entry.
 */

/**
 * A stable, collision-free key for a playlist entry.
 *
 * `show.id` + `track.artistId` is NOT unique on its own: a headliner can hold a
 * SECOND track on the same show (R7's `isSecondHeadlinerTrack`), which collides.
 * We therefore fold in a per-track discriminator — the iTunes track id when
 * present, else the (Apple-unique) preview URL, else the title — so two entries
 * only ever share a key when they are genuinely the same (show, track) pairing.
 */
export function entryKey(e: PlaylistEntry): string {
  const { track, show } = e;
  const discriminator =
    track.itunesTrackId != null
      ? `t${track.itunesTrackId}`
      : track.previewUrl
        ? `u${track.previewUrl}`
        : `n${track.title}`;
  return `${show.id}|${track.artistId}|${discriminator}`;
}

export interface EntryDiff {
  /** Keys present in BOTH lists, in PREV order. */
  kept: string[];
  /** Keys only in PREV (leaving), in PREV order. */
  removed: string[];
  /** Keys only in NEXT (arriving), in NEXT order. */
  added: string[];
}

/**
 * Classify every entry key by set membership across a prev→next rebuild.
 * `kept`/`removed` preserve prev order; `added` preserves next order.
 */
export function diffEntries(prev: PlaylistEntry[], next: PlaylistEntry[]): EntryDiff {
  const prevKeys = prev.map(entryKey);
  const nextKeys = next.map(entryKey);
  const prevSet = new Set(prevKeys);
  const nextSet = new Set(nextKeys);

  const kept = prevKeys.filter((k) => nextSet.has(k));
  const removed = prevKeys.filter((k) => !nextSet.has(k));
  const added = nextKeys.filter((k) => !prevSet.has(k));

  return { kept, removed, added };
}

export interface ContinuityInput {
  prev: PlaylistEntry[];
  next: PlaylistEntry[];
  currentIndex: number;
}

export interface ContinuityResult {
  /** Where the radio needle should land in NEXT; -1 iff NEXT is empty. */
  nextIndex: number;
  /** True iff the exact current track carried over (audio stays uninterrupted). */
  survived: boolean;
}

/**
 * Decide where playback continues after an in-place rebuild.
 *
 *  - Current track survives      → its new index, `survived: true` (no reload).
 *  - Current filtered out        → nearest FOLLOWING survivor (scan prev forward
 *                                  from currentIndex+1); else nearest PRECEDING
 *                                  (scan backward from currentIndex-1); else, if
 *                                  next is non-empty, index 0. `survived: false`.
 *  - Next is empty               → `nextIndex: -1`, `survived: false`.
 *
 * Out-of-range / empty `prev` and `currentIndex` are guarded: with no locatable
 * current we fall through to index 0 (or -1 when next is empty).
 */
export function resolveContinuity({
  prev,
  next,
  currentIndex,
}: ContinuityInput): ContinuityResult {
  if (next.length === 0) return { nextIndex: -1, survived: false };

  // First-occurrence index in NEXT for each key.
  const indexInNext = new Map<string, number>();
  next.forEach((e, i) => {
    const k = entryKey(e);
    if (!indexInNext.has(k)) indexInNext.set(k, i);
  });

  const inRange = currentIndex >= 0 && currentIndex < prev.length;

  if (inRange) {
    // 1. Does the exact current entry carry over?
    const currentKey = entryKey(prev[currentIndex]);
    const survivorAt = indexInNext.get(currentKey);
    if (survivorAt !== undefined) return { nextIndex: survivorAt, survived: true };

    // 2. Nearest FOLLOWING survivor.
    for (let i = currentIndex + 1; i < prev.length; i += 1) {
      const at = indexInNext.get(entryKey(prev[i]));
      if (at !== undefined) return { nextIndex: at, survived: false };
    }

    // 3. Nearest PRECEDING survivor.
    for (let i = currentIndex - 1; i >= 0; i -= 1) {
      const at = indexInNext.get(entryKey(prev[i]));
      if (at !== undefined) return { nextIndex: at, survived: false };
    }
  }

  // 4. Next is non-empty but no survivor found (or no locatable current).
  return { nextIndex: 0, survived: false };
}
