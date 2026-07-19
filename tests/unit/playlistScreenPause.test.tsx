import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { PlaylistScreen } from '../../src/components/PlaylistScreen';
import type { Artist, CityWindowBundle, Show, Track } from '../../src/lib/types';
import type { Geo } from '../../src/lib/api/geo';

/**
 * Regression: the row play/pause button must PAUSE the current track, not restart
 * it. The bug was that a row button always called `onPlayIndex` → `jumpTo(i)`,
 * and `jumpTo` re-assigns `el.src` (reloading the element from 0). For the row
 * that is ALREADY current, the handler must instead toggle pause/resume — which
 * never touches `src`.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

beforeEach(() => {
  window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
  window.HTMLMediaElement.prototype.pause = vi.fn();
});
afterEach(() => cleanup());

const mkArtist = (id: string, name: string): Artist => ({
  id,
  rawNames: [name],
  normalizedName: name,
  isTribute: false,
  prominence: 0.5,
  tier: 'mid',
  billingSlots: [],
});
const mkTrack = (artistId: string, n: number): Track => ({
  artistId,
  itunesTrackId: n,
  title: `${artistId}-title-${n}`,
  previewUrl: `https://audio.example/${n}.m4a`,
  artworkUrl: `https://art.example/${n}.jpg`,
  itunesUrl: `https://itunes.example/${n}`,
  confidence: 'exact',
});
const mkShow = (id: string, startsAt: string, artistIds: string[]): Show => ({
  id,
  name: `Show ${id}`,
  startsAt,
  venue: { name: `V-${id}`, city: 'London' },
  ticketUrl: `https://t/${id}`,
  attractions: artistIds.map((a) => ({ id: a, name: a })),
  artistIds,
});
const geo: Geo = { lat: 51.5, lng: -0.12, displayName: 'London', countryCode: 'GB', tz: 'Europe/London' };

const bundle: CityWindowBundle = {
  key: { city: 'london', window: 'tonight' },
  builtAt: '2026-08-01T00:00:00.000Z',
  geo,
  shows: [mkShow('s1', '2026-08-01T20:00:00', ['a1', 'a2'])],
  artists: { a1: mkArtist('a1', 'ALPHA'), a2: mkArtist('a2', 'BETA') },
  tracks: [mkTrack('a1', 1), mkTrack('a2', 2)],
  posterCount: 1,
  belowBar: false,
};

describe('PlaylistScreen — row play/pause does not restart the current track', () => {
  it('pauses (never re-assigns src) when the CURRENT row button is tapped again', () => {
    const { container } = render(
      <PlaylistScreen bundle={bundle} fontStop="everything" city="london" window="tonight" />,
    );
    const audio = container.querySelector('audio') as HTMLAudioElement;
    const playSpy = window.HTMLMediaElement.prototype.play as ReturnType<typeof vi.fn>;
    const pauseSpy = window.HTMLMediaElement.prototype.pause as ReturnType<typeof vi.fn>;

    // Row 0 is the current index. First tap plays it.
    const rowBtn = screen.getByLabelText('Play preview of ALPHA');
    fireEvent.click(rowBtn);
    expect(playSpy).toHaveBeenCalled();

    // Now count any src re-assignment; toggling pause must NOT touch src.
    let srcSets = 0;
    const desc = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src')!;
    Object.defineProperty(audio, 'src', {
      configurable: true,
      get() {
        return desc.get!.call(this);
      },
      set(v) {
        srcSets++;
        desc.set!.call(this, v);
      },
    });

    // Second tap on the SAME (now-playing) row = pause, not replay.
    fireEvent.click(rowBtn);
    expect(pauseSpy).toHaveBeenCalled();
    expect(srcSets).toBe(0); // the restart bug re-set src here
  });

  it('a DIFFERENT row still jumps to that track (navigation not broken by the fix)', () => {
    const { container } = render(
      <PlaylistScreen bundle={bundle} fontStop="everything" city="london" window="tonight" />,
    );
    const audio = container.querySelector('audio') as HTMLAudioElement;
    // Current is ALPHA (index 0). Tapping the non-current BETA row jumps to it and
    // loads BETA's preview onto the single <audio> element.
    fireEvent.click(screen.getByLabelText('Play preview of BETA'));
    expect(audio.getAttribute('src')).toContain('/2.m4a'); // BETA's previewUrl
  });
});
