import { describe, it, expect } from 'vitest';
import { applyFontStop } from '../../src/lib/pipeline/applyFontStop';
import { TRACK_CAP } from '../../src/lib/pipeline/order';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

// ---- fixture helpers -------------------------------------------------------
const mkArtist = (id: string, tier: Artist['tier'], prominence: number): Artist => ({
  id,
  rawNames: [id],
  normalizedName: id,
  isTribute: false,
  prominence,
  tier,
  billingSlots: [],
});

let trackSeq = 5000;
const mkTrack = (artistId: string, isSecondHeadlinerTrack = false): Track => {
  const n = trackSeq++;
  return {
    artistId,
    itunesTrackId: n,
    title: `${artistId}-song-${n}`,
    previewUrl: `https://audio.example/${n}.m4a`,
    artworkUrl: `https://art.example/${n}.jpg`,
    itunesUrl: `https://itunes.example/${n}`,
    confidence: 'exact',
    ...(isSecondHeadlinerTrack ? { isSecondHeadlinerTrack: true } : {}),
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

// ---- rich mixed-tier fixture bundle ----------------------------------------
// arena1  arena  0.9  — primary + a 2nd-headliner track (R7)
// mid1    mid    0.5  — 2 primary tracks
// sp1     small-print 0.2 — opener, 2 primary tracks
// sp2     small-print 0.15 — least prominent on last show -> encore
const artists: Record<string, Artist> = {
  arena1: mkArtist('arena1', 'arena', 0.9),
  mid1: mkArtist('mid1', 'mid', 0.5),
  sp1: mkArtist('sp1', 'small-print', 0.2),
  sp2: mkArtist('sp2', 'small-print', 0.15),
};

const shows: Show[] = [
  mkShow('sB', '2026-08-02T20:00:00', ['mid1']),
  mkShow('sA', '2026-08-01T20:00:00', ['sp1', 'arena1']), // opener -> arena headliner
  mkShow('sC', '2026-08-03T20:00:00', ['sp2', 'mid1']), // chronologically LAST
];

const arenaPrimary = mkTrack('arena1');
const arenaSecond = mkTrack('arena1', true); // isSecondHeadlinerTrack
const tracks: Track[] = [
  arenaPrimary,
  arenaSecond,
  mkTrack('mid1'),
  mkTrack('mid1'),
  mkTrack('sp1'),
  mkTrack('sp1'),
  mkTrack('sp2'),
  mkTrack('sp2'),
];

const bundle = mkBundle(artists, shows, tracks);

const artistIdsIn = (entries: { track: Track }[]) => entries.map((e) => e.track.artistId);
const hasSecondHeadliner = (entries: { track: Track }[]) =>
  entries.some((e) => e.track.isSecondHeadlinerTrack === true);

describe('applyFontStop (Task 3.3: per-stop tier filter + re-order)', () => {
  it('everything — keeps ALL tracks incl. the arena 2nd-headliner track (R7)', () => {
    const entries = applyFontStop(bundle, 'everything');
    expect(entries).toHaveLength(8);
    expect(hasSecondHeadliner(entries)).toBe(true);
    // arena1 contributes BOTH its primary and its 2nd-headliner track
    expect(artistIdsIn(entries).filter((id) => id === 'arena1')).toHaveLength(2);
  });

  it('no-arenas — drops the arena 2nd-headliner track; arena keeps its 1 primary; no 2nd-headliner anywhere', () => {
    const entries = applyFontStop(bundle, 'no-arenas');
    expect(hasSecondHeadliner(entries)).toBe(false);
    const arenaTracks = artistIdsIn(entries).filter((id) => id === 'arena1');
    expect(arenaTracks).toHaveLength(1); // capped at ONE token track
    expect(entries.some((e) => e.track === arenaSecond)).toBe(false);
    expect(entries.some((e) => e.track === arenaPrimary)).toBe(true);
    // all other (primary) tracks survive
    expect(artistIdsIn(entries).filter((id) => id === 'mid1')).toHaveLength(2);
    expect(artistIdsIn(entries).filter((id) => id === 'sp1')).toHaveLength(2);
  });

  it('small-print — NO arena-tier tracks at all, no 2nd-headliner; openers/mid remain', () => {
    const entries = applyFontStop(bundle, 'small-print');
    expect(artistIdsIn(entries)).not.toContain('arena1'); // whole arena artist dropped
    expect(hasSecondHeadliner(entries)).toBe(false);
    // mid + small-print openers survive
    expect(artistIdsIn(entries).filter((id) => id === 'mid1')).toHaveLength(2);
    expect(artistIdsIn(entries).filter((id) => id === 'sp1')).toHaveLength(2);
    expect(artistIdsIn(entries).filter((id) => id === 'sp2')).toHaveLength(2);
  });

  it('result is a valid ordered PlaylistEntry[] — chronological, <= TRACK_CAP, encore preserved', () => {
    const entries = applyFontStop(bundle, 'everything');
    // chronological (non-decreasing by show startsAt)
    for (let i = 1; i < entries.length; i++) {
      expect(
        entries[i - 1].show.startsAt.localeCompare(entries[i].show.startsAt),
      ).toBeLessThanOrEqual(0);
    }
    expect(entries.length).toBeLessThanOrEqual(TRACK_CAP);
    // encore: exactly one, on the chronologically-last show, least-prominent act (sp2)
    const encores = entries.filter((e) => e.isEncore);
    expect(encores).toHaveLength(1);
    expect(encores[0].show.id).toBe('sC');
    expect(encores[0].track.artistId).toBe('sp2');
    expect(entries[entries.length - 1].isEncore).toBe(true);
  });

  it('small-print that empties the set returns [] cleanly (no throw)', () => {
    // A bundle whose only tracks are arena-tier / 2nd-headliner: small-print nukes all.
    const onlyArena = mkArtist('onlyArena', 'arena', 0.95);
    const emptying = mkBundle(
      { onlyArena },
      [mkShow('sX', '2026-08-01T20:00:00', ['onlyArena'])],
      [mkTrack('onlyArena'), mkTrack('onlyArena', true)],
    );
    expect(applyFontStop(emptying, 'small-print')).toEqual([]);
  });

  it('is deterministic across repeated calls (deep-equal)', () => {
    expect(applyFontStop(bundle, 'no-arenas')).toEqual(applyFontStop(bundle, 'no-arenas'));
    expect(applyFontStop(bundle, 'everything')).toEqual(applyFontStop(bundle, 'everything'));
  });
});
