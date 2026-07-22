import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  useTasteMemory,
  TASTE_STORAGE_KEY,
  TASTE_STORAGE_KEY_V1,
  type HeartedSong,
} from '../../src/hooks/useTasteMemory';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

/** A complete, valid HeartedSong snapshot — overridable per test. */
function makeSong(overrides: Partial<HeartedSong> = {}): HeartedSong {
  return {
    itunesTrackId: 1440,
    title: 'Starburster',
    artist: 'Fontaines D.C.',
    artistId: 'artist-fontaines',
    previewUrl: 'https://audio.example/preview.m4a',
    artworkUrl: 'https://img.example/art.jpg',
    itunesUrl: 'https://music.apple.com/track/1440',
    heartedAt: '2026-07-22T12:00:00.000Z',
    gig: {
      venue: 'Paradise',
      city: 'Lisbon',
      startsAt: '2026-07-25T20:00:00.000Z',
      ticketUrl: 'https://www.jambase.com/show/1',
    },
    ...overrides,
  };
}

describe('useTasteMemory (v2)', () => {
  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useTasteMemory());
    expect(result.current.heartedSongs).toEqual([]);
    expect([...result.current.skipped]).toEqual([]);
  });

  it('toggleHeartSong persists the full snapshot under the v2 key and restores across a remount', () => {
    const song = makeSong();
    const first = renderHook(() => useTasteMemory());

    act(() => first.result.current.toggleHeartSong(song));
    expect(first.result.current.heartedSongs).toEqual([song]);
    expect(first.result.current.isHearted(song.itunesTrackId)).toBe(true);

    // It was written under the versioned v2 key — the whole snapshot, gig included.
    const raw = localStorage.getItem(TASTE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).heartedSongs).toEqual([song]);

    // A fresh mount (new component instance) hydrates it back.
    first.unmount();
    const second = renderHook(() => useTasteMemory());
    expect(second.result.current.heartedSongs).toEqual([song]);
    expect(second.result.current.isHearted(song.itunesTrackId)).toBe(true);
  });

  it('toggleHeartSong is a toggle — a second call with the same itunesTrackId removes it', () => {
    const { result } = renderHook(() => useTasteMemory());
    act(() => result.current.toggleHeartSong(makeSong()));
    expect(result.current.isHearted(1440)).toBe(true);

    // Even a snapshot with *different* metadata unhears — identity is the track id.
    act(() => result.current.toggleHeartSong(makeSong({ title: 'Renamed' })));
    expect(result.current.isHearted(1440)).toBe(false);
    expect(result.current.heartedSongs).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem(TASTE_STORAGE_KEY) as string).heartedSongs,
    ).toEqual([]);
  });

  it('never duplicates a track id, even if storage already holds duplicates', () => {
    // Simulate a corrupt/duplicated stored list — the same id twice.
    const dupe = makeSong();
    localStorage.setItem(
      TASTE_STORAGE_KEY,
      JSON.stringify({ heartedSongs: [dupe, dupe], skipped: [] }),
    );
    const { result } = renderHook(() => useTasteMemory());

    // One toggle removes EVERY copy of that id (toggle lands on "not hearted").
    act(() => result.current.toggleHeartSong(makeSong()));
    expect(result.current.heartedSongs).toEqual([]);
  });

  it('keeps distinct tracks independent', () => {
    const a = makeSong({ itunesTrackId: 1 });
    const b = makeSong({ itunesTrackId: 2, title: 'In ár gCroíthe go deo' });
    const { result } = renderHook(() => useTasteMemory());

    act(() => result.current.toggleHeartSong(a));
    act(() => result.current.toggleHeartSong(b));
    expect(result.current.heartedSongs).toEqual([a, b]);

    act(() => result.current.toggleHeartSong(a));
    expect(result.current.heartedSongs).toEqual([b]);
    expect(result.current.isHearted(1)).toBe(false);
    expect(result.current.isHearted(2)).toBe(true);
  });

  it('markSkipped persists and restores across a remount', () => {
    const first = renderHook(() => useTasteMemory());
    act(() => first.result.current.markSkipped('artist-2'));
    expect(first.result.current.skipped.has('artist-2')).toBe(true);

    first.unmount();
    const second = renderHook(() => useTasteMemory());
    expect(second.result.current.skipped.has('artist-2')).toBe(true);
  });

  it('markSkipped is idempotent (marking the same id twice keeps one entry)', () => {
    const { result } = renderHook(() => useTasteMemory());
    act(() => result.current.markSkipped('x'));
    act(() => result.current.markSkipped('x'));
    expect([...result.current.skipped]).toEqual(['x']);
  });

  describe('v1 → v2 migration', () => {
    it('carries skipped forward, drops artist-hearts, writes v2, removes v1', () => {
      localStorage.setItem(
        TASTE_STORAGE_KEY_V1,
        JSON.stringify({ hearted: ['artist-1', 'artist-9'], skipped: ['artist-2'] }),
      );

      const { result } = renderHook(() => useTasteMemory());

      // skipped survives; artist-hearts cannot become songs, so they're gone.
      expect([...result.current.skipped]).toEqual(['artist-2']);
      expect(result.current.heartedSongs).toEqual([]);

      // The migration is one-time: v2 is now the record, v1 is removed.
      const v2 = JSON.parse(localStorage.getItem(TASTE_STORAGE_KEY) as string);
      expect(v2).toEqual({ heartedSongs: [], skipped: ['artist-2'] });
      expect(localStorage.getItem(TASTE_STORAGE_KEY_V1)).toBeNull();
    });

    it('ignores v1 when v2 already exists (migration never overwrites v2)', () => {
      const song = makeSong();
      localStorage.setItem(
        TASTE_STORAGE_KEY,
        JSON.stringify({ heartedSongs: [song], skipped: ['kept-v2'] }),
      );
      localStorage.setItem(
        TASTE_STORAGE_KEY_V1,
        JSON.stringify({ hearted: ['artist-1'], skipped: ['stale-v1'] }),
      );

      const { result } = renderHook(() => useTasteMemory());
      expect(result.current.heartedSongs).toEqual([song]);
      expect([...result.current.skipped]).toEqual(['kept-v2']);
    });

    it('treats malformed v1 JSON as nothing to migrate', () => {
      localStorage.setItem(TASTE_STORAGE_KEY_V1, '{ not json ]');
      const { result } = renderHook(() => useTasteMemory());
      expect(result.current.heartedSongs).toEqual([]);
      expect([...result.current.skipped]).toEqual([]);
    });

    it('migrates a v1 record whose skipped is the wrong shape without inventing garbage', () => {
      // A string is iterable — without sanitization `new Set('nope')` would
      // hydrate {'n','o','p','e'} and the persist effect would write that
      // garbage into v2 permanently (v1 is already deleted by then).
      localStorage.setItem(
        TASTE_STORAGE_KEY_V1,
        JSON.stringify({ hearted: [], skipped: 'nope' }),
      );
      const { result } = renderHook(() => useTasteMemory());
      expect([...result.current.skipped]).toEqual([]);
      const v2 = JSON.parse(localStorage.getItem(TASTE_STORAGE_KEY) as string);
      expect(v2.skipped).toEqual([]);
    });

    it('filters non-string entries out of a v1 skipped array', () => {
      localStorage.setItem(
        TASTE_STORAGE_KEY_V1,
        JSON.stringify({ skipped: ['keep', 42, null, {}] }),
      );
      const { result } = renderHook(() => useTasteMemory());
      expect([...result.current.skipped]).toEqual(['keep']);
    });
  });

  it('treats malformed stored JSON as empty and never throws', () => {
    localStorage.setItem(TASTE_STORAGE_KEY, '{ this is : not valid json ]');
    expect(() => {
      const { result } = renderHook(() => useTasteMemory());
      expect(result.current.heartedSongs).toEqual([]);
      expect([...result.current.skipped]).toEqual([]);
    }).not.toThrow();
  });

  it('tolerates stored JSON of the wrong shape (missing / mistyped fields)', () => {
    localStorage.setItem(
      TASTE_STORAGE_KEY,
      JSON.stringify({ heartedSongs: 'nope', skipped: 42 }),
    );
    const { result } = renderHook(() => useTasteMemory());
    expect(result.current.heartedSongs).toEqual([]);
    expect([...result.current.skipped]).toEqual([]);
  });

  it('drops a snapshot whose gig.startsAt is not a calendar-date ISO (it would crash the shelf)', () => {
    // The shelf renders every stub through `dateLabelFor`, whose calendarParts
    // THROWS on any string without a leading YYYY-MM-DD. A merely-string
    // startsAt ("TBA", a single-digit month) would pass a typeof check, hydrate,
    // and then crash the whole screen render on every shelf open — the exact
    // half-rendered outcome the strict validator exists to prevent.
    const good = makeSong();
    const tba = makeSong({
      itunesTrackId: 8,
      gig: { ...good.gig, startsAt: 'TBA' },
    });
    const looseIso = makeSong({
      itunesTrackId: 9,
      gig: { ...good.gig, startsAt: '2026-8-1T20:00' }, // unpadded month/day
    });
    localStorage.setItem(
      TASTE_STORAGE_KEY,
      JSON.stringify({ heartedSongs: [good, tba, looseIso], skipped: [] }),
    );
    const { result } = renderHook(() => useTasteMemory());
    expect(result.current.heartedSongs).toEqual([good]);
  });

  it('drops individual malformed hearted entries but keeps the valid ones', () => {
    const good = makeSong();
    localStorage.setItem(
      TASTE_STORAGE_KEY,
      JSON.stringify({
        heartedSongs: [
          good,
          null,
          'a string',
          { itunesTrackId: 'not-a-number', title: 'x' }, // wrong id type
          { ...makeSong({ itunesTrackId: 7 }), gig: null }, // gig snapshot missing
        ],
        skipped: [],
      }),
    );
    const { result } = renderHook(() => useTasteMemory());
    expect(result.current.heartedSongs).toEqual([good]);
  });

  it('is a safe no-op when localStorage is unavailable (private mode / SSR-like)', () => {
    const getSpy = vi
      .spyOn(Storage.prototype, 'getItem')
      .mockImplementation(() => {
        throw new Error('localStorage unavailable');
      });
    const setSpy = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('localStorage unavailable');
      });

    expect(() => {
      const { result } = renderHook(() => useTasteMemory());
      // Reads must not throw…
      expect(result.current.heartedSongs).toEqual([]);
      // …and neither must writes — the heart still works in memory.
      act(() => result.current.toggleHeartSong(makeSong()));
      expect(result.current.isHearted(1440)).toBe(true);
    }).not.toThrow();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
