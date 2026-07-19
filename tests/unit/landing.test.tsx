import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { CityPicker } from '../../src/components/CityPicker';

// vitest globals are disabled → register RTL cleanup by hand (matches sibling tests).
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

describe('CityPicker', () => {
  it('prefill (covered): Play {city} routes to the default window, chips change the target', () => {
    render(<CityPicker prefill={{ displayName: 'London', slug: 'london' }} />);

    const play = screen.getByRole('button', { name: /Play London/i });
    fireEvent.click(play);
    expect(push).toHaveBeenCalledWith('/london/next-14-days');

    // Switching the window chip re-targets the very same Play button.
    fireEvent.click(screen.getByRole('button', { name: /^Tonight$/i }));
    fireEvent.click(screen.getByRole('button', { name: /Play London/i }));
    expect(push).toHaveBeenLastCalledWith('/london/tonight');
  });

  it('null prefill: renders the "Play your city" fallback with the CityField visible', () => {
    render(<CityPicker prefill={null} />);

    expect(screen.getByText(/Play your city/i)).toBeTruthy();
    // CityField open by default in the fallback.
    expect(screen.getByLabelText(/city/i)).toBeTruthy();
  });

  it('CityField commit — covered: typing a covered city + submit routes there', () => {
    render(<CityPicker prefill={null} />);

    const input = screen.getByLabelText(/city/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'madrid' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(push).toHaveBeenCalledWith('/madrid/next-14-days');
  });

  it('CityField commit — miss: an uncovered city shows the recovery copy and does not route', () => {
    render(<CityPicker prefill={null} />);

    const input = screen.getByLabelText(/city/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'lisbon' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);

    expect(
      screen.getByText(/Can't find that one — try the nearest big city\./i),
    ).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
