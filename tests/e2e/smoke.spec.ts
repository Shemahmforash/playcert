import { test, expect } from '@playwright/test';

/**
 * The project's SINGLE end-to-end smoke (Task 5.3). One journey, real selectors,
 * against `next start` built with MOCK_APIS=1 (deterministic, zero network):
 *
 *   open a city → ticket-stub rows render → Play → the single <audio> gets a
 *   mock previewUrl src → drag the dial to SMALL PRINT → the URL updates AND the
 *   arena headliner rows that were present at Marquee are gone.
 *
 * Selectors are the load-bearing product ones: the Play button's
 * `aria-label="Play preview of {artist}"` (TrackRow), the dial's `role="slider"`
 * with `aria-label="Reading level …"` (EarshotDial), and the lone reused
 * `<audio>` element (PlaylistScreen).
 */
test('open London → play a preview → dial to Small Print drops the headliners', async ({ page }) => {
  await page.goto('/london/next-14-days');

  // ── Rows render: at least one "Play preview of …" button is on the page. ──
  const playButtons = page.getByRole('button', { name: /^Play preview of / });
  await expect(playButtons.first()).toBeVisible();
  const marqueeCount = await playButtons.count();
  expect(marqueeCount).toBeGreaterThan(1);

  // The arena headliner (Matt Berninger, top of the bill) is present at Marquee.
  const headliner = page.getByRole('button', { name: 'Play preview of Matt Berninger' });
  expect(await headliner.count()).toBeGreaterThan(0);

  // ── Play the first row → the single <audio> gets a mock previewUrl src. ──
  await playButtons.first().click();
  const audio = page.locator('audio');
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute('src', /^https:\/\/mock\.local\/.+\.m4a$/);

  // ── Operate the dial to SMALL PRINT: focus the slider, press End. ──
  const dial = page.getByRole('slider', { name: /Reading level/i });
  await dial.focus();
  await dial.press('End');

  // ── URL updates to the small-print stop (pushState, no navigation). ──
  await expect(page).toHaveURL(/\/london\/next-14-days\/small-print$/);

  // ── The headliner rows are gone: fewer play buttons, Matt Berninger absent. ──
  await expect(headliner).toHaveCount(0);
  await expect
    .poll(async () => playButtons.count())
    .toBeLessThan(marqueeCount);
});
