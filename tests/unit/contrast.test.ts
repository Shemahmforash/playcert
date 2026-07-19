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
