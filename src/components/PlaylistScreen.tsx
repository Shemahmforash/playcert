'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Artist, TimeWindow } from '../lib/types';
import type { PlaylistEntry } from '../lib/pipeline/order';
import { usePlayer } from '../hooks/usePlayer';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { PlaylistList } from './PlaylistList';
import { RadioPlayer } from './RadioPlayer';

/**
 * PlaylistScreen — the client container that owns the audio + player state and
 * wires the shared list ↔ RadioPlayer bar (Task 2.5).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.3. This is where the
 * hard-won, real-device-verified iOS-safe audio pattern lives (ported verbatim
 * from the old `Player.tsx`):
 *   - a SINGLE reused `<audio>` element (never one-per-track);
 *   - the FIRST `play()` is always called SYNCHRONOUSLY inside the user gesture
 *     (toggle / row-play / same-bill jump), which is what unlocks the element on
 *     iOS Safari — an effect must NEVER be the thing that starts first playback;
 *   - `jumpTo` sets `el.src` then `play()` synchronously, still inside the tap;
 *   - once unlocked, an effect drives auto-advance play/pause on index change.
 *
 * Task 2.5 hardening on top of that: a 300ms inter-track gap before the NEXT
 * track's playback on natural end, and a prompt (<500ms) auto-skip on preview
 * error. No autoplay ever.
 */

// Inter-track silence before the next preview begins (design §1.4 `--gap-track`).
const INTER_TRACK_GAP_MS = 300;
// Full preview length; used as the progress-ring denominator until metadata lands.
const PREVIEW_SECONDS = 30;
const HEART_STORAGE_KEY = 'smallfont:hearts';

export interface PlaylistScreenProps {
  entries: PlaylistEntry[];
  artists: Record<string, Artist>;
  city: string;
  window: TimeWindow;
  widened?: unknown;
  belowBar?: boolean;
}

export function PlaylistScreen({
  entries,
  artists,
  city,
  window: timeWindow,
  widened,
  belowBar,
}: PlaylistScreenProps) {
  const [state, dispatch] = usePlayer(entries.length);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);

  // When true, the NEXT [index,playing] effect run waits INTER_TRACK_GAP_MS
  // before play() — armed only by a natural `ended`, never by a user gesture or
  // an error auto-skip (those must feel immediate).
  const gapRef = useRef(false);

  const { containerRef, itemRef } = useAutoScroll<HTMLDivElement, HTMLLIElement>(
    state.index,
  );

  // ── Hearts (localStorage-backed, artistId keyed) ──────────────────────────
  const [heartedIds, setHeartedIds] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(HEART_STORAGE_KEY);
      if (raw) setHeartedIds(new Set(JSON.parse(raw) as string[]));
    } catch {
      // ignore corrupt / unavailable storage — hearts are non-essential.
    }
  }, []);
  const onHeart = useCallback((artistId: string) => {
    setHeartedIds((prev) => {
      const next = new Set(prev);
      if (next.has(artistId)) next.delete(artistId);
      else next.add(artistId);
      try {
        localStorage.setItem(HEART_STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore storage failures.
      }
      return next;
    });
  }, []);

  const current = entries[state.index];

  // AUTO-ADVANCE ONLY. Once the element is unlocked by a synchronous play()
  // inside a user gesture (toggle/jump below), iOS Safari permits programmatic
  // play() on the SAME element for subsequent tracks. This effect must NOT be
  // what starts the FIRST playback.
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (!state.playing) {
      el.pause();
      return;
    }
    if (gapRef.current) {
      // Natural end → honour the 300ms inter-track silence before the next play.
      gapRef.current = false;
      const id = setTimeout(() => {
        void el.play().catch(() => {});
      }, INTER_TRACK_GAP_MS);
      return () => clearTimeout(id);
    }
    void el.play().catch(() => {});
  }, [state.index, state.playing]);

  // Reset the ring whenever the active track changes.
  useEffect(() => {
    setProgress(0);
  }, [state.index]);

  // ── Gesture handlers — play() is SYNCHRONOUS within the tap (iOS unlock) ───
  const toggle = () => {
    const el = audioRef.current;
    if (state.playing) {
      el?.pause();
      dispatch({ type: 'pause' });
    } else {
      void el?.play().catch(() => {});
      dispatch({ type: 'play' });
    }
  };

  const jumpTo = (i: number) => {
    const el = audioRef.current;
    if (el) {
      // Set src + play synchronously, before React re-renders — keeps the whole
      // thing inside the user gesture for iOS.
      const url = entries[i]?.track.previewUrl;
      if (url) el.src = url;
      void el.play().catch(() => {});
    }
    dispatch({ type: 'jump', index: i });
  };

  const onTimeUpdate = () => {
    const el = audioRef.current;
    if (!el) return;
    const dur =
      Number.isFinite(el.duration) && el.duration > 0 ? el.duration : PREVIEW_SECONDS;
    setProgress(Math.min(1, el.currentTime / dur));
  };

  if (entries.length === 0) {
    return (
      <p className="rounded border border-dashed border-current/30 p-4 text-sm opacity-70">
        Nothing playable in this window yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The SINGLE reused audio element. Auto-advance on end (with the 300ms gap
          armed here) and prompt auto-skip on preview error. */}
      <audio
        ref={audioRef}
        src={current?.track.previewUrl}
        onEnded={() => {
          gapRef.current = true; // arm the inter-track gap for the next play
          dispatch({ type: 'ended' });
        }}
        onError={() => dispatch({ type: 'error' })} // prompt <500ms auto-skip
        onTimeUpdate={onTimeUpdate}
        preload="metadata"
      />

      {widened ? (
        <p className="text-sm text-foreground opacity-60">
          Quiet week — widened the search.
        </p>
      ) : null}
      {belowBar ? (
        <p className="text-sm text-foreground opacity-60">
          Showing the first few — reload in a minute and we&apos;ll have dug up more.
        </p>
      ) : null}

      {/* Scroll container for useAutoScroll; padded so the sticky bar never
          covers the final rows. */}
      <div ref={containerRef} className="pb-24">
        <PlaylistList
          entries={entries}
          artists={artists}
          currentIndex={state.index}
          playing={state.playing}
          city={city}
          window={timeWindow}
          onPlayIndex={(i) => jumpTo(i)}
          onHeart={onHeart}
          heartedIds={heartedIds}
          activeItemRef={itemRef}
        />
      </div>

      <RadioPlayer
        track={
          current
            ? {
                artist: artists[current.track.artistId]?.normalizedName ??
                  current.track.artistId,
                title: current.track.title,
              }
            : null
        }
        show={current?.show}
        playing={state.playing}
        index={state.index}
        total={entries.length}
        progress={progress}
        onToggle={toggle}
        onSkip={() => dispatch({ type: 'skip' })}
      />
    </div>
  );
}
