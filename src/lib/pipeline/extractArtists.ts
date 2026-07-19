import type { Artist, Show } from '../types';

const PRESENTS_RE = /^.*?\bpresents:?\s+/i;
const TOUR_RE = /\s*[-–—:]\s*[^-–—:]*\btour\b.*$/i;
const STRONG_TRIBUTE_RE = /\btribute\b|\bplays\s+[a-z]/i;
const SHOW_PATTERN_RE = /^the\s+(.+?)\s+show$/i;
const FAMOUS = new Set(['doors', 'beatles', 'queen', 'abba', 'pink floyd', 'elvis', 'eagles', 'bee gees', 'led zeppelin', 'rolling stones']);

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function normalizeName(raw: string): string {
  return raw.replace(PRESENTS_RE, '').replace(TOUR_RE, '').trim();
}

export function detectTribute(raw: string): boolean {
  if (STRONG_TRIBUTE_RE.test(raw)) return true;
  const m = SHOW_PATTERN_RE.exec(raw.trim());
  return !!m && FAMOUS.has(m[1].toLowerCase());
}

/** Mutates shows[].artistIds (billed order) and returns the deduped artist map. */
export function extractArtists(shows: Show[]): Record<string, Artist> {
  const artists: Record<string, Artist> = {};
  for (const show of shows) {
    show.artistIds = show.attractions.map((att, slot) => {
      const normalized = normalizeName(att.name);
      const id = slugify(normalized);
      const a = (artists[id] ??= {
        id, rawNames: [], normalizedName: normalized,
        isTribute: detectTribute(att.name),
        prominence: 0, tier: 'mid', billingSlots: [],
      });
      if (!a.rawNames.includes(att.name)) a.rawNames.push(att.name);
      a.billingSlots.push({ showId: show.id, slot, ofSlots: show.attractions.length });
      return id;
    });
  }
  return artists;
}
