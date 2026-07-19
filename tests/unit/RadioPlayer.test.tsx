import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import {
  RadioPlayer,
  PROGRESS_RING_CIRCUMFERENCE,
  type RadioPlayerProps,
} from '../../src/components/RadioPlayer';
import type { Show } from '../../src/lib/types';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

// 2026-09-18 is a Friday → dateLabelFor yields "FRI 18".
const show: Show = {
  id: 'tm:1',
  name: 'Khruangbin at EartH',
  startsAt: '2026-09-18T20:00:00',
  venue: { name: 'EartH', city: 'London' },
  ticketUrl: 'https://t/1',
  attractions: [{ id: 'khruangbin', name: 'Khruangbin' }],
  artistIds: ['khruangbin'],
};

function makeProps(overrides: Partial<RadioPlayerProps> = {}): RadioPlayerProps {
  return {
    track: { artist: 'Khruangbin', title: 'Talero' },
    show,
    playing: false,
    index: 0,
    total: 1,
    progress: 0,
    onToggle: () => {},
    onSkip: () => {},
    ...overrides,
  };
}

describe('RadioPlayer — ticker assembly', () => {
  it('composes "{Artist} — {Title} · plays {DAY DATE} · {Venue}"', () => {
    render(<RadioPlayer {...makeProps()} />);
    expect(
      screen.getByText('Khruangbin — Talero · plays FRI 18 · EartH'),
    ).toBeTruthy();
  });

  it('announces a static sentence in a polite live region', () => {
    render(<RadioPlayer {...makeProps()} />);
    const live = screen.getByRole('status');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.textContent).toContain('Khruangbin');
    expect(live.textContent).toContain('Talero');
  });
});

describe('RadioPlayer — controls', () => {
  it('reflects play state on the Play/Pause stamp via aria-pressed', () => {
    const { rerender } = render(<RadioPlayer {...makeProps({ playing: false })} />);
    const btn = screen.getByRole('button', { name: 'Play' });
    expect(btn.getAttribute('aria-pressed')).toBe('false');

    rerender(<RadioPlayer {...makeProps({ playing: true })} />);
    const pause = screen.getByRole('button', { name: 'Pause' });
    expect(pause.getAttribute('aria-pressed')).toBe('true');
  });

  it('calls onToggle when the Play/Pause stamp is pressed', () => {
    const onToggle = vi.fn();
    render(<RadioPlayer {...makeProps({ onToggle })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('calls onSkip when Skip is pressed', () => {
    const onSkip = vi.fn();
    render(<RadioPlayer {...makeProps({ onSkip })} />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip to next track' }));
    expect(onSkip).toHaveBeenCalledOnce();
  });
});

describe('RadioPlayer — Cueing…→▶ flip (§2.5)', () => {
  it('labels the stamp "Cueing…" while cueing + paused', () => {
    render(<RadioPlayer {...makeProps({ cueing: true, playing: false })} />);
    const btn = screen.getByRole('button', { name: 'Cueing…' });
    // Still enabled → the first tap can synchronously unlock iOS audio.
    expect(btn).toHaveProperty('disabled', false);
    expect(btn.getAttribute('aria-pressed')).toBe('false');
  });

  it('flips to "Play" once ready (cueing=false)', () => {
    render(<RadioPlayer {...makeProps({ cueing: false, playing: false })} />);
    expect(screen.getByRole('button', { name: 'Play' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cueing…' })).toBeNull();
  });

  it('never shows Cueing… once playing (it is the Pause control)', () => {
    render(<RadioPlayer {...makeProps({ cueing: true, playing: true })} />);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cueing…' })).toBeNull();
  });
});

describe('RadioPlayer — empty / null-safe', () => {
  it('renders an idle shell with disabled controls when track is null', () => {
    render(<RadioPlayer {...makeProps({ track: null, show: undefined })} />);
    // Region still present; Play stamp shown but disabled (no autoplay target).
    expect(screen.getByRole('region', { name: 'Radio player' })).toBeTruthy();
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toHaveProperty('disabled', true);
    const skip = screen.getByRole('button', { name: 'Skip to next track' });
    expect(skip).toHaveProperty('disabled', true);
  });
});

describe('RadioPlayer — 30s progress ring', () => {
  const offsetAt = (progress: number) => {
    const { container } = render(<RadioPlayer {...makeProps({ progress })} />);
    const ring = container.querySelector('[data-testid="progress-ring"]');
    return Number(ring?.getAttribute('stroke-dashoffset'));
  };

  it('drains the stroke-dashoffset as progress advances', () => {
    // Empty ring at 0 (offset == full circumference), full ring at 1 (offset 0).
    expect(offsetAt(0)).toBeCloseTo(PROGRESS_RING_CIRCUMFERENCE, 3);
    cleanup();
    expect(offsetAt(1)).toBeCloseTo(0, 3);
    cleanup();
    // Half-way sits halfway between.
    expect(offsetAt(0.5)).toBeCloseTo(PROGRESS_RING_CIRCUMFERENCE / 2, 3);
  });
});
