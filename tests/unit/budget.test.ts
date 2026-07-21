import { describe, it, expect, vi } from 'vitest';
import { fetchJambaseShows, filterShowsToWindow } from '../../src/lib/api/jambase';
import { buildBundle } from '../../src/lib/pipeline/buildBundle';
import { mockDeps } from '../../src/lib/pipeline/mockDeps';
import { CITY_TABLE, type Geo } from '../../src/lib/api/geo';
import { WINDOWS } from '../../src/lib/urlState';
import { TTL } from '../../src/lib/cache';

// ---------------------------------------------------------------------------
// The €5/month JamBase budget, enforced in CI (Task 5.4).
//
// Owner's hard cap is €5/month = staying inside JamBase's FREE tier of 1,000
// calls/month. These tests enforce the three invariants that keep the budget
// true by construction, so any regression (adding cities, shortening the TTL,
// or fanning out a second network call per build) fails CI immediately.
// The runnable sibling is scripts/verify-budgets.ts (`pnpm verify:budgets`).
// ---------------------------------------------------------------------------

const geo: Geo = {
  lat: 51.5074,
  lng: -0.1278,
  displayName: 'London',
  countryCode: 'GB',
  tz: 'Europe/London',
};

// Pin "today" so the wide fetch's date window is deterministic.
const now = () => new Date('2026-07-20T09:00:00Z');

const FREE_TIER_CALLS_PER_MONTH = 1_000;
const SAFETY_THRESHOLD = 900;
const HOURS_PER_MONTH = 720; // 30 days × 24h
const CALLS_PER_BUILD = 1;

describe('JamBase budget — one call per CITY (all windows share ONE wide fetch)', () => {
  // The wide fetch (fetchJambaseShows) is window-INDEPENDENT: ONE JamBase call
  // serves every window, and the PURE `filterShowsToWindow` derives each window's
  // slice with ZERO further network calls. Re-slicing all three windows off one
  // fetch is the whole point of the (city-only) cache key — it never re-fetches.
  it('ONE wide fetch, then all windows filter locally → EXACTLY ONE rawFetch call', async () => {
    const rawFetch = vi.fn(async () => ({ events: [] }));
    const wide = await fetchJambaseShows(geo, { rawFetch, now });
    for (const window of WINDOWS) filterShowsToWindow(wide, window, now()); // pure — 0 calls
    expect(rawFetch).toHaveBeenCalledTimes(1);
  });

  it('a sparse result (which triggers the widen meta) still makes only ONE call', async () => {
    // 2 events across 14 days → below the 8-viable bar → widen meta is emitted by
    // the PURE filter, no network involved: still exactly one wide fetch.
    const events = [
      { identifier: 'jambase:1', name: 'A', startDate: '2026-07-20T20:00:00', performer: [{ name: 'A' }] },
      { identifier: 'jambase:2', name: 'B', startDate: '2026-07-27T20:00:00', performer: [{ name: 'B' }] },
    ];
    const rawFetch = vi.fn(async () => ({ events }));
    const wide = await fetchJambaseShows(geo, { rawFetch, now });
    const { widened } = filterShowsToWindow(wide, 'tonight', now());
    expect(rawFetch).toHaveBeenCalledTimes(1);
    expect(widened).toBeDefined(); // widen path exercised, still 1 call
  });
});

describe('JamBase budget — worst-case monthly projection ≤ 900', () => {
  // Same formula as scripts/verify-budgets.ts, computed from the REAL city
  // table × TTL.SHOWS. Post-decoupling (5.5) the JamBase call lives in the 48h
  // `getShows` cache, so TTL.SHOWS — NOT TTL.BUNDLE — is the cost driver: bundle
  // rebuilds reuse the cached Show[] at zero JamBase cost. Post-P0-b the fetch is
  // window-INDEPENDENT and getShows is keyed by CITY ONLY, so the shows dimension
  // is CITIES, not city×window. Adding cities or shortening TTL.SHOWS fails CI
  // here until the math is brought back within budget.
  it('|CITY_TABLE| × ceil(720/ttlHours) stays under the free-tier safety threshold', () => {
    const cities = Object.keys(CITY_TABLE).length;

    const ttlHours = TTL.SHOWS / 3600;
    const rebuildsPerMonth = Math.ceil(HOURS_PER_MONTH / ttlHours);
    const worstCaseCallsPerMonth = cities * rebuildsPerMonth * CALLS_PER_BUILD;

    expect(worstCaseCallsPerMonth).toBeLessThanOrEqual(SAFETY_THRESHOLD);
    // And, transitively, comfortably under the actual €5 free-tier hard cap.
    expect(worstCaseCallsPerMonth).toBeLessThan(FREE_TIER_CALLS_PER_MONTH);
  });
});

describe('JamBase budget — reproducibility (R12): calls scale with cache keys, not visitors', () => {
  // Building the same (city, window) twice with the SAME deterministic deps
  // yields deep-equal bundles — proving a cache entry is track-for-track
  // identical. A stable cache entry means N visitors of one (city, window)
  // share ONE build, so JamBase calls scale with cache keys, never with traffic.
  it('same (city, window) built twice with identical deps → deep-equal bundle', async () => {
    const a = await buildBundle('london', 'next-14-days', mockDeps('london'));
    const b = await buildBundle('london', 'next-14-days', mockDeps('london'));
    expect(a).toEqual(b);
  });
});
