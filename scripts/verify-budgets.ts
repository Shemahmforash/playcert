/**
 * verify-budgets.ts — the €5/month JamBase budget, verified by construction.
 * =========================================================================
 * Run: `pnpm verify:budgets` (or `pnpm exec tsx scripts/verify-budgets.ts`).
 *
 * THE HARD CAP (ship-blocker): the owner's budget is €5/month. In practice that
 * means staying inside JamBase's FREE tier of 1,000 API calls/month. This script
 * proves the worst-case monthly JamBase call count stays under a safety threshold
 * (≤ 900, leaving the ~100-call €5 overage band as pure, unused buffer), computed
 * from the REAL city table × windows × cache TTL — not hardcoded.
 *
 * COST DRIVER = TTL.SHOWS, NOT the bundle TTL (post-decoupling, 5.5). The single
 * JamBase call now lives inside the 48h `getShows` ('use cache: remote') layer in
 * realDeps.ts, keyed by CITY ONLY. The fetch is window-INDEPENDENT (it returns the
 * raw wide next-14-days Show[]) so all three windows SHARE one cached fetch and
 * each derive their slice locally — the shows dimension is CITIES, not city×window
 * (P0-b, 3a9e7cf9). The OUTER bundle can rebuild as often as it likes (to fill the
 * bill out via the FREE iTunes re-resolution) and every rebuild inside the 48h
 * window reuses the cached Show[] — ZERO new JamBase calls. So the number that
 * gates cost is TTL.SHOWS, and `TTL.BUNDLE` is now a fill-out-speed knob with no
 * budget impact.
 *
 * THE MODEL (computed honestly):
 *   calls/month ≈ cities × showsRefetchesPerMonth × callsPerFetch
 *     cities                 = |CITY_TABLE|                    (worst case: ALL active)
 *     showsRefetchesPerMonth = ceil(720h / TTL.SHOWS hours)    (720 = 30d × 24h;
 *                              getShows revalidates ~once per TTL.SHOWS per ACCESSED
 *                              city, stale-while-revalidate)
 *     callsPerFetch          = 1                               (INVARIANT, asserted below)
 *
 * CURRENT PROJECTION (12 cities, window-independent fetch, 48h TTL.SHOWS):
 *   showsRefetchesPerMonth = ceil(720/48) = 15  →  12 × 15 × 1 = 180 calls/month.
 *   180 ≤ 900 (safety threshold) ≤ 1,000 (free cap). ~820 calls of headroom.
 *
 * If this projection EVER exceeds 900 (e.g. someone adds many cities or shortens
 * TTL.SHOWS), this script exits non-zero. THE FIX is to raise TTL.SHOWS in
 * src/lib/cache.ts to the smallest clean value that brings the worst case back
 * ≤ 900, update the TTL tests, and re-run. (History: 5.4 set the shows/bundle TTL
 * to 48h; 5.5 keyed getShows by (city, window) = 540/month; P0-b re-keyed it to
 * CITY ONLY, since the fetch is window-independent = 180/month.)
 * Concert listings tolerate 1–2 days of staleness; the €5 hard cap wins over
 * freshness. NOTE: `TTL.BUNDLE` no longer appears here — shortening it is free.
 *
 * THE €5 BELT (operational — this script documents it, cannot assert it):
 *   1. The JamBase account MUST have NO payment method on file, so an overage is
 *      PHYSICALLY IMPOSSIBLE — the free tier simply stops serving at 1,000 calls
 *      rather than billing for the 1,001st. That is the real belt; the TTL math
 *      is the belt-and-suspenders that keeps us from ever reaching the cap.
 *   2. When JamBase does return an error (quota/other), fetchJambaseShows throws
 *      a typed JambaseError which the page catches to degrade gracefully to
 *      <ErrorState /> while the edge serves the last good STALE cache entry.
 */

import { CITY_TABLE, type Geo } from '../src/lib/api/geo';
import { WINDOWS } from '../src/lib/urlState';
import { TTL } from '../src/lib/cache';
import { fetchJambaseShows, filterShowsToWindow } from '../src/lib/api/jambase';

const FREE_TIER_CALLS_PER_MONTH = 1_000;
const SAFETY_THRESHOLD = 900; // ≤ this leaves the ~100-call €5 overage band as buffer
const HOURS_PER_MONTH = 720; // 30 days × 24h
const CALLS_PER_BUILD = 1; // the invariant (one wide fetch, local window filtering)

function fail(msg: string): never {
  console.error(`\n❌ BUDGET CHECK FAILED: ${msg}\n`);
  process.exit(1);
}

async function main() {
  const cities = Object.keys(CITY_TABLE).length;

  const ttlSeconds = TTL.SHOWS; // the getShows cache TTL — the ONLY JamBase-cost driver
  const ttlHours = ttlSeconds / 3600;
  const rebuildsPerMonth = Math.ceil(HOURS_PER_MONTH / ttlHours);
  const worstCaseCallsPerMonth = cities * rebuildsPerMonth * CALLS_PER_BUILD;

  // --- Report --------------------------------------------------------------
  console.log('════════════════════════════════════════════════════════════');
  console.log('  JamBase €5/month budget — worst-case projection');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Cities (CITY_TABLE) ............. ${cities}`);
  console.log(`  Shows-cache TTL (getShows) .... ${ttlSeconds}s (${ttlHours}h)`);
  console.log(`  Shows refetches/mo (720h/TTL) .. ${rebuildsPerMonth}`);
  console.log(`  Calls per fetch (invariant) .... ${CALLS_PER_BUILD}`);
  console.log('  ──────────────────────────────────────────────────────────');
  console.log(`  WORST-CASE CALLS/MONTH ......... ${worstCaseCallsPerMonth}  (cities × refetches/mo × 1)`);
  console.log(`  Safety threshold .............. ≤ ${SAFETY_THRESHOLD}`);
  console.log(`  JamBase free tier (hard cap) ... ${FREE_TIER_CALLS_PER_MONTH}`);
  console.log(
    `  Headroom to free cap .......... ${FREE_TIER_CALLS_PER_MONTH - worstCaseCallsPerMonth} calls`,
  );
  console.log('════════════════════════════════════════════════════════════');
  console.log('  €5 BELT: JamBase account must carry NO payment method →');
  console.log('  overage is physically impossible (free tier stops at 1,000).');
  console.log('  JambaseError → <ErrorState /> + stale cache degrades gracefully.');
  console.log('════════════════════════════════════════════════════════════\n');

  // --- Assertion 1: worst-case projection under the safety threshold -------
  if (worstCaseCallsPerMonth > SAFETY_THRESHOLD) {
    fail(
      `worst-case ${worstCaseCallsPerMonth} calls/month exceeds the ${SAFETY_THRESHOLD} safety threshold.\n` +
        `   FIX: raise TTL.SHOWS (the getShows cache) in src/lib/cache.ts to the smallest\n` +
        `   clean value that brings ${cities} × ceil(720/ttlHours) ≤ ${SAFETY_THRESHOLD}, then update the TTL tests.`,
    );
  }
  console.log(`✓ worst-case ${worstCaseCallsPerMonth} ≤ ${SAFETY_THRESHOLD} (under free-tier safety threshold)`);

  // --- Assertion 2: ONE JamBase network call per CITY show-fetch -----------
  // A show-fetch makes exactly ONE JamBase call: the window-INDEPENDENT wide
  // envelope (fetchJambaseShows). The PURE window filter (filterShowsToWindow)
  // that follows must make ZERO further network calls, for EVERY window.
  const geo: Geo = CITY_TABLE.london;
  let calls = 0;
  const spy = async () => {
    calls++;
    return { events: [] };
  };
  const wide = await fetchJambaseShows(geo, { rawFetch: spy });
  for (const w of WINDOWS) filterShowsToWindow(wide, w); // pure — 0 network calls
  if (calls !== 1) {
    fail(`one-call-per-city invariant violated: the show-fetch made ${calls} network calls, expected 1.`);
  }
  console.log(`✓ one-call-per-city invariant holds (wide fetch → 1 call; window filter → 0 calls)`);

  console.log('\n✅ JamBase €5/1,000-call budget holds by construction.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
