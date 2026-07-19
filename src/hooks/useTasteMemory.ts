'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * useTasteMemory — the listener's private taste memory: the artists they've
 * hearted and the ones they've skipped, keyed by a stable per-artist id
 * (artistId). Task 2.10 formalizes the ad-hoc hearts localStorage that Task 2.5
 * inlined into PlaylistScreen.
 *
 * PRIVACY CONSTRAINT (not code — a rule this module and its callers must keep):
 * taste memory lives ONLY in the browser's localStorage. It is NEVER serialized
 * into any request — no query string, header, cookie, or fetch/POST body ever
 * carries it. It exists purely to personalize the client; the server neither
 * sees nor stores it.
 *
 * SSR-safety: nothing here touches `window`/`localStorage` during render, so the
 * server render and the first client render are identical (empty sets). The
 * stored value is read in a mount `useEffect` and hydrated in. Every storage
 * access is wrapped in try/catch so a throwing/absent localStorage (private
 * mode, disabled storage) degrades to an in-memory no-op instead of crashing.
 */

// Versioned so the shape can evolve without misreading old data.
export const TASTE_STORAGE_KEY = 'smallfont:taste:v1';

export interface TasteMemory {
  hearted: Set<string>;
  skipped: Set<string>;
  toggleHeart(id: string): void;
  markSkipped(id: string): void;
}

interface StoredTaste {
  hearted: string[];
  skipped: string[];
}

const EMPTY: StoredTaste = { hearted: [], skipped: [] };

/** Only keep string entries — tolerates a malformed / wrong-shape payload. */
function toStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

/** Read + parse the stored taste. Server, absent storage, or garbage → EMPTY. */
function readStored(): StoredTaste {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(TASTE_STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as unknown as Partial<StoredTaste>;
    return {
      hearted: toStringArray(parsed?.hearted),
      skipped: toStringArray(parsed?.skipped),
    };
  } catch {
    // Malformed JSON or unavailable storage — treat as no memory.
    return EMPTY;
  }
}

export function useTasteMemory(): TasteMemory {
  // Start empty on both server and first client render (SSR-stable). Real data
  // is hydrated in the mount effect below.
  const [hearted, setHearted] = useState<Set<string>>(() => new Set());
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage once, on mount (client only).
  useEffect(() => {
    const stored = readStored();
    setHearted(new Set(stored.hearted));
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
        JSON.stringify({ hearted: [...hearted], skipped: [...skipped] }),
      );
    } catch {
      // Private mode / disabled storage — best-effort, stay in memory.
    }
  }, [hydrated, hearted, skipped]);

  const toggleHeart = useCallback((id: string) => {
    setHearted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const markSkipped = useCallback((id: string) => {
    setSkipped((prev) => {
      if (prev.has(id)) return prev; // idempotent — no needless re-render/write
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  return { hearted, skipped, toggleHeart, markSkipped };
}
