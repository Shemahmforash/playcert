// src/lib/downloadPoster.ts
//
// The offscreen-canvas PNG export for the Lineup Poster (SSOT §2.4, Task 4.7).
//
// This paints the EXACT SAME `PosterLayout` the on-screen `LineupPoster`
// renders as DOM — same title, same sized/weighted/coloured act lines, same
// stacking geometry — onto a fixed 1080×1920 canvas, then downloads it as a PNG.
// It is 100% client-side: nothing is uploaded. The layout is the single source
// of truth (from `posterLayout.ts`), so the PNG and the DOM poster never drift.
//
// Deterministic: NO `new Date()`, NO randomness. Every value that isn't in the
// pure layout (the footer date stamps, venue names, the watermark path) arrives
// via `opts`, so the caller feeds the SAME inputs the DOM poster used.

import type { PosterLayout } from './posterLayout';

// ── Fixed export dimensions + light-paper palette (mirrors posterLayout.ts). ──
const WIDTH = 1080;
const HEIGHT = 1920;
const PAPER = '#EFE7D6'; // light-paper ground
const INK = '#211D17'; // newsprint ink
// meta ink (dates / venues, normal-size mono). Task 5.2 a11y bump: #6E6A61 read
// 4.38:1 on paper (below the 4.5 floor); #686456 → 4.81:1. Mirrors LineupPoster.
const ASH = '#686456';

// ── Stacking geometry — mirrors the constants `layoutPoster` laid the bill out
// with, so the canvas stack matches the DOM stack line-for-line. ──────────────
const TITLE_BAND_PX = 260;
const FOOTER_BAND_PX = 300;
const LINE_HEIGHT = 1.08;
const GAP_PX = 20;

// Font stacks: a sans stack for the bill (matches the app's `font-display`),
// a mono stack for the footer (matches `font-mono`). Weight rides on each line.
const SANS = '"Roboto Flex", system-ui, -apple-system, "Segoe UI", Arial, sans-serif';
const MONO = 'ui-monospace, "Roboto Mono", "SF Mono", Menlo, monospace';

export interface PosterCanvasOpts {
  /** Distinct date stamps, e.g. `['MON 20', 'TUE 21']` — footer, mono ash. */
  dates?: string[];
  /** A few distinct venue names — footer, mono ash. */
  venues?: string[];
  /** The `earshot.fm/{path}` watermark, inked. */
  watermarkPath?: string;
}

/**
 * Paint `layout` onto a fresh 1080×1920 canvas and return it. Deterministic.
 *
 * The ground is light paper; the title sits in the top band; the act lines are
 * stacked (same line-height/gap the layout used) and vertically centred in the
 * usable column between the title and footer bands; the footer carries the
 * dates/venues (mono) and the inked watermark. If `layout.overflowDropped > 0`
 * a small "+N more" note is added — a note, never an error.
 *
 * Guarded: if the environment has no 2D canvas context (e.g. bare jsdom), the
 * (blank-sized) canvas is returned without throwing.
 */
export function renderPosterCanvas(
  layout: PosterLayout,
  opts: PosterCanvasOpts = {},
): HTMLCanvasElement {
  const width = layout.dims?.width ?? WIDTH;
  const height = layout.dims?.height ?? HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext('2d');
  } catch {
    ctx = null;
  }
  if (!ctx) return canvas; // no canvas support — hand back the sized canvas, no throw

  // Light-paper ground.
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  ctx.textAlign = 'center';
  const cx = width / 2;

  // Title band.
  ctx.textBaseline = 'middle';
  ctx.fillStyle = INK;
  ctx.font = `800 72px ${SANS}`;
  ctx.fillText(layout.title, cx, TITLE_BAND_PX * 0.62);

  // The bill — same sizePx / weight / colour the layout computed, stacked with
  // the same line-height + gap, vertically centred in the usable column.
  const usable = height - TITLE_BAND_PX - FOOTER_BAND_PX;
  const stackH =
    layout.lines.reduce((sum, l) => sum + l.sizePx * LINE_HEIGHT, 0) +
    GAP_PX * Math.max(0, layout.lines.length - 1);
  let y = TITLE_BAND_PX + Math.max(0, (usable - stackH) / 2);
  for (const line of layout.lines) {
    const lh = line.sizePx * LINE_HEIGHT;
    ctx.font = `${line.weight} ${line.sizePx}px ${SANS}`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.name.toUpperCase(), cx, y + lh / 2);
    y += lh + GAP_PX;
  }

  // Footer band — dates + venues (mono ash), then the inked watermark.
  const footerTop = height - FOOTER_BAND_PX;
  ctx.textBaseline = 'middle';

  if (layout.overflowDropped > 0) {
    ctx.fillStyle = ASH;
    ctx.font = `500 26px ${SANS}`;
    ctx.fillText(`+${layout.overflowDropped} more`, cx, footerTop - 24);
  }

  let fy = footerTop + 64;
  ctx.fillStyle = ASH;
  if (opts.dates && opts.dates.length > 0) {
    ctx.font = `500 28px ${MONO}`;
    ctx.fillText(opts.dates.join('   ·   '), cx, fy);
    fy += 48;
  }
  if (opts.venues && opts.venues.length > 0) {
    ctx.font = `500 26px ${MONO}`;
    ctx.fillText(opts.venues.join('   ·   '), cx, fy);
    fy += 48;
  }
  if (opts.watermarkPath) {
    ctx.fillStyle = INK;
    ctx.font = `600 30px ${MONO}`;
    ctx.fillText(opts.watermarkPath, cx, footerTop + FOOTER_BAND_PX - 56);
  }

  return canvas;
}

/**
 * Render `layout` to a canvas, encode a PNG, and trigger a client-side download
 * via a transient `<a download>` — no upload, no server round-trip.
 *
 * Fully guarded: environments without `document`, without a 2D context, or
 * without `canvas.toBlob` / `URL.createObjectURL` resolve quietly (no throw), so
 * a click in a limited environment degrades gracefully instead of blowing up.
 */
export async function downloadPosterPng(
  layout: PosterLayout,
  filename: string,
  opts: PosterCanvasOpts = {},
): Promise<void> {
  if (typeof document === 'undefined') return;

  let canvas: HTMLCanvasElement;
  try {
    canvas = renderPosterCanvas(layout, opts);
  } catch {
    return;
  }

  if (typeof canvas.toBlob !== 'function') return;
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const blob = await new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), 'image/png');
    } catch {
      resolve(null);
    }
  });
  if (!blob) return;

  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    if (typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url);
  }
}
