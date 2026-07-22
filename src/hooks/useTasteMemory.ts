'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useTasteMemory — the listener's private taste memory: the songs they've
 * hearted and the artists they've skipped. Task 2.10 formalized the ad-hoc
 * hearts localStorage; the Hearted Shelf design (2026-07-22) moves hearts from
 * artist-level to song-level so a heart can build a takeaway playlist.
 *
 * A heart now stores a self-contained `HeartedSong` snapshot — track, artwork,
 * preview, Apple Music link, AND the gig that introduced it — captured at
 * heart-time so the shelf renders with ZERO fetches. Skips stay artistId-keyed.
 *
 * PRIVACY CONSTRAINT (not code — a rule this module and its callers must keep):
 * taste memory lives ONLY in the browser's localStorage. It is NEVER serialized
 * into any request — no query string, header, cookie, or fetch/POST body ever
 * carries it. It exists purely to personalize the client; the server neither
 * sees nor stores it.
 *
 * SSR-safety: nothing here touches `window`/`localStorage` during render, so the
 * server render and the first client render are identical (empty). The stored
 * value is read in a mount `useEffect` and hydrated in. Every storage access is
 * wrapped in try/catch so a throwing/absent localStorage (private mode,
 * disabled storage) degrades to an in-memory no-op instead of crashing.
 */

// Versioned so the shape can evolve without misreading old data. v2 replaces
// v1's artist-keyed heart set with song snapshots (see migration below).
export const TASTE_STORAGE_KEY = 'earshot:taste:v2';
export const TASTE_STORAGE_KEY_V1 = 'earshot:taste:v1';

/**
 * Everything the Hearted shelf needs to render one hearted song — snapshotted
 * at heart-time, self-contained on purpose: reading it back must never require
 * a fetch (protects both the €5/mo JamBase cap and the privacy rule above).
 */
export interface HeartedSong {
  itunesTrackId: number; // stable key (dedupe/toggle)
  title: string;
  artist: string; // normalizedName at heart-time
  artistId: string;
  previewUrl: string; // 30s preview — playable in the shelf
  artworkUrl: string;
  itunesUrl: string; // "open in Apple Music" per song
  heartedAt: string; // ISO — shelf sorts newest-first
  gig: {
    // the show that introduced you
    venue: string;
    city: string;
    startsAt: string; // ISO — lets the shelf say "past gig" honestly
    ticketUrl: string; // JamBase deep link
  };
}

export interface TasteMemory {
  heartedSongs: HeartedSong[];
  skipped: Set<string>;
  toggleHeartSong(snapshot: HeartedSong): void;
  isHearted(itunesTrackId: number): boolean;
  markSkipped(id: string): void;
}

interface StoredTaste {
  heartedSongs: HeartedSong[];
  skipped: string[];
}

const EMPTY: StoredTaste = { heartedSongs: [], skipped: [] };

/** Only keep string entries — tolerates a malformed / wrong-shape payload. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/**
 * The leading calendar-date shape the shelf's date rendering REQUIRES:
 * `dateLabelFor`/`dayKeyFor` (playlistGrouping) throw on any string without a
 * `YYYY-MM-DD` prefix. So "is a string" is not strict enough for `startsAt` —
 * a corrupted "TBA" or an unpadded "2026-8-1T20:00" would pass typeof, hydrate,
 * and then crash the ENTIRE screen render on every shelf open until storage is
 * cleared. Mirrors calendarParts' own regex (including its trim).
 */
const CALENDAR_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/**
 * Validate one stored entry as a usable HeartedSong. Strict on purpose: a stub
 * with a missing gig or a non-numeric id would crash or lie in the shelf, so a
 * bad entry is dropped rather than half-rendered. Valid neighbours survive.
 */
function isHeartedSong(value: unknown): value is HeartedSong {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  const gig = v.gig as Record<string, unknown> | null | undefined;
  return (
    typeof v.itunesTrackId === 'number' &&
    typeof v.title === 'string' &&
    typeof v.artist === 'string' &&
    typeof v.artistId === 'string' &&
    typeof v.previewUrl === 'string' &&
    typeof v.artworkUrl === 'string' &&
    typeof v.itunesUrl === 'string' &&
    typeof v.heartedAt === 'string' &&
    typeof gig === 'object' &&
    gig !== null &&
    typeof gig.venue === 'string' &&
    typeof gig.city === 'string' &&
    typeof gig.startsAt === 'string' &&
    CALENDAR_DATE_PREFIX.test(gig.startsAt.trim()) &&
    typeof gig.ticketUrl === 'string'
  );
}

/** Only keep well-formed song snapshots — tolerates garbage among the good. */
function toHeartedSongs(value: unknown): HeartedSong[] {
  return Array.isArray(value) ? value.filter(isHeartedSong) : [];
}

/**
 * Read + parse the stored taste, migrating v1 if that's all there is.
 * Server, absent storage, or garbage → EMPTY.
 *
 * Migration is honest about what it can keep: v1 hearts were artistIds, and an
 * artistId cannot reconstruct a song snapshot — so `skipped` is carried forward
 * and the old artist-hearts are let go. One-time: v1 is removed after reading,
 * and once a v2 record exists v1 is never consulted again (so v2 can't be
 * clobbered by a stale v1 left behind by a failed removeItem).
 */
function readStored(): StoredTaste {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(TASTE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown as Partial<StoredTaste>;
      return {
        heartedSongs: toHeartedSongs(parsed?.heartedSongs),
        skipped: toStringArray(parsed?.skipped),
      };
    }
    // No v2 yet — migrate whatever v1 left us, then retire the key. The
    // persist effect writes the migrated state under the v2 key right after
    // hydration, which is what makes this a one-time move.
    const rawV1 = window.localStorage.getItem(TASTE_STORAGE_KEY_V1);
    if (!rawV1) return EMPTY;
    window.localStorage.removeItem(TASTE_STORAGE_KEY_V1);
    const parsedV1 = JSON.parse(rawV1) as unknown as { skipped?: unknown };
    return { heartedSongs: [], skipped: toStringArray(parsedV1?.skipped) };
  } catch {
    // Malformed JSON or unavailable storage — treat as no memory.
    return EMPTY;
  }
}

export function useTasteMemory(): TasteMemory {
  // Start empty on both server and first client render (SSR-stable). Real data
  // is hydrated in the mount effect below.
  const [heartedSongs, setHeartedSongs] = useState<HeartedSong[]>(() => []);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once, on mount (client only).
  useEffect(() => {
    const stored = readStored();
    setHeartedSongs(stored.heartedSongs);
    setSkipped(new Set(stored.skipped));
    setHydrated(true);
  }, []);

  // Persist on every change — but only after hydration, so the empty initial
  // state can never clobber the stored value before the mount read has run.
  useEffect(() => {
    if (!hydrated || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(
        TASTE_STORAGE_KEY,
        JSON.stringify({ heartedSongs, skipped: [...skipped] }),
      );
    } catch {
      // Private mode / disabled storage — best-effort, stay in memory.
    }
  }, [hydrated, heartedSongs, skipped]);

  const toggleHeartSong = useCallback((snapshot: HeartedSong) => {
    setHeartedSongs((prev) => {
      // Identity is the itunesTrackId — a re-heart with drifted metadata still
      // unhears, and filtering (not splicing) also sweeps out any duplicate
      // ids a corrupt stored payload might have smuggled in.
      const without = prev.filter((s) => s.itunesTrackId !== snapshot.itunesTrackId);
      return without.length < prev.length ? without : [...prev, snapshot];
    });
  }, []);

  const isHearted = useCallback(
    (itunesTrackId: number) => heartedSongs.some((s) => s.itunesTrackId === itunesTrackId),
    [heartedSongs],
  );

  const markSkipped = useCallback((id: string) => {
    setSkipped((prev) => {
      if (prev.has(id)) return prev; // idempotent — no needless re-render/write
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return { heartedSongs, skipped, toggleHeartSong, isHearted, markSkipped };
}
