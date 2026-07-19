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
 *  bundle 3600s (or 120s degraded, R3) · per-artist itunes/mb/lb/yt 30d · geo 30d · geo-negative 24h */
export const TTL = { BUNDLE: 3600, BUNDLE_DEGRADED: 120, ARTIST_30D: 2_592_000, GEO_NEG: 86_400 } as const;

export function bundleCacheProfile(playableTracks: number): { revalidate: number } {
  return { revalidate: playableTracks < 8 ? TTL.BUNDLE_DEGRADED : TTL.BUNDLE };
}
