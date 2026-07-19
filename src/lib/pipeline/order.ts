import type { Artist, Show, Track } from '../types';

export interface PlaylistEntry {
  track: Track;
  show: Show;
  isEncore: boolean;
}

export const TRACK_CAP = 30; // R1

export function orderPlaylist(
  shows: Show[],
  artists: Record<string, Artist>,
  tracks: Track[],
): PlaylistEntry[] {
  const byArtist = new Map<string, Track[]>();
  for (const t of tracks) byArtist.set(t.artistId, [...(byArtist.get(t.artistId) ?? []), t]);

  const sortedShows = [...shows].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const entries: PlaylistEntry[] = [];
  const used = new Set<Track>();
  for (const show of sortedShows) {
    for (const artistId of show.artistIds) {
      // billed order = opener…headliner (bill mirroring)
      for (const t of byArtist.get(artistId) ?? []) {
        if (!used.has(t)) {
          used.add(t);
          entries.push({ track: t, show, isEncore: false });
        }
      }
    }
  }

  // Encore (R8): one track from the final show, from its least-prominent billed act.
  const lastShow = sortedShows.at(-1);
  if (lastShow) {
    const candidates = lastShow.artistIds
      .filter((id) => byArtist.has(id))
      .sort((a, b) => (artists[a]?.prominence ?? 0) - (artists[b]?.prominence ?? 0));
    const encoreArtist = candidates[0];
    const encoreEntry = entries.findLast(
      (e) => e.track.artistId === encoreArtist && e.show.id === lastShow.id,
    );
    if (encoreEntry) {
      encoreEntry.isEncore = true;
      const rest = entries.filter((e) => e !== encoreEntry).slice(0, TRACK_CAP - 1);
      return [...rest, encoreEntry];
    }
  }

  return entries.slice(0, TRACK_CAP);
}
