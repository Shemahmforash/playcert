'use client';

import { useEffect, useState } from 'react';
import type { CityWindowBundle, FontStop, TimeWindow } from '../lib/types';
import { recoveryActionsForEmpty } from '../lib/recoveryActions';
import { PlaylistScreen } from './PlaylistScreen';
import { LoadingTheater } from './LoadingTheater';
import { EmptyState } from './EmptyState';
import { ErrorState } from './ErrorState';

export interface PlaylistLoaderProps {
  city: string;
  window: TimeWindow;
  fontStop: FontStop;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; bundle: CityWindowBundle };

/**
 * Client-side bundle loader — the fix for the iOS Safari cold-load BLACK SCREEN.
 *
 * The page's SSR response closes instantly with this component's initial
 * `LoadingTheater` baked in (its useState default is `loading`), so iOS has a
 * FINISHED document to paint. The ~45s cold bundle build then runs in a SEPARATE
 * request to `/api/bundle/{city}/{window}`, behind the theater — never holding the
 * page stream open (which iOS refuses to render progressively).
 *
 * The bundle is fontStop-agnostic (keyed by city+window); the EarshotDial re-filters
 * the already-loaded bundle CLIENT-SIDE, so a fontStop change never triggers a
 * refetch — the effect only depends on [city, window].
 */
export function PlaylistLoader({ city, window, fontStop }: PlaylistLoaderProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ kind: 'loading' });
    fetch(`/api/bundle/${encodeURIComponent(city)}/${encodeURIComponent(window)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`bundle ${r.status}`);
        return r.json() as Promise<CityWindowBundle>;
      })
      .then((bundle) => {
        if (!cancelled) setState({ kind: 'ready', bundle });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [city, window]);

  if (state.kind === 'loading') return <LoadingTheater />;
  if (state.kind === 'error') return <ErrorState />;

  const { bundle } = state;
  // Whole bill genuinely empty (no playable track) → the bare wall + escape hatches.
  if (bundle.tracks.length === 0) {
    return (
      <EmptyState
        city={city}
        window={window}
        actions={recoveryActionsForEmpty({
          city,
          window,
          fontStop,
          unfilteredHadShows: bundle.shows.length > 0,
        })}
      />
    );
  }
  // Ship the WHOLE bundle; PlaylistScreen + applyFontStop render the URL's stop and
  // the dial re-filters locally with zero further fetches.
  return <PlaylistScreen bundle={bundle} fontStop={fontStop} city={city} window={window} />;
}
