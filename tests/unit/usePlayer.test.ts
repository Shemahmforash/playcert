import { describe, it, expect } from 'vitest';
import { playerReducer, initialPlayerState } from '../../src/hooks/usePlayer';
const state3 = { ...initialPlayerState, queueLength: 3 };
describe('playerReducer', () => {
  it('advances on ended', () => {
    const s = playerReducer({ ...state3, index: 0, playing: true }, { type: 'ended' });
    expect(s.index).toBe(1); expect(s.playing).toBe(true);
  });
  it('advances on error (auto-skip broken previews)', () => {
    const s = playerReducer({ ...state3, index: 1, playing: true }, { type: 'error' });
    expect(s.index).toBe(2);
  });
  it('stops (not crash) past the last track', () => {
    const s = playerReducer({ ...state3, index: 2, playing: true }, { type: 'ended' });
    expect(s.playing).toBe(false); expect(s.index).toBe(2);
  });
  it('skip is user-advance with same clamping', () => {
    const s = playerReducer({ ...state3, index: 2, playing: true }, { type: 'skip' });
    expect(s.index).toBe(2);
  });
});
