import { NextResponse, type NextRequest } from 'next/server';
import { parseUrlState } from './lib/urlState';
import { geoForCity, rootRedirectSlug } from './lib/api/geo';

/**
 * Validates the /[city]/[window]/[[...fontStop]] surface BEFORE rendering. Under
 * cacheComponents the page streams (static shell flushed first), so a page-body
 * notFound() can no longer set the HTTP status — it would commit 200 then stream
 * the 404 UI. Middleware runs ahead of the render and can rewrite to the branded
 * not-found route with a real 404 status. Valid params fall through untouched.
 */
export function middleware(req: NextRequest) {
  // Root: automatic location detection. Vercel's geo headers are read HERE, at
  // the edge before the cache — never in the page render — so /{city}/{window}
  // stays a pure, cacheable function of its URL. Snap the IP to the nearest
  // covered city and 307 there; `?pick=1` opts out so the landing picker is
  // still reachable (and no redirect when headers are absent / no nearby city).
  if (req.nextUrl.pathname === '/') {
    if (!req.nextUrl.searchParams.has('pick')) {
      const slug = rootRedirectSlug(req.headers, false);
      if (slug) {
        return NextResponse.redirect(new URL(`/${slug}/next-14-days`, req.url), 307);
      }
    }
    return NextResponse.next();
  }

  const segs = req.nextUrl.pathname.split('/').filter(Boolean);
  if (segs.length < 2) return NextResponse.next(); // assets/non-city paths

  const [city, window, ...rest] = segs;
  const parsed = parseUrlState(city, window, rest.length ? rest : undefined);
  if (parsed.ok && geoForCity(parsed.key.city)) return NextResponse.next();

  // Rewrite to a path that matches no route → Next renders app/not-found.tsx.
  // The explicit 404 status makes the response a real Not Found.
  return NextResponse.rewrite(new URL('/_sf_not_found', req.url), { status: 404 });
}

export const config = {
  // Exclude /api/* (route handlers validate their own input), Next internals,
  // and the favicon. Note "api/" (with slash) so a city slug like "apixyz" still
  // gets validated.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico).*)'],
};
