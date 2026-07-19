import { describe, it, expect } from 'vitest';
import {
  diffEntries,
  entryKey,
  resolveContinuity,
} from '../../src/lib/pipeline/rebuildDiff';
import type { PlaylistEntry } from '../../src/lib/pipeline/order';
import type { Show, Track } from '../../src/lib/types';

/**
 * Task 3.6 — the pure rebuild diff + playback-continuity engine.
 *
 * No React, no timers: given the OLD and NEW playlist entries, classify
 * kept/removed/added and decide where the radio needle lands so playback stays
 * continuous (survivor uninterrupted; filtered-out → nearest following survivor).
 */

const mkShow = (id: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt: '2026-08-01T20:00:00',
  venue: { name: `V-${id}`, city: 'Lisboa' },
  ticketUrl: `https://t/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

const mkTrack = (
  artistId: string,
  itunesTrackId: number,
  extra: Partial<Track> = {},
): Track => ({
  artistId,
  itunesTrackId,
  title: `${artistId}-${itunesTrackId}`,
  previewUrl: `https://audio/${itunesTrackId}.m4a`,
  artworkUrl: `https://art/${itunesTrackId}.jpg`,
  itunesUrl: `https://itunes/${itunesTrackId}`,
  confidence: 'exact',
  ...extra,
});

const mkEntry = (show: Show, track: Track, isEncore = false): PlaylistEntry => ({
  track,
  show,
  isEncore,
});

// A representative bill: an arena headliner + an opener on show A, an opener on B.
const showA = mkShow('tm:A', ['arena', 'opener1']);
const showB = mkShow('tm:B', ['opener2']);

const arenaEntry = mkEntry(showA, mkTrack('arena', 1));
const opener1Entry = mkEntry(showA, mkTrack('opener1', 2));
const opener2Entry = mkEntry(showB, mkTrack('opener2', 3));

// everything → all three; small-print → arena row drops, openers stay.
const everything: PlaylistEntry[] = [arenaEntry, opener1Entry, opener2Entry];
const smallPrint: PlaylistEntry[] = [opener1Entry, opener2Entry];

describe('entryKey', () => {
  it('is stable and collision-free across a headliner second track in the same show', () => {
    // R7: an arena headliner can hold a SECOND track on the SAME show. show.id +
    // artistId alone would collide — the track discriminator keeps them distinct.
    const t1 = mkTrack('arena', 10);
    const t2 = mkTrack('arena', 11, { isSecondHeadlinerTrack: true });
    const e1 = mkEntry(showA, t1);
    const e2 = mkEntry(showA, t2);
    expect(entryKey(e1)).not.toBe(entryKey(e2));
    // …and it is deterministic.
    expect(entryKey(e1)).toBe(entryKey(mkEntry(showA, mkTrack('arena', 10))));
  });
});

describe('diffEntries', () => {
  it('everything → small-print drops the arena row and keeps the openers', () => {
    const { kept, removed, added } = diffEntries(everything, smallPrint);
    expect(removed).toEqual([entryKey(arenaEntry)]);
    expect(kept).toEqual([entryKey(opener1Entry), entryKey(opener2Entry)]);
    expect(added).toEqual([]);
  });

  it('reverse (small-print → everything) reports the arena row as added, in next order', () => {
    const { kept, removed, added } = diffEntries(smallPrint, everything);
    expect(added).toEqual([entryKey(arenaEntry)]);
    expect(kept).toEqual([entryKey(opener1Entry), entryKey(opener2Entry)]);
    expect(removed).toEqual([]);
  });
});

describe('resolveContinuity', () => {
  it('(a) current survives → its new index, survived:true', () => {
    // Playing opener1 (index 1 in everything) → survives at index 0 in small-print.
    expect(
      resolveContinuity({ prev: everything, next: smallPrint, currentIndex: 1 }),
    ).toEqual({ nextIndex: 0, survived: true });
  });

  it('(b) current filtered out → nearest FOLLOWING survivor, survived:false', () => {
    // Playing arena (index 0) → filtered out; nearest following survivor is
    // opener1, which is index 0 in small-print.
    expect(
      resolveContinuity({ prev: everything, next: smallPrint, currentIndex: 0 }),
    ).toEqual({ nextIndex: 0, survived: false });
  });

  it('(c) current filtered out with only PRECEDING survivors → nearest preceding', () => {
    // prev: [opener1, opener2, arena]; next drops arena (the current, last row).
    const prev = [opener1Entry, opener2Entry, arenaEntry];
    const next = [opener1Entry, opener2Entry];
    // currentIndex 2 (arena) — no following survivor, nearest preceding is
    // opener2 at next index 1.
    expect(resolveContinuity({ prev, next, currentIndex: 2 })).toEqual({
      nextIndex: 1,
      survived: false,
    });
  });

  it('(d) next empty → nextIndex -1, survived:false', () => {
    expect(
      resolveContinuity({ prev: everything, next: [], currentIndex: 1 }),
    ).toEqual({ nextIndex: -1, survived: false });
  });

  it('guards an out-of-range currentIndex (non-empty next → index 0)', () => {
    expect(
      resolveContinuity({ prev: everything, next: smallPrint, currentIndex: 99 }),
    ).toEqual({ nextIndex: 0, survived: false });
  });
});
