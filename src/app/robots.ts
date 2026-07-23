import type { MetadataRoute } from 'next';

// Same absolute base as layout.tsx's metadataBase — kept in sync so the sitemap
// linkback resolves to a fully-qualified URL regardless of deploy host.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earshotlive.com';

/**
 * Allow-all robots policy that points crawlers at the sitemap. Nothing here is
 * private (there is no auth surface), and the whole indexable value now lives in
 * the URL-derived shell + sitemap (see sitemap.ts / the PlaylistSection seam note
 * in the [city]/[window] page) — so we invite every bot across the whole tree.
 * Pure and keyless, like the sitemap: no bundle read, no JamBase call.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: new URL('/sitemap.xml', SITE_URL).toString(),
  };
}
