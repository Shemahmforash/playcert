import { describe, it, expect } from 'vitest';
import { cityFromHeaders, geoForCity } from '../../src/lib/api/geo';

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
  it('returns null for an uncovered city (e.g. Lisbon — no Ticketmaster coverage)', () => {
    expect(geoForCity('lisbon')).toBeNull();
  });
});
