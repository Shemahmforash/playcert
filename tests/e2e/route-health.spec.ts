import { test, expect } from '@playwright/test';
import { CITY_TABLE } from '../../src/lib/api/geo';
import type { TimeWindow } from '../../src/lib/types';

/**
 * Route-health smoke — the guard that catches "you broke a city".
 *
 * The single-journey smoke (smoke.spec.ts) only exercises London. That let a
 * regression that 404s a *specific* city (or every city) slip through unit tests
 * — every one of the 399 unit tests can pass while the actual rendered route
 * returns a 404. This spec closes that gap: it drives the REAL production server
 * (built with MOCK_APIS=1, zero network) and asserts, for EVERY city in the live
 * CITY_TABLE, that the canonical route returns HTTP 200 and renders a playable
 * playlist — plus that the three windows render and that a bogus city 404s.
 *
 * It imports CITY_TABLE directly (a pure, next-free module) so a newly added city
 * is covered automatically, with no test edit.
 *
 * Under MOCK_APIS=1 mockDeps returns the same three fixed shows for any city, so
 * every valid route renders identical rows — a status + content check is enough
 * to prove the route is alive end-to-end.
 */

const CITIES = Object.keys(CITY_TABLE);
const WINDOWS: TimeWindow[] = ['tonight', 'this-weekend', 'next-14-days'];

// A visible "Play preview of …" button proves the route rendered the playlist
// (not the 404 page, not the empty state, not a crash).
const expectPlaylistRendered = async (page: import('@playwright/test').Page) => {
  await expect(page.getByRole('button', { name: /^Play preview of / }).first()).toBeVisible();
};

test.describe('route health — every city renders', () => {
  for (const city of CITIES) {
    test(`${city}/next-14-days → 200 + playlist`, async ({ page }) => {
      const resp = await page.goto(`/${city}/next-14-days`);
      expect(resp?.status(), `${city} should render, not 404/500`).toBe(200);
      await expectPlaylistRendered(page);
    });
  }
});

test.describe('route health — every window renders (london)', () => {
  for (const window of WINDOWS) {
    test(`london/${window} → 200 + playlist`, async ({ page }) => {
      const resp = await page.goto(`/london/${window}`);
      expect(resp?.status()).toBe(200);
      await expectPlaylistRendered(page);
    });
  }
});

test('a city NOT in the table 404s (guard still fires)', async ({ page }) => {
  const resp = await page.goto('/atlantis/next-14-days');
  expect(resp?.status()).toBe(404);
});
