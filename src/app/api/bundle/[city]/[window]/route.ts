import { NextResponse } from 'next/server';
import { parseUrlState } from '@/lib/urlState';
import { geoForCity } from '@/lib/api/geo';
import { getBundle } from '@/lib/pipeline/getBundle';
import { JambaseError } from '@/lib/api/jambase';

export const maxDuration = 60;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ city: string; window: string }> },
) {
  const { city, window } = await params;
  // Same validation the page does — a bad city/window is a 404, never a build.
  const parsed = parseUrlState(city, window, undefined);
  if (!parsed.ok || !geoForCity(parsed.key.city)) {
    return NextResponse.json({ error: 'not-found' }, { status: 404 });
  }
  try {
    const bundle = await getBundle(parsed.key.city, parsed.key.window);
    return NextResponse.json(bundle);
  } catch (err) {
    // JamBase quota/error → 502; the client maps a non-ok response to <ErrorState />
    // while the edge can still serve a stale cache entry. Anything else is a real bug.
    if (err instanceof JambaseError) {
      return NextResponse.json({ error: 'source-error' }, { status: 502 });
    }
    throw err;
  }
}
