import { describe, it, expect } from 'vitest';
import {
  cityFromHeaders,
  geoForCity,
  latLngFromHeaders,
  nearestCity,
  rootRedirectSlug,
} from '../../src/lib/api/geo';

describe('cityFromHeaders', () => {
  it('reads and slugifies the Vercel IP headers', () => {
    expect(cityFromHeaders(new Headers({ 'x-vercel-ip-city': 'London', 'x-vercel-ip-country': 'GB' })))
      .toEqual({ displayName: 'London', slug: 'london', countryCode: 'GB' });
  });
  it('percent-decodes multi-word / accented city names', () => {
    expect(cityFromHeaders(new Headers({ 'x-vercel-ip-city': 'S%C3%A3o%20Paulo', 'x-vercel-ip-country': 'BR' })))
      .toEqual({ displayName: 'São Paulo', slug: 'sao-paulo', countryCode: 'BR' });
  });
  it('returns null when headers are absent or empty', () => {
    expect(cityFromHeaders(new Headers())).toBeNull();
    expect(cityFromHeaders(new Headers({ 'x-vercel-ip-city': '', 'x-vercel-ip-country': 'GB' }))).toBeNull();
  });
});

describe('geoForCity', () => {
  it('returns Geo for a covered city', () => {
    const g = geoForCity('london');
    expect(g?.countryCode).toBe('GB');
    expect(g?.displayName).toBe('London');
    expect(typeof g?.lat).toBe('number');
    expect(typeof g?.tz).toBe('string');
  });
  it('returns null for an uncovered city (not in the table)', () => {
    expect(geoForCity('reykjavik')).toBeNull();
  });
});

describe('latLngFromHeaders', () => {
  it('parses valid Vercel lat/lng headers into finite numbers', () => {
    const h = new Headers({
      'x-vercel-ip-latitude': '51.5074',
      'x-vercel-ip-longitude': '-0.1278',
    });
    expect(latLngFromHeaders(h)).toEqual({ lat: 51.5074, lng: -0.1278 });
  });
  it('returns null when either header is missing', () => {
    expect(latLngFromHeaders(new Headers())).toBeNull();
    expect(
      latLngFromHeaders(new Headers({ 'x-vercel-ip-latitude': '51.5' })),
    ).toBeNull();
  });
  it('returns null when a header is non-numeric garbage', () => {
    const h = new Headers({
      'x-vercel-ip-latitude': 'not-a-number',
      'x-vercel-ip-longitude': '-0.1278',
    });
    expect(latLngFromHeaders(h)).toBeNull();
  });
});

describe('nearestCity', () => {
  it('snaps London coords to london with a tiny distance', () => {
    const hit = nearestCity(51.5074, -0.1278);
    expect(hit?.slug).toBe('london');
    expect(hit!.distanceKm).toBeLessThan(1);
  });
  it("a covered city's own coords snap to itself at ~0 km", () => {
    const madrid = geoForCity('madrid')!;
    const hit = nearestCity(madrid.lat, madrid.lng);
    expect(hit?.slug).toBe('madrid');
    expect(hit!.distanceKm).toBeLessThan(0.001);
  });
  it('a point near (but not exactly) London still snaps to london', () => {
    // ~15 km NW of central London — well inside the 150km guard.
    const hit = nearestCity(51.62, -0.32);
    expect(hit?.slug).toBe('london');
    expect(hit!.distanceKm).toBeGreaterThan(0);
    expect(hit!.distanceKm).toBeLessThan(150);
  });
  it('returns null for a mid-Atlantic point beyond maxKm', () => {
    expect(nearestCity(40, -40)).toBeNull();
  });
});

describe('rootRedirectSlug', () => {
  const londonHeaders = new Headers({
    'x-vercel-ip-latitude': '51.5074',
    'x-vercel-ip-longitude': '-0.1278',
  });

  it('London headers + wantsPicker=false → london', () => {
    expect(rootRedirectSlug(londonHeaders, false)).toBe('london');
  });
  it('wantsPicker=true → null (never auto-redirect via ?pick=1)', () => {
    expect(rootRedirectSlug(londonHeaders, true)).toBeNull();
  });
  it('no geo headers → null (render the picker)', () => {
    expect(rootRedirectSlug(new Headers(), false)).toBeNull();
  });
});
