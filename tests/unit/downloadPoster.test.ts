import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderPosterCanvas, downloadPosterPng } from '../../src/lib/downloadPoster';
import { layoutPoster } from '../../src/lib/posterLayout';
import type { PosterAct } from '../../src/lib/posterLayout';

/**
 * Task 4.7 — the offscreen-canvas PNG export. The canvas paints the SAME
 * `layoutPoster(...)` output the on-screen poster renders, so the file matches
 * the DOM bill. jsdom has no real 2D context, so `getContext` / `toBlob` are
 * mocked to record the paint calls and to drive the download path.
 */

const acts: PosterAct[] = [
  { name: 'GIANT HEADLINER', prominence: 1 },
  { name: 'MIDDLE ACT', prominence: 0.5 },
  { name: 'TINY OPENER', prominence: 0 },
];

const layout = layoutPoster({
  acts,
  fontStop: 'everything',
  city: 'london',
  window: 'tonight',
});

/** A recording 2D-context stub — captures fillText/fillRect + font/fillStyle. */
function makeCtxStub() {
  const fillTexts: string[] = [];
  const fonts: string[] = [];
  const fillStyles: string[] = [];
  let fillRects = 0;
  const ctx = {
    set font(v: string) {
      fonts.push(v);
    },
    get font() {
      return fonts[fonts.length - 1] ?? '';
    },
    set fillStyle(v: string) {
      fillStyles.push(v);
    },
    get fillStyle() {
      return fillStyles[fillStyles.length - 1] ?? '';
    },
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillRect: () => {
      fillRects += 1;
    },
    fillText: (t: string) => {
      fillTexts.push(t);
    },
    // Rough width estimate so the fit-to-width guard runs (real ctx measures glyphs).
    measureText: (t: string) => {
      const m = /(\d+)px/.exec(fonts[fonts.length - 1] ?? '');
      const size = m ? Number(m[1]) : 16;
      return { width: t.length * size * 0.6 };
    },
  };
  return {
    ctx,
    get fillTexts() {
      return fillTexts;
    },
    get fillStyles() {
      return fillStyles;
    },
    get fillRects() {
      return fillRects;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderPosterCanvas', () => {
  it('returns a 1080×1920 canvas and paints the title + every act line', () => {
    const rec = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      rec.ctx as unknown as CanvasRenderingContext2D,
    );

    const canvas = renderPosterCanvas(layout, {
      dates: ['MON 20', 'TUE 21'],
      venues: ['The Lexington'],
      watermarkPath: 'earshotlive.com/london/tonight',
    });

    // Fixed export dimensions (SSOT §2.4).
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);

    // The light-paper ground was filled.
    expect(rec.fillRects).toBeGreaterThan(0);

    // The title + each act name (upper-cased) were painted — same layout source.
    expect(rec.fillTexts).toContain(layout.title);
    for (const line of layout.lines) {
      expect(rec.fillTexts).toContain(line.name.toUpperCase());
    }

    // Footer content: dates, venue, watermark.
    expect(rec.fillTexts.some((t) => t.includes('MON 20'))).toBe(true);
    expect(rec.fillTexts.some((t) => t.includes('The Lexington'))).toBe(true);
    expect(rec.fillTexts).toContain('earshotlive.com/london/tonight');

    // Each act line's spot-ink colour was used as a fillStyle (matches the DOM).
    for (const line of layout.lines) {
      expect(rec.fillStyles).toContain(line.color);
    }
  });

  it('returns a sized canvas without throwing when there is no 2D context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const canvas = renderPosterCanvas(layout);
    expect(canvas.width).toBe(1080);
    expect(canvas.height).toBe(1920);
  });
});

describe('downloadPosterPng', () => {
  it('encodes a PNG and triggers a transient <a download> click', async () => {
    const rec = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      rec.ctx as unknown as CanvasRenderingContext2D,
    );

    const blob = new Blob(['png'], { type: 'image/png' });
    const toBlob = vi
      .spyOn(HTMLCanvasElement.prototype, 'toBlob')
      .mockImplementation((cb: (b: Blob | null) => void, type?: string) => {
        expect(type).toBe('image/png');
        cb(blob);
      });

    const createUrl = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:earshot-test');
    const revokeUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    let downloadName = '';
    const setAttr = vi
      .spyOn(HTMLAnchorElement.prototype, 'download', 'set')
      .mockImplementation(function (this: HTMLAnchorElement, v: string) {
        downloadName = v;
      });

    await downloadPosterPng(layout, 'earshot-london-tonight.png', {
      watermarkPath: 'earshotlive.com/london/tonight',
    });

    expect(toBlob).toHaveBeenCalled();
    expect(createUrl).toHaveBeenCalledWith(blob);
    expect(anchorClick).toHaveBeenCalledTimes(1);
    expect(downloadName).toBe('earshot-london-tonight.png');
    expect(revokeUrl).toHaveBeenCalledWith('blob:earshot-test');

    setAttr.mockRestore();
  });

  it('resolves without throwing when canvas has no toBlob (guard path)', async () => {
    const rec = makeCtxStub();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      rec.ctx as unknown as CanvasRenderingContext2D,
    );
    // Simulate an environment with no PNG encoder.
    const original = HTMLCanvasElement.prototype.toBlob;
    // @ts-expect-error — deliberately removing toBlob to exercise the guard.
    HTMLCanvasElement.prototype.toBlob = undefined;
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    await expect(
      downloadPosterPng(layout, 'earshot-london-tonight.png'),
    ).resolves.toBeUndefined();
    expect(click).not.toHaveBeenCalled();

    HTMLCanvasElement.prototype.toBlob = original;
  });
});
