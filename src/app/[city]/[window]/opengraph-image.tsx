import { ImageResponse } from 'next/og';
import { parseUrlState } from '../../../lib/urlState';
import { cityDisplay, dateRangeLabel } from '../../../lib/title';

// Branded OpenGraph card, derived from the URL params ONLY (city + window). It
// must NEVER call getBundle / JamBase: social crawlers hit OG images
// unpredictably across many URLs, and the app runs on the JamBase free tier
// (owner budget €5/mo). Top-acts-in-card is a deliberate later enhancement.
//
// Lives at the `[window]` segment (not inside `[[...fontStop]]`, where an
// optional catch-all must be the last URL part) — the card doesn't depend on
// the font stop, and metadata routes are inherited by the nested page.

export const alt = 'Earshot — hear the openers before the headliners.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

type Params = Promise<{ city: string; window: string }>;

// Design palette as INLINE HEX — ImageResponse (satori) can't read CSS vars.
const GROUND = '#16120D'; // warm near-black
const NEWSPRINT = '#F4F1EA'; // off-white
const PINK = '#FF4D82'; // riso-pink accent
const MUTED = 'rgba(244, 241, 234, 0.55)';

export default async function Image({ params }: { params: Params }) {
  const { city, window } = await params;
  const parsed = parseUrlState(city, window, undefined);

  // Guard: invalid city/window → generic Earshot-branded fallback, never throw.
  const headline = parsed.ok ? cityDisplay(parsed.key.city).toUpperCase() : 'EARSHOT';
  const dateRange = parsed.ok ? dateRangeLabel(parsed.key.window, new Date()) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: GROUND,
          color: NEWSPRINT,
          padding: '72px 80px',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Eyebrow */}
        <div
          style={{
            display: 'flex',
            fontSize: 30,
            letterSpacing: 12,
            fontWeight: 700,
            color: PINK,
          }}
        >
          EARSHOT
        </div>

        {/* City + date range */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              fontSize: headline.length > 12 ? 128 : 168,
              lineHeight: 0.95,
              fontWeight: 800,
              letterSpacing: -4,
            }}
          >
            {headline}
          </div>
          {dateRange && (
            <div
              style={{
                display: 'flex',
                marginTop: 28,
                fontSize: 56,
                fontWeight: 600,
                letterSpacing: 2,
                color: PINK,
              }}
            >
              {dateRange}
            </div>
          )}
        </div>

        {/* Tagline */}
        <div
          style={{
            display: 'flex',
            fontSize: 34,
            fontWeight: 500,
            color: MUTED,
          }}
        >
          Read bottom-up — hear the openers before the headliners.
        </div>
      </div>
    ),
    { ...size },
  );
}
