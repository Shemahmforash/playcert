import { Suspense } from 'react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { resolvePageState } from '../../../../lib/pageState';
import { formatCanonicalPath, type RequestKey } from '../../../../lib/urlState';
import type { TimeWindow } from '../../../../lib/types';
import { pageTitle, pageDescription } from '../../../../lib/title';
import { geoForCity } from '../../../../lib/api/geo';
import { LoadingTheater } from '../../../../components/LoadingTheater';
import { PlaylistLoader } from '../../../../components/PlaylistLoader';

export const maxDuration = 60;

const WINDOW_LABEL: Record<TimeWindow, string> = {
  tonight: 'Tonight',
  'this-weekend': 'This weekend',
  'next-14-days': 'Next 14 days',
};

const titleCase = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

type Params = Promise<{ city: string; window: string; fontStop?: string[] }>;

/**
 * Per-request page metadata (title/description/canonical + OG/Twitter). Derived
 * from the URL ONLY — it must NEVER read the bundle / call JamBase, since social
 * crawlers hit these unpredictably across many URLs (the OG image is likewise
 * URL-derived, see opengraph-image.tsx). The OG image itself is auto-wired by
 * the `opengraph-image` file convention, so `openGraph.images` is left unset.
 *
 * Canonical is the SHORT form (R11): `formatCanonicalPath` omits `/everything`,
 * so `/london/next-14-days/everything` and `/london/next-14-days` both canonicalize
 * to `…/next-14-days`.
 */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { city, window, fontStop } = await params;
  const state = resolvePageState({ city, window, fontStop });
  if (state.kind !== 'render') {
    // Invalid params → the page 404s; give crawlers plain brand metadata.
    return { title: 'Earshot', description: 'The gig listings you read from the bottom up.' };
  }
  const key = state.key;
  // Request-time date for the range label — dynamic per request, no bundle read.
  const title = pageTitle(key.city, key.window, new Date());
  const description = pageDescription(key.city);
  const canonical = formatCanonicalPath(key);
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { title, description, url: canonical, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

// Resolves + validates the dynamic params inside a Suspense boundary. With
// dynamicParams=false this always succeeds, but the checks stay as defense.
async function resolveKey(params: Params): Promise<RequestKey> {
  const { city, window, fontStop } = await params;
  const state = resolvePageState({ city, window, fontStop });
  if (state.kind === 'not-found') notFound();
  if (!geoForCity(state.key.city)) notFound();
  return state.key;
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
  // The bundle is NOT built here. Building it in the SSR path holds the streamed
  // response open for the whole ~45s cold build, which iOS Safari refuses to paint
  // (black screen until the stream closes). Instead this boundary resolves instantly
  // (params only) and hands off to the CLIENT `PlaylistLoader`, which fetches the
  // bundle from /api/bundle behind its own LoadingTheater — so the page response
  // closes fast and every browser paints the shell + theater immediately.
  return <PlaylistLoader city={key.city} window={key.window} fontStop={key.fontStop} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground opacity-50">Earshot</p>
        <p className="text-[0.7rem] leading-snug tracking-[0.04em] text-ash">
          Gig lineups, as a playlist — read from the bottom up.
        </p>
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
