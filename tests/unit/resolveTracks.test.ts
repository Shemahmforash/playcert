import { describe, it, expect, vi } from 'vitest';
import { resolveTracks } from '../../src/lib/pipeline/resolveTracks';
import type { Artist } from '../../src/lib/types';

const mkArtist = (id: string, o: Partial<Artist> = {}): Artist => ({
  id, normalizedName: id, rawNames: [id], isTribute: false,
  prominence: 0, tier: 'mid', billingSlots: [{ showId: 'tm:1', slot: 0, ofSlots: 1 }], ...o,
});
const exactCandidates = (name: string) => [
  { artistId: '1', itunesTrackId: 1, artistName: name, title: 'Hit', previewUrl: 'https://p/1', artworkUrl: 'https://a/1', itunesUrl: 'https://itunes/1' },
  { artistId: '1', itunesTrackId: 2, artistName: name, title: 'Second', previewUrl: 'https://p/2', artworkUrl: 'https://a/2', itunesUrl: 'https://itunes/2' },
];

describe('resolveTracks', () => {
  it('exact hit → confidence exact', async () => {
    const tracks = await resolveTracks([mkArtist('balthvs')], {
      searchTracks: async () => exactCandidates('balthvs'), crossCheck: vi.fn(),
    });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].confidence).toBe('exact');
  });
  it('homonym (no exact) → MB confirm → mb-confirmed', async () => {
    const tracks = await resolveTracks([mkArtist('boston')], {
      searchTracks: async () => exactCandidates('Boston (PT)'),
      crossCheck: async () => ({ status: 'confirmed', mbid: 'm1' }),
    });
    expect(tracks[0]?.confidence).toBe('mb-confirmed');
  });
  it('homonym → MB mismatch → SILENT DROP (absence beats wrong)', async () => {
    const tracks = await resolveTracks([mkArtist('boston')], {
      searchTracks: async () => exactCandidates('Boston (PT)'),
      crossCheck: async () => ({ status: 'unconfident' }),
    });
    expect(tracks).toHaveLength(0);
  });
  it('empty iTunes result → drop, no throw', async () => {
    const tracks = await resolveTracks([mkArtist('ghost-act')], {
      searchTracks: async () => [], crossCheck: vi.fn(),
    });
    expect(tracks).toHaveLength(0);
  });
  it('tribute flag forces the ambiguous path even on exact name hit', async () => {
    const cc = vi.fn(async () => ({ status: 'unconfident' as const }));
    const tracks = await resolveTracks([mkArtist('the doors show', { isTribute: true })], {
      searchTracks: async () => exactCandidates('the doors show'), crossCheck: cc,
    });
    expect(cc).toHaveBeenCalled();
    expect(tracks).toHaveLength(0);
  });
  it('thrown iTunes search (throttle/timeout) → skip that artist, others still resolve, no throw', async () => {
    const searchTracks = vi.fn(async (name: string) => {
      if (name === 'throttled') throw new Error('429 Too Many Requests');
      return exactCandidates(name);
    });
    const tracks = await resolveTracks([mkArtist('throttled'), mkArtist('balthvs')], {
      searchTracks, crossCheck: vi.fn(),
    });
    expect(tracks).toHaveLength(1);
    expect(tracks[0].artistId).toBe('balthvs');
  });
  it('R7: headliner ALWAYS gets a 2nd track in the bundle, flagged', async () => {
    const headliner = mkArtist('khruangbin', { billingSlots: [{ showId: 'tm:1', slot: 2, ofSlots: 3 }] });
    const tracks = await resolveTracks([headliner], {
      searchTracks: async () => exactCandidates('khruangbin'), crossCheck: vi.fn(),
      isHeadliner: () => true,
    });
    expect(tracks).toHaveLength(2);
    expect(tracks[1].isSecondHeadlinerTrack).toBe(true);
  });
});
