import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, fireEvent, screen } from '@testing-library/react';
import { useAutoScroll } from '../../src/hooks/useAutoScroll';

// A minimal harness: the container carries containerRef, a single child carries
// itemRef (the "active" row). We drive `activeIndex` via props / rerender.
function Harness({ activeIndex }: { activeIndex: number }) {
  const { containerRef, itemRef } = useAutoScroll(activeIndex);
  return createElement(
    'div',
    { ref: containerRef, 'data-testid': 'container' },
    createElement('div', { ref: itemRef, 'data-testid': 'item' }),
  );
}

let scrollSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom has no scrollIntoView — install a spy on the prototype.
  scrollSpy = vi.fn();
  (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView =
    scrollSpy;
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete (Element.prototype as unknown as { scrollIntoView?: unknown })
    .scrollIntoView;
});

describe('useAutoScroll', () => {
  it('does not scroll while activeIndex is negative (no active row)', () => {
    render(createElement(Harness, { activeIndex: -1 }));
    expect(scrollSpy).not.toHaveBeenCalled();
  });

  it('scrolls the active row into view when activeIndex changes', () => {
    const { rerender } = render(createElement(Harness, { activeIndex: -1 }));
    expect(scrollSpy).not.toHaveBeenCalled();

    rerender(createElement(Harness, { activeIndex: 2 }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('suppresses auto-scroll for 5s after a manual scroll, then resumes', () => {
    const { rerender } = render(createElement(Harness, { activeIndex: -1 }));

    // Manual scroll on the container → arms the 5s suppression window.
    fireEvent.scroll(screen.getByTestId('container'));

    // An activeIndex change inside the window must NOT auto-scroll.
    rerender(createElement(Harness, { activeIndex: 0 }));
    expect(scrollSpy).not.toHaveBeenCalled();

    // Still suppressed just before the window closes.
    vi.advanceTimersByTime(4999);
    rerender(createElement(Harness, { activeIndex: 1 }));
    expect(scrollSpy).not.toHaveBeenCalled();

    // Past 5s the suppression lifts and auto-scroll resumes.
    vi.advanceTimersByTime(2);
    rerender(createElement(Harness, { activeIndex: 2 }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('also suppresses after keyboard row-focus (focusin) for 5s', () => {
    const { rerender } = render(createElement(Harness, { activeIndex: -1 }));

    fireEvent.focusIn(screen.getByTestId('container'));
    rerender(createElement(Harness, { activeIndex: 0 }));
    expect(scrollSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(5001);
    rerender(createElement(Harness, { activeIndex: 1 }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);
  });

  it('does not treat its own programmatic scroll as a manual scroll', () => {
    const { rerender } = render(createElement(Harness, { activeIndex: -1 }));

    // Programmatic auto-scroll fires…
    rerender(createElement(Harness, { activeIndex: 0 }));
    expect(scrollSpy).toHaveBeenCalledTimes(1);

    // …the scroll event it induces must NOT arm suppression, so the next
    // activeIndex change still auto-scrolls.
    fireEvent.scroll(screen.getByTestId('container'));
    rerender(createElement(Harness, { activeIndex: 1 }));
    expect(scrollSpy).toHaveBeenCalledTimes(2);
  });

  it('is SSR/jsdom-safe when the element has no scrollIntoView', () => {
    delete (Element.prototype as unknown as { scrollIntoView?: unknown })
      .scrollIntoView;
    // Must not throw even though scrollIntoView is unavailable.
    expect(() => {
      const { rerender } = render(createElement(Harness, { activeIndex: -1 }));
      rerender(createElement(Harness, { activeIndex: 0 }));
    }).not.toThrow();
  });
});
