import { LoadingTheater } from '../../../../components/LoadingTheater';

/**
 * Route-level loading UI. Next renders this INSTANTLY the moment a navigation to
 * this segment starts (a window change via `router.push`, or a hard reload),
 * before the server has streamed anything — so mobile web never shows a blank
 * beat. It mirrors the page's static shell (Earshot masthead + the same
 * `LoadingTheater` crate-digging fallback used inside the page's Suspense), so
 * the loading state is identical whether it comes from here or from the
 * in-page dynamic hole.
 */
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-xl px-5 py-10 flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-[0.2em] text-foreground opacity-50">Earshot</p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground opacity-40">
          Reading the small print…
        </h1>
      </header>
      <LoadingTheater />
    </main>
  );
}
