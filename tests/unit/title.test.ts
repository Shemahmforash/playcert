import { describe, it, expect } from 'vitest';
import {
  cityDisplay,
  dateRangeLabel,
  pageTitle,
  pageDescription,
} from '../../src/lib/title';
import { resolvePageState } from '../../src/lib/pageState';
import { formatCanonicalPath } from '../../src/lib/urlState';

// A fixed instant so the range math is deterministic (noon UTC → UTC day 20).
const NOW = new Date('2026-07-20T12:00:00Z');

describe('dateRangeLabel', () => {
  it('tonight → a single day (no range)', () => {
    expect(dateRangeLabel('tonight', NOW)).toBe('JUL 20');
  });

  it('this-weekend → today..+3d, same-month range', () => {
    expect(dateRangeLabel('this-weekend', NOW)).toBe('JUL 20–23');
  });

  it('next-14-days → today..+13d inclusive (JUL 20 → AUG 2)', () => {
    expect(dateRangeLabel('next-14-days', NOW)).toBe('JUL 20–AUG 2');
  });

  it('month-crossing range shows the month on both ends', () => {
    // JUL 25 + 13 = AUG 7
    expect(dateRangeLabel('next-14-days', new Date('2026-07-25T12:00:00Z'))).toBe('JUL 25–AUG 7');
  });

  it('same-month range collapses to end-day only (JUL 5–18)', () => {
    // JUL 5 + 13 = JUL 18, still in July
    expect(dateRangeLabel('next-14-days', new Date('2026-07-05T12:00:00Z'))).toBe('JUL 5–18');
  });

  it('uses an EN DASH (U+2013), not a hyphen', () => {
    expect(dateRangeLabel('next-14-days', NOW)).toContain('–');
    expect(dateRangeLabel('next-14-days', NOW)).not.toContain('-');
  });
});

describe('cityDisplay', () => {
  it('returns the covered city displayName', () => {
    expect(cityDisplay('london')).toBe('London');
    expect(cityDisplay('new-york')).toBe('New York');
  });
  it('title-cases a slug fallback for uncovered cities', () => {
    // A slug NOT in CITY_TABLE falls back to title-casing the slug itself.
    expect(cityDisplay('kansas-city')).toBe('Kansas City');
  });
});

describe('pageTitle', () => {
  it('formats as UPPERCASE CITY · DATE RANGE', () => {
    expect(pageTitle('london', 'next-14-days', NOW)).toBe('LONDON · JUL 20–AUG 2');
  });
});

describe('pageDescription', () => {
  it('is one honest line naming the city', () => {
    expect(pageDescription('london')).toBe(
      'Concerts near London, read bottom-up — hear the openers before the headliners.',
    );
  });
});

// The canonical logic used by generateMetadata is `formatCanonicalPath(resolved
// key)`. generateMetadata itself is awkward to unit-test (it lives in a Server
// Component page that pulls in `next/cache` + the bundle pipeline at import), so
// we assert the exact short-form (R11) derivation it delegates to instead.
describe('canonical short-form (as generateMetadata derives it)', () => {
  it('drops /everything for the default stop', () => {
    const state = resolvePageState({ city: 'london', window: 'next-14-days', fontStop: ['everything'] });
    expect(state.kind).toBe('render');
    if (state.kind === 'render') {
      expect(formatCanonicalPath(state.key)).toBe('/london/next-14-days');
    }
  });
  it('keeps a non-default stop', () => {
    const state = resolvePageState({ city: 'london', window: 'next-14-days', fontStop: ['small-print'] });
    if (state.kind === 'render') {
      expect(formatCanonicalPath(state.key)).toBe('/london/next-14-days/small-print');
    }
  });
});
