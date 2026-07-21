import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { EarshotDial } from '../../src/components/EarshotDial';
import type { FontStop } from '../../src/lib/types';

/**
 * Task 3.5 — the EarshotDial (design doc §2.2 / §4).
 *
 * Locks the load-bearing contract: `role="slider"` with the right
 * aria-valuenow/aria-valuetext per stop; ←/→ step + clamp; Home/End jump; a
 * detent tap fires onChange; and the ACTIVE detent carries a NON-COLOR state cue
 * (bold weight + underline) — "meaning never color-only".
 */

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

const VALUETEXT: Record<FontStop, string> = {
  everything: 'Marquee — the whole bill, every act',
  'no-arenas': 'Trimmed — each headliner cut to a single song',
  'small-print': 'Small Print — the opening and support acts only',
};

describe('EarshotDial — slider semantics', () => {
  it('renders role="slider" with correct aria-valuenow + aria-valuetext for each stop', () => {
    const cases: Array<[FontStop, number]> = [
      ['everything', 0],
      ['no-arenas', 1],
      ['small-print', 2],
    ];
    for (const [value, expectedNow] of cases) {
      const { unmount } = render(<EarshotDial value={value} onChange={() => {}} />);
      const slider = screen.getByRole('slider');
      expect(slider.getAttribute('aria-valuemin')).toBe('0');
      expect(slider.getAttribute('aria-valuemax')).toBe('2');
      expect(slider.getAttribute('aria-valuenow')).toBe(String(expectedNow));
      expect(slider.getAttribute('aria-valuetext')).toBe(VALUETEXT[value]);
      unmount();
    }
  });
});

describe('EarshotDial — keyboard', () => {
  it('ArrowRight steps to the next stop', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="everything" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenCalledWith('no-arenas');
  });

  it('ArrowLeft steps to the previous stop', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="small-print" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenCalledWith('no-arenas');
  });

  it('clamps at the right end — ArrowRight on small-print fires nothing', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="small-print" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowRight' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps at the left end — ArrowLeft on everything fires nothing', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="everything" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowLeft' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('Home jumps to everything, End jumps to small-print', () => {
    const onChange = vi.fn();
    const { rerender } = render(<EarshotDial value="small-print" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(onChange).toHaveBeenCalledWith('everything');

    onChange.mockReset();
    rerender(<EarshotDial value="everything" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(onChange).toHaveBeenCalledWith('small-print');
  });

  it('does NOT handle ArrowUp/ArrowDown (reserved for row nav)', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="everything" onChange={onChange} />);
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' });
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('EarshotDial — pointer', () => {
  it('clicking a detent label fires onChange with that stop', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="everything" onChange={onChange} />);
    fireEvent.click(screen.getByText('SMALL PRINT'));
    expect(onChange).toHaveBeenCalledWith('small-print');
  });

  it('clicking the ALREADY-active detent label fires nothing (no-op)', () => {
    const onChange = vi.fn();
    render(<EarshotDial value="everything" onChange={onChange} />);
    fireEvent.click(screen.getByText('MARQUEE'));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('EarshotDial — active state is never color-only (§4)', () => {
  it('the active detent label carries bold weight AND an underline', () => {
    render(<EarshotDial value="no-arenas" onChange={() => {}} />);
    const active = screen.getByText('TRIMMED');
    expect(active.style.fontWeight).toBe('700');
    expect(active.style.textDecoration).toContain('underline');

    // A non-active label carries neither cue → the state is not conveyed by ink alone.
    const inactive = screen.getByText('MARQUEE');
    expect(inactive.style.fontWeight).toBe('400');
    expect(inactive.style.textDecoration).toBe('none');
  });
});
