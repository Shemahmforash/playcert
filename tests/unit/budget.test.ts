import { describe, it, expect, vi } from 'vitest';
import { fetchJambaseShows } from '../../src/lib/api/jambase';
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

describe('JamBase budget — one call per build (all windows cost 1 call)', () => {
  // Every window (tonight / this-weekend / next-14-days) is served by ONE wide
  // JamBase fetch + LOCAL filtering — the narrower windows never trigger a
  // second network call, and the widen ladder is pure local logic.
  it.each(WINDOWS)('window %s → EXACTLY ONE rawFetch call', async (window) => {
    const rawFetch = vi.fn(async () => ({ events: [] }));
    await fetchJambaseShows(geo, window, { rawFetch, now });
    expect(rawFetch).toHaveBeenCalledTimes(1);
  });

  it('a sparse result (which triggers the widen meta) still makes only ONE call', async () => {
    // 2 events across 14 days → below the 8-viable bar → widen meta is emitted,
    // but that is pure local logic: still exactly one network call.
    const events = [
      { identifier: 'jambase:1', name: 'A', startDate: '2026-07-20T20:00:00', performer: [{ name: 'A' }] },
      { identifier: 'jambase:2', name: 'B', startDate: '2026-07-27T20:00:00', performer: [{ name: 'B' }] },
    ];
    const rawFetch = vi.fn(async () => ({ events }));
    const { widened } = await fetchJambaseShows(geo, 'tonight', { rawFetch, now });
    expect(rawFetch).toHaveBeenCalledTimes(1);
    expect(widened).toBeDefined(); // widen path exercised, still 1 call
  });
});

describe('JamBase budget — worst-case monthly projection ≤ 900', () => {
  // Same formula as scripts/verify-budgets.ts, computed from the REAL city
  // table × windows × TTL.SHOWS. Post-decoupling (5.5) the JamBase call lives in
  // the 48h `getShows` cache, so TTL.SHOWS — NOT TTL.BUNDLE — is the cost driver:
  // bundle rebuilds reuse the cached Show[] at zero JamBase cost. Adding cities or
  // shortening TTL.SHOWS fails CI here until the math is brought back within budget.
  it('|CITY_TABLE| × |WINDOWS| × ceil(720/ttlHours) stays under the free-tier safety threshold', () => {
    const cities = Object.keys(CITY_TABLE).length;
    const windows = WINDOWS.length;
    const combos = cities * windows;

    const ttlHours = TTL.SHOWS / 3600;
    const rebuildsPerMonth = Math.ceil(HOURS_PER_MONTH / ttlHours);
    const worstCaseCallsPerMonth = combos * rebuildsPerMonth * CALLS_PER_BUILD;

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
