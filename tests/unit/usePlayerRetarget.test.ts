import { describe, it, expect } from 'vitest';
import { playerReducer, initialPlayerState } from '../../src/hooks/usePlayer';

/**
 * Task 3.6 — the `retarget` action + the stale-queueLength fix.
 *
 * `usePlayer(entries.length)` only seeds queueLength at MOUNT; after an in-place
 * dial rebuild the queue length changes but useReducer ignores the arg. `retarget`
 * syncs queueLength (and moves + clamps the index) so subsequent skip/ended clamp
 * against the NEW last index instead of the stale one.
 */

describe('playerReducer — retarget', () => {
  it('updates queueLength, clamps the index into range, and preserves playing by default', () => {
    const s = playerReducer(
      { ...initialPlayerState, index: 4, playing: true, queueLength: 10 },
      { type: 'retarget', index: 5, queueLength: 3 },
    );
    expect(s.queueLength).toBe(3);
    expect(s.index).toBe(2); // clamped to max(0, 3-1)
    expect(s.playing).toBe(true); // omitted → unchanged
  });

  it('honors an explicit playing flag', () => {
    const s = playerReducer(
      { ...initialPlayerState, index: 0, playing: true, queueLength: 5 },
      { type: 'retarget', index: 1, queueLength: 5, playing: false },
    );
    expect(s.playing).toBe(false);
    expect(s.index).toBe(1);
  });

  it('empty queue → index 0', () => {
    const s = playerReducer(
      { ...initialPlayerState, index: 3, playing: true, queueLength: 8 },
      { type: 'retarget', index: 2, queueLength: 0 },
    );
    expect(s.queueLength).toBe(0);
    expect(s.index).toBe(0);
  });

  it('a subsequent skip clamps against the NEW queueLength (stale-bug fix)', () => {
    // Before the fix: queueLength stayed 10, so skip from index 2 would advance to
    // 3 (past the real last index 2). After retarget to length 3, skip must stop.
    let s = { ...initialPlayerState, index: 4, playing: true, queueLength: 10 };
    s = playerReducer(s, { type: 'retarget', index: 2, queueLength: 3 });
    s = playerReducer(s, { type: 'skip' });
    expect(s.index).toBe(2); // clamped at the new last index
    expect(s.playing).toBe(false); // stopped, not advanced past the end
  });

  it('a subsequent ended clamps against the NEW queueLength', () => {
    let s = { ...initialPlayerState, index: 9, playing: true, queueLength: 10 };
    s = playerReducer(s, { type: 'retarget', index: 1, queueLength: 2 });
    // index 1 is the new last (length 2) → ended stops rather than advancing.
    s = playerReducer(s, { type: 'ended' });
    expect(s.index).toBe(1);
    expect(s.playing).toBe(false);
  });
});
