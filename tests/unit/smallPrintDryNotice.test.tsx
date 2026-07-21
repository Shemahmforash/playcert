import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { SmallPrintDryNotice } from '../../src/components/SmallPrintDryNotice';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

describe('SmallPrintDryNotice — one-tap Trimmed escape hatch (Task 3.7, §2.6)', () => {
  it('renders the dry copy and a real "try Trimmed" button (role=status)', () => {
    render(<SmallPrintDryNotice onTryTrimmed={() => {}} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Small Print runs dry here —')).toBeTruthy();
    // The escape hatch is an actionable control, not prose. The label comes from
    // FONT_STOP_LABELS so it never drifts from the dial (was the stale "No Arenas").
    const btn = screen.getByRole('button', { name: 'try Trimmed' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('clicking the button calls onTryTrimmed exactly once', () => {
    const onTryTrimmed = vi.fn();
    render(<SmallPrintDryNotice onTryTrimmed={onTryTrimmed} />);
    fireEvent.click(screen.getByRole('button', { name: 'try Trimmed' }));
    expect(onTryTrimmed).toHaveBeenCalledTimes(1);
  });
});
