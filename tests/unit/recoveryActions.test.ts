import { describe, it, expect } from 'vitest';
import { recoveryActionsForEmpty } from '../../src/lib/recoveryActions';

describe('recoveryActionsForEmpty — the empty-state escape hatches (§2.6)', () => {
  it('terminal window (next-14-days) OMITS any widen-the-window action (R5)', () => {
    const actions = recoveryActionsForEmpty({
      city: 'braga',
      window: 'next-14-days',
      fontStop: 'everything',
    });
    // No route action at all — 14 days is terminal, no next-30-days route exists.
    expect(actions.some((a) => a.action.kind === 'route')).toBe(false);
  });

  it('non-terminal window offers a widen-the-window route to the next window', () => {
    const actions = recoveryActionsForEmpty({
      city: 'braga',
      window: 'tonight',
      fontStop: 'everything',
    });
    const route = actions.find((a) => a.action.kind === 'route');
    expect(route).toBeTruthy();
    // tonight → this-weekend; everything stop omitted from the canonical path.
    expect(route!.action).toEqual({ kind: 'route', href: '/braga/this-weekend' });
  });

  it('a filtering stop + unfilteredHadShows offers "Everything on the dial"', () => {
    const actions = recoveryActionsForEmpty({
      city: 'braga',
      window: 'tonight',
      fontStop: 'small-print',
      unfilteredHadShows: true,
    });
    const dial = actions.find((a) => a.action.kind === 'dialStop');
    expect(dial).toBeTruthy();
    expect(dial!.action).toEqual({ kind: 'dialStop', stop: 'everything' });
  });

  it('does NOT offer Everything when the stop is filtering but nothing was filtered out', () => {
    const actions = recoveryActionsForEmpty({
      city: 'braga',
      window: 'tonight',
      fontStop: 'small-print',
      unfilteredHadShows: false,
    });
    expect(actions.some((a) => a.action.kind === 'dialStop')).toBe(false);
  });

  it('does NOT offer Everything when already at the everything stop', () => {
    const actions = recoveryActionsForEmpty({
      city: 'braga',
      window: 'tonight',
      fontStop: 'everything',
      unfilteredHadShows: true,
    });
    expect(actions.some((a) => a.action.kind === 'dialStop')).toBe(false);
  });

  it('always includes a "Try another city" openCityField action', () => {
    const base = recoveryActionsForEmpty({
      city: 'braga',
      window: 'next-14-days',
      fontStop: 'everything',
    });
    expect(base.some((a) => a.action.kind === 'openCityField')).toBe(true);

    const rich = recoveryActionsForEmpty({
      city: 'braga',
      window: 'tonight',
      fontStop: 'small-print',
      unfilteredHadShows: true,
    });
    expect(rich.some((a) => a.action.kind === 'openCityField')).toBe(true);
  });
});
