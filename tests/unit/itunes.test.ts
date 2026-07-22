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

  it('drops a row whose previewUrl is not http(s), and blanks bad link/artwork URLs', () => {
    const poisoned = {
      results: [
        // non-http preview → whole row dropped (no playable stream)
        { trackId: 1, artistName: 'A', previewUrl: 'javascript:alert(1)' },
        // valid preview, but poisoned linkback + artwork → those blank out
        {
          trackId: 2,
          artistName: 'B',
          previewUrl: 'https://audio.example/p.m4a',
          trackViewUrl: 'javascript:alert(2)',
          artworkUrl100: 'data:image/svg+xml,<svg/onload=alert(3)>',
        },
      ],
    };
    const c = parseSearch(poisoned);
    expect(c.length).toBe(1);
    expect(c[0].artistName).toBe('B');
    expect(c[0].itunesUrl).toBe('');
    expect(c[0].artworkUrl).toBe('');
  });
});
