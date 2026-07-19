import { describe, it, expect } from 'vitest';
import { groupByDay, dateLabelFor } from '../../src/lib/playlistGrouping';
import type { PlaylistEntry } from '../../src/lib/pipeline/order';
import type { Show, Track } from '../../src/lib/types';

// ---- fixture helpers -------------------------------------------------------
const mkTrack = (artistId: string, n: number): Track => ({
  artistId,
  itunesTrackId: n,
  title: `${artistId}-${n}`,
  previewUrl: `https://audio.example/${n}.m4a`,
  artworkUrl: `https://art.example/${n}.jpg`,
  itunesUrl: `https://itunes.example/${n}`,
  confidence: 'exact',
});

const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `V-${id}`, city: 'Lisboa' },
  ticketUrl: `https://t/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

const mkEntry = (
  artistId: string,
  n: number,
  show: Show,
  isEncore = false,
): PlaylistEntry => ({ track: mkTrack(artistId, n), show, isEncore });

describe('dateLabelFor', () => {
  it('renders "WEEKDAY DAY" uppercase from the calendar-date portion', () => {
    // 2026-08-01 is a Saturday (verified against a known anchor).
    expect(dateLabelFor('2026-08-01T20:00:00')).toBe('SAT 1');
    expect(dateLabelFor('2026-08-02T21:00:00')).toBe('SUN 2');
    expect(dateLabelFor('2026-08-03T19:00:00')).toBe('MON 3');
    expect(dateLabelFor('2026-08-20T19:00:00')).toBe('THU 20');
  });

  it('is timezone-stable: the trailing offset never shifts the calendar day', () => {
    // Same wall-calendar date, wildly different offsets → identical label.
    expect(dateLabelFor('2026-09-05T23:30:00-05:00')).toBe('SAT 5');
    expect(dateLabelFor('2026-09-05T01:00:00+09:00')).toBe('SAT 5');
  });

  it('throws on an unparseable date string', () => {
    expect(() => dateLabelFor('not-a-date')).toThrow();
  });
});

describe('groupByDay', () => {
  const s1 = mkShow('s1', '2026-08-01T20:00:00', ['a1']);
  const s2 = mkShow('s2', '2026-08-01T22:00:00', ['a2']);
  const s3 = mkShow('s3', '2026-08-02T21:00:00', ['a3']);
  const s4 = mkShow('s4', '2026-08-03T19:00:00', ['a4']);
  const s5 = mkShow('s5', '2026-08-03T21:00:00', ['a5']);

  // 6 chronologically-ordered entries across 3 calendar days: [2, 1, 3].
  const entries: PlaylistEntry[] = [
    mkEntry('a1', 1, s1),
    mkEntry('a2', 2, s2),
    mkEntry('a3', 3, s3),
    mkEntry('a4', 4, s4),
    mkEntry('a5', 5, s5),
    mkEntry('a5', 6, s5, true),
  ];

  it('groups consecutive-by-day into 3 groups with correct keys and labels', () => {
    const groups = groupByDay(entries);
    expect(groups).toHaveLength(3);
    expect(groups.map((g) => g.dayKey)).toEqual([
      '2026-08-01',
      '2026-08-02',
      '2026-08-03',
    ]);
    expect(groups.map((g) => g.dateLabel)).toEqual(['SAT 1', 'SUN 2', 'MON 3']);
    expect(groups.map((g) => g.entries.length)).toEqual([2, 1, 3]);
  });

  it('preserves the ORIGINAL flat index of every entry', () => {
    const groups = groupByDay(entries);
    // Flatten the per-day indices back out and expect the original 0..5 run.
    const flatIndices = groups.flatMap((g) => g.entries.map((e) => e.index));
    expect(flatIndices).toEqual([0, 1, 2, 3, 4, 5]);
    // Day 3 keeps indices 3,4,5 even though it is the third group.
    expect(groups[2].entries.map((e) => e.index)).toEqual([3, 4, 5]);
    // Each carried entry is the very object from the input array.
    expect(groups[0].entries[0].entry).toBe(entries[0]);
    expect(groups[2].entries[2].entry).toBe(entries[5]);
  });

  it('is timezone-stable: same calendar day with different offsets stays one group', () => {
    const zA = mkShow('zA', '2026-09-05T23:30:00-05:00', ['x']);
    const zB = mkShow('zB', '2026-09-05T01:00:00+09:00', ['y']);
    const groups = groupByDay([mkEntry('x', 10, zA), mkEntry('y', 11, zB)]);
    expect(groups).toHaveLength(1);
    expect(groups[0].dayKey).toBe('2026-09-05');
    expect(groups[0].dateLabel).toBe('SAT 5');
  });

  it('returns an empty array for no entries', () => {
    expect(groupByDay([])).toEqual([]);
  });
});
