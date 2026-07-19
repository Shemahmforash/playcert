import { describe, it, expect, vi } from 'vitest';
import { getArtistListenCount } from '../../src/lib/api/listenbrainz';
import counts from '../fixtures/listenbrainz/counts.json';

describe('getArtistListenCount', () => {
  const params = { mbid: 'mbid-balthvs', name: 'BALTHVS' };

  it('returns the numeric total listen count from a valid response', async () => {
    const n = await getArtistListenCount(params, { rawFetch: async () => counts });
    expect(n).toBe(482913);
  });

  it('returns null on an empty/malformed response (no throw)', async () => {
    expect(await getArtistListenCount(params, { rawFetch: async () => ({}) })).toBeNull();
    expect(await getArtistListenCount(params, { rawFetch: async () => [{}] })).toBeNull();
    expect(await getArtistListenCount(params, { rawFetch: async () => null })).toBeNull();
  });

  it('NEVER throws: rawFetch that throws → null (strictly non-fatal)', async () => {
    const raw = vi.fn(async () => { throw new Error('503'); });
    const n = await getArtistListenCount(params, { rawFetch: raw });
    expect(n).toBeNull();
    expect(raw).toHaveBeenCalledTimes(1);
  });

  it('returns null when no mbid is available and no rawFetch (can\'t query by name in v1)', async () => {
    const n = await getArtistListenCount({ name: 'BALTHVS' });
    expect(n).toBeNull();
  });
});
