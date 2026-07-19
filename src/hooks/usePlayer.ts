'use client';
import { useReducer } from 'react';
export interface PlayerState { index: number; playing: boolean; queueLength: number }
export type PlayerAction =
  | { type: 'play' } | { type: 'pause' }
  | { type: 'skip' } | { type: 'ended' } | { type: 'error' }
  | { type: 'jump'; index: number }
  // Task 3.6: an in-place dial rebuild re-derives the queue. `retarget` syncs the
  // (otherwise mount-only) queueLength AND moves the needle to the continuity
  // index, so subsequent skip/ended clamp against the NEW last index — fixing the
  // stale-queueLength bug where `usePlayer(entries.length)` only seeded at mount.
  | { type: 'retarget'; index: number; queueLength: number; playing?: boolean };
export const initialPlayerState: PlayerState = { index: 0, playing: false, queueLength: 0 };
export function playerReducer(s: PlayerState, a: PlayerAction): PlayerState {
  const last = s.queueLength - 1;
  switch (a.type) {
    case 'play': return { ...s, playing: true };
    case 'pause': return { ...s, playing: false };
    case 'skip':
    case 'ended':
    case 'error':
      return s.index >= last ? { ...s, playing: false } : { ...s, index: s.index + 1 };
    case 'jump': return { ...s, index: Math.max(0, Math.min(last, a.index)), playing: true };
    case 'retarget': {
      const max = Math.max(0, a.queueLength - 1);
      const index = a.queueLength === 0 ? 0 : Math.max(0, Math.min(max, a.index));
      return { ...s, queueLength: a.queueLength, index, playing: a.playing ?? s.playing };
    }
  }
}
export function usePlayer(queueLength: number) {
  return useReducer(playerReducer, { ...initialPlayerState, queueLength });
}
