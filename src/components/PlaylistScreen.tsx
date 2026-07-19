'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CityWindowBundle, FontStop, TimeWindow } from '../lib/types';
import type { PlaylistEntry } from '../lib/pipeline/order';
import { applyFontStop } from '../lib/pipeline/applyFontStop';
import { usePlayer } from '../hooks/usePlayer';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useTasteMemory } from '../hooks/useTasteMemory';
import { PlaylistList } from './PlaylistList';
import { RadioPlayer } from './RadioPlayer';
import { SparseNotice } from './SparseNotice';
import { WindowChips } from './WindowChips';
import { formatCanonicalPath } from '../lib/urlState';

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
// Poster-count tick cadence (§2.5 "a count ticks up on arrival").
const POSTER_TICK_MS = 90;
// Fallback flip Cueing…→▶ if `canplay` never fires (no preview / test env).
const CUE_FALLBACK_MS = 1200;

/** Distinct gigs behind the playlist = the poster count (§2.5). */
export function distinctPosterCount(entries: PlaylistEntry[]): number {
  return new Set(entries.map((e) => e.show.id)).size;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export interface PlaylistScreenProps {
  bundle: CityWindowBundle;
  fontStop: FontStop;
  city: string;
  window: TimeWindow;
}

export function PlaylistScreen({
  bundle,
  fontStop: initialFontStop,
  city,
  window: timeWindow,
}: PlaylistScreenProps) {
  const router = useRouter();

  // The dial's data source (Task 3.4). The whole bundle is on the client, so a
  // font-stop change is a PURE, ZERO-FETCH re-derivation: `applyFontStop` filters
  // the full track set for the stop and re-orders. Task 3.5's dial will call
  // `setFontStop` (+ pushState); for now this simply mirrors the URL's stop, so
  // the SSR render already shows `applyFontStop(bundle, key.fontStop)`.
  const [fontStop, setFontStop] = useState<FontStop>(initialFontStop);
  const { artists, widened, belowBar } = bundle;
  const entries = useMemo(
    () => applyFontStop(bundle, fontStop),
    [bundle, fontStop],
  );

  const [state, dispatch] = usePlayer(entries.length);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);

  // Defensive unmount cleanup: a fast client transition (or a window-change
  // navigation, which unmounts this screen and STOPS + replays on the new build)
  // must never leave the single <audio> element playing. Pause it on teardown.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Changing the WINDOW is a FULL NAVIGATION to /{city}/{newWindow}: the route
  // unmounts this screen (stopping the audio via the cleanup above) and replays
  // the LoadingTheater on the freshly-built playlist. No manual audio stop.
  const onWindowChange = (nextWindow: TimeWindow) => {
    router.push(
      formatCanonicalPath({ city, window: nextWindow, fontStop: 'everything' }),
    );
  };

  // ── Entrance choreography (§2.5) — client-side, AFTER the payload lands ─────
  // The rows drop staggered (CSS, see `entering` below); here we tick a visible
  // poster count up to the number of distinct gigs, and flip the player's Play
  // stamp from `Cueing…` to `▶` once the first preview can play.
  const posterTotal = useMemo(() => distinctPosterCount(entries), [entries]);
  const [posterCount, setPosterCount] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Reduced motion → no tick, just land on the final count.
    if (prefersReducedMotion()) {
      setPosterCount(posterTotal);
      return;
    }
    setPosterCount(0);
    let n = 0;
    const id = setInterval(() => {
      n += 1;
      setPosterCount(n);
      if (n >= posterTotal) clearInterval(id);
    }, POSTER_TICK_MS);
    return () => clearInterval(id);
  }, [posterTotal]);

  useEffect(() => {
    // Prefer the real `canplay` (wired on the <audio> below); this is the
    // belt-and-braces flip so the stamp never hangs on `Cueing…` if the preview
    // is missing or `canplay` never fires (e.g. in tests).
    if (prefersReducedMotion()) {
      setReady(true);
      return;
    }
    const id = setTimeout(() => setReady(true), CUE_FALLBACK_MS);
    return () => clearTimeout(id);
  }, []);

  // When true, the NEXT [index,playing] effect run waits INTER_TRACK_GAP_MS
  // before play() — armed only by a natural `ended`, never by a user gesture or
  // an error auto-skip (those must feel immediate).
  const gapRef = useRef(false);

  const { containerRef, itemRef } = useAutoScroll<HTMLDivElement, HTMLLIElement>(
    state.index,
  );

  // ── Taste memory (localStorage-backed, artistId keyed) — Task 2.10 ─────────
  // Hearts + skips now live in the shared `useTasteMemory` hook (SSR-safe,
  // never sent to the server) instead of the ad-hoc storage Task 2.5 inlined.
  const { hearted: heartedIds, toggleHeart, markSkipped } = useTasteMemory();

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

  const skip = () => {
    // Remember the deliberately-skipped artist (taste signal), then advance.
    if (current) markSkipped(current.track.artistId);
    dispatch({ type: 'skip' });
  };

  // ── Global keyboard shortcuts (design doc §4 "Keyboard") ───────────────────
  // Supported keys on the playlist screen:
  //   Space         → play/pause (the radio), unless a real control/text field
  //                   is focused (native activation / typing wins there).
  //   N  or  →       → skip to the next track.
  // Row-level actions (play a row, heart, flip the stub) already work via native
  // <button> semantics — Enter/Space on the focused control. We deliberately
  // ignore inputs, textareas, selects and contenteditable so typing is never
  // hijacked, and reserve ↑↓/←→ on a role="slider" for the Phase-3 dial.
  // Latest-handler refs keep the window listener subscribed exactly once.
  const toggleRef = useRef<() => void>(() => {});
  const skipRef = useRef<() => void>(() => {});
  toggleRef.current = toggle;
  skipRef.current = skip;

  useEffect(() => {
    function isTypingTarget(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        el.isContentEditable
      );
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (isTypingTarget(t)) return;
      const role = t instanceof HTMLElement ? t.getAttribute('role') : null;

      if (e.key === ' ' || e.code === 'Space') {
        // Let a focused button/link/slider handle its own Space activation.
        if (t instanceof HTMLElement) {
          const tag = t.tagName;
          if (tag === 'BUTTON' || tag === 'A' || role === 'slider') return;
        }
        e.preventDefault();
        toggleRef.current();
        return;
      }
      if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') {
        if (role === 'slider') return; // reserved for the Phase-3 dial
        e.preventDefault();
        skipRef.current();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
        onCanPlay={() => setReady(true)} // flip Cueing…→▶ the moment audio can start
        preload="metadata"
      />

      {/* Header: the window chips. Changing the window is a full navigation
          (stop + replay); while the radio plays they collapse to the active
          chip to stay out of the way. */}
      <div className="flex items-center justify-between gap-3">
        <WindowChips
          value={timeWindow}
          onChange={onWindowChange}
          collapsed={state.playing}
          label="Change window"
        />
      </div>

      {/* Poster count ticks up on arrival — a subtle box-office tally. */}
      <p
        className="font-mono text-xs"
        // --ash (meta ink, contrast-verified ≥4.5:1 on --canvas at 12px) rather
        // than the decorative --ash-quiet, which the design system reserves for
        // never-text-<14px and which misses the 4.5 floor (Task 2.12).
        style={{ color: 'var(--ash)' }}
        aria-live="polite"
      >
        <span aria-hidden>▓ </span>
        {posterCount} {posterCount === 1 ? 'poster' : 'posters'}
      </p>

      {widened ? <SparseNotice widened={widened} city={city} /> : null}
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
          onHeart={toggleHeart}
          heartedIds={heartedIds}
          activeItemRef={itemRef}
          entering
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
        cueing={!ready}
        onToggle={toggle}
        onSkip={skip}
      />
    </div>
  );
}
