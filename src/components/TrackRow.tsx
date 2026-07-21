'use client';

import type { CSSProperties } from 'react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { FontStop } from '../lib/types';
import { StubBack, type SameBillItem, type StubReport } from './StubBack';
import { HeartFilledIcon, HeartOutlineIcon, PauseIcon, PlayIcon } from './icons';

// Chroma-coupled-to-SIZE gate, mirrored from posterLayout.ts (SPOT_INK_MIN_PX):
// a display name only earns a loud spot ink once it renders ≥ 28px; anything
// smaller stays newsprint --ink. Size, never colour alone, carries the billing.
const SPOT_INK_MIN_PX = 28;

// useLayoutEffect on the client (measure before paint → no flash of overflow),
// useEffect on the server (React would warn on useLayoutEffect during SSR).
const useIsomorphicLayoutEffect = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

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
  itunesUrl?: string;       // Track.itunesUrl — per-track Apple linkback (ToS)
  state: 'idle' | 'playing' | 'played' | 'unavailable';
  prominence?: number;      // 0..1 — display-name size (fame). Default 0.5.
  isEncore?: boolean;
  widenTag?: string;        // e.g. "+38 KM" or "OUTSIDE WINDOW"
  hearted?: boolean;
  accentHue?: string;       // day's weekday-ink; falls back to --admission
  /**
   * The active dial stop — the ONLY signal needed to pick the loud spot ink on
   * a fame-sized name, exactly as posterLayout's `colorFor` does: pink at the
   * marquee / no-arenas stops (headliners are the big type), blue at Small Print
   * (openers are the big type). Omit → names stay newsprint --ink (test default).
   */
  fontStop?: FontStop;
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
 * FOUR anchors, not two: the old floor→mid→top curve read as binary — nearly
 * every row landed on the ~28px mid, so billing order wasn't legible at rest.
 * We widen the spread and carve a distinct MID tier between opener and headliner
 * so the three roles separate at a glance:
 *   0    → 14  (fine-print floor — the lower floor widens the bottom of the scale)
 *   0.4  → 22  (opener / lower support)
 *   0.7  → 34  (mid act — clearly above an opener, clearly below a headliner)
 *   1    → 48  (top headliner; still capped at 48, down from 64: names WRAP
 *              instead of truncating, and 48 keeps a long name to ~2 readable lines)
 * The curve is three linear segments hinged at 0.4 / 0.7 so every anchor lands
 * exactly and the mapping stays STRICTLY monotonic. The ≥ 28px spot-ink gate
 * (SPOT_INK_MIN_PX) is unchanged and still keys off the FITTED size; on this curve
 * it bites around p ≈ 0.55, so mid acts and headliners earn the loud ink while
 * openers stay newsprint. Prominence is clamped to [0,1], so the output never
 * escapes [14, 48] px.
 */
export function nameSizePx(prominence = 0.5): number {
  const p = Math.min(1, Math.max(0, prominence));
  let px: number;
  if (p <= 0.4) {
    px = 14 + (p / 0.4) * (22 - 14); // 0 → 14 … 0.4 → 22
  } else if (p <= 0.7) {
    px = 22 + ((p - 0.4) / 0.3) * (34 - 22); // 0.4 → 22 … 0.7 → 34
  } else {
    px = 34 + ((p - 0.7) / 0.3) * (48 - 34); // 0.7 → 34 … 1 → 48
  }
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
  title,
  venue,
  dateLabel,
  doors,
  ticketUrl,
  itunesUrl,
  state,
  prominence = 0.5,
  isEncore,
  widenTag,
  hearted,
  accentHue,
  fontStop,
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

  // Stable id linking the gig-chip disclosure to the back face it reveals, so
  // `aria-expanded` on the chip is paired with an `aria-controls` target (§4).
  const backFaceId = useId();

  // ── Fit-to-width display name (P0) ────────────────────────────────────────
  // Names WRAP at word boundaries only (never mid-word — the old `break-words`
  // split "SEBASTIAN" into "SEBASTI/AN", reading as a typo on the hero element).
  // A single word longer than the column can't wrap, so we shrink the point size
  // until the widest word fits. Measured on the client (SSR renders at the
  // prominence-derived base size, then this fits before paint).
  const nameRef = useRef<HTMLSpanElement>(null);
  const baseNamePx = nameSizePx(prominence);
  const [namePx, setNamePx] = useState(baseNamePx);
  useIsomorphicLayoutEffect(() => {
    const el = nameRef.current;
    const box = el?.parentElement;
    if (!el || !box) return;
    let lastWidth = -1;
    const fit = () => {
      const width = box.clientWidth;
      if (width <= 0 || width === lastWidth) return; // width is flex-driven & font-independent → gate blocks resize loops
      lastWidth = width;
      let size = baseNamePx;
      el.style.fontSize = `${size}px`;
      let guard = 0;
      while (el.scrollWidth > el.clientWidth + 0.5 && size > 12 && guard < 60) {
        size -= 1;
        el.style.fontSize = `${size}px`;
        guard += 1;
      }
      setNamePx(size);
    };
    fit();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(fit);
      ro.observe(box);
    }
    return () => ro?.disconnect();
  }, [artist, baseNamePx]);

  function setOpen(next: boolean) {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  }

  // Active row wears a left rule in the day's ink (or the loud admission stamp
  // as the standalone fallback) + a subtle perforation glow.
  const accent = accentHue ?? 'var(--admission)';

  // ── The two-colour bill reaches the on-screen names ───────────────────────
  // Same rule as posterLayout.colorFor, keyed off the ACTUAL fitted size so the
  // poster and the screen agree: a name that renders ≥ 28px earns the loud spot
  // ink of whoever the current stop features (pink at marquee / no-arenas where
  // headliners are biggest; blue at Small Print where openers are biggest);
  // smaller type stays newsprint --ink. Without a stop signal (standalone/tests)
  // we can't name the featured ink, so names stay --ink.
  const nameColor =
    fontStop && namePx >= SPOT_INK_MIN_PX
      ? fontStop === 'small-print'
        ? 'var(--riso-blue)'
        : 'var(--riso-pink)'
      : 'var(--ink)';

  const chipText =
    `${dateLabel} · ${venue.toUpperCase()}` + (doors ? ` · DOORS ${doors}` : '');

  // DISPLAY-ONLY trailing-punctuation strip. At fame size a trailing period reads
  // as a stray print smudge ("VOLNERO." → "VOLNERO"). This touches PIXELS ONLY:
  // `artist` (and therefore the upstream slug/id, iTunes match target and cache
  // key — all derived from the untouched `normalizedName`) still carries the real
  // name; we only trim what the big name line paints. A lone '!'/'?' is left alone
  // (it can belong to a name, e.g. "Wham!"); we strip trailing dots, commas,
  // colons/semicolons, middots, bullets and dashes plus any trailing whitespace,
  // and fall back to the raw name if that somehow empties the string.
  const displayName = artist.replace(/[\s.,;:·•–—-]+$/u, '') || artist;

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
          : {
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              // When flipped open the BACK face is in flow and defines the row
              // height; the front is lifted out of flow so it can't force the
              // box to the (shorter) front height and clip the taller back.
              ...(open ? { position: 'absolute', inset: 0 } : null),
            }
      }
    >
      {/* ── Top half: the playable, fame-sized name line ─────────────────── */}
      <div className="flex items-center gap-3 px-3 pt-2">
        {/* Punched-hole Play — quiet outline; --admission fill only while playing */}
        <button
          type="button"
          aria-label={`Play preview of ${displayName}`}
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
          {isPlaying ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
        </button>

        {/* The fame-sized display name + the song title beneath it. The title
            EARNS its keep here: a headliner shows a SECOND track at Marquee, so the
            same act can occupy two consecutive rows with the identical big name —
            without a legible song line the pair reads as an accidental dupe. So the
            title line is deliberately given more presence than a footnote (below):
            it's the one thing that tells a headliner's two rows apart. */}
        <div className="min-w-0 flex-1 flex flex-col justify-center">
          <span
            ref={nameRef}
            // WRAP at word boundaries, never truncate and never mid-word. Long
            // multi-word names fall to a second line ("BELLE AND / SEBASTIAN");
            // a single word too wide for the column is shrunk to fit (namePx),
            // so the display name never splits into a nonsense syllable.
            className="font-display uppercase"
            style={{
              fontSize: `${namePx}px`,
              lineHeight: 1.0,
              letterSpacing: '-0.02em',
              overflowWrap: 'normal',
              wordBreak: 'keep-all',
              textWrap: 'balance',
              opacity: isPlayed ? 0.6 : undefined, // used-stub: exact 60%
              color: nameColor,
              ...nameVariation(prominence),
            }}
          >
            {displayName}
          </span>
          {/* Song title: lifted from a 12px near-afterthought to a 14px mono line
              with a touch of tracking, so it carries real presence and does the
              work of distinguishing a headliner's two rows (see note above). Still
              --ash (quiet ink) and truncating so it never competes with the name. */}
          <span
            className="truncate font-mono text-sm"
            style={{
              color: 'var(--ash)',
              letterSpacing: '0.01em',
              opacity: isPlayed ? 0.6 : undefined,
            }}
          >
            {title}
          </span>
        </div>

        {/* Heart — outline → filled riso-pink on tap (localStorage in 2.4). */}
        <button
          type="button"
          aria-label={hearted ? `Unheart ${displayName}` : `Heart ${displayName}`}
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
          {hearted ? <HeartFilledIcon aria-hidden /> : <HeartOutlineIcon aria-hidden />}
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
          aria-controls={backFaceId}
          aria-label={`Gig details, ${chipText}`}
          onClick={() => {
            onOpenGig?.();
            setOpen(!open);
          }}
          className="flex flex-1 items-center justify-between gap-2 font-mono text-xs text-ash focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            minHeight: '44px',
            // A hairline box + an explicit labelled affordance so the bar reads as
            // a tappable "flip for gig details" control, not a mystery spin.
            border: '1px solid var(--line)',
            borderRadius: 'var(--radius-chip, 2px)',
            padding: '0 10px',
            outlineColor: accent,
          }}
        >
          <span className="truncate">{chipText}</span>
          <span
            aria-hidden
            className="shrink-0 uppercase"
            style={{ letterSpacing: '0.06em', color: 'var(--ink)', opacity: 0.65 }}
          >
            Gig info ▸
          </span>
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
      id={backFaceId}
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
              backfaceVisibility: 'hidden',
              WebkitBackfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
              // Closed: absolute so the compact front defines the row height.
              // Open: in flow so the (taller) back defines it — the Tickets stamp
              // and wrong-artist line stay inside the box instead of overflowing.
              ...(open ? null : { position: 'absolute' as const, inset: 0 }),
            }
      }
    >
      <StubBack
        artist={artist}
        venue={venue}
        dateLabel={dateLabel}
        doors={doors}
        ticketUrl={ticketUrl}
        itunesUrl={itunesUrl}
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
