import { describe, it, expect, vi } from 'vitest';
import { memoInFlight } from '../../src/lib/cache';
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
