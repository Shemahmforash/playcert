'use client';
import { useEffect, useRef } from 'react';
import type { Show } from '@/lib/types';
import { usePlayer } from '@/hooks/usePlayer';

export interface PlayerTrack {
  artist: string;
  title: string;
  previewUrl: string;
  show: Show;
}

export function Player({ tracks }: { tracks: PlayerTrack[] }) {
  const [state, dispatch] = usePlayer(tracks.length);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Drive the single reused <audio> element from reducer state.
  // No autoplay on mount: playback only starts once state.playing flips true
  // via the user's Play tap (mobile audio-unlock requirement). On advance
  // (index change) while already playing, this re-fires play() for the next
  // track's src, chaining after that single initial user gesture.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state.playing) {
      void el.play().catch(() => {
        /* rejected play (e.g. no gesture yet / broken src) — onError handles skip */
      });
    } else {
      el.pause();
    }
  }, [state.playing, state.index]);

  const current = tracks[state.index];

  if (tracks.length === 0) {
    return <p className="text-sm text-neutral-500">nothing playable</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <audio
        ref={audioRef}
        src={current?.previewUrl}
        onEnded={() => dispatch({ type: 'ended' })}
        onError={() => dispatch({ type: 'error' })}
        preload="none"
      />

      <div className="flex gap-2">
        <button
          type="button"
          className="border px-3 py-1 text-sm"
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={() => dispatch({ type: state.playing ? 'pause' : 'play' })}
        >
          {state.playing ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          className="border px-3 py-1 text-sm"
          aria-label="Skip to next track"
          onClick={() => dispatch({ type: 'skip' })}
        >
          Skip
        </button>
      </div>

      <ol className="flex flex-col gap-1">
        {tracks.map((t, i) => {
          const isCurrent = i === state.index;
          const venue = t.show?.venue?.name;
          return (
            <li key={i}>
              <button
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                className={`w-full text-left text-sm px-1 ${isCurrent ? 'font-bold bg-neutral-100' : ''}`}
                onClick={() => dispatch({ type: 'jump', index: i })}
              >
                {t.artist} — {t.title}
                {venue ? ` — ${venue}` : ''}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
