'use client';

import { Fragment, useMemo, useState } from 'react';
import type { Artist, TimeWindow } from '../lib/types';
import type { PlaylistEntry } from '../lib/pipeline/order';
import { dayAccentHue } from '../lib/dayAccent';
import { dateLabelFor, groupByDay } from '../lib/playlistGrouping';
import { DateDivider } from './DateDivider';
import { TrackRow } from './TrackRow';
import type { SameBillItem } from './StubBack';

/**
 * PlaylistList — the itinerary: day-grouped ticket-stub rows (Task 2.4).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.1. Purely
 * presentational — the player owns `currentIndex`/`playing` and the page owns
 * hearts; this component only maps the ordered playlist onto `DateDivider`s and
 * `TrackRow`s and enforces one-stub-open-at-a-time. Rows are addressed by their
 * ORIGINAL flat index so Play / same-bill jumps line up with the player queue.
 */

export interface PlaylistListProps {
  entries: PlaylistEntry[];
  artists: Record<string, Artist>;
  /** The playing row's flat index, or -1 if none. */
  currentIndex: number;
  playing: boolean;
  /** Report context threaded into each stub-back beacon. */
  city: string;
  window: TimeWindow;
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

export function PlaylistList({
  entries,
  artists,
  currentIndex,
  playing,
  city,
  window,
  onPlayIndex,
  onHeart,
  heartedIds,
  activeItemRef,
  entering = false,
}: PlaylistListProps) {
  // Flip exclusivity: the list owns which single stub is open (one-at-a-time).
  const [openId, setOpenId] = useState<string | null>(null);

  const groups = useMemo(() => groupByDay(entries), [entries]);

  // Map each show to its billed entries (with flat indices) for same-bill rows.
  const byShow = useMemo(() => {
    const map = new Map<string, Array<{ index: number; entry: PlaylistEntry }>>();
    entries.forEach((entry, index) => {
      const list = map.get(entry.show.id) ?? [];
      list.push({ index, entry });
      map.set(entry.show.id, list);
    });
    return map;
  }, [entries]);

  const nameOf = (artistId: string) =>
    artists[artistId]?.normalizedName ?? artistId;

  return (
    <ol className="flex flex-col">
      {groups.map((group) => (
        <Fragment key={group.dayKey}>
          <li>
            <DateDivider iso={group.dayKey} label={group.dateLabel} />
          </li>

          {group.entries.map(({ entry, index }) => {
            const { track, show, isEncore } = entry;
            const artistId = track.artistId;
            const rowKey = `${show.id}:${artistId}`;

            const state =
              index === currentIndex && playing
                ? 'playing'
                : index < currentIndex
                  ? 'played'
                  : 'idle';

            // Headliner = last id in billing order (opener…headliner).
            const lastId = show.artistIds[show.artistIds.length - 1];
            const role = artistId === lastId ? 'headliner' : 'opener';

            // Co-billed acts on the same show → tappable same-bill mini-rows.
            const sameBill: SameBillItem[] = (byShow.get(show.id) ?? [])
              .filter((sb) => sb.index !== index)
              .map((sb) => ({
                artist: nameOf(sb.entry.track.artistId),
                onPlay: () => onPlayIndex(sb.index),
              }));

            return (
              <li
                key={rowKey}
                ref={index === currentIndex ? activeItemRef : undefined}
                className={`mt-2 px-3 first:mt-0${entering ? ' sf-row-drop' : ''}`}
                // Stagger the thud; cap the delay so late rows don't dawdle.
                style={
                  entering
                    ? { animationDelay: `${Math.min(index, 12) * 70}ms` }
                    : undefined
                }
              >
                <TrackRow
                  artist={nameOf(artistId)}
                  title={track.title}
                  venue={show.venue.name}
                  dateLabel={dateLabelFor(show.startsAt)}
                  ticketUrl={show.ticketUrl}
                  state={state}
                  prominence={artists[artistId]?.prominence ?? 0.5}
                  isEncore={isEncore}
                  accentHue={dayAccentHue(show.startsAt)}
                  hearted={heartedIds?.has(artistId)}
                  role={role}
                  headliner={nameOf(lastId)}
                  sameBill={sameBill}
                  report={{ city, window, artistId, showId: show.id }}
                  isOpen={openId === rowKey}
                  onOpenChange={(next) => setOpenId(next ? rowKey : null)}
                  onPlay={() => onPlayIndex(index)}
                  onHeart={onHeart ? () => onHeart(artistId) : undefined}
                />
              </li>
            );
          })}
        </Fragment>
      ))}
    </ol>
  );
}
