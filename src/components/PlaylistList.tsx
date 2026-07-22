'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { Artist, FontStop } from '../lib/types';
import type { PlaylistEntry } from '../lib/pipeline/order';
import { diffEntries, entryKey } from '../lib/pipeline/rebuildDiff';
import { dayAccentHue } from '../lib/dayAccent';
import { dateLabelFor, dayKeyFor } from '../lib/playlistGrouping';
import { DateDivider } from './DateDivider';
import { TrackRow } from './TrackRow';
import type { SameBillItem } from './StubBack';

/**
 * PlaylistList — the itinerary: day-grouped ticket-stub rows (Task 2.4), with the
 * Task 3.6 in-place re-typeset choreography layered on top.
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.1 + §2.2. Purely
 * presentational — the player owns `currentIndex`/`playing` and the page owns
 * hearts. Rows are addressed by their ORIGINAL flat index in the LIVE `entries`
 * queue so Play / same-bill jumps line up with the player queue.
 *
 * Rebuild choreography (§2.2, ≤800ms, zero fetches): when the dial lands on a new
 * stop `entries` re-derives. Survivors STAY PUT (React keeps them by their stable
 * `entryKey`, never remounted). Newly-arrived rows DROP in (`sf-row-drop`). Rows
 * that left are kept mounted for a short settle window as inert, aria-hidden
 * GHOSTS that shrink + collapse off the sheet (`sf-row-collapse`), then unmount.
 * A rebuild that fires mid-window supersedes the previous one (timer reset +
 * recompute from the current prev→next), so no orphan exit rows are ever stranded.
 */

// Removed rows stay mounted this long so their 250ms collapse reads, then unmount.
// Comfortably under the §2.2 800ms rebuild ceiling.
const REBUILD_SETTLE_MS = 320;

type Phase = 'stay' | 'enter' | 'exit';
interface DisplayRow {
  entry: PlaylistEntry;
  key: string;
  phase: Phase;
}
/** A removed row + the key of the nearest preceding survivor it collapses under. */
interface ExitRow {
  entry: PlaylistEntry;
  key: string;
  anchorKey: string | null;
}

export interface PlaylistListProps {
  entries: PlaylistEntry[];
  artists: Record<string, Artist>;
  /** The playing row's flat index, or -1 if none. */
  currentIndex: number;
  playing: boolean;
  /**
   * The active dial stop, forwarded to each row so a fame-sized (≥28px) display
   * name takes the featured spot ink (pink at marquee / no-arenas, blue at Small
   * Print) — the same chroma-coupled-to-size rule the Lineup Poster prints.
   * Optional + additive: omit (standalone / tests) and names stay newsprint --ink.
   */
  fontStop?: FontStop;
  onPlayIndex: (index: number) => void;
  onHeart?: (artistId: string) => void;
  heartedIds?: Set<string>;
  /**
   * Attached to the `<li>` at `currentIndex` so the container's `useAutoScroll`
   * can scroll the active row into view. Optional + additive — standalone /
   * test renders omit it.
   */
  activeItemRef?: React.Ref<HTMLLIElement>;
  /**
   * Entrance choreography (§2.5): when true the rows drop in staggered on mount
   * (a 2px thud, 70ms apart). Opt-in so standalone/test renders stay static.
   * The CSS animation plays once per row mount; reduced motion flattens it.
   */
  entering?: boolean;
}

/** Guarded `prefers-reduced-motion: reduce` probe — false (motion) under SSR/jsdom. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

export function PlaylistList({
  entries,
  artists,
  currentIndex,
  playing,
  fontStop,
  onPlayIndex,
  onHeart,
  heartedIds,
  activeItemRef,
  entering = false,
}: PlaylistListProps) {
  // Flip exclusivity: the list owns which single stub is open (one-at-a-time).
  // Keyed by the stable entryKey so a headliner's two tracks never share a flip.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  // ── Rebuild choreography state ───────────────────────────────────────────
  const prevEntriesRef = useRef<PlaylistEntry[]>(entries);
  const firstRunRef = useRef(true);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The collapsing exit rows + the set of just-arrived keys (drop-in), or null
  // when the list is settled (all rows are plain survivors).
  const [rebuild, setRebuild] = useState<{ exits: ExitRow[]; added: Set<string> } | null>(
    null,
  );

  useEffect(() => {
    const prev = prevEntriesRef.current;
    // Skip the very first run (mount): the entrance drop is `entering`'s job.
    if (firstRunRef.current) {
      firstRunRef.current = false;
      prevEntriesRef.current = entries;
      return;
    }
    if (prev === entries) return;
    prevEntriesRef.current = entries;

    const { added, removed } = diffEntries(prev, entries);
    const removedSet = new Set(removed);
    const nextKeySet = new Set(entries.map(entryKey));

    // Anchor each removed row under the nearest PRECEDING survivor (its prev
    // context), so the collapse reads where the name used to sit. Removed rows
    // ahead of every survivor collapse at the head (anchorKey === null).
    const exits: ExitRow[] = [];
    let lastSurvivor: string | null = null;
    for (const e of prev) {
      const k = entryKey(e);
      if (nextKeySet.has(k)) lastSurvivor = k;
      else if (removedSet.has(k)) exits.push({ entry: e, key: k, anchorKey: lastSurvivor });
    }

    setRebuild({ exits, added: new Set(added) });
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      setRebuild(null);
      settleTimerRef.current = null;
    }, REBUILD_SETTLE_MS);
  }, [entries]);

  // Never leave a dangling settle timer.
  useEffect(
    () => () => {
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    },
    [],
  );

  // Flat index in the LIVE queue (survivors + arrivals) by stable key.
  const indexByKey = useMemo(() => {
    const m = new Map<string, number>();
    entries.forEach((e, i) => m.set(entryKey(e), i));
    return m;
  }, [entries]);

  // Co-billed acts per show, from the LIVE queue only (ghosts get none).
  const byShow = useMemo(() => {
    const map = new Map<string, Array<{ index: number; entry: PlaylistEntry }>>();
    entries.forEach((entry, index) => {
      const list = map.get(entry.show.id) ?? [];
      list.push({ index, entry });
      map.set(entry.show.id, list);
    });
    return map;
  }, [entries]);

  // ── The union: survivors/arrivals in NEXT order, with exit ghosts woven in
  // at their prev-relative positions (right after their anchoring survivor). ──
  const displayRows = useMemo<DisplayRow[]>(() => {
    const added = rebuild?.added ?? new Set<string>();
    const exits = rebuild?.exits ?? [];
    const rows: DisplayRow[] = [];

    // Head exits (no preceding survivor) collapse at the top.
    for (const ex of exits) {
      if (ex.anchorKey === null) rows.push({ entry: ex.entry, key: ex.key, phase: 'exit' });
    }
    for (const e of entries) {
      const k = entryKey(e);
      rows.push({ entry: e, key: k, phase: added.has(k) ? 'enter' : 'stay' });
      for (const ex of exits) {
        if (ex.anchorKey === k) rows.push({ entry: ex.entry, key: ex.key, phase: 'exit' });
      }
    }
    return rows;
  }, [entries, rebuild]);

  const nameOf = (artistId: string) => artists[artistId]?.normalizedName ?? artistId;

  // Walk the flat union, emitting a DateDivider whenever the calendar day turns.
  const children: React.ReactNode[] = [];
  let currentDay: string | null = null;

  for (const row of displayRows) {
    const { entry, key, phase } = row;
    const { track, show, isEncore } = entry;
    const dayKey = dayKeyFor(show.startsAt);
    if (dayKey !== currentDay) {
      currentDay = dayKey;
      children.push(
        <li key={`day:${key}`}>
          <DateDivider iso={dayKey} label={dateLabelFor(show.startsAt)} />
        </li>,
      );
    }

    if (phase === 'exit') {
      // Inert, aria-hidden ghost: spot ink drained to --ash, type shrinking +
      // collapsing off the sheet. Not a button → out of the a11y/query tree at once.
      children.push(
        <li
          key={key}
          aria-hidden
          className={`mt-2 px-3 ${reducedMotion ? 'sf-row-fade' : 'sf-row-collapse'}`}
        >
          <div
            className="flex items-center bg-surface pl-3"
            style={{
              border: '1px solid var(--line)',
              borderRadius: 'var(--radius-stub, 3px)',
              minHeight: '72px',
              color: 'var(--ash)',
            }}
          >
            <span
              className="min-w-0 flex-1 truncate font-display uppercase"
              style={{
                fontSize: '28px',
                lineHeight: 1,
                letterSpacing: '-0.02em',
                color: 'var(--ash)',
              }}
            >
              {nameOf(track.artistId)}
            </span>
          </div>
        </li>,
      );
      continue;
    }

    const artistId = track.artistId;
    const index = indexByKey.get(key) ?? -1;

    const state =
      index === currentIndex && playing
        ? 'playing'
        : index >= 0 && index < currentIndex
          ? 'played'
          : 'idle';

    // Headliner = last id in billing order (opener…headliner).
    const lastId = show.artistIds[show.artistIds.length - 1];
    const roleOf = artistId === lastId ? 'headliner' : 'opener';

    // Co-billed acts on the same show → tappable same-bill mini-rows. Exclude the
    // act ITSELF (a headliner carries a 2nd track at Marquee, so one show can hold
    // two rows for the same artist — never list an act as its own "same bill") and
    // dedupe so each co-act appears at most once.
    const seenSameBill = new Set<string>([artistId]);
    const sameBill: SameBillItem[] = (byShow.get(show.id) ?? [])
      .filter((sb) => {
        const aid = sb.entry.track.artistId;
        if (seenSameBill.has(aid)) return false;
        seenSameBill.add(aid);
        return true;
      })
      .map((sb) => ({
        artist: nameOf(sb.entry.track.artistId),
        onPlay: () => onPlayIndex(sb.index),
      }));

    // Drop-in for arrivals (and the initial entrance), never under reduced motion.
    const drop = !reducedMotion && (phase === 'enter' || entering);

    children.push(
      <li
        key={key}
        ref={index === currentIndex ? activeItemRef : undefined}
        className={`mt-2 px-3 first:mt-0${drop ? ' sf-row-drop' : ''}`}
        // Stagger the thud; cap the delay so late rows don't dawdle.
        style={drop ? { animationDelay: `${Math.min(Math.max(index, 0), 12) * 70}ms` } : undefined}
      >
        <TrackRow
          artist={nameOf(artistId)}
          title={track.title}
          venue={show.venue.name}
          dateLabel={dateLabelFor(show.startsAt)}
          ticketUrl={show.ticketUrl}
          itunesUrl={track.itunesUrl}
          state={state}
          prominence={artists[artistId]?.prominence ?? 0.5}
          isEncore={isEncore}
          accentHue={dayAccentHue(show.startsAt)}
          fontStop={fontStop}
          hearted={heartedIds?.has(artistId)}
          role={roleOf}
          headliner={nameOf(lastId)}
          sameBill={sameBill}
          isOpen={openKey === key}
          onOpenChange={(next) => setOpenKey(next ? key : null)}
          onPlay={() => index >= 0 && onPlayIndex(index)}
          onHeart={onHeart ? () => onHeart(artistId) : undefined}
        />
      </li>,
    );
  }

  return <ol className="flex flex-col">{children}</ol>;
}
