import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { SmallPrintDryNotice } from '../../src/components/SmallPrintDryNotice';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

describe('SmallPrintDryNotice — one-tap No Arenas escape hatch (Task 3.7, §2.6)', () => {
  it('renders the dry copy and a real "try No Arenas" button (role=status)', () => {
    render(<SmallPrintDryNotice onTryNoArenas={() => {}} />);
    expect(screen.getByRole('status')).toBeTruthy();
    expect(screen.getByText('Small Print runs dry here —')).toBeTruthy();
    // The escape hatch is an actionable control, not prose.
    const btn = screen.getByRole('button', { name: 'try No Arenas' });
    expect(btn.tagName).toBe('BUTTON');
  });

  it('clicking the button calls onTryNoArenas exactly once', () => {
    const onTryNoArenas = vi.fn();
    render(<SmallPrintDryNotice onTryNoArenas={onTryNoArenas} />);
    fireEvent.click(screen.getByRole('button', { name: 'try No Arenas' }));
    expect(onTryNoArenas).toHaveBeenCalledTimes(1);
  });
});
