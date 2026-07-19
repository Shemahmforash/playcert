import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto w-full flex min-h-dvh max-w-xl flex-col justify-center gap-3 px-5 py-10">
      <p className="text-xs uppercase tracking-[0.2em] text-foreground opacity-50">Earshot</p>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Nothing on this page.</h1>
      <p className="text-sm text-foreground opacity-70">
        That listing doesn&apos;t exist.{' '}
        <Link href="/london/next-14-days" className="underline underline-offset-4">
          Try London instead
        </Link>
        .
      </p>
    </main>
  );
}
