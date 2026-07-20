import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { UseMyLocation } from '../../src/components/UseMyLocation';

// vitest globals are disabled → register RTL cleanup by hand (matches siblings).
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const LONDON = { latitude: 51.5074, longitude: -0.1278 };

function mockGeolocation(
  impl: (success: PositionCallback, error: PositionErrorCallback) => void,
) {
  Object.defineProperty(globalThis.navigator, 'geolocation', {
    configurable: true,
    value: { getCurrentPosition: impl },
  });
}

afterEach(() => {
  cleanup();
  push.mockReset();
  // @ts-expect-error — tear down the injected mock between tests.
  delete globalThis.navigator.geolocation;
});

describe('UseMyLocation', () => {
  it('renders the button', () => {
    render(<UseMyLocation />);
    expect(
      screen.getByRole('button', { name: /use my exact location/i }),
    ).toBeTruthy();
  });

  it('success at London coords routes to /london/next-14-days', () => {
    mockGeolocation((success) =>
      success({ coords: LONDON } as GeolocationPosition),
    );
    render(<UseMyLocation />);

    fireEvent.click(
      screen.getByRole('button', { name: /use my exact location/i }),
    );
    expect(push).toHaveBeenCalledWith('/london/next-14-days');
  });

  it('honours the passed window when routing', () => {
    mockGeolocation((success) =>
      success({ coords: LONDON } as GeolocationPosition),
    );
    render(<UseMyLocation window="tonight" />);

    fireEvent.click(
      screen.getByRole('button', { name: /use my exact location/i }),
    );
    expect(push).toHaveBeenCalledWith('/london/tonight');
  });

  it('a permission error shows the inline notice and does not route', () => {
    mockGeolocation((_success, error) =>
      error({ code: 1, message: 'denied' } as GeolocationPositionError),
    );
    render(<UseMyLocation />);

    fireEvent.click(
      screen.getByRole('button', { name: /use my exact location/i }),
    );
    expect(screen.getByText(/couldn't get your location/i)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});
