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
 * Ticketmaster-covered launch markets. Small hand-curated table (no geocoding
 * key needed) — a later task can add real geocoding for arbitrary typed cities.
 */
export const CITY_TABLE: Record<string, Geo> = {
  london: { lat: 51.5074, lng: -0.1278, displayName: 'London', countryCode: 'GB', tz: 'Europe/London' },
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
