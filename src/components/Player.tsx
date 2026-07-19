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

  // AUTO-ADVANCE ONLY. Once the element has been unlocked by a synchronous
  // play() inside a user gesture (see start()/jumpTo() below), iOS Safari
  // permits programmatic play() on the same element for subsequent tracks.
  // This effect must NOT be the thing that starts the FIRST playback — doing
  // that here (post-render, outside the gesture) is exactly what iOS blocks.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (state.playing) void el.play().catch(() => {});
    else el.pause();
  }, [state.index, state.playing]);

  const current = tracks[state.index];

  // These run INSIDE the click handler, so play() is synchronous within the
  // user gesture — the iOS Safari audio-unlock requirement.
  const start = () => {
    void audioRef.current?.play().catch(() => {});
    dispatch({ type: 'play' });
  };
  const pause = () => {
    audioRef.current?.pause();
    dispatch({ type: 'pause' });
  };
  const jumpTo = (i: number) => {
    const el = audioRef.current;
    if (el) {
      // Set the new source and play synchronously, before React re-renders —
      // keeps the whole thing inside the user gesture for iOS.
      el.src = tracks[i].previewUrl;
      void el.play().catch(() => {});
    }
    dispatch({ type: 'jump', index: i });
  };

  if (tracks.length === 0) {
    return (
      <p className="rounded border border-dashed border-current/30 p-4 text-sm opacity-70">
        Nothing playable in this window yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <audio
        ref={audioRef}
        src={current?.previewUrl}
        onEnded={() => dispatch({ type: 'ended' })}
        onError={() => dispatch({ type: 'error' })}
        preload="metadata"
      />

      {/* Now playing */}
      <div className="flex items-baseline gap-3">
        <button
          type="button"
          aria-label={state.playing ? 'Pause' : 'Play'}
          onClick={() => (state.playing ? pause() : start())}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background text-lg leading-none"
        >
          {state.playing ? '❚❚' : '▶'}
        </button>
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{current.artist}</div>
          <div className="truncate text-sm opacity-70">
            {current.title}
            {current.show?.venue?.name ? ` · ${current.show.venue.name}` : ''}
          </div>
        </div>
        <button
          type="button"
          aria-label="Skip to next track"
          onClick={() => dispatch({ type: 'skip' })}
          className="ml-auto shrink-0 rounded-full border border-current/40 px-3 py-1.5 text-xs uppercase tracking-wide opacity-80 hover:opacity-100"
        >
          Skip ⏭
        </button>
      </div>

      {/* Queue */}
      <ol className="flex flex-col gap-px overflow-hidden rounded-md border border-current/15">
        {tracks.map((t, i) => {
          const isCurrent = i === state.index;
          const venue = t.show?.venue?.name;
          return (
            <li key={i}>
              <button
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => jumpTo(i)}
                className={`flex w-full items-baseline gap-2 px-3 py-2 text-left text-sm ${
                  isCurrent
                    ? 'bg-foreground text-background font-semibold'
                    : 'hover:bg-current/5'
                }`}
              >
                <span className="w-4 shrink-0 text-xs opacity-60">
                  {isCurrent && state.playing ? '▶' : i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{t.artist}</span>
                  <span className="opacity-70"> — {t.title}</span>
                  {venue ? <span className="opacity-50"> · {venue}</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
