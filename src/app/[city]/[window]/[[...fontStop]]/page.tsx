import { Suspense } from 'react';
import { connection } from 'next/server';
import { cacheLife } from 'next/cache';
import { fetchEventsPage } from '@/lib/api/ticketmaster';
import { searchArtistTracks, pickExact } from '@/lib/api/itunes';
import { Player } from '@/components/Player';

export const maxDuration = 60;

async function getLondonSkeleton() {
  'use cache';
  cacheLife({ revalidate: 3600 });
  const start = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const end = new Date(Date.now() + 14 * 864e5).toISOString().replace(/\.\d+Z$/, 'Z');
  const { shows } = await fetchEventsPage({
    apikey: process.env.TICKETMASTER_KEY!,
    latlong: '51.5074,-0.1278', radiusKm: 30,
    startDateTime: start, endDateTime: end,
  });
  const names = [...new Set(shows.flatMap((s) => s.attractions.map((a) => a.name)))].slice(0, 15);
  const tracks: Array<{ artist: string; title: string; previewUrl: string; show: (typeof shows)[number] }> = [];
  for (const name of names) {
    const hit = pickExact(await searchArtistTracks(name), name);
    const show = shows.find((s) => s.attractions.some((a) => a.name === name));
    if (hit && show) tracks.push({ artist: hit.artistName, title: hit.title, previewUrl: hit.previewUrl, show });
    await new Promise((r) => setTimeout(r, 3500));
  }
  return { shows, tracks };
}

async function PlaylistSection() {
  // Defer this Suspense boundary to request time so the build emits the static
  // shell + fallback instead of trying to prerender-fill the ~52s cache (which
  // exceeds Next's 50s prerender fill timeout). The 'use cache' fn below still
  // caches at runtime (revalidate 3600), so only the first request pays the cost.
  await connection();
  const { tracks } = await getLondonSkeleton();
  return <Player tracks={tracks} />;
}

export default function Page() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-5 py-10">
      <header>
        <p className="text-xs uppercase tracking-[0.2em] opacity-50">Small Font</p>
        <h1 className="text-2xl font-bold tracking-tight">London · Next 14 days</h1>
      </header>
      <Suspense fallback={<p className="text-sm opacity-60">digging through the listings…</p>}>
        <PlaylistSection />
      </Suspense>
    </main>
  );
}
