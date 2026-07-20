import type { CityWindowBundle, FontStop, Track } from '../types';
import { orderPlaylist, type PlaylistEntry } from './order';

/**
 * The Earshot dial (Task 3.3). PURE + synchronous: given the full
 * CityWindowBundle and the selected FontStop, filter the bundle's track set by
 * tier/second-headliner rules for that stop, then RE-RUN ordering on the
 * surviving tracks so chronology, bill-mirroring, the 30-cap and the encore are
 * recomputed for exactly that set.
 *
 * Because it derives everything from the (already-serialized) bundle, it runs
 * identically on the server (SSR of any stop URL) and on the client (a dial
 * drag) with zero fetches.
 *
 * `tier` is derived from OBJECTIVE billing order (see score.ts): a top-billed
 * headliner/solo act is `arena`; everyone billed below them is `small-print`.
 *
 * Per-stop rules:
 *   everything   keep ALL tracks — the ONLY stop where an
 *                `isSecondHeadlinerTrack` track is visible (R7).
 *   no-arenas    DROP every `isSecondHeadlinerTrack` track, so a top-billed
 *                headliner is capped at its ONE primary token track; all
 *                artists' primary tracks are kept.
 *   small-print  DROP every track whose artist has `tier === 'arena'` entirely,
 *                AND drop `isSecondHeadlinerTrack` tracks — so the top-billed
 *                headliners fall away and only the opening/support acts remain.
 *
 * If a stop empties the set, ordering the empty set naturally yields `[]`.
 */
export function applyFontStop(bundle: CityWindowBundle, fontStop: FontStop): PlaylistEntry[] {
  const keep = (track: Track): boolean => {
    switch (fontStop) {
      case 'everything':
        return true;
      case 'no-arenas':
        return !track.isSecondHeadlinerTrack;
      case 'small-print':
        return !track.isSecondHeadlinerTrack && bundle.artists[track.artistId]?.tier !== 'arena';
    }
  };

  const filteredTracks = bundle.tracks.filter(keep);
  return orderPlaylist(bundle.shows, bundle.artists, filteredTracks);
}
