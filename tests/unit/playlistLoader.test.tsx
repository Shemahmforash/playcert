import { afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { PlaylistLoader } from '../../src/components/PlaylistLoader';
import type { CityWindowBundle } from '../../src/lib/types';

// vitest globals are disabled in this project → register RTL cleanup by hand.
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const emptyBundle = { tracks: [], shows: [{ id: 's' }] } as unknown as CityWindowBundle;

/**
 * PlaylistLoader is the fix for the iOS Safari cold-load black screen: the page's
 * SSR closes instantly with this component's initial LoadingTheater, and the bundle
 * is fetched client-side from /api/bundle. These lock the three non-happy branches
 * (loading / error / empty); the happy path is covered end-to-end by the e2e smoke.
 */
describe('PlaylistLoader — client bundle load', () => {
  it('renders the LoadingTheater immediately, before the fetch resolves', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // never resolves
    render(<PlaylistLoader city="london" window="next-14-days" fontStop="everything" />);
    expect(screen.getByRole('status')).toBeTruthy(); // LoadingTheater is a polite status region
  });

  it('falls back to ErrorState when the bundle fetch is not ok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502 })));
    render(<PlaylistLoader city="london" window="next-14-days" fontStop="everything" />);
    await waitFor(() => expect(screen.getByText('The poster wall is down.')).toBeTruthy());
  });

  it('shows EmptyState (with escape hatches) when the bundle has no playable tracks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => emptyBundle })));
    render(<PlaylistLoader city="london" window="next-14-days" fontStop="everything" />);
    await waitFor(() => expect(screen.getByText('Try another city')).toBeTruthy());
  });
});
