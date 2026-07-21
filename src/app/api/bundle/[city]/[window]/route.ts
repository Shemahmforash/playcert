import { NextResponse } from 'next/server';
import { cacheLife } from 'next/cache';
import type { TimeWindow } from '@/lib/types';
import { parseUrlState } from '@/lib/urlState';
import { geoForCity } from '@/lib/api/geo';
import { buildBundleCached } from '@/lib/pipeline/buildBundle';
import { buildDeps } from '@/lib/pipeline/deps';
import { bundleCacheProfile } from '@/lib/cache';
import { JambaseError } from '@/lib/api/jambase';

export const maxDuration = 60;

/**
 * The (slow-on-cold) bundle build, in the SAME 48h/`'use cache: remote'` layer the
 * page used to hold open inside its stream. Serving it from a STANDALONE request is
 * the whole point of this route: the page's SSR response can now close instantly
 * (masthead + LoadingTheater), so iOS Safari — which refuses to paint a streamed
 * response that's still hanging open — has a finished document to render. The ~45s
 * cold build happens here, behind the client-side LoadingTheater, not in the page
 * stream. Warm calls return from the cache in ~1s; the cost driver is unchanged
 * (the 48h getShows cache inside buildDeps → realDeps).
 */
async function getBundle(city: string, window: TimeWindow) {
  'use cache: remote';
  const b = await buildBundleCached(city, window, buildDeps(city));
  cacheLife(bundleCacheProfile(b.tracks.length));
  return b;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ city: string; window: string }> },
) {
  const { city, window } = await params;
  // Same validation the page does — a bad city/window is a 404, never a build.
  const parsed = parseUrlState(city, window, undefined);
  if (!parsed.ok || !geoForCity(parsed.key.city)) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  try {
    const bundle = await getBundle(parsed.key.city, parsed.key.window);
    return NextResponse.json(bundle);
  } catch (err) {
    // JamBase quota/error → 502; the client maps a non-ok response to <ErrorState />
    // while the edge can still serve a stale cache entry. Anything else is a real bug.
    if (err instanceof JambaseError) {
      return NextResponse.json({ error: 'source-error' }, { status: 502 });
    }
    throw err;
  }
}
