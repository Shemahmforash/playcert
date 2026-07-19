import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  LoadingTheater,
  LOADING_TIMEOUT_MS,
} from '../../src/components/LoadingTheater';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

describe('LoadingTheater — the crate-digging fallback', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('renders "Reading the small print…" before the timeout', () => {
    render(<LoadingTheater />);
    expect(screen.getByText('Reading the small print…')).toBeTruthy();
  });

  it('swaps to the honest "still reading" copy after 45s', () => {
    render(<LoadingTheater />);
    expect(screen.queryByText(/Still reading/)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(LOADING_TIMEOUT_MS);
    });

    expect(screen.getByText(/Still reading/)).toBeTruthy();
    expect(screen.queryByText('Reading the small print…')).toBeNull();
  });

  it('fires onTimeout once when the 45s timer elapses', () => {
    const onTimeout = vi.fn();
    render(<LoadingTheater onTimeout={onTimeout} />);
    expect(onTimeout).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(LOADING_TIMEOUT_MS);
    });

    expect(onTimeout).toHaveBeenCalledOnce();
  });

  it('clears the timer on unmount → no state update after teardown', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onTimeout = vi.fn();
    const { unmount } = render(<LoadingTheater onTimeout={onTimeout} />);

    unmount();
    act(() => {
      vi.advanceTimersByTime(LOADING_TIMEOUT_MS * 2);
    });

    // The cleared timer must not fire after unmount.
    expect(onTimeout).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
