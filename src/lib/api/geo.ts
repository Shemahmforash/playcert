// src/lib/api/geo.ts
// Geo resolution: Vercel header prefill + a small hand-curated covered-city table.
// Real geocoding for arbitrary typed cities (needs GOOGLE_GEOCODING_KEY) is deferred
// to a later task; the launch is London-first, so a hardcoded table is deterministic
// and network/key-free.
import { slugify } from '../pipeline/extractArtists';

export interface Geo {
  lat: number;
  lng: number;
  displayName: string;
  countryCode: string;
  tz: string;
}

export interface CityHint {
  displayName: string;
  slug: string;
  countryCode: string;
}

/** Vercel injects x-vercel-ip-city / x-vercel-ip-country (percent-encoded). Null when absent/garbage. */
export function cityFromHeaders(headers: Headers): CityHint | null {
  const rawCity = headers.get('x-vercel-ip-city');
  const country = headers.get('x-vercel-ip-country');
  if (!rawCity || !country) return null;
  let displayName: string;
  try {
    displayName = decodeURIComponent(rawCity).trim();
  } catch {
    return null;
  }
  if (!displayName) return null;
  const slug = slugify(displayName);
  if (!slug) return null;
  return { displayName, slug, countryCode: country.toUpperCase() };
}

/**
 * Covered launch markets, hand-curated. Source is now JamBase, which — unlike
 * the retired Ticketmaster path — covers Portugal, so Lisbon/Porto are in. This
 * table snaps IP coords to a covered city with no per-request call; real
 * geocoding of arbitrary typed cities uses GOOGLE_GEOCODING_KEY elsewhere.
 */
export const CITY_TABLE: Record<string, Geo> = {
  london: { lat: 51.5074, lng: -0.1278, displayName: 'London', countryCode: 'GB', tz: 'Europe/London' },
  // Portugal — now reachable because JamBase (unlike Ticketmaster) covers PT.
  lisbon: { lat: 38.7223, lng: -9.1393, displayName: 'Lisbon', countryCode: 'PT', tz: 'Europe/Lisbon' },
  porto: { lat: 41.1579, lng: -8.6291, displayName: 'Porto', countryCode: 'PT', tz: 'Europe/Lisbon' },
  manchester: { lat: 53.4808, lng: -2.2426, displayName: 'Manchester', countryCode: 'GB', tz: 'Europe/London' },
  dublin: { lat: 53.3498, lng: -6.2603, displayName: 'Dublin', countryCode: 'IE', tz: 'Europe/Dublin' },
  madrid: { lat: 40.4168, lng: -3.7038, displayName: 'Madrid', countryCode: 'ES', tz: 'Europe/Madrid' },
  barcelona: { lat: 41.3874, lng: 2.1686, displayName: 'Barcelona', countryCode: 'ES', tz: 'Europe/Madrid' },
  paris: { lat: 48.8566, lng: 2.3522, displayName: 'Paris', countryCode: 'FR', tz: 'Europe/Paris' },
  berlin: { lat: 52.52, lng: 13.405, displayName: 'Berlin', countryCode: 'DE', tz: 'Europe/Berlin' },
  amsterdam: { lat: 52.3676, lng: 4.9041, displayName: 'Amsterdam', countryCode: 'NL', tz: 'Europe/Amsterdam' },
  'new-york': { lat: 40.7128, lng: -74.006, displayName: 'New York', countryCode: 'US', tz: 'America/New_York' },
  'los-angeles': { lat: 34.0522, lng: -118.2437, displayName: 'Los Angeles', countryCode: 'US', tz: 'America/Los_Angeles' },
};

export function geoForCity(slug: string): Geo | null {
  return CITY_TABLE[slug] ?? null;
}

/**
 * Read Vercel's approximate IP coordinates (`x-vercel-ip-latitude` /
 * `x-vercel-ip-longitude`). Pure and keyless: parseFloat both, return null
 * unless BOTH are finite numbers. These headers exist ONLY at the edge — they
 * must be read in middleware (before the cache), never in a page render.
 */
export function latLngFromHeaders(headers: Headers): { lat: number; lng: number } | null {
  const lat = parseFloat(headers.get('x-vercel-ip-latitude') ?? '');
  const lng = parseFloat(headers.get('x-vercel-ip-longitude') ?? '');
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

const EARTH_RADIUS_KM = 6371;

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(s));
}

/**
 * Snap arbitrary coordinates to the nearest COVERED city (great-circle km,
 * R=6371). Returns the closest entry ONLY if within `maxKm` (default 150) —
 * else null ("not in your area yet"). Pure, no network. Snapping to the finite
 * CITY_TABLE (rather than geocoding a name) keeps the URL cache-key space finite.
 */
export function nearestCity(
  lat: number,
  lng: number,
  maxKm = 150,
): { slug: string; geo: Geo; distanceKm: number } | null {
  let best: { slug: string; geo: Geo; distanceKm: number } | null = null;
  for (const [slug, geo] of Object.entries(CITY_TABLE)) {
    const distanceKm = haversineKm(lat, lng, geo.lat, geo.lng);
    if (best === null || distanceKm < best.distanceKm) {
      best = { slug, geo, distanceKm };
    }
  }
  if (best === null || best.distanceKm > maxKm) return null;
  return best;
}

/**
 * The testable middleware decision for the root path. If `wantsPicker` (the
 * `?pick=1` escape hatch), return null — never auto-redirect. Otherwise read the
 * IP coords and, if present, snap to the nearest covered city's slug (or null
 * when no city is within range / no coords). Pure — build a Headers to test it.
 */
export function rootRedirectSlug(headers: Headers, wantsPicker: boolean): string | null {
  if (wantsPicker) return null;
  const coords = latLngFromHeaders(headers);
  if (!coords) return null;
  return nearestCity(coords.lat, coords.lng)?.slug ?? null;
}
