'use client';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { FontStop, Show, TimeWindow } from '../lib/types';
import { formatCanonicalPath } from '../lib/urlState';
import { dayAccentHue } from '../lib/dayAccent';
import { layoutPoster, type PosterAct } from '../lib/posterLayout';

/**
 * LineupPoster — the on-screen reveal of "the week as a downloadable festival
 * bill" (SSOT §2.4 + §1.1), Task 4.6.
 *
 * This renders the PURE `layoutPoster(...)` geometry as DOM on the LIGHT PAPER
 * context — figure/ground flips from the dark app so the poster reads as an
 * ink-on-paper printout. Every colour here is inline hex from the light palette;
 * it deliberately does NOT rely on the app's dark CSS tokens.
 *
 * It is a focus-trapped modal (role="dialog" aria-modal): a ✕ close button,
 * ESC + backdrop close, focus moves in on open and returns to the trigger on
 * close, `prefers-reduced-motion` respected.
 *
 * Scope note: this task renders the poster + close ONLY. The long-press TRIGGER,
 * the rotateX peel animation, and the offscreen-canvas PNG download of the same
 * `layoutPoster` output are Task 4.7. This component is standalone/mountable and
 * is NOT yet wired into PlaylistScreen.
 */

// ── Light-paper palette (SSOT §2.4). Inline hex — a distinct, ink-on-paper
// context, NOT the app's dark tokens. ────────────────────────────────────────
const PAPER = '#EFE7D6';
const SURFACE = '#F6EFDF';
const INK = '#211D17';
const ASH = '#6E6A61';

export interface LineupPosterProps {
  acts: PosterAct[];
  shows: Show[];
  city: string;
  window: TimeWindow;
  fontStop: FontStop;
  onClose: () => void;
  className?: string;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const WEEKDAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** `2026-07-20T…` → `MON 20`, pinned to UTC so it never drifts across midnight. */
function dateStampLabel(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const day = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return `${WEEKDAYS[day.getUTCDay()]} ${Number(d)}`;
}

export function LineupPoster({
  acts,
  shows,
  city,
  window: timeWindow,
  fontStop,
  onClose,
  className,
}: LineupPosterProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The element focused before we opened — focus returns here on close (this is
  // the long-press trigger once Task 4.7 wires one in).
  const returnFocusRef = useRef<Element | null>(null);

  const layout = useMemo(
    () => layoutPoster({ acts, fontStop, city, window: timeWindow }),
    [acts, fontStop, city, timeWindow],
  );

  // Footer: the week's distinct date stamps + a few distinct venue names, mono.
  const { dateStamps, venues, accentDates } = useMemo(() => {
    const stampSet = new Set<string>();
    const venueSet = new Set<string>();
    const dateSet = new Set<string>();
    for (const show of shows) {
      const stamp = dateStampLabel(show.startsAt);
      if (stamp) stampSet.add(stamp);
      const isoDay = /^(\d{4}-\d{2}-\d{2})/.exec(show.startsAt.trim())?.[1];
      if (isoDay) dateSet.add(isoDay);
      const name = show.venue?.name?.trim();
      if (name) venueSet.add(name);
    }
    return {
      dateStamps: Array.from(stampSet),
      venues: Array.from(venueSet).slice(0, 4),
      accentDates: Array.from(dateSet).slice(0, 4),
    };
  }, [shows]);

  const watermark = `earshot.fm${formatCanonicalPath({ city, window: timeWindow, fontStop })}`;

  const close = useCallback(() => {
    onClose();
  }, [onClose]);

  // Capture the trigger, move focus into the dialog, and restore focus on close.
  useEffect(() => {
    returnFocusRef.current =
      typeof document !== 'undefined' ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog) {
      const first = dialog.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialog).focus();
    }
    return () => {
      const prev = returnFocusRef.current;
      if (prev && prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  // Focus trap + ESC close.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(
        dialog!.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || !dialog!.contains(active))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [close]);

  const reduced = prefersReducedMotion();

  // Decorative day-accent radial washes — low opacity, aria-hidden. Positioned
  // deterministically from the distinct show dates so it stays reproducible.
  const washes = accentDates.map((iso, i) => {
    const hue = dayAccentHue(iso);
    const positions = [
      { top: '8%', left: '12%' },
      { top: '30%', left: '78%' },
      { top: '62%', left: '20%' },
      { top: '85%', left: '70%' },
    ];
    const pos = positions[i % positions.length];
    return (
      <div
        key={iso}
        aria-hidden
        style={{
          position: 'absolute',
          top: pos.top,
          left: pos.left,
          width: '46%',
          height: '46%',
          transform: 'translate(-50%, -50%)',
          borderRadius: '9999px',
          background: `radial-gradient(circle, ${hue} 0%, transparent 70%)`,
          opacity: 0.12,
          pointerEvents: 'none',
        }}
      />
    );
  });

  return (
    <div className={className}>
      {/* Backdrop — click to close. */}
      <div
        data-testid="lineup-poster-backdrop"
        onClick={close}
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 40,
          background: 'rgba(20,18,14,0.55)',
        }}
      />

      {/* The poster dialog on the light paper context. */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={layout.title}
        tabIndex={-1}
        className="font-display"
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          zIndex: 50,
          // Mirror the fixed 1080×1920 export aspect on-screen, but never spill
          // outside the viewport.
          width: 'min(92vw, 540px)',
          maxHeight: '92vh',
          aspectRatio: '1080 / 1920',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: PAPER,
          color: INK,
          boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
          transition: reduced ? 'none' : 'opacity 200ms ease-out',
        }}
      >
        {/* Decorative day-accent washes behind everything. */}
        <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {washes}
        </div>

        {/* ✕ close — top-right, over the paper. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close poster"
          style={{
            position: 'absolute',
            top: '3%',
            right: '4%',
            zIndex: 2,
            width: '40px',
            height: '40px',
            borderRadius: '9999px',
            background: SURFACE,
            border: `1px solid ${ASH}`,
            color: INK,
            fontSize: '18px',
            lineHeight: 1,
            cursor: 'pointer',
          }}
        >
          <span aria-hidden>✕</span>
        </button>

        {/* Title band. */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '7% 6% 2%',
            textAlign: 'center',
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: 'clamp(22px, 6.5vw, 40px)',
              fontWeight: 800,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              color: INK,
            }}
          >
            {layout.title}
          </h2>
        </div>

        {/* The sized act lines — the bill itself. Scaled to the on-screen box:
            the pure sizePx is in 1080-wide space, so we express it as a % of the
            export width and let the flex column carry it. */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '0.35em',
            padding: '0 5%',
            overflow: 'hidden',
            // Establish a query container so the act lines can scale by `cqw`
            // (1cqw = 1% of this column's width), preserving the 1080-wide ratio.
            containerType: 'inline-size',
          }}
        >
          {layout.lines.map((line, i) => (
            <div
              key={`${line.name}-${i}`}
              style={{
                // sizePx is authored against the 1080px export width; on screen
                // we express it relative to that width so the ratio is preserved.
                fontSize: `${(line.sizePx / 1080) * 100}cqw`,
                fontWeight: line.weight,
                color: line.color,
                lineHeight: 1.02,
                textTransform: 'uppercase',
                textAlign: 'center',
                maxWidth: '100%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {line.name}
            </div>
          ))}
        </div>

        {/* Footer band — dates + a few venues in mono, then the watermark. */}
        <div
          className="font-mono"
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '3% 6% 5%',
            textAlign: 'center',
            color: ASH,
            fontSize: 'clamp(9px, 2.4vw, 13px)',
            letterSpacing: '0.04em',
          }}
        >
          {dateStamps.length > 0 ? (
            <div style={{ textTransform: 'uppercase' }}>{dateStamps.join('  ·  ')}</div>
          ) : null}
          {venues.length > 0 ? (
            <div style={{ marginTop: '0.5em', textTransform: 'uppercase' }}>
              {venues.join('  ·  ')}
            </div>
          ) : null}
          <div style={{ marginTop: '0.9em', color: INK }}>{watermark}</div>
        </div>
      </div>
    </div>
  );
}
