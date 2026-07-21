import { afterEach, describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { TrackRow, nameSizePx, type TrackRowProps } from '../../src/components/TrackRow';

// vitest globals are disabled in this project, so RTL's auto-cleanup never
// registers — do it by hand so each render starts from a clean DOM.
afterEach(cleanup);
afterEach(() => vi.unstubAllGlobals());

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

describe('TrackRow — stub flip + back face (Task 2.3)', () => {
  it('flips open on the gig chip and closes on the ✕', () => {
    render(<TrackRow {...makeProps()} />);
    const chip = screen.getByRole('button', { name: /MUSICBOX/ });

    // Closed: chip reports collapsed, the back-face Tickets link is inaccessible.
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();

    // Flip open → back content becomes visible/accessible.
    fireEvent.click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('link', { name: /tickets/i })).toBeTruthy();

    // ✕ closes it again.
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
  });

  it('keeps the back face inert + aria-hidden while the front is showing', () => {
    const { container } = render(<TrackRow {...makeProps()} />);
    const link = container.querySelector(
      'a[href="https://tickets.example/balthvs"]',
    );
    // The link is in the DOM but not exposed to the a11y tree while closed…
    expect(link).toBeTruthy();
    expect(screen.queryByRole('link', { name: /tickets/i })).toBeNull();
    const backWrap = link!.closest('[inert]');
    expect(backWrap).toBeTruthy();
    expect(backWrap!.getAttribute('aria-hidden')).toBe('true');

    // …and becomes accessible (no longer inert) once flipped open.
    fireEvent.click(screen.getByRole('button', { name: /MUSICBOX/ }));
    expect(screen.getByRole('link', { name: /tickets/i })).toBeTruthy();
    expect(link!.closest('[inert]')).toBeNull();
  });

  it('bills an opener as "opening for {headliner}"', () => {
    render(
      <TrackRow {...makeProps({ role: 'opener', headliner: 'KHRUANGBIN' })} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /MUSICBOX/ }));
    expect(screen.getByText(/opening for/i)).toBeTruthy();
    expect(screen.getByText('KHRUANGBIN')).toBeTruthy();
    expect(screen.queryByText(/headlining/i)).toBeNull();
  });

  it('bills a headliner as "— headlining"', () => {
    render(<TrackRow {...makeProps({ role: 'headliner' })} />);
    fireEvent.click(screen.getByRole('button', { name: /MUSICBOX/ }));
    expect(screen.getByText(/headlining/i)).toBeTruthy();
    expect(screen.queryByText(/opening for/i)).toBeNull();
  });

  it('fires the wrong-artist beacon exactly once, then reads "Thanks — noted"', () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    render(
      <TrackRow
        {...makeProps({
          report: {
            city: 'lisbon',
            window: 'next-14-days',
            artistId: 'artist-42',
            showId: 'show-99',
          },
        })}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /MUSICBOX/ }));

    fireEvent.click(screen.getByRole('button', { name: 'wrong artist?' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/report-artist');
    expect(opts.method).toBe('POST');
    expect(opts.keepalive).toBe(true);
    expect(String(opts.body)).toContain('artist-42');
    expect(String(opts.body)).toContain('show-99');

    // Control flips to the noted state and disables.
    const noted = screen.getByRole('button', { name: 'Thanks — noted' });
    expect((noted as HTMLButtonElement).disabled).toBe(true);

    // A second click does NOT fetch again.
    fireEvent.click(noted);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('points the Tickets link at ticketUrl and opens it safely in a new tab', () => {
    render(<TrackRow {...makeProps({ ticketUrl: 'https://tm.example/xyz' })} />);
    fireEvent.click(screen.getByRole('button', { name: /MUSICBOX/ }));
    const link = screen.getByRole('link', { name: /tickets/i });
    expect(link.getAttribute('href')).toBe('https://tm.example/xyz');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('honors controlled isOpen / onOpenChange (parent owns flip exclusivity)', () => {
    // A parent that only ever keeps ONE stub open — the 2.4 list contract.
    function Parent() {
      const [openId, setOpenId] = useState<string | null>(null);
      return (
        <>
          <TrackRow
            {...makeProps({ artist: 'ONE', venue: 'Alpha', ticketUrl: 'https://t/one' })}
            isOpen={openId === 'one'}
            onOpenChange={(n) => setOpenId(n ? 'one' : null)}
          />
          <TrackRow
            {...makeProps({ artist: 'TWO', venue: 'Beta', ticketUrl: 'https://t/two' })}
            isOpen={openId === 'two'}
            onOpenChange={(n) => setOpenId(n ? 'two' : null)}
          />
        </>
      );
    }
    render(<Parent />);

    // Open row ONE.
    fireEvent.click(screen.getByRole('button', { name: /ALPHA/ }));
    let links = screen.getAllByRole('link', { name: /tickets/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://t/one');

    // Opening row TWO closes row ONE — only one stub open at a time.
    fireEvent.click(screen.getByRole('button', { name: /BETA/ }));
    links = screen.getAllByRole('link', { name: /tickets/i });
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute('href')).toBe('https://t/two');
  });
});

describe('nameSizePx — prominence sizing', () => {
  it('grows with prominence', () => {
    expect(nameSizePx(0.9)).toBeGreaterThan(nameSizePx(0.3));
  });

  it('anchors on the widened four-tier cascade (0→14, 0.4→22, 0.7→34, 1→48)', () => {
    expect(nameSizePx(0)).toBe(14); // fine-print floor, lowered to widen the spread
    expect(nameSizePx(0.4)).toBe(22); // opener / lower support
    expect(nameSizePx(0.7)).toBe(34); // distinct mid act
    expect(nameSizePx(1)).toBe(48); // capped at 48 (down from 64) so wrapped names stay ~2 lines
  });

  it('keeps a distinct, glance-separable mid tier between opener and headliner', () => {
    // The mid act must sit clearly above an opener and clearly below a headliner.
    expect(nameSizePx(0.7) - nameSizePx(0.4)).toBeGreaterThanOrEqual(10);
    expect(nameSizePx(1) - nameSizePx(0.7)).toBeGreaterThanOrEqual(10);
  });

  it('defaults to the 0.5 midpoint size', () => {
    expect(nameSizePx()).toBe(nameSizePx(0.5));
  });

  it('clamps out-of-range prominence to the sane range', () => {
    expect(nameSizePx(-5)).toBe(14);
    expect(nameSizePx(9)).toBe(48);
  });
});
