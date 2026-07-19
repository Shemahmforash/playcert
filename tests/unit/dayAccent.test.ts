import { describe, it, expect } from 'vitest';
import { dayAccentHue } from '../../src/lib/dayAccent';

// Design-system weekday ink ledger (docs/design/2026-07-19-phase2-design-system.md §1.1)
const MON = '#5AA9E6';
const TUE = '#E68A5A';
const WED = '#7FB25A';
const THU = '#B27ADE';
const FRI = '#E6C15A';
const SAT = '#E67A9E';
const SUN = '#5AE6D0';

describe('dayAccentHue', () => {
  it('maps a known Monday to the Mon hue', () => {
    // 2024-01-01 is a Monday
    expect(dayAccentHue('2024-01-01')).toBe(MON);
  });

  it('maps a known Sunday to the Sun hue', () => {
    // 2024-01-07 is a Sunday
    expect(dayAccentHue('2024-01-07')).toBe(SUN);
  });

  it('walks the full 7-hue cycle across a week', () => {
    expect(dayAccentHue('2024-01-01')).toBe(MON); // Mon
    expect(dayAccentHue('2024-01-02')).toBe(TUE); // Tue
    expect(dayAccentHue('2024-01-03')).toBe(WED); // Wed
    expect(dayAccentHue('2024-01-04')).toBe(THU); // Thu
    expect(dayAccentHue('2024-01-05')).toBe(FRI); // Fri
    expect(dayAccentHue('2024-01-06')).toBe(SAT); // Sat
    expect(dayAccentHue('2024-01-07')).toBe(SUN); // Sun
  });

  it('is timezone-stable: same calendar date in different offsets gets the same hue', () => {
    // Same wall-calendar day (2024-01-01) written from two very different cities.
    // A naive UTC/local parse would shift these across the midnight boundary.
    const auckland = '2024-01-01T01:00:00+13:00';
    const honolulu = '2024-01-01T23:00:00-10:00';
    expect(dayAccentHue(auckland)).toBe(MON);
    expect(dayAccentHue(honolulu)).toBe(MON);
    expect(dayAccentHue(auckland)).toBe(dayAccentHue(honolulu));
  });

  it('accepts a Date object and derives from its UTC calendar day', () => {
    // Constructed as UTC midnight so the calendar day is unambiguous.
    expect(dayAccentHue(new Date('2024-01-07T00:00:00Z'))).toBe(SUN);
  });

  it('ignores the time component entirely', () => {
    expect(dayAccentHue('2024-01-01T00:00:00Z')).toBe(dayAccentHue('2024-01-01T23:59:59Z'));
  });
});
