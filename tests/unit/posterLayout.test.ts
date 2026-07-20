import { describe, it, expect } from 'vitest';
import {
  layoutPoster,
  posterActsFromBundle,
  type PosterAct,
} from '../../src/lib/posterLayout';
import type { Artist, CityWindowBundle } from '../../src/lib/types';

/**
 * Task 4.6 — the PURE Lineup Poster layout engine.
 *
 * Acts are sized ∝ billing prominence, INVERTED at Small Print (openers become
 * the giant headline, ex-headliners shrink to the agate foot). Colour is
 * chroma-coupled-to-size: the "loud" spot ink follows whoever the current stop
 * features — pink at everything / no-arenas, blue at Small Print — and only on
 * type ≥ 28px; anything smaller is newsprint ink.
 */

const HEADLINER: PosterAct = { name: 'GIANT HEADLINER', prominence: 1 };
const OPENER: PosterAct = { name: 'TINY OPENER', prominence: 0 };

// The poster's light-paper spot pink (Task 5.2 a11y bump from #FF4D82 → #E63A6E:
// the dark-wall pink read only 2.57:1 on paper, below the 3:1 large-text floor).
const PINK = '#E63A6E';
const BLUE = '#3B6BE8';
const INK = '#211D17';

const base = { city: 'london', window: 'tonight' as const };

const lineFor = (layout: ReturnType<typeof layoutPoster>, name: string) =>
  layout.lines.find((l) => l.name === name)!;

describe('layoutPoster — title + dims', () => {
  it('title is `{CITY} WEEK FEST` (city display-cased, upper-cased)', () => {
    const layout = layoutPoster({ acts: [HEADLINER], fontStop: 'everything', ...base });
    expect(layout.title).toBe('LONDON WEEK FEST');
  });

  it('dims are the fixed 1080×1920 export size', () => {
    const layout = layoutPoster({ acts: [HEADLINER], fontStop: 'everything', ...base });
    expect(layout.dims).toEqual({ width: 1080, height: 1920 });
  });
});

describe('layoutPoster — sizing + chroma-coupled colour at everything', () => {
  it('a headliner (prominence 1) is LARGER than an opener (prominence 0), and the biggest is pink', () => {
    const layout = layoutPoster({
      acts: [OPENER, HEADLINER],
      fontStop: 'everything',
      ...base,
    });
    const head = lineFor(layout, HEADLINER.name);
    const open = lineFor(layout, OPENER.name);

    expect(head.sizePx).toBeGreaterThan(open.sizePx);
    // The biggest line overall is the headliner, in riso-pink.
    const biggest = [...layout.lines].sort((a, b) => b.sizePx - a.sizePx)[0];
    expect(biggest.name).toBe(HEADLINER.name);
    expect(biggest.color).toBe(PINK);
  });

  it('sub-28px acts fall back to newsprint ink (colour never on small type)', () => {
    const layout = layoutPoster({
      acts: [OPENER, HEADLINER],
      fontStop: 'everything',
      ...base,
    });
    const open = lineFor(layout, OPENER.name);
    expect(open.sizePx).toBeLessThan(28);
    expect(open.color).toBe(INK);
  });
});

describe('layoutPoster — the Small-Print inversion', () => {
  it('sizing INVERTS: the opener is now LARGER than the headliner, and the biggest is blue', () => {
    const everything = layoutPoster({
      acts: [OPENER, HEADLINER],
      fontStop: 'everything',
      ...base,
    });
    const smallPrint = layoutPoster({
      acts: [OPENER, HEADLINER],
      fontStop: 'small-print',
      ...base,
    });

    const openSP = lineFor(smallPrint, OPENER.name);
    const headSP = lineFor(smallPrint, HEADLINER.name);

    // Inversion vs. the marquee stop.
    expect(openSP.sizePx).toBeGreaterThan(headSP.sizePx);
    expect(openSP.sizePx).toBeGreaterThan(lineFor(everything, OPENER.name).sizePx);

    // The biggest at Small Print is the opener, in riso-blue.
    const biggest = [...smallPrint.lines].sort((a, b) => b.sizePx - a.sizePx)[0];
    expect(biggest.name).toBe(OPENER.name);
    expect(biggest.color).toBe(BLUE);

    // The demoted ex-headliner shrinks below the spot-ink threshold → ink.
    expect(headSP.sizePx).toBeLessThan(28);
    expect(headSP.color).toBe(INK);
  });
});

describe('layoutPoster — deterministic overflow drop', () => {
  const manyActs: PosterAct[] = Array.from({ length: 30 }, (_, i) => ({
    name: `ACT ${String(i).padStart(2, '0')}`,
    prominence: 0.5,
  }));

  it('caps `lines` to what fits 1920 and reports the dropped count (never silently truncates)', () => {
    const layout = layoutPoster({ acts: manyActs, fontStop: 'everything', ...base });

    expect(layout.lines.length).toBeLessThan(manyActs.length);
    expect(layout.overflowDropped).toBeGreaterThan(0);
    expect(layout.lines.length + layout.overflowDropped).toBe(manyActs.length);
  });

  it('is deterministic — identical inputs give identical output', () => {
    const a = layoutPoster({ acts: manyActs, fontStop: 'everything', ...base });
    const b = layoutPoster({ acts: manyActs, fontStop: 'everything', ...base });
    expect(a).toEqual(b);
  });
});

describe('posterActsFromBundle', () => {
  const mkArtist = (id: string, normalizedName: string, prominence: number): Artist => ({
    id,
    rawNames: [normalizedName],
    normalizedName,
    isTribute: false,
    prominence,
    tier: 'mid',
    billingSlots: [],
  });

  const mkBundle = (artists: Record<string, Artist>): CityWindowBundle =>
    ({ artists } as unknown as CityWindowBundle);

  it('de-dupes by normalized name and sorts by prominence DESC', () => {
    const bundle = mkBundle({
      a: mkArtist('a', 'MID ACT', 0.5),
      b: mkArtist('b', 'HEADLINER', 0.9),
      c: mkArtist('c', 'OPENER', 0.1),
      // A duplicate normalized name under a different key must be dropped.
      b2: mkArtist('b2', 'HEADLINER', 0.9),
    });

    const acts = posterActsFromBundle(bundle);
    expect(acts.map((a) => a.name)).toEqual(['HEADLINER', 'MID ACT', 'OPENER']);
    expect(acts).toHaveLength(3);
  });
});
