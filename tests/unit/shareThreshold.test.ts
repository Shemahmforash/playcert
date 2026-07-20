import { afterEach, describe, it, expect } from 'vitest';
import { cleanup, renderHook, act } from '@testing-library/react';
import {
  useShareThreshold,
  shareThresholdReducer,
  initialShareThresholdState,
} from '../../src/hooks/useShareThreshold';

/**
 * Task 4.2 — the earned-share threshold (the growth core's gate).
 *
 * Sharing is EARNED, never a wall before first sound. The pure reducer is tested
 * directly (DOM-free); the hook is exercised via renderHook for the sticky flag
 * and the `suppressed` override.
 *
 * RULE: earned when TWO DISTINCT previews each reach ≥15s, OR ≥20s of active
 * interaction accrues. Sticky once true. `suppressed` forces the returned value
 * false regardless.
 */

afterEach(() => cleanup());

describe('shareThresholdReducer — pure earn rule', () => {
  it('two DISTINCT previews each ≥15s → earned', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 15 });
    expect(s.earned).toBe(false); // one is not enough
    s = shareThresholdReducer(s, { type: 'preview', index: 1, seconds: 16 });
    expect(s.earned).toBe(true);
  });

  it('a single preview at 30s → NOT earned (needs two distinct)', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 30 });
    expect(s.earned).toBe(false);
    expect(s.previews).toEqual([0]);
  });

  it('the SAME preview index counted twice does not satisfy "two distinct"', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 18 });
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 29 });
    expect(s.previews).toEqual([0]);
    expect(s.earned).toBe(false);
  });

  it('a 14s preview does not count', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 14 });
    s = shareThresholdReducer(s, { type: 'preview', index: 1, seconds: 14 });
    expect(s.previews).toEqual([]);
    expect(s.earned).toBe(false);
  });

  it('≥20s of accrued interaction → earned', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'interaction', seconds: 12 });
    expect(s.earned).toBe(false);
    s = shareThresholdReducer(s, { type: 'interaction', seconds: 8 });
    expect(s.interactionSeconds).toBe(20);
    expect(s.earned).toBe(true);
  });

  it('below both thresholds → not earned', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 15 });
    s = shareThresholdReducer(s, { type: 'interaction', seconds: 10 });
    expect(s.earned).toBe(false);
  });

  it('once earned, stays earned even as later signals arrive', () => {
    let s = initialShareThresholdState();
    s = shareThresholdReducer(s, { type: 'interaction', seconds: 20 });
    expect(s.earned).toBe(true);
    // A later no-op signal must not un-earn it.
    s = shareThresholdReducer(s, { type: 'preview', index: 0, seconds: 2 });
    expect(s.earned).toBe(true);
  });
});

describe('useShareThreshold — hook behaviour', () => {
  it('flips earned once two distinct previews reach ≥15s and stays earned', () => {
    const { result } = renderHook(() => useShareThreshold({}));
    expect(result.current.earned).toBe(false);

    act(() => result.current.notePreviewProgress(0, 15));
    expect(result.current.earned).toBe(false);
    act(() => result.current.notePreviewProgress(1, 15));
    expect(result.current.earned).toBe(true);

    // Sticky.
    act(() => result.current.noteInteraction(0));
    expect(result.current.earned).toBe(true);
  });

  it('earns via ≥20s of accrued interaction', () => {
    const { result } = renderHook(() => useShareThreshold({}));
    act(() => result.current.noteInteraction(20));
    expect(result.current.earned).toBe(true);
  });

  it('suppressed:true → never earned even past thresholds', () => {
    const { result } = renderHook(() => useShareThreshold({ suppressed: true }));
    act(() => {
      result.current.notePreviewProgress(0, 30);
      result.current.notePreviewProgress(1, 30);
      result.current.noteInteraction(50);
    });
    expect(result.current.earned).toBe(false);
  });
});
