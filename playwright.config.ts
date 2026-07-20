import { defineConfig, devices } from '@playwright/test';

/**
 * The project's SINGLE e2e config (Task 5.3). Playwright drives the ONE smoke
 * spec (tests/e2e/smoke.spec.ts) against the PRODUCTION server built + started
 * with `MOCK_APIS=1`, so the whole journey runs with ZERO network — no JamBase,
 * iTunes or MusicBrainz calls (see src/lib/pipeline/mockDeps.ts).
 *
 * A distinct port (3210) keeps it clear of a `pnpm dev` on 3000. `testDir` is
 * tests/e2e; the Vitest unit suite (tests/**\/*.test.ts) is never picked up here,
 * and Vitest excludes tests/e2e in turn, so the two runners never overlap.
 */
const PORT = 3210;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Build + start the real production server with the mock APIs wired in.
    command: `MOCK_APIS=1 pnpm build && MOCK_APIS=1 pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
