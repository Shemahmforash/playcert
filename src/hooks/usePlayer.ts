'use client';
import { useReducer } from 'react';
export interface PlayerState { index: number; playing: boolean; queueLength: number }
export type PlayerAction =
  | { type: 'play' } | { type: 'pause' }
  | { type: 'skip' } | { type: 'ended' } | { type: 'error' }
  | { type: 'jump'; index: number };
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
  }
}
export function usePlayer(queueLength: number) {
  return useReducer(playerReducer, { ...initialPlayerState, queueLength });
}
