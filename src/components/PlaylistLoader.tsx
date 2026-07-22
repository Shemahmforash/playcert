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
 * Upper bound for a single bundle fetch. The cold bundle build runs ~45s; we sit a
 * little above that so a healthy-but-slow cold start still lands, while a build that
 * blows past the 60s function maxDuration is aborted locally (instead of hanging until
 * the function dies) and handed to the retry path.
 */
const FETCH_TIMEOUT_MS = 60_000;

/**
 * A non-ok HTTP status is a real answer from the server, not a transport failure — it
 * goes STRAIGHT to ErrorState. Only a timeout/network error (anything else thrown) is
 * treated as retryable, so we tag the ok-check rejection to tell the two apart.
 */
class BundleHttpError extends Error {}

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

    const url = `/api/bundle/${encodeURIComponent(city)}/${encodeURIComponent(window)}`;
    // The controller/timer of the CURRENTLY in-flight attempt, so unmount/cancel can
    // abort whichever attempt (first or retry) is running.
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // One fetch attempt, bounded by an AbortController timeout. Resolves with the parsed
    // bundle, or throws — a BundleHttpError for a non-ok status (not retried) or the raw
    // AbortError/network error (retryable).
    const attempt = async (): Promise<CityWindowBundle> => {
      controller = new AbortController();
      timer = setTimeout(() => controller?.abort(), FETCH_TIMEOUT_MS);
      try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new BundleHttpError(`bundle ${r.status}`);
        return (await r.json()) as CityWindowBundle;
      } finally {
        clearTimeout(timer);
      }
    };

    // Try once; on a timeout/network error retry EXACTLY once before falling to error.
    // A non-ok status (BundleHttpError) skips the retry — the server already answered.
    const run = async () => {
      try {
        const bundle = await attempt();
        if (!cancelled) setState({ kind: 'ready', bundle });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BundleHttpError) {
          setState({ kind: 'error' });
          return;
        }
        try {
          const bundle = await attempt();
          if (!cancelled) setState({ kind: 'ready', bundle });
        } catch {
          if (!cancelled) setState({ kind: 'error' });
        }
      }
    };
    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      controller?.abort();
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
