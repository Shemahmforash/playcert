import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { connection } from 'next/server';
import { cacheLife } from 'next/cache';
import { resolvePageState } from '../../../../lib/pageState';
import type { RequestKey } from '../../../../lib/urlState';
import type { TimeWindow } from '../../../../lib/types';
import { geoForCity } from '../../../../lib/api/geo';
import { buildBundleCached } from '../../../../lib/pipeline/buildBundle';
import { realDeps } from '../../../../lib/pipeline/realDeps';
import { orderPlaylist } from '../../../../lib/pipeline/order';
import { bundleCacheProfile } from '../../../../lib/cache';
import { TicketmasterError } from '../../../../lib/api/ticketmaster';
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
  'use cache';
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
  // Defer this boundary to request time: the build emits the shell + fallback
  // instead of trying to prerender-fill the multi-second pipeline.
  await connection();
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
    return (
      <PlaylistScreen
        entries={orderPlaylist(b.shows, b.artists, b.tracks)}
        artists={b.artists}
        city={key.city}
        window={key.window}
        widened={b.widened}
        belowBar={b.belowBar}
      />
    );
  } catch (err) {
    if (err instanceof TicketmasterError) {
      return <ErrorState />;
    }
    throw err;
  }
}

export default function Page({ params }: { params: Params }) {
  return (
    <main className="mx-auto max-w-xl px-5 py-10 flex flex-col gap-6">
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
