import { describe, it, expect } from 'vitest';
import { orderPlaylist, TRACK_CAP } from '../../src/lib/pipeline/order';
import type { Artist, Show, Track } from '../../src/lib/types';

// ---- fixture helpers -------------------------------------------------------
const mkArtist = (id: string, prominence: number): Artist => ({
  id,
  rawNames: [id],
  normalizedName: id,
  isTribute: false,
  prominence,
  tier: 'mid',
  billingSlots: [],
});

let trackSeq = 1000;
const mkTrack = (artistId: string): Track => ({
  artistId,
  itunesTrackId: trackSeq++, // unique + distinct object each call
  title: `${artistId}-song-${trackSeq}`,
  previewUrl: `https://audio.example/${trackSeq}.m4a`,
  artworkUrl: `https://art.example/${trackSeq}.jpg`,
  itunesUrl: `https://itunes.example/${trackSeq}`,
  confidence: 'exact',
});

const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `Venue ${id}`, city: 'Lisboa' },
  ticketUrl: `https://tm.example/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});

// ---- artists: varied prominence so the last show's opener is unambiguous ---
const artists: Record<string, Artist> = {
  a1: mkArtist('a1', 0.9),
  a2: mkArtist('a2', 0.8),
  a3: mkArtist('a3', 0.7),
  a4: mkArtist('a4', 0.6),
  a5: mkArtist('a5', 0.5),
  a6: mkArtist('a6', 0.4),
  a7: mkArtist('a7', 0.3),
  aOpen: mkArtist('aOpen', 0.25), // 3-act show opener
  aMid: mkArtist('aMid', 0.55), //   3-act show middle
  aHead: mkArtist('aHead', 0.85), // 3-act show headliner
  aHigh: mkArtist('aHigh', 0.95), // last show headliner
  aLow: mkArtist('aLow', 0.1), //    last show opener -> least prominent -> encore
};

// ---- 12 shows across 5 distinct days, deliberately out of order ------------
const shows: Show[] = [
  mkShow('s9', '2026-08-04T20:00:00', ['a1', 'a2']), // reused acts, 0 new tracks
  mkShow('s2', '2026-08-01T21:00:00', ['a2']),
  mkShow('s12', '2026-08-05T21:00:00', ['aLow', 'aHigh']), // chronologically LAST
  mkShow('s6', '2026-08-03T20:00:00', ['aOpen', 'aMid', 'aHead']), // 3-act, opener->headliner
  mkShow('s1', '2026-08-01T20:00:00', ['a1']),
  mkShow('s11', '2026-08-05T19:00:00', ['aHigh']),
  mkShow('s4', '2026-08-02T22:00:00', ['a4']),
  mkShow('s7', '2026-08-03T21:00:00', ['a6']),
  mkShow('s3', '2026-08-02T20:00:00', ['a3']),
  mkShow('s10', '2026-08-04T22:00:00', ['a3']), // reused act, 0 new tracks
  mkShow('s5', '2026-08-03T19:00:00', ['a5']),
  mkShow('s8', '2026-08-04T18:00:00', ['a7']),
];

// ---- 31 resolvable tracks (each a distinct object) -------------------------
// aOpen 2 + aMid 1 + aHead 2 = 5
// a1 3 + a2 3 + a3 3 + a4 3 + a5 3 + a6 3 + a7 2 = 20
// aHigh 2 + aLow 4 = 6   => total 31
const tracks: Track[] = [
  mkTrack('a1'), mkTrack('a1'), mkTrack('a1'),
  mkTrack('a2'), mkTrack('a2'), mkTrack('a2'),
  mkTrack('a3'), mkTrack('a3'), mkTrack('a3'),
  mkTrack('a4'), mkTrack('a4'), mkTrack('a4'),
  mkTrack('a5'), mkTrack('a5'), mkTrack('a5'),
  mkTrack('a6'), mkTrack('a6'), mkTrack('a6'),
  mkTrack('a7'), mkTrack('a7'),
  mkTrack('aOpen'), mkTrack('aOpen'),
  mkTrack('aMid'),
  mkTrack('aHead'), mkTrack('aHead'),
  mkTrack('aHigh'), mkTrack('aHigh'),
  mkTrack('aLow'), mkTrack('aLow'), mkTrack('aLow'), mkTrack('aLow'),
];

describe('orderPlaylist (R8: chronology + bill mirroring + 30-cap + encore)', () => {
  it('sanity: fixture really has 31 tracks, 12 shows, 5 distinct days', () => {
    expect(tracks).toHaveLength(31);
    expect(shows).toHaveLength(12);
    const days = new Set(shows.map((s) => s.startsAt.slice(0, 10)));
    expect(days.size).toBe(5);
    const threeActShow = shows.find((s) => s.artistIds.length === 3);
    expect(threeActShow?.artistIds).toEqual(['aOpen', 'aMid', 'aHead']);
  });

  it('sorts entries by show startsAt (non-decreasing)', () => {
    const entries = orderPlaylist(shows, artists, tracks);
    for (let i = 1; i < entries.length; i++) {
      expect(
        entries[i - 1].show.startsAt.localeCompare(entries[i].show.startsAt),
      ).toBeLessThanOrEqual(0);
    }
  });

  it('preserves billing-slot order within the 3-act show (opener before headliner)', () => {
    const entries = orderPlaylist(shows, artists, tracks);
    const inS6 = entries
      .map((e, i) => ({ i, artistId: e.track.artistId, showId: e.show.id }))
      .filter((e) => e.showId === 's6');
    const lastOpenerIdx = Math.max(...inS6.filter((e) => e.artistId === 'aOpen').map((e) => e.i));
    const firstHeadIdx = Math.min(...inS6.filter((e) => e.artistId === 'aHead').map((e) => e.i));
    expect(inS6.some((e) => e.artistId === 'aOpen')).toBe(true);
    expect(inS6.some((e) => e.artistId === 'aHead')).toBe(true);
    expect(lastOpenerIdx).toBeLessThan(firstHeadIdx);
  });

  it('caps at exactly 30 entries with the encore as the final slot', () => {
    const entries = orderPlaylist(shows, artists, tracks);
    expect(entries).toHaveLength(TRACK_CAP);
    expect(entries).toHaveLength(30);
    const last = entries[entries.length - 1];
    expect(last.isEncore).toBe(true);
    // only the final slot is the encore
    expect(entries.filter((e) => e.isEncore)).toHaveLength(1);
  });

  it('encore is one track from the chronologically-last show, least-prominent billed act with a track', () => {
    const entries = orderPlaylist(shows, artists, tracks);
    const encore = entries[entries.length - 1];
    expect(encore.isEncore).toBe(true);
    expect(encore.show.id).toBe('s12'); // 2026-08-05T21:00 is the latest
    expect(encore.track.artistId).toBe('aLow'); // prominence 0.1 < aHigh 0.95
  });

  it('is deterministic across repeated calls (deep-equal)', () => {
    const a = orderPlaylist(shows, artists, tracks);
    const b = orderPlaylist(shows, artists, tracks);
    expect(a).toEqual(b);
  });
});
