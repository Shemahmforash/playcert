import { describe, it, expect } from 'vitest';
import { contrastRatio, relativeLuminance, parseHex } from '../../src/lib/contrast';

/**
 * Task 2.12 — contrast floor lock (design doc §4 "ACCESSIBILITY FLOOR").
 *
 * These hex values are the SHIPPING design tokens, copied verbatim from
 * src/app/globals.css (see the cited line per constant). This test is the
 * programmatic gate that keeps them above the WCAG contrast floor on BOTH
 * rendered contexts:
 *   - Dark ("the wall") — the entire interactive product.
 *   - Light ("the paper") — the downloadable poster/share card AND the whole
 *     interactive app when the viewer's OS prefers light.
 *
 * WCAG bars used, stated per assertion:
 *   - AA_NORMAL 4.5:1 — body/meta text < ~18px (design doc: "all body/meta text ≥ 4.5:1").
 *   - AA_LARGE  3.0:1 — large display type ≥ 28px, and graphical controls
 *     (SC 1.4.11 non-text) such as the play/pause icon glyph (design doc:
 *     "display type ≥ 28px meets 3:1 large-text").
 */
const AA_NORMAL = 4.5;
const AA_LARGE = 3.0;

// ── Dark ("wall") tokens — globals.css :root (default context) ───────────────
const DARK = {
  canvas: '#16120d', //         globals.css L14  --canvas
  surface: '#221c14', //        globals.css L15  --surface
  surfaceRaised: '#2b241a', //  globals.css L16  --surface-raised
  ink: '#f0eadc', //            globals.css L19  --ink
  ash: '#a8a59d', //            globals.css L20  --ash
  admission: '#e8402a', //      globals.css L24  --admission (identical both themes)
  risoBlue: '#3b6be8', //       globals.css L26  --riso-blue (identical both themes)
} as const;

// ── Light ("paper") tokens — globals.css :root[data-theme="light"] (L64-73) ──
const LIGHT = {
  canvas: '#efe7d6', //         globals.css L65  --canvas
  surface: '#f6efdf', //        globals.css L66  --surface
  surfaceRaised: '#fbf6ea', //  globals.css L67  --surface-raised
  ink: '#211d17', //            globals.css L68  --ink
  ash: '#686456', //            globals.css L69  --ash  (bumped from #6e6a61 in Task 2.12; the old value read 4.38:1 on the light canvas at 12px — below the 4.5 floor)
  admission: '#e8402a', //      spot ink, identical to dark
  risoBlue: '#3b6be8', //       spot ink, identical to dark
} as const;

// ── Attribution footer (Task 5.1/5.2). Its base line is 11px = NORMAL text
// (< 14px), so it must clear 4.5:1 on --canvas in both themes. The design's
// `--ash-quiet` decorative tone MISSES that floor (dark 4.28:1, light 2.91:1),
// so Task 5.2 moved the base copy to `--ash`. These are the raw token values so
// the gate proves both the failure of the old tone and the fix. ───────────────
const ASH_QUIET = {
  dark: '#7c796f', //   globals.css L21  --ash-quiet (dark)
  light: '#8c877b', //  globals.css L58  --ash-quiet (light)
} as const;

// ── Light-paper LineupPoster palette — inline hex (src/lib/posterLayout.ts,
// src/components/LineupPoster.tsx, src/lib/downloadPoster.ts). A distinct
// ink-on-paper context, NOT the app's dark tokens. ────────────────────────────
const POSTER = {
  paper: '#EFE7D6', //    ground (dialog bg + PNG fill)
  surface: '#F6EFDF', //  raised chips (close/download buttons)
  ink: '#211D17', //      newsprint ink — body/meta + sub-28px act names
  ash: '#686456', //      footer dates/venues (bumped from #6E6A61 in Task 5.2)
  risoPink: '#E63A6E', // spot ink A on paper (bumped from #FF4D82 in Task 5.2)
  risoBlue: '#3B6BE8', // spot ink B on paper (unchanged — it holds 3:1 on paper)
} as const;

// ── OpenGraph card — inline hex (src/app/[city]/[window]/opengraph-image.tsx),
// satori can't read CSS vars. Warm near-black ground, off-white type, pink
// accent for the large display headline/date. ────────────────────────────────
const OG = {
  ground: '#16120D', //    warm near-black
  text: '#F4F1EA', //      off-white body/eyebrow/tagline
  accent: '#FF4D82', //    riso-pink — eyebrow + city + date (all ≥ 30px display)
} as const;

describe('contrast lib — WCAG relative luminance', () => {
  it('parses shorthand and full hex, with or without #', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
    expect(parseHex('000000')).toEqual([0, 0, 0]);
    expect(parseHex('#16120d')).toEqual([0x16, 0x12, 0x0d]);
  });

  it('pins the reference luminance of pure black and white', () => {
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
  });

  it('gives the canonical 21:1 for black-on-white and is symmetric', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 2);
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 2);
  });

  it('rejects malformed hex', () => {
    expect(() => parseHex('#12')).toThrow();
    expect(() => parseHex('nothex')).toThrow();
  });
});

describe('design tokens — body/meta text ≥ 4.5:1 (AA normal)', () => {
  // --ink is the primary printed ink for body sentences + all metadata.
  it('ink on canvas clears 4.5:1 on both themes', () => {
    expect(contrastRatio(DARK.ink, DARK.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(LIGHT.ink, LIGHT.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('ink on surface (stub panels, player) clears 4.5:1 on both themes', () => {
    expect(contrastRatio(DARK.ink, DARK.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(LIGHT.ink, LIGHT.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // --ash is the secondary/meta ink (poster count, dates, billing). The design
  // doc pins it at "4.5:1 at 12px on --canvas"; the light value was bumped in
  // Task 2.12 so it holds on the light canvas too (it previously read 4.38:1).
  it('ash on canvas clears 4.5:1 on both themes (12px meta text)', () => {
    expect(contrastRatio(DARK.ash, DARK.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(LIGHT.ash, LIGHT.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('ash on surface clears 4.5:1 on both themes (≥14px meta text)', () => {
    expect(contrastRatio(DARK.ash, DARK.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(LIGHT.ash, LIGHT.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('spot inks — at their real sizes (AA large / non-text 3:1)', () => {
  /**
   * The Play/Pause stamp knocks the canvas ink out of the loud --admission
   * fill (RadioPlayer: color:var(--canvas) on background:var(--admission)). The
   * glyph (▶ / ❚❚) is a graphical control → SC 1.4.11 non-text 3:1 bar. The dark
   * context (the only place the loud stamp actually ships) also clears 4.5:1.
   */
  it('canvas-on-admission (Play stamp glyph) clears the 3:1 non-text bar on both themes', () => {
    expect(contrastRatio(DARK.canvas, DARK.admission)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(LIGHT.canvas, LIGHT.admission)).toBeGreaterThanOrEqual(AA_LARGE);
    // Interactive product ships dark; there the 14px glyph even clears AA normal.
    expect(contrastRatio(DARK.canvas, DARK.admission)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  /**
   * --riso-blue is the riskiest ink for contrast (design doc Open Questions).
   * The chroma-is-coupled-to-size rule (§1.1) reserves full riso-blue chroma for
   * display type ≥ 28px, which only needs the 3:1 large-text bar. Asserted on the
   * stub-back ground (surface-raised on dark, surface on light) where the blue
   * headliner/same-bill ink is drawn.
   */
  it('riso-blue display type clears the 3:1 large-text bar on both themes', () => {
    expect(contrastRatio(DARK.risoBlue, DARK.surfaceRaised)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(LIGHT.risoBlue, LIGHT.surface)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Task 5.2 — contrast sweep over the surfaces added since Task 2.12.
// ─────────────────────────────────────────────────────────────────────────────

describe('attribution footer — base line is 11px NORMAL text ≥ 4.5:1', () => {
  // The footer copy renders at font-size 11px (< 14px), which is unambiguously
  // NORMAL text under WCAG → the 4.5:1 floor applies, not the 3:1 large bar.
  it('the decorative --ash-quiet tone FAILS 4.5:1 at 11px (why it is not the base ink)', () => {
    // Documents the failure the fix resolves — both themes miss the normal floor.
    expect(contrastRatio(ASH_QUIET.dark, DARK.canvas)).toBeLessThan(AA_NORMAL);
    expect(contrastRatio(ASH_QUIET.light, LIGHT.canvas)).toBeLessThan(AA_NORMAL);
  });

  it('the shipped footer ink (--ash) clears 4.5:1 at 11px on BOTH canvases', () => {
    // AttributionFooter now sets `color: var(--ash)` for the base line; the two
    // provider links were already --ash. This is the assertion that locks it.
    expect(contrastRatio(DARK.ash, DARK.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(LIGHT.ash, LIGHT.canvas)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('light-paper LineupPoster — ink + meta ash (AA normal 4.5:1)', () => {
  // The poster prints ink for the title, watermark, and every sub-28px act name.
  it('poster ink clears 4.5:1 on the paper ground AND the raised surface', () => {
    expect(contrastRatio(POSTER.ink, POSTER.paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(POSTER.ink, POSTER.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // The footer dates/venues/"+N more" render in mono ash at clamp(9px…13px) =
  // NORMAL text. The dark-wall value #6E6A61 read only 4.38:1 on paper (below
  // floor); Task 5.2 bumped both the DOM poster and the PNG export to #686456.
  it('poster meta ash clears 4.5:1 on the paper ground (bumped #6E6A61 → #686456)', () => {
    expect(contrastRatio('#6E6A61', POSTER.paper)).toBeLessThan(AA_NORMAL); // old value missed
    expect(contrastRatio(POSTER.ash, POSTER.paper)).toBeGreaterThanOrEqual(AA_NORMAL);
    expect(contrastRatio(POSTER.ash, POSTER.surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });
});

describe('spot inks on size (chroma-only-≥28px rule) — large text 3:1', () => {
  // §1.1: full spot-ink chroma rides only on display type ≥ 28px, which needs
  // only the 3:1 large-text bar. Both inks, on BOTH stocks (dark wall + paper).
  it('riso-pink clears 3:1 large-text on the dark wall AND the light paper', () => {
    // Dark wall keeps the loud #FF4D82 (5.89:1 on bitumen — also the OG accent).
    expect(contrastRatio('#FF4D82', DARK.canvas)).toBeGreaterThanOrEqual(AA_LARGE);
    // Paper needs the deepened #E63A6E: the original #FF4D82 read 2.57:1 there.
    expect(contrastRatio('#FF4D82', POSTER.paper)).toBeLessThan(AA_LARGE); // why it was bumped
    expect(contrastRatio(POSTER.risoPink, POSTER.paper)).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it('riso-blue clears 3:1 large-text on the dark wall AND the light paper', () => {
    expect(contrastRatio(DARK.risoBlue, DARK.canvas)).toBeGreaterThanOrEqual(AA_LARGE);
    expect(contrastRatio(POSTER.risoBlue, POSTER.paper)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});

describe('OpenGraph card — text 4.5:1, accent 3:1 (large display)', () => {
  it('card text (#F4F1EA) clears 4.5:1 on the ground', () => {
    expect(contrastRatio(OG.text, OG.ground)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('card accent (#FF4D82) clears 3:1 on the ground (city/date is ≥ 56px display)', () => {
    expect(contrastRatio(OG.accent, OG.ground)).toBeGreaterThanOrEqual(AA_LARGE);
  });
});
