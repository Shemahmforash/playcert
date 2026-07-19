'use client';

import type { Show } from '../lib/types';
import { dateLabelFor } from '../lib/playlistGrouping';
import { NowPlayingTicker } from './NowPlayingTicker';

/**
 * RadioPlayer — the box-office counter-edge sticky bar (Task 2.5).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.3. PRESENTATIONAL: the
 * single `<audio>` and all player state live in `PlaylistScreen`; this bar is UI
 * + controls only. Sticky bottom, `--surface-raised`, a 40px faux-halftone
 * artwork block, a 30s progress ring around the loud pink ADMIT-ONE Play stamp,
 * the `NowPlayingTicker`, and a Skip control. No autoplay — sound only ever
 * starts from a gesture handled by the container.
 */

export interface RadioPlayerTrack {
  artist: string;
  title: string;
}

export interface RadioPlayerProps {
  /** Null-safe: when there is no current track the bar renders an idle shell. */
  track: RadioPlayerTrack | null;
  /** The current track's show, for the `plays {DAY DATE} · {Venue}` tail. */
  show?: Show;
  playing: boolean;
  index: number;
  total: number;
  /** 0..1 across the 30s preview; drives the progress ring. */
  progress?: number;
  /**
   * Pre-buffer state (§2.5): a shared link arrives paused and the stamp reads
   * `Cueing…` until the first track can play, then flips `▶` with one pulse.
   * The button stays enabled throughout so the FIRST tap still unlocks iOS audio.
   */
  cueing?: boolean;
  onToggle: () => void;
  onSkip: () => void;
}

// Progress-ring geometry. Exported so tests can reason about the stroke offset.
export const PROGRESS_RING_RADIUS = 18;
export const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

/** Assemble the mono marquee line `{Artist} — {Title} · plays {DAY DATE} · {Venue}`. */
export function tickerText(track: RadioPlayerTrack, show?: Show): string {
  const parts = [`${track.artist} — ${track.title}`];
  if (show) {
    parts.push(`plays ${dateLabelFor(show.startsAt)}`);
    if (show.venue?.name) parts.push(show.venue.name);
  }
  return parts.join(' · ');
}

export function RadioPlayer({
  track,
  show,
  playing,
  index,
  total,
  progress = 0,
  cueing = false,
  onToggle,
  onSkip,
}: RadioPlayerProps) {
  const clamped = Math.min(1, Math.max(0, progress));
  const dashOffset = PROGRESS_RING_CIRCUMFERENCE * (1 - clamped);

  // The stamp reads `Cueing…` only while paused + pre-buffer; once playing it is
  // unambiguously the pause control.
  const showCueing = cueing && !playing;

  const marquee = track ? tickerText(track, show) : 'Cueing…';
  const liveSentence = track
    ? `Now playing track ${index + 1} of ${total}: ${track.artist}, ${track.title}.`
    : 'Nothing cued yet.';

  return (
    <div
      role="region"
      aria-label="Radio player"
      className="sticky bottom-0 z-10 flex items-center gap-3 px-3 py-2"
      style={{
        background: 'var(--surface-raised)',
        borderTop: '1px solid var(--line)',
        paddingBottom: 'calc(0.5rem + env(safe-area-inset-bottom))',
      }}
    >
      {/* 40px faux single-channel halftone artwork block (tinted, no promo photo). */}
      <div
        aria-hidden
        className="shrink-0"
        style={{
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-stub, 3px)',
          backgroundColor: 'var(--surface)',
          backgroundImage:
            'radial-gradient(var(--ash-quiet) 1px, transparent 1.2px)',
          backgroundSize: '4px 4px',
          border: '1px solid var(--line)',
        }}
      />

      <NowPlayingTicker text={marquee} liveSentence={liveSentence} />

      {/* Play / Pause — the one loud pink ADMIT-ONE stamp, wrapped by the 30s ring. */}
      <div className="relative shrink-0" style={{ width: '44px', height: '44px' }}>
        <svg
          aria-hidden
          className="absolute inset-0"
          width="44"
          height="44"
          viewBox="0 0 44 44"
        >
          <circle
            cx="22"
            cy="22"
            r={PROGRESS_RING_RADIUS}
            fill="none"
            stroke="var(--line)"
            strokeWidth="2"
          />
          <circle
            data-testid="progress-ring"
            cx="22"
            cy="22"
            r={PROGRESS_RING_RADIUS}
            fill="none"
            stroke="var(--admission)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            transform="rotate(-90 22 22)"
          />
        </svg>
        <button
          type="button"
          aria-label={showCueing ? 'Cueing…' : playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
          onClick={onToggle}
          disabled={!track}
          className="absolute inset-0 flex items-center justify-center rounded-full text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          style={{
            background: 'var(--admission)',
            color: 'var(--canvas)',
            outlineColor: 'var(--admission)',
          }}
        >
          {/* Cueing… → ▶ with one settle pulse the moment the stamp goes live. */}
          <span aria-hidden className={showCueing ? undefined : 'sf-cue-pulse'}>
            {showCueing ? '…' : playing ? '❚❚' : '▶'}
          </span>
        </button>
      </div>

      {/* Skip → next visual row. */}
      <button
        type="button"
        aria-label="Skip to next track"
        onClick={onSkip}
        disabled={!track}
        className="flex shrink-0 items-center justify-center rounded-full font-mono text-xs leading-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
        style={{
          width: '44px',
          height: '44px',
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          outlineColor: 'var(--admission)',
        }}
      >
        <span aria-hidden>⏭</span>
      </button>
    </div>
  );
}
