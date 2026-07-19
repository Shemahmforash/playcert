import type { TimeWindow } from '../lib/types';
import type { RecoveryAction } from '../lib/recoveryActions';
import { formatCanonicalPath } from '../lib/urlState';

/**
 * EmptyState — the bare wall (Task 2.9, §2.6 "Empty").
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6. Shown ONLY after
 * the full internal widen ladder still yields zero playable shows. A torn-poster
 * motif on the wall, the headline "Nothing on the poster.", one honest line, and
 * the recovery actions rendered as real links — never a widen-window button (14
 * days is terminal; the derivation omits it), so the wall never dead-ends.
 *
 * `window` is threaded in (beyond the plan's {city, actions}) so a `dialStop`
 * action can be rendered as a real canonical URL via formatCanonicalPath — that
 * path needs city + window + stop, and a valid link matters.
 */

const titleCase = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export interface EmptyStateProps {
  city: string;
  window: TimeWindow;
  actions: RecoveryAction[];
}

// Resolves a recovery action to the href its link should point at.
function hrefFor(
  action: RecoveryAction['action'],
  city: string,
  window: TimeWindow,
): string {
  switch (action.kind) {
    case 'route':
      return action.href;
    case 'dialStop':
      return formatCanonicalPath({ city, window, fontStop: action.stop });
    case 'openCityField':
      return '/';
  }
}

export function EmptyState({ city, window, actions }: EmptyStateProps) {
  return (
    <section
      className="flex flex-col items-center gap-5 py-12 text-center"
      style={{ color: 'var(--ink)' }}
    >
      {/* Torn-poster motif — a bare strip on the wall with a perforated tear edge. */}
      <svg
        aria-hidden
        width="120"
        height="88"
        viewBox="0 0 120 88"
        style={{ color: 'var(--line)' }}
      >
        <rect
          x="14"
          y="8"
          width="92"
          height="52"
          rx="3"
          fill="var(--surface)"
          stroke="currentColor"
        />
        {/* The torn / perforated bottom edge — the poster ripped off the wall. */}
        <path
          d="M14 60 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l8 -8 l8 8 l0 -8 z"
          fill="var(--canvas)"
          stroke="currentColor"
        />
        {/* A couple of ghost rules where type used to be. */}
        <rect x="26" y="22" width="52" height="6" rx="1" fill="var(--surface-raised)" />
        <rect x="26" y="36" width="34" height="5" rx="1" fill="var(--surface-raised)" />
      </svg>

      <div className="flex flex-col gap-1">
        <h2
          className="font-display text-2xl font-bold tracking-tight"
          style={{ color: 'var(--ink)' }}
        >
          Nothing on the poster.
        </h2>
        <p className="text-sm" style={{ color: 'var(--ash)' }}>
          No shows we can play near {titleCase(city)} in this window.
        </p>
      </div>

      {actions.length > 0 ? (
        <ul className="flex flex-wrap items-center justify-center gap-3">
          {actions.map((a) => (
            <li key={`${a.action.kind}:${a.label}`}>
              <a
                href={hrefFor(a.action, city, window)}
                className="inline-block rounded-[var(--radius-stub,4px)] px-4 py-2 text-sm font-medium"
                style={{
                  color: 'var(--ink)',
                  border: '1px solid var(--line)',
                  background: 'var(--surface)',
                }}
              >
                {a.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
