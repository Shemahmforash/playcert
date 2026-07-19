import { describe, it, expect } from 'vitest';
import { parseUrlState, formatCanonicalPath } from '../../src/lib/urlState';

describe('parseUrlState', () => {
  it('parses a full triple', () => {
    expect(parseUrlState('lisbon', 'next-14-days', ['small-print'])).toEqual({
      ok: true, key: { city: 'lisbon', window: 'next-14-days', fontStop: 'small-print' },
    });
  });
  it('defaults omitted fontStop to everything', () => {
    expect(parseUrlState('lisbon', 'tonight', undefined)).toEqual({
      ok: true, key: { city: 'lisbon', window: 'tonight', fontStop: 'everything' },
    });
  });
  it('rejects unknown window', () => {
    expect(parseUrlState('lisbon', 'next-30-days', undefined)).toEqual({ ok: false, reason: 'window' });
  });
  it('rejects unknown fontStop', () => {
    expect(parseUrlState('lisbon', 'tonight', ['huge-print'])).toEqual({ ok: false, reason: 'fontStop' });
  });
  it('rejects slugs violating the grammar ^[a-z0-9-]{2,40}$ (R10)', () => {
    for (const bad of ['L', 'Lisbon', 'a', 'lisbon!', 'x'.repeat(41), '../etc']) {
      expect(parseUrlState(bad, 'tonight', undefined).ok).toBe(false);
    }
  });
  it('rejects extra path segments', () => {
    expect(parseUrlState('lisbon', 'tonight', ['everything', 'extra']).ok).toBe(false);
  });
});

describe('formatCanonicalPath (R11)', () => {
  it('omits everything from the path', () => {
    expect(formatCanonicalPath({ city: 'lisbon', window: 'tonight', fontStop: 'everything' })).toBe('/lisbon/tonight');
  });
  it('includes non-default stops', () => {
    expect(formatCanonicalPath({ city: 'lisbon', window: 'tonight', fontStop: 'small-print' })).toBe('/lisbon/tonight/small-print');
  });
});
