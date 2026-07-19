import { Suspense } from 'react';
import { headers } from 'next/headers';
import { cityFromHeaders } from '../lib/api/geo';
import { CityPicker } from '../components/CityPicker';

/**
 * Landing `/` — the "Play {City}" entry point (Task 2.7).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md. The masthead (eyebrow +
 * headline) is a fully static shell that prerenders; the IP PREFILL is the only
 * dynamic bit, so the header read lives in an async child under `<Suspense>`
 * (Cache Components requires uncached data to sit inside a boundary — that keeps
 * `/` a static route with a streamed hole rather than a fully dynamic page).
 *
 * `cityFromHeaders` reads Vercel's `x-vercel-ip-*` headers for a best-effort
 * city prefill; in local dev those are absent → null → the null-geo fallback
 * (CityField open). The fallback also serves as the Suspense fallback, so the
 * picker is usable the instant the shell paints. No geolocation prompt, ever; no
 * submit button; typed-city validation is client-side against the covered table
 * (see CityPicker's ADAPTATION note).
 */

async function PrefilledCityPicker() {
  const h = await headers();
  const hint = cityFromHeaders(h);
  const prefill = hint ? { displayName: hint.displayName, slug: hint.slug } : null;
  return <CityPicker prefill={prefill} />;
}

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-8 px-5 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-ash">Earshot</p>
      <h1 className="font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-[-0.02em] text-ink sm:text-6xl">
        Hear your city before it happens.
      </h1>
      <Suspense fallback={<CityPicker prefill={null} />}>
        <PrefilledCityPicker />
      </Suspense>
    </main>
  );
}
