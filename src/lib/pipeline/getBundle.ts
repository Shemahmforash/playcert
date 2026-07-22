import { cacheLife } from 'next/cache';
import type { TimeWindow } from '@/lib/types';
import { buildBundleCached } from '@/lib/pipeline/buildBundle';
import { buildDeps } from '@/lib/pipeline/deps';
import { bundleCacheProfile } from '@/lib/cache';

/**
 * The (slow-on-cold) bundle build, held in its own `'use cache: remote'` layer on
 * the 3h/2h `bundleCacheProfile` TTL (NOT the 72h getShows layer — that one lives
 * deeper, inside buildDeps → realDeps, and is what actually governs JamBase cost).
 * Serving the build from a STANDALONE request is the whole point of the bundle
 * route: the page's SSR response can now close instantly (masthead +
 * LoadingTheater), so iOS Safari — which refuses to paint a streamed response
 * that's still hanging open — has a finished document to render. The ~45s cold
 * build happens here, behind the client-side LoadingTheater, not in the page
 * stream. Warm calls return from the cache in ~1s; the cost driver is unchanged
 * (the 72h getShows cache inside buildDeps → realDeps).
 *
 * Extracted into src/lib so it's testable in isolation and reusable from a second
 * entry point (the future warm hook / cron) — not just the route handler.
 */
export async function getBundle(city: string, window: TimeWindow) {
  'use cache: remote';
  const b = await buildBundleCached(city, window, buildDeps(city));
  cacheLife(bundleCacheProfile(b.tracks.length));
  return b;
}
