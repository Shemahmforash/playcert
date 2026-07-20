import { describe, it, expect, vi } from 'vitest';
import { memoInFlight } from '../../src/lib/cache';
import { cacheKeys, bundleCacheProfile } from '../../src/lib/cache';
describe('memoInFlight', () => {
  it('coalesces concurrent calls for the same key into one execution', async () => {
    const fn = vi.fn(async () => 'bundle');
    const memo = memoInFlight<string>();
    const [a, b] = await Promise.all([memo('london:next-14-days', fn), memo('london:next-14-days', fn)]);
    expect(a).toBe('bundle'); expect(b).toBe('bundle');
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it('re-executes after settlement (memo is in-flight only, not a store)', async () => {
    const fn = vi.fn(async () => 'x');
    const memo = memoInFlight<string>();
    await memo('k', fn); await memo('k', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('cacheKeys', () => {
  it('builders are pure and stable', () => {
    expect(cacheKeys.bundle('lisbon', 'next-14-days')).toBe('bundle:lisbon:next-14-days');
    expect(cacheKeys.itunes('khruangbin')).toBe('itunes:khruangbin');
    expect(cacheKeys.mb('khruangbin')).toBe('mb:khruangbin');
    expect(cacheKeys.lb('mbid-123')).toBe('lb:mbid-123');
    expect(cacheKeys.yt('khruangbin')).toBe('yt:khruangbin');
    expect(cacheKeys.geo('lisbon')).toBe('geo:lisbon');
  });
});

describe('bundleCacheProfile (cost control — JamBase free tier)', () => {
  it('returns 6h (21600s) degraded below the 8-playable-track bar', () => {
    expect(bundleCacheProfile(7)).toEqual({ revalidate: 21_600 });
    expect(bundleCacheProfile(0)).toEqual({ revalidate: 21_600 });
  });
  it('returns 24h (86400s) at/above the bar', () => {
    expect(bundleCacheProfile(8)).toEqual({ revalidate: 86_400 });
    expect(bundleCacheProfile(30)).toEqual({ revalidate: 86_400 });
  });
});
