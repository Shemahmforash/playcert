import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Dev-only: allow opening the app from a phone on the LAN (e.g. for the
  // mobile-Safari playback check) without Next blocking dev resources as
  // cross-origin. Ignored in production. Update to your machine's LAN address
  // (`http://<ip>:3000`) as printed in `pnpm dev` output.
  allowedDevOrigins: ['192.168.68.52'],
};

export default nextConfig;
