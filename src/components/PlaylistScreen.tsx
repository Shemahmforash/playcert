'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CityWindowBundle, FontStop, TimeWindow } from '../lib/types';
import type { PlaylistEntry } from '../lib/pipeline/order';
import { applyFontStop } from '../lib/pipeline/applyFontStop';
import { smallPrintRunsDry } from '../lib/pipeline/smallPrintDry';
import { resolveContinuity } from '../lib/pipeline/rebuildDiff';
import { usePlayer } from '../hooks/usePlayer';
import { useAutoScroll } from '../hooks/useAutoScroll';
import { useTasteMemory } from '../hooks/useTasteMemory';
import { useShareThreshold } from '../hooks/useShareThreshold';
import { PlaylistList } from './PlaylistList';
import { RadioPlayer } from './RadioPlayer';
import { ShareSheet } from './ShareSheet';
import { SparseNotice } from './SparseNotice';
import { SmallPrintDryNotice } from './SmallPrintDryNotice';
import { WindowChips } from './WindowChips';
import { EarshotDial } from './EarshotDial';
import { LineupPoster } from './LineupPoster';
import { posterActsFromEntries } from '../lib/posterLayout';
import { formatCanonicalPath, FONT_STOPS } from '../lib/urlState';

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
// Dial rebuild (Task 3.6): the polite two-step announcement's settle delay, and
// the crossfade ramp when a filtered-out current retargets to a survivor (§2.2).
const REBUILD_ANNOUNCE_MS = 450;
const CROSSFADE_MS = 400;
// Lineup Poster long-press commit threshold (§2.4): hold 500ms to peel + reveal.
const POSTER_LONG_PRESS_MS = 500;

/** Human labels for the polite rebuild announcement (the dial's three stops). */
const STOP_LABEL: Record<FontStop, string> = {
  everything: 'Everything',
  'no-arenas': 'No Arenas',
  'small-print': 'Small Print',
};

/** Title-case a city slug for display, e.g. "new-york" → "New York". */
function titleCaseCity(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

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

  // The dial's data source (Task 3.4/3.5). The whole bundle is on the client, so
  // a font-stop change is a PURE, ZERO-FETCH re-derivation: `applyFontStop`
  // filters the full track set for the stop and re-orders. The EarshotDial calls
  // `handleDialChange` (setFontStop + pushState); a popstate mirrors Back/Forward
  // back onto the dial. The initial value mirrors the URL's stop so SSR already
  // renders `applyFontStop(bundle, key.fontStop)`.
  const [fontStop, setFontStop] = useState<FontStop>(initialFontStop);
  const { artists, widened, belowBar } = bundle;
  const entries = useMemo(
    () => applyFontStop(bundle, fontStop),
    [bundle, fontStop],
  );

  // "Small Print runs dry" escape hatch (Task 3.7, §2.6): the stop — not a genuinely
  // quiet week — has thinned the bill below 8 shows. Pure predicate off the bundle.
  const dry = useMemo(
    () => fontStop === 'small-print' && smallPrintRunsDry(bundle),
    [bundle, fontStop],
  );

  const [state, dispatch] = usePlayer(entries.length);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [progress, setProgress] = useState(0);

  // ── Rebuild continuity (Task 3.6) ──────────────────────────────────────────
  // When the dial lands on a new stop, `entries` re-derives in place. We retarget
  // the radio needle the instant that happens, using React's "adjust state during
  // render" pattern (a conditional dispatch guarded by a prev-value ref): because
  // the retarget lands BEFORE this render commits, the single <audio src> never
  // flickers through a stale index — a SURVIVING current track keeps playing
  // UNINTERRUPTED at its new index (its previewUrl is unchanged, so the element
  // never reloads). A filtered-out current arms a crossfade to the nearest
  // following survivor (handled in the auto-advance effect below). Mount is
  // naturally skipped: prevEntriesRef starts equal to `entries`.
  const prevEntriesRef = useRef(entries);
  const crossfadeRef = useRef(false);
  if (prevEntriesRef.current !== entries) {
    const prev = prevEntriesRef.current;
    prevEntriesRef.current = entries;
    const { nextIndex, survived } = resolveContinuity({
      prev,
      next: entries,
      currentIndex: state.index,
    });
    if (!survived && state.playing && entries.length > 0) crossfadeRef.current = true;
    dispatch({
      type: 'retarget',
      index: nextIndex < 0 ? 0 : nextIndex,
      queueLength: entries.length,
      playing: state.playing,
    });
  }

  // Polite, visually-hidden rebuild announcement — its OWN live region, distinct
  // from the NowPlayingTicker's track-change region. Two steps: "Rebuilding: X."
  // on landing, then the settled tally "{n} tracks, {m} shows." a beat later.
  const [rebuildMsg, setRebuildMsg] = useState('');
  const announceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announceMountedRef = useRef(false);

  // Defensive unmount cleanup: a fast client transition (or a window-change
  // navigation, which unmounts this screen and STOPS + replays on the new build)
  // must never leave the single <audio> element playing. Pause it on teardown.
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  // Two-step polite announcement, fired on each stop landing (entries re-derive).
  // Skips mount; a fresh landing supersedes any pending settle tally.
  useEffect(() => {
    if (!announceMountedRef.current) {
      announceMountedRef.current = true;
      return;
    }
    setRebuildMsg(`Rebuilding: ${STOP_LABEL[fontStop]}.`);
    if (announceTimerRef.current) clearTimeout(announceTimerRef.current);
    announceTimerRef.current = setTimeout(() => {
      setRebuildMsg(`${entries.length} tracks, ${distinctPosterCount(entries)} shows.`);
      announceTimerRef.current = null;
    }, REBUILD_ANNOUNCE_MS);
    return () => {
      if (announceTimerRef.current) {
        clearTimeout(announceTimerRef.current);
        announceTimerRef.current = null;
      }
    };
    // Keyed on `entries` — the single re-derivation that a stop landing produces.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // Changing the WINDOW is a FULL NAVIGATION to /{city}/{newWindow}: the route
  // unmounts this screen (stopping the audio via the cleanup above) and replays
  // the LoadingTheater on the freshly-built playlist. No manual audio stop.
  const onWindowChange = (nextWindow: TimeWindow) => {
    router.push(
      formatCanonicalPath({ city, window: nextWindow, fontStop: 'everything' }),
    );
  };

  // ── The Earshot dial (Task 3.5) — a PURE, ZERO-FETCH re-filter ────────────
  // Changing the font-stop is NOT a navigation: it only re-derives `entries`
  // (the useMemo above re-runs against the already-client-side bundle) and
  // updates the URL via history.pushState — no `router.push`, no server
  // round-trip, no fetch. `formatCanonicalPath` omits `everything` (R11).
  const handleDialChange = (next: FontStop) => {
    if (next === fontStop) return;
    setFontStop(next);
    if (typeof window !== 'undefined') {
      window.history.pushState(
        null,
        '',
        formatCanonicalPath({ city, window: timeWindow, fontStop: next }),
      );
    }
  };

  // Browser Back/Forward "walk the dial history" (design §4): a popstate reads
  // the last path segment and mirrors it back onto the dial. Because the stop
  // change is a pushState (not a route change), the URL history is ours to read.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPopState = () => {
      const seg = window.location.pathname.split('/').filter(Boolean).pop();
      setFontStop(
        seg && (FONT_STOPS as readonly string[]).includes(seg)
          ? (seg as FontStop)
          : 'everything',
      );
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

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

  // ── Lineup Poster (Task 4.7, §2.4) — long-press to peel + reveal ───────────
  // The masthead poster trigger opens `LineupPoster` as an OVERLAY above the
  // list: the audio element + RadioPlayer are never unmounted and never paused,
  // so the radio keeps playing behind the poster. Opening is either a plain
  // click on the poster icon button (desktop-discoverable) OR a 500ms long-press
  // (pointerdown arms a timer; any release before 500ms cancels — "snaps flat",
  // no partial state; at 500ms it commits). On open we focus the trigger first
  // so LineupPoster (which restores focus to the previously-focused element on
  // close) returns focus here.
  const [posterOpen, setPosterOpen] = useState(false);
  const posterTriggerRef = useRef<HTMLButtonElement>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLongPress = () => {
    if (longPressRef.current) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  };
  const openPoster = () => {
    clearLongPress();
    posterTriggerRef.current?.focus();
    setPosterOpen(true);
  };
  const startLongPress = () => {
    clearLongPress();
    longPressRef.current = setTimeout(() => {
      longPressRef.current = null;
      openPoster();
    }, POSTER_LONG_PRESS_MS);
  };
  // Never leave a pending long-press timer behind on unmount.
  useEffect(() => clearLongPress, []);

  // ── Earned share threshold (Task 4.2) ─────────────────────────────────────
  // Sharing is EARNED, never a wall before first sound. The grabber only appears
  // once real engagement has accrued (two previews ≥15s OR ~20s of interaction).
  // Suppressed for thin (belowBar) AND empty playlists (Task 4.5) — a dead thin
  // link is never worth forwarding (blueprint risk 6). The empty case also never
  // reaches the ShareSheet render (early return below), so this is belt-and-braces.
  const { earned, notePreviewProgress, noteInteraction } = useShareThreshold({
    suppressed: belowBar || entries.length === 0,
  });

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
    if (crossfadeRef.current) {
      // Filtered-out current retargeted to the nearest following survivor. The
      // declarative <audio src> already points at that survivor, so a true
      // two-source crossfade isn't available with one element — we approximate
      // the §2.2 400ms crossfade as a guarded fade-IN of the incoming survivor:
      // start silent, play, ramp volume 0→1. (A clean switch is the acceptable
      // floor; this softens it without touching the iOS gesture-unlock path.)
      crossfadeRef.current = false;
      el.volume = 0;
      void el.play().catch(() => {});
      const start = Date.now();
      const id = setInterval(() => {
        const t = Math.min(1, (Date.now() - start) / CROSSFADE_MS);
        el.volume = t;
        if (t >= 1) clearInterval(id);
      }, 20);
      return () => {
        clearInterval(id);
        el.volume = 1;
      };
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
    noteInteraction(); // genuine gesture → accrue active-interaction time
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
    noteInteraction(); // genuine gesture → accrue active-interaction time
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

  // A row / same-bill play button. If it targets the track that is ALREADY
  // current, it must toggle pause/resume — NOT re-jump: `jumpTo` resets `el.src`,
  // which reloads the element and restarts the preview from 0 (the "pause that
  // replays" bug). Only a DIFFERENT row loads + plays a new track.
  const playIndex = (i: number) => {
    if (i === state.index) {
      toggle();
      return;
    }
    jumpTo(i);
  };

  const skip = () => {
    noteInteraction(); // genuine gesture → accrue active-interaction time
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
    // Feed the earned-share threshold — ONLY while actually playing (§B S11).
    if (state.playing) notePreviewProgress(state.index, el.currentTime);
  };

  if (entries.length === 0) {
    // The Small Print stop can filter the bill all the way to zero. The bare
    // fallback would hide the escape hatch, so when `dry` is true surface the
    // one-tap No Arenas notice ABOVE it — the dial is still reachable.
    return (
      <div className="flex flex-col gap-4">
        {dry ? (
          <SmallPrintDryNotice onTryNoArenas={() => handleDialChange('no-arenas')} />
        ) : null}
        <p className="rounded border border-dashed border-current/30 p-4 text-sm opacity-70">
          Nothing playable in this window yet.
        </p>
      </div>
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
        {/* Mis-located? Reach the picker WITHOUT the middleware auto-redirecting
            straight back — ?pick=1 is the escape hatch. Kept visually quiet. */}
        <a
          href="/?pick=1"
          className="shrink-0 text-xs underline underline-offset-4"
          style={{ color: 'var(--ash)' }}
        >
          not {titleCaseCity(city)}?
        </a>
      </div>

      {/* The signature control — the printed point-size gauge (Task 3.5). Given
          masthead prominence above the poster count. Dragging/stepping it
          re-filters the playlist with ZERO fetches and updates the URL via
          history (no navigation). The poster trigger sits alongside it. */}
      <div className="flex items-center justify-between gap-3">
        <EarshotDial value={fontStop} onChange={handleDialChange} />
        {/* Poster trigger (§2.4): click opens directly (desktop-discoverable);
            a 500ms click-hold / long-press also commits. The corner-curl is the
            hold affordance. Audio keeps playing — this only mounts an overlay. */}
        <button
          ref={posterTriggerRef}
          type="button"
          aria-label="Make a poster"
          title="Make a poster (hold to peel)"
          onClick={openPoster}
          onPointerDown={startLongPress}
          onPointerUp={clearLongPress}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          className="relative shrink-0 rounded-md border p-2 text-xs"
          style={{ borderColor: 'var(--ash)', color: 'var(--ash)' }}
        >
          <span aria-hidden style={{ fontSize: '16px', lineHeight: 1 }}>
            ◲
          </span>
          {/* Corner-curl affordance — a peeling top-right corner. */}
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 0,
              right: 0,
              width: 0,
              height: 0,
              borderTop: '8px solid var(--ash)',
              borderLeft: '8px solid transparent',
              opacity: 0.5,
            }}
          />
        </button>
      </div>

      {/* Box-office tally: what the playlist actually is — how many songs, drawn
          from how many gigs. The gig count ticks up on arrival (§2.5). */}
      <p
        className="font-mono text-xs"
        // --ash (meta ink, contrast-verified ≥4.5:1 on --canvas at 12px) rather
        // than the decorative --ash-quiet, which the design system reserves for
        // never-text-<14px and which misses the 4.5 floor (Task 2.12).
        style={{ color: 'var(--ash)' }}
        aria-live="polite"
      >
        <span aria-hidden>▓ </span>
        {entries.length} {entries.length === 1 ? 'song' : 'songs'} from{' '}
        {posterCount} {posterCount === 1 ? 'gig' : 'gigs'} near you
      </p>

      {/* Polite rebuild announcement — visually hidden, its OWN live region (NOT
          the ticker). "Rebuilding: {Stop}." on landing → "{n} tracks, {m} shows."
          once settled. No role=status, so it never doubles the player's region. */}
      <p
        aria-live="polite"
        data-testid="rebuild-live"
        style={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0, 0, 0, 0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {rebuildMsg}
      </p>

      {dry ? (
        <SmallPrintDryNotice onTryNoArenas={() => handleDialChange('no-arenas')} />
      ) : null}
      {widened ? <SparseNotice widened={widened} city={city} /> : null}
      {belowBar ? (
        <p className="text-sm text-foreground opacity-60">
          Showing the first few — reload in a minute and we&apos;ll have dug up more.
        </p>
      ) : null}

      {/* Scroll container for useAutoScroll; padded so the sticky bar never
          covers the final rows. When the poster is open the list PEELS away
          (rotateX 8°, 550ms; ✕ reverses ~400ms; reduced-motion = cross-fade),
          while the audio + player bar stay live below. */}
      <div
        ref={containerRef}
        className={`pb-24 sf-peel${posterOpen ? ' sf-peel-open' : ''}`}
      >
        <PlaylistList
          entries={entries}
          artists={artists}
          currentIndex={state.index}
          playing={state.playing}
          city={city}
          window={timeWindow}
          onPlayIndex={playIndex}
          onHeart={toggleHeart}
          heartedIds={heartedIds}
          activeItemRef={itemRef}
          entering
        />
      </div>

      {/* Earned share sheet (Task 4.2): a quiet "Take it with you" grabber sits
          ~24px ABOVE the player once sharing is earned — it renders NOTHING until
          then and never auto-opens. Canonical URL is built from location.origin at
          click time (no geo/header read). */}
      <ShareSheet
        earned={earned}
        city={city}
        window={timeWindow}
        fontStop={fontStop}
        currentTrack={
          current
            ? {
                artist:
                  artists[current.track.artistId]?.normalizedName ??
                  current.track.artistId,
                title: current.track.title,
              }
            : null
        }
      />

      {/* The player bar stays LIVE and ON TOP while the poster is open — lifted
          above the poster's backdrop (z-40) / dialog (z-50) so the radio keeps
          playing and visible behind/above the peeled list. */}
      <div
        style={{
          position: 'relative',
          zIndex: posterOpen ? 60 : undefined,
        }}
      >
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

      {/* The Lineup Poster overlay (Task 4.7). Mounted only while open; it is a
          focus-trapped modal that reverses focus back to the trigger on close.
          The audio element above is untouched, so the radio never stops. */}
      {posterOpen ? (
        <LineupPoster
          acts={posterActsFromEntries(entries, artists)}
          shows={bundle.shows}
          city={city}
          window={timeWindow}
          fontStop={fontStop}
          onClose={() => setPosterOpen(false)}
        />
      ) : null}
    </div>
  );
}
