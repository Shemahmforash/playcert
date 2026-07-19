import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { ErrorState } from '../../src/components/ErrorState';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

describe('ErrorState — the poster wall is down (§2.6 "Error")', () => {
  it('renders the headline and a single Try again control', () => {
    render(<ErrorState />);
    expect(screen.getByText('The poster wall is down.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('calls onRetry when Try again is pressed', () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('shows the muted stale tag only when stale', () => {
    const { rerender } = render(<ErrorState />);
    expect(screen.queryByText('showing listings from earlier today')).toBeNull();

    rerender(<ErrorState stale />);
    expect(screen.getByText('showing listings from earlier today')).toBeTruthy();
  });
});
