import type { NextConfig } from 'next';

// --- HTTP security headers --------------------------------------------------
// Applied to every response. Rationale (audited 2026-07):
//   * A nonce-based CSP would force every page dynamic and DISABLE PPR / edge
//     caching (see Next's CSP guide) — that would break both performance and
//     the strict JamBase cost cap, which leans on the cache. So we use the
//     static "without nonces" CSP: `'unsafe-inline'` on script/style is the
//     PPR-compatible tradeoff. Our real XSS defense is React auto-escaping plus
//     the http(s)-only URL guard at the upstream boundary (src/lib/safeUrl.ts);
//     CSP here is defense-in-depth (frame-ancestors, object-src, base-uri, …).
//   * media-src MUST allow Apple's preview CDN — the 30s previews are the whole
//     product. Artwork is a faux halftone block (no remote <img>), and fonts are
//     self-hosted via next/font, so img-src/font-src stay tight ('self').
//   * 'unsafe-eval' is dev-only (React uses eval for dev stack reconstruction).
const isDev = process.env.NODE_ENV === 'development';

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' data: blob:`,
  `font-src 'self'`,
  // Apple 30s preview streams (audio-ssl.itunes.apple.com / *.mzstatic.com).
  `media-src 'self' https://*.itunes.apple.com https://*.mzstatic.com`,
  `connect-src 'self'`,
  `object-src 'none'`,
  `base-uri 'none'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join('; ');

const securityHeaders = [
  // Report-Only for the initial rollout: the browser reports would-be
  // violations but blocks nothing, so a mistaken directive can't break audio
  // playback or hydration on the live site. Once a deploy is confirmed clean,
  // flip this key to 'Content-Security-Policy' to enforce.
  { key: 'Content-Security-Policy-Report-Only', value: csp },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(self), payment=(), browsing-topics=()',
  },
  // *.vercel.app is HSTS-preloaded already; this future-proofs a custom domain.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
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
