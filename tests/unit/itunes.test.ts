import { describe, it, expect } from 'vitest';
import { parseSearch, pickExact } from '../../src/lib/api/itunes';
import exactHit from '../fixtures/itunes/exact-hit.json';
describe('itunes', () => {
  it('Zod-parses the fixture into candidates', () => {
    const c = parseSearch(exactHit);
    expect(c.length).toBeGreaterThan(0);
    expect(c[0].previewUrl).toContain('http');
  });
  it('pickExact selects the case-insensitive exact artist-name match', () => {
    const c = parseSearch(exactHit);
    const artistName = c[0].artistName;
    const track = pickExact(c, artistName.toUpperCase());
    expect(track?.artistName.toLowerCase()).toBe(artistName.toLowerCase());
  });
  it('pickExact returns null when no exact match exists', () => {
    const c = parseSearch(exactHit);
    expect(pickExact(c, 'zzz nonexistent artist')).toBeNull();
  });
});
