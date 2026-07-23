import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { LineupPoster } from '../../src/components/LineupPoster';
import type { Show } from '../../src/lib/types';
import type { PosterAct } from '../../src/lib/posterLayout';

/**
 * Task 4.6 — the on-screen LineupPoster reveal (the peel + PNG download are 4.7).
 * A focus-trapped modal on the light paper context: title, sized act lines, the
 * earshotlive.com/… watermark, and a ✕ / ESC close.
 */

afterEach(cleanup);

const acts: PosterAct[] = [
  { name: 'GIANT HEADLINER', prominence: 1 },
  { name: 'MIDDLE ACT', prominence: 0.5 },
  { name: 'TINY OPENER', prominence: 0 },
];

const mkShow = (id: string, startsAt: string, venue: string): Show => ({
  id,
  name: 'Gig',
  startsAt,
  venue: { name: venue, city: 'London' },
  ticketUrl: `https://tm/${id}`,
  attractions: [],
  artistIds: [],
});

const shows = [
  mkShow('tm:1', '2026-07-20T20:00:00Z', 'The Lexington'),
  mkShow('tm:2', '2026-07-21T19:30:00Z', 'EartH'),
];

const baseProps = {
  acts,
  shows,
  city: 'london',
  window: 'tonight' as const,
  fontStop: 'everything' as const,
};

describe('LineupPoster', () => {
  it('renders the title, act names, and the earshotlive.com/… watermark', () => {
    render(<LineupPoster {...baseProps} onClose={() => {}} />);

    expect(screen.getByRole('dialog', { name: /london week fest/i })).toBeTruthy();
    expect(screen.getByRole('heading', { name: /london week fest/i })).toBeTruthy();
    expect(screen.getByText('GIANT HEADLINER')).toBeTruthy();
    expect(screen.getByText('TINY OPENER')).toBeTruthy();
    // Watermark = earshotlive.com + the canonical path (everything → no stop segment).
    expect(screen.getByText('earshotlive.com/london/tonight')).toBeTruthy();
    // A venue name derived from `shows` appears in the footer.
    expect(screen.getByText(/the lexington/i)).toBeTruthy();
  });

  it('the ✕ button calls onClose', () => {
    const onClose = vi.fn();
    render(<LineupPoster {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close poster/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('backdrop click calls onClose', () => {
    const onClose = vi.fn();
    render(<LineupPoster {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('lineup-poster-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('is a focus-trapped dialog: focus moves in on open and ESC closes', () => {
    const onClose = vi.fn();
    render(<LineupPoster {...baseProps} onClose={onClose} />);
    const dialog = screen.getByRole('dialog');

    // Focus moved into the dialog (onto the ✕) on open.
    expect(dialog.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
