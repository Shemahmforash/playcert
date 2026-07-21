import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EmptyState } from '../../src/components/EmptyState';
import { recoveryActionsForEmpty } from '../../src/lib/recoveryActions';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(cleanup);

describe('EmptyState — the bare wall (§2.6 "Empty")', () => {
  it('renders the "Nothing on the poster." headline', () => {
    render(<EmptyState city="braga" window="next-14-days" actions={[]} />);
    expect(screen.getByText('Nothing on the poster.')).toBeTruthy();
  });

  it('renders every given recovery action by its label', () => {
    const actions = recoveryActionsForEmpty({
      city: 'braga',
      window: 'tonight',
      fontStop: 'small-print',
      unfilteredHadShows: true,
    });
    render(<EmptyState city="braga" window="tonight" actions={actions} />);
    // widen route + Marquee dial link + Try another city.
    expect(screen.getByText('Try this weekend')).toBeTruthy();
    expect(screen.getByText('Marquee on the dial')).toBeTruthy();
    expect(screen.getByText('Try another city')).toBeTruthy();
  });

  it('renders a route action as an <a> to its href', () => {
    render(
      <EmptyState
        city="braga"
        window="tonight"
        actions={[
          { label: 'Try this weekend', action: { kind: 'route', href: '/braga/this-weekend' } },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: 'Try this weekend' });
    expect(link.getAttribute('href')).toBe('/braga/this-weekend');
  });

  it('renders a dialStop action as a link to the fontStop URL', () => {
    render(
      <EmptyState
        city="braga"
        window="tonight"
        actions={[
          { label: 'Marquee on the dial', action: { kind: 'dialStop', stop: 'everything' } },
        ]}
      />,
    );
    const link = screen.getByRole('link', { name: 'Marquee on the dial' });
    // everything stop → canonical path omits the fontStop segment.
    expect(link.getAttribute('href')).toBe('/braga/tonight');
  });

  it('renders openCityField as a link back to /', () => {
    render(
      <EmptyState
        city="braga"
        window="tonight"
        actions={[{ label: 'Try another city', action: { kind: 'openCityField' } }]}
      />,
    );
    const link = screen.getByRole('link', { name: 'Try another city' });
    expect(link.getAttribute('href')).toBe('/');
  });
});
