import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { SparseNotice } from '../../src/components/SparseNotice';
import type { WidenMeta } from '../../src/lib/types';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

describe('SparseNotice — honest widen copy by kind (§2.6)', () => {
  it('radius only → "widened to {km} km."', () => {
    const widened: WidenMeta = { radiusKm: 50 };
    render(<SparseNotice widened={widened} city="braga" />);
    expect(
      screen.getByText('Quiet week in Braga — widened to 50 km.'),
    ).toBeTruthy();
  });

  it('window changed only → "widened to {window label}."', () => {
    const widened: WidenMeta = { window: 'next-14-days' };
    render(<SparseNotice widened={widened} city="braga" />);
    expect(
      screen.getByText('Quiet week in Braga — widened to the next 14 days.'),
    ).toBeTruthy();
  });

  it('this-weekend window label reads "this weekend"', () => {
    const widened: WidenMeta = { window: 'this-weekend' };
    render(<SparseNotice widened={widened} city="porto" />);
    expect(
      screen.getByText('Quiet week in Porto — widened to this weekend.'),
    ).toBeTruthy();
  });

  it('tonight window label reads "tonight"', () => {
    const widened: WidenMeta = { window: 'tonight' };
    render(<SparseNotice widened={widened} city="lisbon" />);
    expect(
      screen.getByText('Quiet week in Lisbon — widened to tonight.'),
    ).toBeTruthy();
  });

  it('both radius AND window → "widened to {km} km and {window label}."', () => {
    const widened: WidenMeta = { radiusKm: 50, window: 'next-14-days' };
    render(<SparseNotice widened={widened} city="braga" />);
    expect(
      screen.getByText(
        'Quiet week in Braga — widened to 50 km and the next 14 days.',
      ),
    ).toBeTruthy();
  });
});

describe('SparseNotice — dismissible', () => {
  it('hides the banner when the dismiss control is pressed', () => {
    const widened: WidenMeta = { radiusKm: 50 };
    render(<SparseNotice widened={widened} city="braga" />);
    expect(screen.queryByText(/Quiet week in Braga/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(screen.queryByText(/Quiet week in Braga/)).toBeNull();
  });
});
