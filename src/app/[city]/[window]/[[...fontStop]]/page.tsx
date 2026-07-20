import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { cacheLife } from 'next/cache';
import { resolvePageState } from '../../../../lib/pageState';
import type { RequestKey } from '../../../../lib/urlState';
import type { TimeWindow } from '../../../../lib/types';
import { geoForCity } from '../../../../lib/api/geo';
import { buildBundleCached } from '../../../../lib/pipeline/buildBundle';
import { realDeps } from '../../../../lib/pipeline/realDeps';
import { bundleCacheProfile } from '../../../../lib/cache';
import { JambaseError } from '../../../../lib/api/jambase';
import { PlaylistScreen } from '../../../../components/PlaylistScreen';
import { LoadingTheater } from '../../../../components/LoadingTheater';
import { EmptyState } from '../../../../components/EmptyState';
import { ErrorState } from '../../../../components/ErrorState';
import { recoveryActionsForEmpty } from '../../../../lib/recoveryActions';

export const maxDuration = 60;

const WINDOW_LABEL: Record<TimeWindow, string> = {
  tonight: 'Tonight',
  'this-weekend': 'This weekend',
  'next-14-days': 'Next 14 days',
};

const titleCase = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

type Params = Promise<{ city: string; window: string; fontStop?: string[] }>;

// Resolves + validates the dynamic params inside a Suspense boundary. With
// dynamicParams=false this always succeeds, but the checks stay as defense.
async function resolveKey(params: Params): Promise<RequestKey> {
  const { city, window, fontStop } = await params;
  const state = resolvePageState({ city, window, fontStop });
  if (state.kind === 'not-found') notFound();
  if (!geoForCity(state.key.city)) notFound();
  return state.key;
}

async function getBundle(city: string, window: TimeWindow) {
  'use cache: remote';
  const b = await buildBundleCached(city, window, realDeps(city));
  cacheLife(bundleCacheProfile(b.tracks.length));
  return b;
}

async function CityTitle({ params }: { params: Params }) {
  const key = await resolveKey(params);
  return (
    <h1 className="text-2xl font-bold tracking-tight text-foreground">
      {titleCase(key.city)} · {WINDOW_LABEL[key.window]}
    </h1>
  );
}

async function PlaylistSection({ params }: { params: Params }) {
  const key = await resolveKey(params);
  // NOTE: reading params above already makes this boundary request-time dynamic,
  // so no connection() is needed. Crucially, connection() here was ALSO defeating
  // the nested `getBundle` "use cache" persistence on Vercel serverless (the
  // bundle rebuilt every request); removing it lets the Data Cache persist.
  try {
    const b = await getBundle(key.city, key.window);
    // The full internal widen ladder still yielded nothing playable → the bare
    // wall, with honest escape hatches (§2.6 "Empty"). `unfilteredHadShows` lets
    // the derivation offer an "Everything on the dial" reset when the emptiness
    // is a filtering choice, not a genuinely dead city+window.
    if (b.tracks.length === 0) {
      return (
        <EmptyState
          city={key.city}
          window={key.window}
          actions={recoveryActionsForEmpty({
            city: key.city,
            window: key.window,
            fontStop: key.fontStop,
            unfilteredHadShows: b.shows.length > 0,
          })}
        />
      );
    }
    // Ship the WHOLE bundle to the client and let `applyFontStop` produce what's
    // rendered. The SSR render shows `applyFontStop(b, key.fontStop)` for the
    // URL's stop (e.g. /london/next-14-days/small-print server-renders the
    // small-print view), and the Phase-3.5 dial can re-filter locally with ZERO
    // fetches because every track is already on the client.
    return (
      <PlaylistScreen
        bundle={b}
        fontStop={key.fontStop}
        city={key.city}
        window={key.window}
      />
    );
  } catch (err) {
    // JamBase is the live source: a quota/error → ErrorState while the edge
    // serves stale is acceptable graceful degradation.
    if (err instanceof JambaseError) {
      return <ErrorState />;
    }
    throw err;
  }
}

export default function Page({ params }: { params: Params }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground opacity-50">Earshot</p>
        <Suspense
          fallback={
            <h1 className="text-2xl font-bold tracking-tight text-foreground opacity-40">
              Reading the small print…
            </h1>
          }
        >
          <CityTitle params={params} />
        </Suspense>
      </header>
      <Suspense fallback={<LoadingTheater />}>
        <PlaylistSection params={params} />
      </Suspense>
    </main>
  );
}
