export function memoInFlight<T>() {
  const inFlight = new Map<string, Promise<T>>();
  return (key: string, fn: () => Promise<T>): Promise<T> => {
    const existing = inFlight.get(key);
    if (existing) return existing;
    const p = fn().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  };
}

export const cacheKeys = {
  bundle: (city: string, window: string) => `bundle:${city}:${window}`,
  itunes: (normalizedName: string) => `itunes:${normalizedName}`,
  mb: (normalizedName: string) => `mb:${normalizedName}`,
  lb: (idOrName: string) => `lb:${idOrName}`,
  yt: (normalizedName: string) => `yt:${normalizedName}`,
  geo: (citySlug: string) => `geo:${citySlug}`,
} as const;

/** TTL table (enforced via "use cache" + cacheLife at call sites):
 *  shows 48h · bundle 3h (or 2h degraded) · per-artist itunes/mb/lb/yt 30d · geo 30d · geo-negative 24h
 *
 *  COST CONTROL lives in SHOWS (48h), NOT the bundle TTL. Post-decoupling (5.5/5.6)
 *  the one JamBase call sits inside the 48h `getShows` cache (realDeps.ts), keyed by
 *  CITY ONLY — the fetch is window-independent (one wide 14-day envelope, sliced per
 *  window locally, P0-b), so a CITY makes ~1 JamBase call per 48h no matter how often
 *  the bundle rebuilds or which windows are viewed. Worst case (all 12 cities active):
 *  12 x ceil(720/48) = 180 calls/month — under the 1,000 free cap (~820 headroom).
 *  `scripts/verify-budgets.ts` asserts this against SHOWS. Concert listings
 *  tolerate 1–2 days of staleness; the EUR5 hard cap wins over freshness.
 *
 *  BUNDLE / BUNDLE_DEGRADED are now short (3h / 2h) FILL-OUT knobs with ZERO budget
 *  impact: each bundle rebuild reuses the 48h-cached Show[] (no new JamBase call)
 *  and re-runs the FREE, keyless iTunes resolution, so a fresh (or below-bar)
 *  playlist climbs toward the full bill within hours instead of up to 2 days.
 *  Degraded (partial, <8 tracks) is the shorter of the two so sparse bills fill
 *  fastest. Trade-off: more frequent background revalidation = more Vercel compute,
 *  which is NOT a JamBase cost. */
export const TTL = { BUNDLE: 10_800, BUNDLE_DEGRADED: 7_200, SHOWS: 172_800, ARTIST_30D: 2_592_000, GEO_NEG: 86_400 } as const;

/** Stale + expire bookends for the OUTER bundle cacheLife profile. `revalidate`
 *  (3h/2h) is the fill-out cadence; these two frame the SWR window around it.
 *
 *  BUNDLE_STALE (~60s): how long the client router may reuse a cached bundle
 *  without even asking the server — keeps in-session navigation instant while a
 *  background revalidate refreshes the bill.
 *
 *  BUNDLE_EXPIRE (48h): the HARD ceiling past which a cached bundle may no longer
 *  be served stale and a miss must BLOCK on a fresh build. Deliberately a generous
 *  multiple of revalidate (48h ≈ 16× the 3h full TTL) so stale-while-revalidate
 *  reliably HIDES cold builds — including the empty in-memory cache right after a
 *  deploy — instead of forcing users onto a blocking cold rebuild. It has ZERO
 *  JamBase-cost impact (the one paid call lives in the 48h getShows layer). */
const BUNDLE_STALE = 60;
const BUNDLE_EXPIRE = 172_800; // 48h

/**
 * Full/degraded revalidate for the OUTER bundle cache. Post-decoupling (5.5) the
 * JamBase call lives in the 48h `getShows` layer (see realDeps.ts), so this TTL
 * no longer governs COST — it governs how often the bundle re-runs the FREE
 * iTunes resolution to fill the bill out. Shortened to 3h full / 2h degraded (5.6)
 * so a fresh or below-bar playlist fills toward the full bill within hours at zero
 * JamBase cost.
 *
 * Returns the FULL cacheLife shape { stale, revalidate, expire } — leaving stale
 * and expire implicit let them fall to framework defaults, which the cold-miss /
 * warming plan can't rely on; they are now pinned explicitly (see the bookend
 * consts above) and passed straight to `cacheLife` (see getBundle.ts).
 *
 * `SPIKE_BUNDLE_REVALIDATE` (seconds) is an env override used ONLY to observe
 * rebuilds empirically; unset in prod/tests, so the committed 3h/2h values (and
 * the budget assertions, which key off TTL.SHOWS) are unaffected.
 */
export function bundleCacheProfile(
  playableTracks: number,
): { stale: number; revalidate: number; expire: number } {
  const spike = Number(process.env.SPIKE_BUNDLE_REVALIDATE);
  const revalidate =
    Number.isFinite(spike) && spike > 0
      ? spike
      : playableTracks < 8
        ? TTL.BUNDLE_DEGRADED
        : TTL.BUNDLE;
  return { stale: BUNDLE_STALE, revalidate, expire: BUNDLE_EXPIRE };
}
