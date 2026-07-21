import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Build output dir. Defaults to `.next`, but the e2e suite (playwright.config.ts)
  // sets NEXT_DIST_DIR=.next-e2e so its `next build` NEVER clobbers a running
  // `pnpm dev`'s `.next` — sharing one dir between `build` and `dev` makes dev
  // serve stale production artifacts (404s on valid routes). Unset on Vercel, so
  // production is unaffected.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Dev-only: allow opening the app from a phone on the LAN (e.g. for the
  // mobile-Safari playback check) without Next blocking dev resources as
  // cross-origin. Ignored in production. Update to your machine's LAN address
  // (`http://<ip>:3000`) as printed in `pnpm dev` output.
  allowedDevOrigins: ['192.168.68.52'],
};

export default nextConfig;
