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
 * Covered markets — hand-curated live-music cities. JamBase is GLOBAL, so this set is
 * a DELIBERATE, BOUNDED list, not a source limit: a finite table = finite cache keys =
 * the provable €5 JamBase budget (worst-case calls scale with this count — see
 * scripts/verify-budgets.ts, whose guard fails if the count crowds the free tier).
 * ~56 of the largest global markets, weighted to the Western world + Japan / South
 * Korea / China / Australia. The table snaps IP coords to a covered city with no
 * per-request call; real geocoding of arbitrary typed cities uses GOOGLE_GEOCODING_KEY
 * (deferred). Grouped by region for readability; order is not significant.
 */
export const CITY_TABLE: Record<string, Geo> = {
  // ── UK & Ireland ──
  london: { lat: 51.5074, lng: -0.1278, displayName: 'London', countryCode: 'GB', tz: 'Europe/London' },
  manchester: { lat: 53.4808, lng: -2.2426, displayName: 'Manchester', countryCode: 'GB', tz: 'Europe/London' },
  glasgow: { lat: 55.8642, lng: -4.2518, displayName: 'Glasgow', countryCode: 'GB', tz: 'Europe/London' },
  dublin: { lat: 53.3498, lng: -6.2603, displayName: 'Dublin', countryCode: 'IE', tz: 'Europe/Dublin' },
  // ── Iberia (JamBase covers Portugal, unlike the retired Ticketmaster path) ──
  lisbon: { lat: 38.7223, lng: -9.1393, displayName: 'Lisbon', countryCode: 'PT', tz: 'Europe/Lisbon' },
  porto: { lat: 41.1579, lng: -8.6291, displayName: 'Porto', countryCode: 'PT', tz: 'Europe/Lisbon' },
  madrid: { lat: 40.4168, lng: -3.7038, displayName: 'Madrid', countryCode: 'ES', tz: 'Europe/Madrid' },
  barcelona: { lat: 41.3874, lng: 2.1686, displayName: 'Barcelona', countryCode: 'ES', tz: 'Europe/Madrid' },
  // ── Western & Central Europe ──
  paris: { lat: 48.8566, lng: 2.3522, displayName: 'Paris', countryCode: 'FR', tz: 'Europe/Paris' },
  amsterdam: { lat: 52.3676, lng: 4.9041, displayName: 'Amsterdam', countryCode: 'NL', tz: 'Europe/Amsterdam' },
  brussels: { lat: 50.8503, lng: 4.3517, displayName: 'Brussels', countryCode: 'BE', tz: 'Europe/Brussels' },
  berlin: { lat: 52.52, lng: 13.405, displayName: 'Berlin', countryCode: 'DE', tz: 'Europe/Berlin' },
  hamburg: { lat: 53.5511, lng: 9.9937, displayName: 'Hamburg', countryCode: 'DE', tz: 'Europe/Berlin' },
  munich: { lat: 48.1351, lng: 11.582, displayName: 'Munich', countryCode: 'DE', tz: 'Europe/Berlin' },
  vienna: { lat: 48.2082, lng: 16.3738, displayName: 'Vienna', countryCode: 'AT', tz: 'Europe/Vienna' },
  zurich: { lat: 47.3769, lng: 8.5417, displayName: 'Zürich', countryCode: 'CH', tz: 'Europe/Zurich' },
  milan: { lat: 45.4642, lng: 9.19, displayName: 'Milan', countryCode: 'IT', tz: 'Europe/Rome' },
  rome: { lat: 41.9028, lng: 12.4964, displayName: 'Rome', countryCode: 'IT', tz: 'Europe/Rome' },
  // ── Nordics ──
  copenhagen: { lat: 55.6761, lng: 12.5683, displayName: 'Copenhagen', countryCode: 'DK', tz: 'Europe/Copenhagen' },
  stockholm: { lat: 59.3293, lng: 18.0686, displayName: 'Stockholm', countryCode: 'SE', tz: 'Europe/Stockholm' },
  oslo: { lat: 59.9139, lng: 10.7522, displayName: 'Oslo', countryCode: 'NO', tz: 'Europe/Oslo' },
  helsinki: { lat: 60.1699, lng: 24.9384, displayName: 'Helsinki', countryCode: 'FI', tz: 'Europe/Helsinki' },
  // ── Central / Eastern Europe + Greece ──
  warsaw: { lat: 52.2297, lng: 21.0122, displayName: 'Warsaw', countryCode: 'PL', tz: 'Europe/Warsaw' },
  prague: { lat: 50.0755, lng: 14.4378, displayName: 'Prague', countryCode: 'CZ', tz: 'Europe/Prague' },
  budapest: { lat: 47.4979, lng: 19.0402, displayName: 'Budapest', countryCode: 'HU', tz: 'Europe/Budapest' },
  athens: { lat: 37.9838, lng: 23.7275, displayName: 'Athens', countryCode: 'GR', tz: 'Europe/Athens' },
  // ── United States ──
  'new-york': { lat: 40.7128, lng: -74.006, displayName: 'New York', countryCode: 'US', tz: 'America/New_York' },
  'los-angeles': { lat: 34.0522, lng: -118.2437, displayName: 'Los Angeles', countryCode: 'US', tz: 'America/Los_Angeles' },
  chicago: { lat: 41.8781, lng: -87.6298, displayName: 'Chicago', countryCode: 'US', tz: 'America/Chicago' },
  'san-francisco': { lat: 37.7749, lng: -122.4194, displayName: 'San Francisco', countryCode: 'US', tz: 'America/Los_Angeles' },
  austin: { lat: 30.2672, lng: -97.7431, displayName: 'Austin', countryCode: 'US', tz: 'America/Chicago' },
  nashville: { lat: 36.1627, lng: -86.7816, displayName: 'Nashville', countryCode: 'US', tz: 'America/Chicago' },
  seattle: { lat: 47.6062, lng: -122.3321, displayName: 'Seattle', countryCode: 'US', tz: 'America/Los_Angeles' },
  boston: { lat: 42.3601, lng: -71.0589, displayName: 'Boston', countryCode: 'US', tz: 'America/New_York' },
  washington: { lat: 38.9072, lng: -77.0369, displayName: 'Washington, D.C.', countryCode: 'US', tz: 'America/New_York' },
  atlanta: { lat: 33.749, lng: -84.388, displayName: 'Atlanta', countryCode: 'US', tz: 'America/New_York' },
  miami: { lat: 25.7617, lng: -80.1918, displayName: 'Miami', countryCode: 'US', tz: 'America/New_York' },
  denver: { lat: 39.7392, lng: -104.9903, displayName: 'Denver', countryCode: 'US', tz: 'America/Denver' },
  'las-vegas': { lat: 36.1699, lng: -115.1398, displayName: 'Las Vegas', countryCode: 'US', tz: 'America/Los_Angeles' },
  'new-orleans': { lat: 29.9511, lng: -90.0715, displayName: 'New Orleans', countryCode: 'US', tz: 'America/Chicago' },
  // ── Canada ──
  toronto: { lat: 43.6532, lng: -79.3832, displayName: 'Toronto', countryCode: 'CA', tz: 'America/Toronto' },
  montreal: { lat: 45.5019, lng: -73.5674, displayName: 'Montréal', countryCode: 'CA', tz: 'America/Toronto' },
  vancouver: { lat: 49.2827, lng: -123.1207, displayName: 'Vancouver', countryCode: 'CA', tz: 'America/Vancouver' },
  // ── Latin America ──
  'mexico-city': { lat: 19.4326, lng: -99.1332, displayName: 'Mexico City', countryCode: 'MX', tz: 'America/Mexico_City' },
  'sao-paulo': { lat: -23.5505, lng: -46.6333, displayName: 'São Paulo', countryCode: 'BR', tz: 'America/Sao_Paulo' },
  'buenos-aires': { lat: -34.6037, lng: -58.3816, displayName: 'Buenos Aires', countryCode: 'AR', tz: 'America/Argentina/Buenos_Aires' },
  // ── Japan ──
  tokyo: { lat: 35.6762, lng: 139.6503, displayName: 'Tokyo', countryCode: 'JP', tz: 'Asia/Tokyo' },
  osaka: { lat: 34.6937, lng: 135.5023, displayName: 'Osaka', countryCode: 'JP', tz: 'Asia/Tokyo' },
  // ── South Korea ──
  seoul: { lat: 37.5665, lng: 126.978, displayName: 'Seoul', countryCode: 'KR', tz: 'Asia/Seoul' },
  // ── China & Hong Kong (mainland China uses one tz, Asia/Shanghai) ──
  shanghai: { lat: 31.2304, lng: 121.4737, displayName: 'Shanghai', countryCode: 'CN', tz: 'Asia/Shanghai' },
  beijing: { lat: 39.9042, lng: 116.4074, displayName: 'Beijing', countryCode: 'CN', tz: 'Asia/Shanghai' },
  'hong-kong': { lat: 22.3193, lng: 114.1694, displayName: 'Hong Kong', countryCode: 'HK', tz: 'Asia/Hong_Kong' },
  // ── Australia & New Zealand ──
  sydney: { lat: -33.8688, lng: 151.2093, displayName: 'Sydney', countryCode: 'AU', tz: 'Australia/Sydney' },
  melbourne: { lat: -37.8136, lng: 144.9631, displayName: 'Melbourne', countryCode: 'AU', tz: 'Australia/Melbourne' },
  perth: { lat: -31.9505, lng: 115.8605, displayName: 'Perth', countryCode: 'AU', tz: 'Australia/Perth' },
  auckland: { lat: -36.8485, lng: 174.7633, displayName: 'Auckland', countryCode: 'NZ', tz: 'Pacific/Auckland' },
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
