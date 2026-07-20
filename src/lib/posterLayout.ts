// src/lib/posterLayout.ts
//
// PURE, deterministic layout engine for the Lineup Poster — "the week as a
// downloadable festival bill" (SSOT §2.4 + §1.1). This module contains NO DOM,
// NO `new Date()`, NO randomness: everything it needs arrives via arguments, so
// the same inputs always produce the same PosterLayout. Task 4.7 (peel + PNG
// canvas download) and the on-screen LineupPoster component both consume this
// as their single source of geometry.
//
// The poster renders on the LIGHT paper context (figure/ground flips from the
// dark app so it reads as an ink-on-paper printout), so the colours here are
// inline hex from the light palette — deliberately NOT the app's dark tokens.

import type { Artist, CityWindowBundle, FontStop, TimeWindow } from './types';
import type { PlaylistEntry } from './pipeline/order';
import { cityDisplay } from './title';

// ── Light-paper palette (SSOT §2.4). Inline hex: this is a distinct context. ──
// The poster prints on LIGHT paper, so the spot inks need enough tooth against a
// near-white stock — the mirror of the dark wall, where they sit on bitumen.
const INK = '#211D17'; // newsprint ink — the default, colour-free
// Task 5.2 a11y: the dark-wall riso-pink #FF4D82 reads only 2.57:1 on this paper —
// below even the 3:1 large-text floor the "chroma-only-≥28px" rule (§1.1) promises.
// (SSOT §4 flagged riso-BLUE as the risky ink, but on paper it's pink that misses.)
// #E63A6E is the minimal darkening that clears 3:1 on paper (3.29:1); the dark app
// and OG card keep #FF4D82, which passes on bitumen (5.89:1). Big names only.
const RISO_PINK = '#E63A6E'; // spot ink for whoever is featured at the marquee stops
const RISO_BLUE = '#3B6BE8'; // spot ink for whoever is featured at Small Print (openers)

// ── Fixed export dimensions (SSOT §2.4). ─────────────────────────────────────
const WIDTH = 1080 as const;
const HEIGHT = 1920 as const;

// ── Type scale. A strong festival-bill ramp: agate fine-print floor → headline. ─
const MIN_PX = 18; // agate / fine print
const MAX_PX = 168; // giant headline that fills a 1080-wide poster

// Fit-to-width: cap each name's size so it fits on one line. Side margin each
// edge, and an estimated glyph advance for a bold uppercase sans (~0.62em).
const SIDE_MARGIN_PX = 72;
const CHAR_WIDTH_RATIO = 0.62;

// Chroma-coupled-to-size threshold: spot ink only rides on type ≥ this size;
// anything smaller is newsprint ink. Size carries the meaning; colour never
// carries it alone.
const SPOT_INK_MIN_PX = 28;

// Weight ramp mirrors nameVariation's spirit in TrackRow: heavier as fame grows.
const MIN_WEIGHT = 500;
const MAX_WEIGHT = 800;

// ── Stacking geometry for the finite canvas. The act lines live between a top
// title band and a bottom footer band (dates + venues + watermark); the space
// left over is the usable column the lines must fit inside. ───────────────────
const LINE_HEIGHT = 1.08; // multiplied by each line's sizePx
const GAP_PX = 20; // vertical gap between stacked lines
const TITLE_BAND_PX = 260; // {CITY} WEEK FEST title + top margin
const FOOTER_BAND_PX = 300; // dates/venues row + earshot.fm watermark

export interface PosterAct {
  name: string;
  prominence: number; // 0..1 (opener 0 → headliner 1), BILLING-derived
}

export interface PosterLine {
  name: string;
  sizePx: number;
  weight: number;
  color: string;
}

export interface PosterLayout {
  title: string;
  lines: PosterLine[];
  dims: { width: typeof WIDTH; height: typeof HEIGHT };
  overflowDropped: number;
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/**
 * Distinct, billing-ranked acts pulled straight from a bundle's `artists`
 * record. Name is `normalizedName`; prominence is the Phase-3 billing score.
 * De-duped by normalized name (record keys are already unique, but a defensive
 * de-dupe keeps this safe if fed a hand-built map) and sorted by prominence
 * DESC so headliners lead. A helper so Task 4.7 can feed the current bundle.
 */
export function posterActsFromBundle(bundle: CityWindowBundle): PosterAct[] {
  const seen = new Set<string>();
  const acts: PosterAct[] = [];
  for (const artist of Object.values(bundle.artists)) {
    const name = artist.normalizedName;
    if (seen.has(name)) continue;
    seen.add(name);
    acts.push({ name, prominence: clamp01(artist.prominence) });
  }
  // Prominence DESC; name ASC as a stable, deterministic tie-break.
  acts.sort((a, b) => b.prominence - a.prominence || a.name.localeCompare(b.name));
  return acts;
}

/**
 * Distinct acts pulled from the CURRENT playlist entries — i.e. exactly the acts
 * the visitor sees on screen (artists whose tracks actually resolved and are in
 * this font-stop view). This is what the poster should show: `posterActsFromBundle`
 * draws from `bundle.artists`, which includes acts that were extracted but never
 * got a playable track (unresolved headliners), so it listed names absent from
 * the list. De-duped by artistId, sorted by billing prominence DESC.
 */
export function posterActsFromEntries(
  entries: PlaylistEntry[],
  artists: Record<string, Artist>,
): PosterAct[] {
  const seen = new Set<string>();
  const acts: PosterAct[] = [];
  for (const entry of entries) {
    const id = entry.track.artistId;
    if (seen.has(id)) continue;
    seen.add(id);
    const artist = artists[id];
    if (!artist) continue;
    acts.push({ name: artist.normalizedName, prominence: clamp01(artist.prominence) });
  }
  acts.sort((a, b) => b.prominence - a.prominence || a.name.localeCompare(b.name));
  return acts;
}

/**
 * The 0..1 "sizing key" for an act at the current stop. This is where the
 * INVERSION lives: at Small Print an opener (prominence 0) scores 1 → the giant
 * headline, while an ex-headliner (prominence 1) scores 0 → the agate foot.
 * At every other stop the key is just prominence, so headliners stay biggest.
 */
function sizingKey(prominence: number, fontStop: FontStop): number {
  const p = clamp01(prominence);
  return fontStop === 'small-print' ? 1 - p : p;
}

/** Linear ramp from the sizing key to a font size in px (MIN_PX..MAX_PX). */
function sizePxFromKey(key: number): number {
  return Math.round(MIN_PX + clamp01(key) * (MAX_PX - MIN_PX));
}

/** Roboto-Flex weight from the sizing key: bigger type reads bolder. */
function weightFromKey(key: number): number {
  return Math.round(MIN_WEIGHT + clamp01(key) * (MAX_WEIGHT - MIN_WEIGHT));
}

/**
 * Chroma-coupled-to-size colour role. The "loud" spot ink follows whoever the
 * current stop is featuring: pink at everything / no-arenas (headliners grow),
 * blue at Small Print (openers grow). But only type ≥ SPOT_INK_MIN_PX earns
 * the spot ink; anything smaller is plain newsprint INK. Size, never colour
 * alone, carries the billing meaning.
 */
function colorFor(sizePx: number, fontStop: FontStop): string {
  if (sizePx < SPOT_INK_MIN_PX) return INK;
  return fontStop === 'small-print' ? RISO_BLUE : RISO_PINK;
}

/** Vertical space one line consumes in the stack (its cap height + the gap). */
function lineCost(sizePx: number): number {
  return sizePx * LINE_HEIGHT + GAP_PX;
}

export interface LayoutPosterArgs {
  acts: PosterAct[];
  fontStop: FontStop;
  city: string;
  window: TimeWindow;
  dims?: { width: typeof WIDTH; height: typeof HEIGHT };
}

/**
 * Lay the poster out. Pure and deterministic.
 *
 * 1. Title  = `${CITY} WEEK FEST` (city display-cased then upper-cased).
 * 2. Sizing = each act's sizing key → font size / weight / colour (see above).
 * 3. Overflow = the canvas is finite. Lines are sorted by size DESC (name ASC
 *    tie-break) and greedily stacked while the cumulative height still fits the
 *    usable column (HEIGHT − title band − footer band). The moment a line would
 *    overflow, it and every remaining (smaller) line are dropped, and the count
 *    is reported in `overflowDropped` — never silently truncated.
 */
export function layoutPoster({
  acts,
  fontStop,
  city,
  dims,
}: LayoutPosterArgs): PosterLayout {
  const width = dims?.width ?? WIDTH;
  const height = dims?.height ?? HEIGHT;
  const title = `${cityDisplay(city).toUpperCase()} WEEK FEST`;

  // Size every act by prominence, THEN cap each so the name fits the poster width
  // on one line — the prominence size alone made long names (e.g. BELLE AND
  // SEBASTIAN at 168px) far wider than 1080px, so the DOM truncated them and the
  // canvas clipped them on both sides. `fitSize` is a length-based estimate for a
  // bold uppercase sans (~0.62em per glyph); the canvas refines it with real
  // measureText. usable width leaves a 72px side margin.
  const usableWidth = width - 2 * SIDE_MARGIN_PX;
  const sized: PosterLine[] = acts.map((act) => {
    const key = sizingKey(act.prominence, fontStop);
    const fitSize = usableWidth / Math.max(1, act.name.trim().length * CHAR_WIDTH_RATIO);
    const sizePx = Math.max(
      MIN_PX,
      Math.min(sizePxFromKey(key), Math.round(fitSize)),
    );
    return {
      name: act.name,
      sizePx,
      weight: weightFromKey(key),
      color: colorFor(sizePx, fontStop),
    };
  });
  sized.sort((a, b) => b.sizePx - a.sizePx || a.name.localeCompare(b.name));

  // Greedily place lines while the running stack height fits the usable column.
  const usable = height - TITLE_BAND_PX - FOOTER_BAND_PX;
  const lines: PosterLine[] = [];
  let stack = 0;
  for (const line of sized) {
    const next = stack + lineCost(line.sizePx);
    if (next > usable) break; // this and every smaller remaining line overflow
    stack = next;
    lines.push(line);
  }

  return {
    title,
    lines,
    dims: { width: width as typeof WIDTH, height: height as typeof HEIGHT },
    overflowDropped: sized.length - lines.length,
  };
}
