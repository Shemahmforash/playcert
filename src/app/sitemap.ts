import type { MetadataRoute } from 'next';
import { CITY_TABLE } from '../lib/api/geo';
import { WINDOWS, formatCanonicalPath } from '../lib/urlState';

// Same absolute base as layout.tsx's metadataBase — sitemap `url`s must be
// fully-qualified, so mirror the one env var the rest of the app resolves against.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://earshotlive.com';

/**
 * The indexable surface, enumerated as CITY_TABLE × WINDOWS in SHORT canonical
 * form. The client-load split (see the PlaylistSection seam note) moved every
 * lineup row out of the server HTML, so the sitemap — not crawlable body copy —
 * is now how search engines discover the covered city/window pages.
 *
 * PURE + URL-derived, exactly like generateMetadata / opengraph-image: it reads
 * only the finite CITY_TABLE and WINDOWS, never the bundle / JamBase (crawlers
 * hit this unpredictably and it must never trigger a paid data fetch). fontStop
 * is fixed to `everything` so `formatCanonicalPath` emits the short form
 * (`/london/tonight`, not `…/everything`) — the same canonical the per-page
 * metadata advertises, so the two never disagree.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];
  for (const city of Object.keys(CITY_TABLE)) {
    // London is the launch market (its shells are also prerendered — see the page's
    // generateStaticParams), so it gets the highest priority.
    const isLaunchMarket = city === 'london';
    for (const window of WINDOWS) {
      const path = formatCanonicalPath({ city, window, fontStop: 'everything' });
      entries.push({
        url: new URL(path, SITE_URL).toString(),
        changeFrequency: 'daily',
        priority: isLaunchMarket ? 0.9 : 0.6,
      });
    }
  }
  return entries;
}
