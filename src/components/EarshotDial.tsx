'use client';

import { useRef } from 'react';
import type { FontStop } from '../lib/types';
import { FONT_STOPS } from '../lib/urlState';

/**
 * EarshotDial — the signature 3-detent font-stop control (Task 3.5).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.2. A `--surface-raised`
 * track well with detent tick marks and a 44px `--riso-pink` rubber-stamp thumb
 * (1px misregistration) parked on the active detent; below it, three columns of
 * label + always-visible plain-language gloss: MARQUEE / TRIMMED / SMALL PRINT.
 * (The original bare "72 · 24 · 6" point-size numerals were removed — they
 * measured a size nothing on screen embodied and read as an unexplained puzzle;
 * the point-size romance now lives on the downloadable poster instead.)
 *
 * Three HARD detents map 1:1 to `FONT_STOPS` (index 0→2):
 *   everything → MARQUEE (whole bill) · no-arenas → TRIMMED (headliners: one song)
 *   · small-print → SMALL PRINT (openers only).
 *
 * The control ONLY reports the chosen stop via `onChange`; the URL/history
 * pushState + the (Task 3.6) list re-typeset choreography live in the parent
 * (PlaylistScreen). A haptic tick fires on every landed change.
 *
 * A11y (design §2.2 / §4, load-bearing): `role="slider"` with
 * aria-valuemin/max/now + a full-sentence `aria-valuetext` per stop; ←/→ step,
 * Home/End jump to the ends; ↑/↓ are deliberately NOT handled (reserved for row
 * nav elsewhere). Meaning is never color-only — the ACTIVE detent label carries
 * bold weight + an underline on top of ink.
 */

interface Detent {
  stop: FontStop;
  label: string;
  /** Full human sentence announced by `aria-valuetext`. */
  valuetext: string;
  /** Short plain-language gloss shown UNDER the label — always visible for all
   *  three stops so the control self-explains before the thumb is touched. */
  gloss: string;
}

// Order MUST match FONT_STOPS so the index is the aria-valuenow.
const DETENTS: readonly Detent[] = [
  {
    stop: 'everything',
    label: 'MARQUEE',
    valuetext: 'Marquee — the whole bill, every act',
    gloss: 'the whole bill',
  },
  {
    stop: 'no-arenas',
    label: 'TRIMMED',
    valuetext: 'Trimmed — each headliner cut to a single song',
    gloss: 'headliners: one song',
  },
  {
    stop: 'small-print',
    label: 'SMALL PRINT',
    valuetext: 'Small print — the opening and support acts only',
    gloss: 'openers only',
  },
];

const LAST = DETENTS.length - 1; // 2

/** Detent centre as a percentage of the (inset) track width: 0 / 50 / 100. */
function detentPct(i: number): number {
  return (i / LAST) * 100;
}

function vibrateTick(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate?.(10);
  }
}

export interface EarshotDialProps {
  value: FontStop;
  onChange: (next: FontStop) => void;
  className?: string;
}

export function EarshotDial({ value, onChange, className }: EarshotDialProps) {
  const index = Math.max(0, FONT_STOPS.indexOf(value));
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Fire onChange ONLY when the stop actually changes; tick on every land.
  const commit = (next: FontStop) => {
    if (next === value) return;
    vibrateTick();
    onChange(next);
  };

  // Nearest of the 3 detents from a pointer x within the track rect (guarded).
  const stopFromClientX = (clientX: number): FontStop | null => {
    const el = trackRef.current;
    if (!el || typeof el.getBoundingClientRect !== 'function') return null;
    const rect = el.getBoundingClientRect();
    if (!rect || rect.width <= 0) return null;
    const frac = (clientX - rect.left) / rect.width;
    const clamped = Math.min(1, Math.max(0, frac));
    return FONT_STOPS[Math.round(clamped * LAST)];
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let nextIndex: number;
    switch (e.key) {
      case 'ArrowRight':
        nextIndex = Math.min(index + 1, LAST);
        break;
      case 'ArrowLeft':
        nextIndex = Math.max(index - 1, 0);
        break;
      case 'Home':
        nextIndex = 0;
        break;
      case 'End':
        nextIndex = LAST;
        break;
      default:
        return; // ↑/↓ and everything else fall through to row-nav shortcuts
    }
    e.preventDefault();
    commit(FONT_STOPS[nextIndex]);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    trackRef.current?.setPointerCapture?.(e.pointerId);
    const next = stopFromClientX(e.clientX);
    if (next) commit(next);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const next = stopFromClientX(e.clientX);
    if (next) commit(next);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    trackRef.current?.releasePointerCapture?.(e.pointerId);
  };

  return (
    <div className={['w-full select-none', className].filter(Boolean).join(' ')}>
      {/* The slider itself — the paper ruler track (owns keyboard + drag). */}
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="Reading level — how far down the bill"
        aria-valuemin={0}
        aria-valuemax={LAST}
        aria-valuenow={index}
        aria-valuetext={DETENTS[index].valuetext}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className={[
          'relative mx-[22px] flex h-11 cursor-pointer touch-none items-center',
          'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri',
        ].join(' ')}
      >
        {/* Track well. */}
        <div
          className="absolute inset-x-0 h-1.5 rounded-full"
          style={{ background: 'var(--surface-raised)' }}
        />
        {/* Detent tick marks — pink on the active detent, quiet elsewhere. */}
        {DETENTS.map((d, i) => (
          <span
            key={d.stop}
            aria-hidden
            className="absolute h-3 w-0.5 rounded-full"
            style={{
              left: `${detentPct(i)}%`,
              transform: 'translateX(-50%)',
              background: i === index ? 'var(--riso-pink)' : 'var(--ash-quiet)',
            }}
          />
        ))}
        {/* 44px pink rubber-stamp thumb (1px misregistration via offset shadow). */}
        <span
          aria-hidden
          data-testid="dial-thumb"
          className="absolute h-11 w-11 rounded-full motion-safe:transition-[left] motion-safe:duration-200"
          style={{
            left: `${detentPct(index)}%`,
            transform: 'translateX(-50%)',
            background: 'var(--riso-pink)',
            boxShadow: '1.5px 1.5px 0 rgba(59, 107, 232, 0.5)',
          }}
        />
      </div>

      {/* Detent labels + ALWAYS-ON plain-language glosses — one column per stop.
          Showing what all three positions do (not just the active one) lets a
          first-timer understand the control before touching the thumb; the old
          bare "72 · 24 · 6" numerals measured a point size nothing on screen
          embodied, so they were removed (kept as poster flavor elsewhere). The
          ACTIVE column is bold + underlined (never color-only, §4). Each column
          is a tap target; tabIndex=-1 keeps the single slider the one tab-stop. */}
      <div className="mx-[22px] mt-1 grid grid-cols-3">
        {DETENTS.map((d, i) => {
          const active = i === index;
          const align =
            i === 0
              ? 'items-start text-left'
              : i === LAST
                ? 'items-end text-right'
                : 'items-center text-center';
          return (
            <button
              key={d.stop}
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={() => commit(d.stop)}
              className={`flex flex-col gap-0.5 px-1 py-2 ${align}`}
            >
              <span
                className="font-display text-[11px] uppercase leading-none"
                style={{
                  letterSpacing: '0.08em',
                  fontWeight: active ? 700 : 400,
                  textDecoration: active ? 'underline' : 'none',
                  color: active ? 'var(--riso-pink)' : 'var(--ash)',
                }}
              >
                {d.label}
              </span>
              <span
                className="font-mono text-[10px] leading-tight"
                style={{ color: active ? 'var(--ash)' : 'var(--ash-quiet)' }}
              >
                {d.gloss}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
