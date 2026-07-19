import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TrackRow, nameSizePx, type TrackRowProps } from '../../src/components/TrackRow';

// vitest globals are disabled in this project, so RTL's auto-cleanup never
// registers — do it by hand so each render starts from a clean DOM.
afterEach(cleanup);

function makeProps(overrides: Partial<TrackRowProps> = {}): TrackRowProps {
  return {
    artist: 'BALTHVS',
    title: 'Samba',
    venue: 'Musicbox',
    dateLabel: 'SAT 20',
    doors: '8PM',
    ticketUrl: 'https://tickets.example/balthvs',
    state: 'idle',
    ...overrides,
  };
}

describe('TrackRow — gig chip text assembly', () => {
  it('composes "SAT 20 · MUSICBOX · DOORS 8PM" and shows no price', () => {
    const { container } = render(<TrackRow {...makeProps()} />);
    expect(screen.getByText('SAT 20 · MUSICBOX · DOORS 8PM')).toBeTruthy();
    // The product dropped price — no currency of any kind may appear.
    expect(container.textContent).not.toMatch(/[€£$]/);
    expect(container.textContent?.toLowerCase()).not.toContain('price');
  });

  it('omits the DOORS segment when doors is absent', () => {
    render(<TrackRow {...makeProps({ doors: undefined })} />);
    expect(screen.getByText('SAT 20 · MUSICBOX')).toBeTruthy();
  });
});

describe('TrackRow — states', () => {
  it('renders the name at 60% opacity when played', () => {
    render(<TrackRow {...makeProps({ state: 'played' })} />);
    const name = screen.getByText('BALTHVS');
    expect(name.style.opacity).toBe('0.6');
  });

  it('does not dim the name at 60% when idle', () => {
    render(<TrackRow {...makeProps({ state: 'idle' })} />);
    const name = screen.getByText('BALTHVS');
    expect(name.style.opacity).not.toBe('0.6');
  });

  it('shows PREVIEW UNAVAILABLE and disables Play when unavailable', () => {
    render(<TrackRow {...makeProps({ state: 'unavailable' })} />);
    expect(screen.getByText('PREVIEW UNAVAILABLE')).toBeTruthy();
    const play = screen.getByRole('button', { name: 'Play preview of BALTHVS' });
    expect((play as HTMLButtonElement).disabled).toBe(true);
  });

  it('sets Play aria-pressed=true when playing', () => {
    render(<TrackRow {...makeProps({ state: 'playing' })} />);
    const play = screen.getByRole('button', { name: 'Play preview of BALTHVS' });
    expect(play.getAttribute('aria-pressed')).toBe('true');
  });

  it('sets Play aria-pressed=false when idle', () => {
    render(<TrackRow {...makeProps({ state: 'idle' })} />);
    const play = screen.getByRole('button', { name: 'Play preview of BALTHVS' });
    expect(play.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('TrackRow — tags', () => {
  it('shows an ENCORE tag when isEncore', () => {
    render(<TrackRow {...makeProps({ isEncore: true })} />);
    expect(screen.getByText('ENCORE')).toBeTruthy();
  });

  it('shows the widen tag when provided', () => {
    render(<TrackRow {...makeProps({ widenTag: '+38 KM' })} />);
    expect(screen.getByText('+38 KM')).toBeTruthy();
  });

  it('omits both tags by default', () => {
    render(<TrackRow {...makeProps()} />);
    expect(screen.queryByText('ENCORE')).toBeNull();
  });
});

describe('TrackRow — callbacks', () => {
  it('calls onPlay when Play is clicked', () => {
    const onPlay = vi.fn();
    render(<TrackRow {...makeProps({ onPlay })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play preview of BALTHVS' }));
    expect(onPlay).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenGig when the gig chip is clicked', () => {
    const onOpenGig = vi.fn();
    render(<TrackRow {...makeProps({ onOpenGig })} />);
    fireEvent.click(screen.getByText('SAT 20 · MUSICBOX · DOORS 8PM'));
    expect(onOpenGig).toHaveBeenCalledTimes(1);
  });

  it('calls onHeart when the heart is clicked', () => {
    const onHeart = vi.fn();
    render(<TrackRow {...makeProps({ onHeart })} />);
    const heart = screen.getByRole('button', { name: /heart/i });
    fireEvent.click(heart);
    expect(onHeart).toHaveBeenCalledTimes(1);
  });

  it('does not call onPlay when Play is disabled (unavailable)', () => {
    const onPlay = vi.fn();
    render(<TrackRow {...makeProps({ state: 'unavailable', onPlay })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play preview of BALTHVS' }));
    expect(onPlay).not.toHaveBeenCalled();
  });
});

describe('nameSizePx — prominence sizing', () => {
  it('grows with prominence', () => {
    expect(nameSizePx(0.9)).toBeGreaterThan(nameSizePx(0.3));
  });

  it('anchors near the spec points (0→15, 0.5→28, 1→64)', () => {
    expect(nameSizePx(0)).toBe(15);
    expect(nameSizePx(0.5)).toBe(28);
    expect(nameSizePx(1)).toBe(64);
  });

  it('defaults to the 0.5 midpoint size', () => {
    expect(nameSizePx()).toBe(nameSizePx(0.5));
  });

  it('clamps out-of-range prominence to the sane range', () => {
    expect(nameSizePx(-5)).toBe(15);
    expect(nameSizePx(9)).toBe(64);
  });
});
