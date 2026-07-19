'use client';

/**
 * ErrorState — the poster wall is down (Task 2.9, §2.6 "Error").
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6. Shown when we can't
 * reach the listings. Reassuring, not blaming ("Nothing's wrong with your city.")
 * with exactly one action — Try again. If a stale copy exists it's served
 * silently with a muted mono "showing listings from earlier today" tag.
 */

export interface ErrorStateProps {
  /** A stale cached copy is being shown beneath/alongside — flags the mono tag. */
  stale?: boolean;
  /** Retry handler. When omitted the control reloads the current page. */
  onRetry?: () => void;
}

export function ErrorState({ stale, onRetry }: ErrorStateProps) {
  const retry = () => {
    if (onRetry) onRetry();
    else if (typeof window !== 'undefined') window.location.reload();
  };

  return (
    <section
      className="flex flex-col items-center gap-5 py-12 text-center"
      style={{ color: 'var(--ink)' }}
    >
      <div className="flex flex-col gap-1">
        <h2
          className="font-display text-2xl font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          The poster wall is down.
        </h2>
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          We couldn&apos;t reach the listings. Nothing&apos;s wrong with your city.
        </p>
      </div>

      <button
        type="button"
        onClick={retry}
        className="inline-block rounded-[var(--radius-stub,4px)] px-4 py-2 text-sm font-medium"
        style={{
          color: 'var(--ink)',
          border: '1px solid var(--line)',
          background: 'var(--surface)',
        }}
      >
        Try again
      </button>

      {stale ? (
        <p className="font-mono text-xs uppercase" style={{ color: 'var(--ash-quiet)' }}>
          showing listings from earlier today
        </p>
      ) : null}
    </section>
  );
}
