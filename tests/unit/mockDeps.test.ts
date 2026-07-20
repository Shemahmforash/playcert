import { describe, it, expect } from 'vitest';
import { buildBundle } from '../../src/lib/pipeline/buildBundle';
import { applyFontStop } from '../../src/lib/pipeline/applyFontStop';
import { mockDeps } from '../../src/lib/pipeline/mockDeps';

// The MOCK_APIS factory must yield a FULLY DETERMINISTIC, offline bundle: a
// top-billed headliner scores `arena`, an opener `small-print`, every track has
// a mock previewUrl, and dialling to Small Print DROPS the arena headliner rows.
// This is the offline proof the Playwright smoke exercises in a real browser.
describe('mockDeps (MOCK_APIS fixture factory — 5.3)', () => {
  it('builds a deterministic offline bundle with headliner→arena and opener→small-print', async () => {
    const bundle = await buildBundle('london', 'next-14-days', mockDeps('london'));

    // A multi-act headliner (top of the bill) → arena; its opener → small-print.
    const berninger = bundle.artists['matt-berninger'];
    const ronboy = bundle.artists['ronboy'];
    expect(berninger.tier).toBe('arena');
    expect(berninger.prominence).toBe(1);
    expect(ronboy.tier).toBe('small-print');
    expect(ronboy.prominence).toBe(0);

    // At least two shows so the list has multiple rows.
    expect(bundle.shows.length).toBeGreaterThanOrEqual(2);

    // Every track carries a mock previewUrl — nothing hit the network.
    expect(bundle.tracks.length).toBeGreaterThan(0);
    for (const t of bundle.tracks) {
      expect(t.previewUrl).toMatch(/^https:\/\/mock\.local\/.+\.m4a$/);
    }

    // The headliner earns a second (isSecondHeadlinerTrack) track so the dial's
    // three stops each differ.
    expect(
      bundle.tracks.some(
        (t) => t.artistId === 'matt-berninger' && t.isSecondHeadlinerTrack === true,
      ),
    ).toBe(true);
  });

  it('applyFontStop(small-print) DROPS the arena headliner rows vs everything', async () => {
    const bundle = await buildBundle('london', 'next-14-days', mockDeps('london'));

    const everything = applyFontStop(bundle, 'everything');
    const smallPrint = applyFontStop(bundle, 'small-print');

    // Small Print is a strict subset — fewer rows once the headliners fall away.
    expect(smallPrint.length).toBeLessThan(everything.length);

    // The arena headliner is present at Marquee and gone at Small Print.
    expect(everything.some((e) => e.track.artistId === 'matt-berninger')).toBe(true);
    expect(smallPrint.some((e) => e.track.artistId === 'matt-berninger')).toBe(false);

    // No arena-tier artist survives Small Print; at least one opener remains.
    for (const e of smallPrint) {
      expect(bundle.artists[e.track.artistId]?.tier).not.toBe('arena');
    }
    expect(smallPrint.some((e) => e.track.artistId === 'ronboy')).toBe(true);
  });

  it('is byte-for-byte deterministic across repeated builds', async () => {
    const a = await buildBundle('london', 'next-14-days', mockDeps('london'));
    const b = await buildBundle('london', 'next-14-days', mockDeps('london'));
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});
