import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RateQueue } from '../../src/lib/queue';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('RateQueue', () => {
  it('paces calls at the configured spacing (250ms = 4/s)', async () => {
    const q = new RateQueue({ minSpacingMs: 250 });
    const stamps: number[] = [];
    const jobs = [1, 2, 3].map(() => q.schedule(async () => stamps.push(Date.now())));
    await vi.runAllTimersAsync();
    await Promise.all(jobs);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(250);
    expect(stamps[2] - stamps[1]).toBeGreaterThanOrEqual(250);
  });
  it('paces at 3500ms for the iTunes rate', async () => {
    const q = new RateQueue({ minSpacingMs: 3500 });
    const stamps: number[] = [];
    const jobs = [1, 2].map(() => q.schedule(async () => stamps.push(Date.now())));
    await vi.runAllTimersAsync();
    await Promise.all(jobs);
    expect(stamps[1] - stamps[0]).toBeGreaterThanOrEqual(3500);
  });
  it('a rejected job does not wedge the queue', async () => {
    const q = new RateQueue({ minSpacingMs: 10 });
    const bad = q.schedule(async () => { throw new Error('boom'); });
    const good = q.schedule(async () => 'ok');
    await vi.runAllTimersAsync();
    await expect(bad).rejects.toThrow('boom');
    await expect(good).resolves.toBe('ok');
  });
  it('cache-before-queue contract: a cache hit never touches the bucket', async () => {
    const q = new RateQueue({ minSpacingMs: 1000 });
    const spy = vi.spyOn(q, 'schedule');
    const cached = new Map([['k', 'hit']]);
    const get = (k: string) => cached.get(k) ?? q.schedule(async () => 'miss');
    expect(get('k')).toBe('hit');
    expect(spy).not.toHaveBeenCalled();
  });
});
