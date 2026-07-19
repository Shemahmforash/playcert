/**
 * contrast.ts — WCAG 2.x relative-luminance contrast math (Task 2.12).
 *
 * Pure, dependency-free. Used by tests/unit/contrast.test.ts to lock the design
 * system's token pairs against the accessibility floor (design doc §4): body/meta
 * text ≥ 4.5:1, large display type ≥ 3:1, on BOTH the dark ("wall") and light
 * ("paper") themes.
 *
 * Formula: WCAG 2.1 relative luminance + contrast ratio.
 *   https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 *   https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** Parse `#rgb` / `#rrggbb` (with or without `#`) into 0..255 channels. */
export function parseHex(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(h)) {
    throw new Error(`Invalid hex colour: "${hex}"`);
  }
  const int = parseInt(h, 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

/** Linearise a single 0..255 sRGB channel per WCAG. */
function linearize(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance (0 = black … 1 = white) of an `#rrggbb` colour. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * WCAG contrast ratio between two colours, in [1, 21]. Symmetric in its
 * arguments (order does not matter).
 */
export function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}
