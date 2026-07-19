import type { Artist, Track } from '../types';
import { pickExact, type ItunesCandidate } from '../api/itunes';
import type { CrossCheck, EventContext } from '../api/musicbrainz';

interface Deps {
  searchTracks: (name: string) => Promise<ItunesCandidate[]>;
  crossCheck: (name: string, ctx?: EventContext) => Promise<CrossCheck>;
  isHeadliner?: (a: Artist) => boolean;
  ctx?: EventContext;
}

// A headliner is the top-billed act of a MULTI-act show (last slot, ofSlots > 1).
// A solo booking (ofSlots === 1) is NOT treated as a headliner here: it gets a
// single track, matching the exact-hit contract.
const defaultIsHeadliner = (a: Artist) =>
  a.billingSlots.some((b) => b.slot === b.ofSlots - 1 && b.ofSlots > 1);

const toTrack = (a: Artist, c: ItunesCandidate, confidence: Track['confidence']): Track => ({
  artistId: a.id, itunesTrackId: c.itunesTrackId, title: c.title,
  previewUrl: c.previewUrl, artworkUrl: c.artworkUrl, itunesUrl: c.itunesUrl, confidence,
});

export async function resolveTracks(artists: Artist[], deps: Deps): Promise<Track[]> {
  const out: Track[] = [];
  for (const artist of artists) {
    const candidates = await deps.searchTracks(artist.normalizedName);
    if (candidates.length === 0) continue;
    const exact = pickExact(candidates, artist.normalizedName);

    let accepted: ItunesCandidate | null = null;
    let confidence: Track['confidence'] = 'exact';
    if (exact && !artist.isTribute) {
      accepted = exact;
    } else {
      const check = await deps.crossCheck(artist.normalizedName, deps.ctx);
      if (check.status === 'confirmed') {
        artist.mbid = check.mbid;
        accepted = exact ?? candidates[0];
        confidence = 'mb-confirmed';
      }
    }
    if (!accepted) continue; // SILENT DROP

    out.push(toTrack(artist, accepted, confidence));
    if ((deps.isHeadliner ?? defaultIsHeadliner)(artist)) {
      const second = candidates.find(
        (c) => c.artistName === accepted!.artistName && c.itunesTrackId !== accepted!.itunesTrackId,
      );
      if (second) out.push({ ...toTrack(artist, second, confidence), isSecondHeadlinerTrack: true });
    }
  }
  return out;
}
