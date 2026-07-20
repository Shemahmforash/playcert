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
 *  bundle 48h (or 6h degraded) · per-artist itunes/mb/lb/yt 30d · geo 30d · geo-negative 24h
 *
 *  COST CONTROL: these long bundle TTLs are the single biggest cost lever for the
 *  JamBase free tier (1k calls/month, owner budget EUR5/mo). With exactly one
 *  JamBase call per bundle build, a 48h FULL / 6h DEGRADED TTL caps calls to
 *  ~1 build per 2 days per (city, window). At the worst case (all 12 cities x 3
 *  windows = 36 combos active), 36 x ceil(720/48) = 540 calls/month — comfortably
 *  under the 1,000 free cap with ~460 headroom. The full TTL was bumped 24h→48h
 *  in 5.4: at 24h the worst case was 36 x 30 = 1,080/month, OVER the free cap.
 *  Concert listings tolerate 1–2 days of staleness; the EUR5 hard cap wins over
 *  freshness. `scripts/verify-budgets.ts` asserts this by construction.
 *  The old 120s degraded value would have blown the budget: one page revalidating
 *  every 120s is ~21k calls/month by itself. */
export const TTL = { BUNDLE: 172_800, BUNDLE_DEGRADED: 21_600, ARTIST_30D: 2_592_000, GEO_NEG: 86_400 } as const;

export function bundleCacheProfile(playableTracks: number): { revalidate: number } {
  return { revalidate: playableTracks < 8 ? TTL.BUNDLE_DEGRADED : TTL.BUNDLE };
}
