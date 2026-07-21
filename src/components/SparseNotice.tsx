'use client';

import { useState } from 'react';
import type { TimeWindow, WidenMeta } from '../lib/types';

/**
 * SparseNotice — the honest widen banner (Task 2.8, §2.6 "Sparse").
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6. When the local
 * window filter (filterShowsToWindow) had to reach past the requested radius
 * and/or window to find a viable bill, we say so plainly — an amber rubber-stamp
 * overprint sitting under the header. "Plain, never apologetic-cute." Dismissible
 * (local state only; nothing persisted, nothing in the URL).
 *
 * Copy is derived from the WidenMeta kind:
 *   - radius only  → "…widened to 50 km."
 *   - window only  → "…widened to the next 14 days."
 *   - both         → "…widened to 50 km and the next 14 days."
 */

// Window → the human phrase used inside the widen sentence.
const WINDOW_PHRASE: Record<TimeWindow, string> = {
  tonight: 'tonight',
  'this-weekend': 'this weekend',
  'next-14-days': 'the next 14 days',
};

const titleCase = (slug: string) =>
  slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

/** Builds the widen sentence from the meta — radius, window, or both. */
export function sparseCopy(widened: WidenMeta, city: string): string {
  const where = titleCase(city);
  const parts: string[] = [];
  if (widened.radiusKm != null) parts.push(`${widened.radiusKm} km`);
  if (widened.window) parts.push(WINDOW_PHRASE[widened.window]);
  const widenedTo = parts.join(' and ');
  return `Quiet week in ${where} — widened to ${widenedTo}.`;
}

export interface SparseNoticeProps {
  widened: WidenMeta;
  city: string;
}

export function SparseNotice({ widened, city }: SparseNoticeProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-[var(--radius-stub,4px)] px-3 py-2 text-sm"
      style={{
        color: 'var(--stamp-amber)',
        border: '1px solid var(--stamp-amber)',
        // Faint amber wash so it reads as an overprinted rubber-stamp tag.
        background: 'color-mix(in srgb, var(--stamp-amber) 10%, transparent)',
      }}
    >
      <p className="flex-1">{sparseCopy(widened, city)}</p>
      <button
        type="button"
        aria-label="Dismiss notice"
        onClick={() => setHidden(true)}
        className="shrink-0 font-mono leading-none opacity-70 hover:opacity-100"
        style={{ color: 'var(--stamp-amber)' }}
      >
        ✕
      </button>
    </div>
  );
}
