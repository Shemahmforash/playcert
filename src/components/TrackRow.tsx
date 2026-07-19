'use client';

import type { CSSProperties } from 'react';
import { useEffect, useState } from 'react';
import { StubBack, type SameBillItem, type StubReport } from './StubBack';

/**
 * TicketStubRow (front face) — the ticket-stub track row that is the visual
 * heart of the Phase 2 UI.
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.1. This is the FRONT
 * face only — the flip / StubBack is Task 2.3 and list wiring is Task 2.4. Every
 * colour traces to a globals.css token (--surface / --line / --admission / --ink
 * / --ash …); no hardcoded palette lives here.
 *
 * A torn poster strip on `--surface`: the top half is the playable fame-sized
 * name line (punched-hole Play on the left, heart on the right); a PERFORATED
 * divider (dashed hairline + punched end-notches) is the ticket-stub signature;
 * the bottom half is the mono gig chip (the flip target, wired in 2.3). There is
 * deliberately NO price anywhere — the product dropped it.
 */

export interface TrackRowProps {
  artist: string;
  title: string;
  venue: string;            // show.venue.name
  dateLabel: string;        // e.g. "SAT 20" (caller derives from show.startsAt)
  doors?: string;           // e.g. "8PM"
  ticketUrl: string;
  state: 'idle' | 'playing' | 'played' | 'unavailable';
  prominence?: number;      // 0..1 — display-name size (fame). Default 0.5.
  isEncore?: boolean;
  widenTag?: string;        // e.g. "+38 KM" or "OUTSIDE WINDOW"
  hearted?: boolean;
  accentHue?: string;       // day's weekday-ink; falls back to --admission
  onPlay?: () => void;
  onHeart?: () => void;
  onOpenGig?: () => void;   // the gig-chip tap (fired alongside the flip)

  // ── Flip / StubBack (Task 2.3) ──────────────────────────────────────────
  /**
   * Controlled flip state. When provided, the parent (2.4 list) owns which stub
   * is open and enforces one-open-at-a-time by only ever setting one row's
   * `isOpen` true. Omit for the uncontrolled standalone fallback used in tests.
   */
  isOpen?: boolean;
  /** Fired with the requested next flip state on chip tap / ✕ close. */
  onOpenChange?: (next: boolean) => void;
  /** Back-face billing: 'opener' → "opening for {headliner}"; else "headlining". */
  role?: 'opener' | 'headliner';
  headliner?: string;
  sameBill?: SameBillItem[];
  report?: StubReport;
}

/** Guarded `prefers-reduced-motion: reduce` probe — false (motion) under SSR/jsdom. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

/**
 * Map an artist's prominence (0..1 fame) to a display-name size in px.
 *
 * Anchored to the design system's concrete scale (§1.2 / Task 2.2): the fine
 * print floor sits at ~15px, the default mid act at ~28px, and an arena
 * headliner bleeds up to ~64px. The curve is two linear segments hinged at the
 * 0.5 midpoint so all three anchors land exactly and the mapping stays strictly
 * monotonic. Prominence is clamped to [0,1], so the output never escapes
 * [15, 64] px. Phase 3's dial will drive `prominence` live.
 */
export function nameSizePx(prominence = 0.5): number {
  const p = Math.min(1, Math.max(0, prominence));
  const px =
    p <= 0.5
      ? 15 + (p / 0.5) * (28 - 15) // 0 → 15 … 0.5 → 28
      : 28 + ((p - 0.5) / 0.5) * (64 - 28); // 0.5 → 28 … 1 → 64
  return Math.round(px);
}

/** Roboto Flex variation for the screen-printed bill: heavier + condensed as
 * fame grows, so a headliner reads physically bolder/narrower than an opener. */
function nameVariation(prominence: number): CSSProperties {
  const p = Math.min(1, Math.max(0, prominence));
  const wght = Math.round(500 + p * 300); // 500 → 800
  const wdth = Math.round(100 - p * 25); // 100 → 75 (condensed)
  return { fontVariationSettings: `'wght' ${wght}, 'wdth' ${wdth}, 'opsz' 40` };
}

export function TrackRow({
  artist,
  venue,
  dateLabel,
  doors,
  ticketUrl,
  state,
  prominence = 0.5,
  isEncore,
  widenTag,
  hearted,
  accentHue,
  onPlay,
  onHeart,
  onOpenGig,
  isOpen,
  onOpenChange,
  role,
  headliner,
  sameBill,
  report,
}: TrackRowProps) {
  const isPlaying = state === 'playing';
  const isPlayed = state === 'played';
  const isUnavailable = state === 'unavailable';

  // Flip state: controlled when `isOpen` is supplied (parent owns exclusivity —
  // it only ever sets one row open), else an uncontrolled internal fallback.
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const isControlled = isOpen !== undefined;
  const open = isControlled ? Boolean(isOpen) : uncontrolledOpen;
  const reducedMotion = usePrefersReducedMotion();

  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  // Active row wears a left rule in the day's ink (or the loud admission stamp
  // as the standalone fallback) + a subtle perforation glow.
  const accent = accentHue ?? 'var(--admission)';

  const chipText =
    `${dateLabel} · ${venue.toUpperCase()}` + (doors ? ` · DOORS ${doors}` : '');

  // Shared face geometry: both faces stack in the same box so the row flips as
  // one object. `preserve-3d` + `backfaceVisibility: hidden` give the rotateY
  // hinge; under reduced motion we swap to an opacity crossfade (no rotation).
  const flipTransition = reducedMotion
    ? 'opacity 400ms ease'
    : 'transform 400ms cubic-bezier(0.4, 0.2, 0.2, 1)';

  const frontFace = (
    <div
      className="relative flex flex-col"
      // Hidden (and inert) while the back is showing.
      inert={open || undefined}
      aria-hidden={open || undefined}
      style={
        reducedMotion
          ? {
              transition: flipTransition,
              opacity: open ? 0 : 1,
              ...(open
                ? { position: 'absolute', inset: 0, pointerEvents: 'none' }
                : null),
            }
          : { backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }
      }
    >
      {/* ── Top half: the playable, fame-sized name line ─────────────────── */}
      <div className="flex items-center gap-3 px-3 pt-2">
        {/* Punched-hole Play — quiet outline; --admission fill only while playing */}
        <button
          type="button"
          aria-label={`Play preview of ${artist}`}
          aria-pressed={isPlaying}
          disabled={isUnavailable}
          onClick={onPlay}
          className="flex shrink-0 items-center justify-center rounded-full text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
          style={{
            width: '44px',
            height: '44px',
            background: isPlaying ? 'var(--admission)' : 'var(--canvas)',
            color: isPlaying ? 'var(--canvas)' : 'var(--ink)',
            border: isPlaying ? 'none' : '1px solid var(--ink)',
            outlineColor: accent,
          }}
        >
          <span aria-hidden>{isPlaying ? '❚❚' : '▶'}</span>
        </button>

        {/* The fame-sized display name — Roboto Flex, uppercase, condensed. */}
        <span
          className="min-w-0 flex-1 truncate font-display uppercase"
          style={{
            fontSize: `${nameSizePx(prominence)}px`,
            lineHeight: 1,
            letterSpacing: '-0.02em',
            opacity: isPlayed ? 0.6 : undefined, // used-stub: exact 60%
            color: 'var(--ink)',
            ...nameVariation(prominence),
          }}
        >
          {artist}
        </span>

        {/* Heart — outline → filled riso-pink on tap (localStorage in 2.4). */}
        <button
          type="button"
          aria-label={hearted ? `Unheart ${artist}` : `Heart ${artist}`}
          aria-pressed={Boolean(hearted)}
          onClick={onHeart}
          className="flex shrink-0 items-center justify-center rounded-full text-lg leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            width: '44px',
            height: '44px',
            color: hearted ? 'var(--riso-pink)' : 'var(--ash)',
            outlineColor: accent,
          }}
        >
          <span aria-hidden>{hearted ? '♥' : '♡'}</span>
        </button>
      </div>

      {/* ── The perforated divider — the ticket-stub signature ───────────── */}
      {/* Dashed hairline (repeating-linear-gradient) PLUS punched end-notches
          (radial-gradient discs of --canvas showing through the paper). When
          playing, the notches carry a faint accent perforation glow. */}
      <div
        aria-hidden
        className="relative mx-3 my-1"
        style={{ height: '10px' }}
      >
        <div
          className="absolute inset-x-0 top-1/2"
          style={{
            height: '1px',
            transform: 'translateY(-50%)',
            backgroundImage:
              'repeating-linear-gradient(to right, var(--line) 0 5px, transparent 5px 10px)',
          }}
        />
        {/* left notch */}
        <span
          className="absolute top-1/2"
          style={{
            left: '-9px',
            width: '10px',
            height: '10px',
            transform: 'translateY(-50%)',
            borderRadius: '9999px',
            background:
              'radial-gradient(circle at center, var(--canvas) 0 4px, transparent 4px)',
            boxShadow: isPlaying ? `0 0 5px 1px ${accent}` : undefined,
          }}
        />
        {/* right notch */}
        <span
          className="absolute top-1/2"
          style={{
            right: '-9px',
            width: '10px',
            height: '10px',
            transform: 'translateY(-50%)',
            borderRadius: '9999px',
            background:
              'radial-gradient(circle at center, var(--canvas) 0 4px, transparent 4px)',
            boxShadow: isPlaying ? `0 0 5px 1px ${accent}` : undefined,
          }}
        />
      </div>

      {/* ── Bottom half: the gig chip (flip target) + tags ───────────────── */}
      <div className="flex flex-wrap items-center gap-2 px-3 pb-2">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => {
            onOpenGig?.();
            setOpen(!open);
          }}
          className="flex flex-1 items-center justify-between gap-2 font-mono text-xs text-ash focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            minHeight: '44px',
            borderRadius: 'var(--radius-chip, 2px)',
            outlineColor: accent,
          }}
        >
          <span className="truncate">{chipText}</span>
          <span aria-hidden className="shrink-0">▸</span>
        </button>

        {isEncore ? (
          <span className="font-mono text-[11px] uppercase text-ash">ENCORE</span>
        ) : null}

        {widenTag ? (
          <span
            className="font-mono text-[11px] uppercase"
            style={{ color: 'var(--stamp-amber)' }}
          >
            {widenTag}
          </span>
        ) : null}

        {isUnavailable ? (
          // Overprinted amber rubber-stamp tag; 1px misregistration, semi-opaque.
          <span
            className="font-mono text-[11px] uppercase"
            style={{
              color: 'var(--stamp-amber)',
              border: '1px solid var(--stamp-amber)',
              borderRadius: 'var(--radius-chip, 2px)',
              padding: '1px 4px',
              opacity: 0.85,
              transform: 'rotate(-1.5deg)',
            }}
          >
            PREVIEW UNAVAILABLE
          </span>
        ) : null}
      </div>
    </div>
  );

  const backFace = (
    <div
      // Inert + hidden from a11y while the front is showing, so the Tickets link
      // and ✕ are neither focusable nor exposed until the stub is flipped open.
      inert={!open || undefined}
      aria-hidden={!open || undefined}
      style={
        reducedMotion
          ? {
              transition: flipTransition,
              opacity: open ? 1 : 0,
              ...(open ? null : { position: 'absolute', inset: 0, pointerEvents: 'none' }),
            }
          : {
              position: 'absolute',
              inset: 0,
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }
      }
    >
      <StubBack
        artist={artist}
        venue={venue}
        dateLabel={dateLabel}
        doors={doors}
        ticketUrl={ticketUrl}
        role={role}
        headliner={headliner}
        sameBill={sameBill}
        report={report}
        onClose={() => setOpen(false)}
      />
    </div>
  );

  return (
    <div
      className="relative bg-surface text-ink"
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-stub, 3px)',
        minHeight: '72px',
        borderLeft: isPlaying ? `3px solid ${accent}` : undefined,
        ...(reducedMotion ? null : { perspective: '1200px' }),
      }}
    >
      <div
        className="relative"
        style={
          reducedMotion
            ? undefined
            : {
                transformStyle: 'preserve-3d',
                transition: flipTransition,
                transform: open ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }
        }
      >
        {frontFace}
        {backFace}
      </div>
    </div>
  );
}
