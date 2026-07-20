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
 * THE MODEL (computed honestly):
 *   calls/month ≈ combos × rebuildsPerMonth × callsPerBuild
 *     combos           = |CITY_TABLE| × |WINDOWS|              (worst case: ALL active)
 *     rebuildsPerMonth = ceil(720h / ttlHours)                (720 = 30d × 24h;
 *                        `use cache` revalidates ~once per TTL per ACCESSED combo,
 *                        stale-while-revalidate)
 *     callsPerBuild    = 1                                     (INVARIANT, asserted below)
 *
 * CURRENT PROJECTION (12 cities × 3 windows = 36 combos, 48h full-bundle TTL):
 *   rebuildsPerMonth = ceil(720/48) = 15  →  36 × 15 × 1 = 540 calls/month.
 *   540 ≤ 900 (safety threshold) ≤ 1,000 (free cap). ~460 calls of headroom.
 *
 * If this projection EVER exceeds 900 (e.g. someone adds cities or shortens the
 * TTL), this script exits non-zero. THE FIX is to raise the full-bundle TTL:
 * bump `bundleCacheProfile`'s full `revalidate` (TTL.BUNDLE) in src/lib/cache.ts
 * to the smallest clean value that brings the worst case back ≤ 900, update the
 * TTL tests, and re-run. (History: 5.4 bumped it 24h→48h — at 24h the worst case
 * was 36 × 30 = 1,080/month, OVER the free cap.) Concert listings tolerate 1–2
 * days of staleness; the €5 hard cap wins over freshness.
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
import { fetchJambaseShows } from '../src/lib/api/jambase';

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
  const windows = WINDOWS.length;
  const combos = cities * windows;

  const ttlSeconds = TTL.BUNDLE; // full-bundle revalidate — the real value from cache.ts
  const ttlHours = ttlSeconds / 3600;
  const rebuildsPerMonth = Math.ceil(HOURS_PER_MONTH / ttlHours);
  const worstCaseCallsPerMonth = combos * rebuildsPerMonth * CALLS_PER_BUILD;

  // --- Report --------------------------------------------------------------
  console.log('════════════════════════════════════════════════════════════');
  console.log('  JamBase €5/month budget — worst-case projection');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Cities (CITY_TABLE) ............. ${cities}`);
  console.log(`  Windows (WINDOWS) .............. ${windows}`);
  console.log(`  Full-bundle TTL ............... ${ttlSeconds}s (${ttlHours}h)`);
  console.log(`  Combos (cities × windows) ...... ${combos}`);
  console.log(`  Rebuilds/mo (ceil 720h / TTL) .. ${rebuildsPerMonth}`);
  console.log(`  Calls per build (invariant) .... ${CALLS_PER_BUILD}`);
  console.log('  ──────────────────────────────────────────────────────────');
  console.log(`  WORST-CASE CALLS/MONTH ......... ${worstCaseCallsPerMonth}`);
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
        `   FIX: raise the full-bundle TTL (TTL.BUNDLE in src/lib/cache.ts) to the smallest\n` +
        `   clean value that brings ${combos} × ceil(720/ttlHours) ≤ ${SAFETY_THRESHOLD}, then update the TTL tests.`,
    );
  }
  console.log(`✓ worst-case ${worstCaseCallsPerMonth} ≤ ${SAFETY_THRESHOLD} (under free-tier safety threshold)`);

  // --- Assertion 2: ONE JamBase network call per build ---------------------
  // A build makes exactly ONE JamBase fetch: one wide envelope, then LOCAL window
  // filtering. The widen ladder must NOT fan out extra network calls.
  const geo: Geo = CITY_TABLE.london;
  let calls = 0;
  const spy = async () => {
    calls++;
    return { events: [] };
  };
  await fetchJambaseShows(geo, WINDOWS[0], { rawFetch: spy });
  if (calls !== 1) {
    fail(`one-call-per-build invariant violated: fetchJambaseShows made ${calls} network calls, expected 1.`);
  }
  console.log(`✓ one-call-per-build invariant holds (fetchJambaseShows → exactly 1 network call)`);

  console.log('\n✅ JamBase €5/1,000-call budget holds by construction.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
