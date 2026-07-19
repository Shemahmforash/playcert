import { afterEach, describe, it, expect, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import {
  useTasteMemory,
  TASTE_STORAGE_KEY,
} from '../../src/hooks/useTasteMemory';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('useTasteMemory', () => {
  it('starts empty when nothing is stored', () => {
    const { result } = renderHook(() => useTasteMemory());
    expect([...result.current.hearted]).toEqual([]);
    expect([...result.current.skipped]).toEqual([]);
  });

  it('toggleHeart persists to localStorage and restores across a remount', () => {
    const first = renderHook(() => useTasteMemory());

    act(() => first.result.current.toggleHeart('artist-1'));
    expect(first.result.current.hearted.has('artist-1')).toBe(true);

    // It was written under the versioned key.
    const raw = localStorage.getItem(TASTE_STORAGE_KEY);
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw as string).hearted).toContain('artist-1');

    // A fresh mount (new component instance) hydrates it back.
    first.unmount();
    const second = renderHook(() => useTasteMemory());
    expect(second.result.current.hearted.has('artist-1')).toBe(true);
  });

  it('toggleHeart is a toggle — a second call removes the id', () => {
    const { result } = renderHook(() => useTasteMemory());
    act(() => result.current.toggleHeart('a'));
    expect(result.current.hearted.has('a')).toBe(true);
    act(() => result.current.toggleHeart('a'));
    expect(result.current.hearted.has('a')).toBe(false);
    expect(JSON.parse(localStorage.getItem(TASTE_STORAGE_KEY) as string).hearted).toEqual(
      [],
    );
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

  it('treats malformed stored JSON as empty and never throws', () => {
    localStorage.setItem(TASTE_STORAGE_KEY, '{ this is : not valid json ]');
    expect(() => {
      const { result } = renderHook(() => useTasteMemory());
      expect([...result.current.hearted]).toEqual([]);
      expect([...result.current.skipped]).toEqual([]);
    }).not.toThrow();
  });

  it('tolerates stored JSON of the wrong shape (missing arrays)', () => {
    localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify({ hearted: 'nope' }));
    const { result } = renderHook(() => useTasteMemory());
    expect([...result.current.hearted]).toEqual([]);
    expect([...result.current.skipped]).toEqual([]);
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
      expect([...result.current.hearted]).toEqual([]);
      // …and neither must writes.
      act(() => result.current.toggleHeart('z'));
      expect(result.current.hearted.has('z')).toBe(true);
    }).not.toThrow();

    getSpy.mockRestore();
    setSpy.mockRestore();
  });
});
