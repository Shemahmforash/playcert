import type { FontStop, TimeWindow } from './types';
import { formatCanonicalPath, FONT_STOP_LABELS } from './urlState';

/**
 * recoveryActions — pure derivation of the escape hatches an EmptyState offers
 * (Task 2.9, §2.6 "Empty").
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.6. When the internal
 * widen ladder still yields zero playable shows, the wall is bare — so we hand
 * the visitor a small, honest set of ways out, never a dead end:
 *   - widen the window ONE step (tonight→this-weekend→next-14-days), but NEVER
 *     past the terminal 14-day window — no `next-30-days` route exists (R5);
 *   - drop the dial filter back to Everything, but only when a filter is active
 *     AND the unfiltered bill actually had shows (otherwise it changes nothing);
 *   - always: try another city.
 *
 * Pure + framework-free so it can be unit-tested and reused server- or client-
 * side. The rendering (which kind → <a> / dial link / CityField) lives in
 * EmptyState.
 */

export type RecoveryAction = {
  label: string;
  action:
    | { kind: 'route'; href: string }
    | { kind: 'dialStop'; stop: FontStop }
    | { kind: 'openCityField' };
};

// The widen ladder's window succession (mirrors fetchShows' NEXT_WINDOW). The
// terminal window maps to null → no widen action is offered there.
const NEXT_WINDOW: Record<TimeWindow, TimeWindow | null> = {
  tonight: 'this-weekend',
  'this-weekend': 'next-14-days',
  'next-14-days': null,
};

// Window → the human phrase used inside a recovery label.
const WINDOW_PHRASE: Record<TimeWindow, string> = {
  tonight: 'tonight',
  'this-weekend': 'this weekend',
  'next-14-days': 'the next 14 days',
};

export interface EmptyContext {
  city: string;
  window: TimeWindow;
  fontStop: FontStop;
  /** Did the UNFILTERED bill (every stop) have any shows? Gates the dial reset. */
  unfilteredHadShows?: boolean;
}

export function recoveryActionsForEmpty(ctx: EmptyContext): RecoveryAction[] {
  const actions: RecoveryAction[] = [];

  // Widen the window one step — omitted at the terminal 14-day window (R5).
  const next = NEXT_WINDOW[ctx.window];
  if (next) {
    actions.push({
      label: `Try ${WINDOW_PHRASE[next]}`,
      action: {
        kind: 'route',
        href: formatCanonicalPath({
          city: ctx.city,
          window: next,
          fontStop: ctx.fontStop,
        }),
      },
    });
  }

  // The dial is filtering AND the unfiltered bill had shows → offer to drop the
  // filter rather than leave the wall bare over a filtering choice.
  if (ctx.fontStop !== 'everything' && ctx.unfilteredHadShows) {
    actions.push({
      label: `${FONT_STOP_LABELS.everything} on the dial`,
      action: { kind: 'dialStop', stop: 'everything' },
    });
  }

  // Always: a fresh city is the universal escape hatch.
  actions.push({
    label: 'Try another city',
    action: { kind: 'openCityField' },
  });

  return actions;
}
