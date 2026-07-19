import { describe, it, expect } from 'vitest';
import { distinctPosterCount } from '../../src/components/PlaylistScreen';
import type { PlaylistEntry } from '../../src/lib/pipeline/order';
import type { Show, Track } from '../../src/lib/types';

const showOf = (id: string): Show => ({
  id,
  name: `Show ${id}`,
  startsAt: '2026-09-18T20:00:00',
  venue: { name: 'EartH', city: 'London' },
  ticketUrl: `https://t/${id}`,
  attractions: [],
  artistIds: ['a'],
});

let trackSeq = 1;
const trackOf = (): Track => ({
  artistId: 'a',
  itunesTrackId: trackSeq++,
  title: `Track ${trackSeq}`,
  previewUrl: `https://p/${trackSeq}.m4a`,
  artworkUrl: `https://art/${trackSeq}.jpg`,
  itunesUrl: `https://itunes/${trackSeq}`,
  confidence: 'exact',
});

const entry = (showId: string): PlaylistEntry => ({
  track: trackOf(),
  show: showOf(showId),
  isEncore: false,
});

describe('distinctPosterCount — the entrance tally (§2.5)', () => {
  it('counts distinct show ids, not tracks', () => {
    const entries = [
      entry('tm:1'),
      entry('tm:1'), // same gig, two billed acts → one poster
      entry('tm:2'),
      entry('tm:3'),
    ];
    expect(distinctPosterCount(entries)).toBe(3);
  });

  it('is 0 for an empty playlist', () => {
    expect(distinctPosterCount([])).toBe(0);
  });
});
