import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Task 5.2 — reduced-motion regression guard.
 *
 * Every decorative animation in the app (SSOT §2.5 + the dial/flip/poster
 * choreography) is authored as a CSS animation/transition class in globals.css.
 * The `@media (prefers-reduced-motion: reduce)` block MUST flatten each one, so a
 * viewer who asks for less motion never gets growth/fall/pulse/blink/peel travel.
 *
 * This test reads the SHIPPING globals.css and asserts that the reduced-motion
 * block references every animation class by name. It is a guard: a new animation
 * cannot ship without a reduced-motion entry, because adding the class here (or
 * to the block) is what keeps this green. Pure string/regex checks on the file —
 * no rendering, no jsdom media-query mocking.
 */

// vitest runs with cwd at the project root (see vitest.config.ts).
const CSS_PATH = resolve(process.cwd(), 'src/app/globals.css');
const css = readFileSync(CSS_PATH, 'utf8');

/** Slice out the `@media (prefers-reduced-motion: reduce) { … }` block body by
 *  brace-matching from the media query to its balanced closing brace. */
function reducedMotionBlock(source: string): string {
  const marker = /@media\s*\(\s*prefers-reduced-motion:\s*reduce\s*\)\s*\{/;
  const m = marker.exec(source);
  if (!m) throw new Error('no prefers-reduced-motion block found in globals.css');
  const bodyStart = m.index + m[0].length;
  let depth = 1;
  let i = bodyStart;
  for (; i < source.length && depth > 0; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') depth--;
  }
  return source.slice(bodyStart, i - 1);
}

// Every animation/transition class in the app. Each MUST appear in the block.
const ANIMATION_CLASSES = [
  'sf-grow', //         indeterminate "reading the small print" growth
  'sf-cursor', //       sf-blink caret (looping)
  'sf-strip', //        crate poster-strip shimmer (looping)
  'sf-rule-fill', //    sf-fill ambient "still digging" gauge (long)
  'sf-row-drop', //     sf-drop arrival thud
  'sf-cue-pulse', //    Cueing… → ▶ settle pulse
  'sf-row-collapse', // dial-rebuild shrink+collapse exit
  'sf-row-fade', //     reduced-motion exit (fade in place)
  'sf-peel', //         LineupPoster rotateX peel
  'sf-peel-open', //    peel open modifier
] as const;

describe('globals.css — prefers-reduced-motion covers every animation class', () => {
  const block = reducedMotionBlock(css);

  it('a reduced-motion block exists', () => {
    expect(block.length).toBeGreaterThan(0);
  });

  it.each(ANIMATION_CLASSES)(
    'the reduced-motion block references .%s',
    (cls) => {
      // Match the class as a whole token (`.sf-grow` but not `.sf-grow-x`).
      const re = new RegExp(`\\.${cls}(?![\\w-])`);
      expect(re.test(block)).toBe(true);
    },
  );

  // The indeterminate / looping animations are the ones that most bother a
  // reduced-motion user; they must be explicitly stopped (animation: none),
  // not merely re-timed.
  it.each(['sf-grow', 'sf-cursor', 'sf-strip', 'sf-rule-fill', 'sf-row-drop', 'sf-cue-pulse'])(
    'looping/indeterminate .%s is killed with `animation: none`',
    () => {
      expect(/animation:\s*none/i.test(block)).toBe(true);
    },
  );

  it('the peel is de-rotated to an opacity-only transition under reduced motion', () => {
    // No rotateX travel: the block forces transform:none on the peel.
    expect(/\.sf-peel[\s\S]*transform:\s*none/i.test(block)).toBe(true);
  });
});
