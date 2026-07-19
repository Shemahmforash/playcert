import { describe, it, expect, vi } from 'vitest';
import { crossCheckArtist } from '../../src/lib/api/musicbrainz';
import match from '../fixtures/musicbrainz/match.json';
import mismatch from '../fixtures/musicbrainz/mismatch.json';

describe('crossCheckArtist', () => {
  const ctx = { countryCode: 'PT', genreHints: ['psychedelic', 'funk'] };
  it('confirms when genre/area align with event context', async () => {
    const r = await crossCheckArtist('balthvs', ctx, { rawFetch: async () => match });
    expect(r.status).toBe('confirmed');
    if (r.status === 'confirmed') expect(r.mbid).toBeTruthy();
  });
  it('returns unconfident on genre/area mismatch', async () => {
    const r = await crossCheckArtist('boston', ctx, { rawFetch: async () => mismatch });
    expect(r.status).toBe('unconfident');
  });
  it('NEVER throws: network error → unconfident (strictly non-fatal)', async () => {
    const r = await crossCheckArtist('x', ctx, { rawFetch: async () => { throw new Error('503'); } });
    expect(r.status).toBe('unconfident');
  });
  it('timeout → unconfident, no retry', async () => {
    const raw = vi.fn(async () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }); });
    const r = await crossCheckArtist('x', ctx, { rawFetch: raw });
    expect(r.status).toBe('unconfident');
    expect(raw).toHaveBeenCalledTimes(1);
  });
});
