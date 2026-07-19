import { describe, it, expect, vi } from 'vitest';
import { fetchShowsWithWiden } from '../../src/lib/pipeline/fetchShows';

const geo = { lat: 41.55, lng: -8.42, displayName: 'Braga', countryCode: 'PT', tz: 'Europe/Lisbon' };
const mkShows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `tm:${i}` } as any));

describe('fetchShowsWithWiden (R5)', () => {
  it('rich market: no widening, no metadata', async () => {
    const q = vi.fn(async () => mkShows(20));
    const r = await fetchShowsWithWiden(geo, 'next-14-days', { query: q });
    expect(r.widened).toBeUndefined();
    expect(q).toHaveBeenCalledTimes(1);
    expect(q).toHaveBeenCalledWith(geo, 30, 'next-14-days');
  });
  it('sparse: widens radius 30→50 first', async () => {
    const q = vi.fn()
      .mockResolvedValueOnce(mkShows(3))
      .mockResolvedValueOnce(mkShows(12));
    const r = await fetchShowsWithWiden(geo, 'next-14-days', { query: q });
    expect(r.widened).toEqual({ radiusKm: 50 });
    expect(r.shows.length).toBe(12);
  });
  it('still sparse: widens window next (tonight → this-weekend → next-14-days)', async () => {
    const q = vi.fn()
      .mockResolvedValueOnce(mkShows(2))
      .mockResolvedValueOnce(mkShows(3))
      .mockResolvedValueOnce(mkShows(4))
      .mockResolvedValueOnce(mkShows(9));
    const r = await fetchShowsWithWiden(geo, 'tonight', { query: q });
    expect(r.widened).toEqual({ radiusKm: 50, window: 'next-14-days' });
  });
  it('next-14-days is terminal: below-bar result returned honestly, never widened further', async () => {
    const q = vi.fn().mockResolvedValue(mkShows(4));
    const r = await fetchShowsWithWiden(geo, 'next-14-days', { query: q });
    expect(q).toHaveBeenCalledTimes(2);
    expect(r.shows.length).toBe(4);
    expect(r.widened).toEqual({ radiusKm: 50 });
  });
});
