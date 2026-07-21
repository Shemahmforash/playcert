'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TimeWindow } from '../lib/types';
import { CITY_TABLE, geoForCity } from '../lib/api/geo';
import { slugify } from '../lib/pipeline/extractArtists';
import { WindowChips } from './WindowChips';
import { UseMyLocation } from './UseMyLocation';
import { PlayIcon } from './icons';

/**
 * CityPicker — the landing entry point (Task 2.7).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md. Two paths:
 *  - IP prefill of a COVERED city → an oversized "▶ Play {City}" that routes to
 *    `/{slug}/{window}` for the selected WindowChip, plus a "not {City}?" escape
 *    hatch that reveals the CityField typeahead.
 *  - null prefill OR a prefill we don't cover → a generic "▶ Play your city"
 *    fallback with the CityField open by default.
 *
 * ADAPTATION: we have no real geocoder. City→coords is the hand-curated
 * `CITY_TABLE` via `geoForCity` (a pure, key-free function safe to import
 * client-side), so typed cities are validated in the browser — covered → route,
 * else the inline miss copy. No commit-only geocode server action is needed.
 *
 * The live "pre-play" dial is Phase 3 and is deliberately OMITTED here.
 */

export interface CityPickerProps {
  prefill: { displayName: string; slug: string } | null;
}

const MISS_COPY = "Can't find that one — try the nearest big city.";

const COVERED_CITIES = Object.values(CITY_TABLE)
  .map((g) => g.displayName)
  .join(', ');

export function CityPicker({ prefill }: CityPickerProps) {
  const router = useRouter();

  const prefillGeo = prefill ? geoForCity(prefill.slug) : null;
  const covered = prefillGeo !== null;

  const [window, setWindow] = useState<TimeWindow>('next-14-days');
  // In the fallback the field is open from the start; with a covered prefill it
  // stays hidden until the visitor taps "not {City}?".
  const [fieldOpen, setFieldOpen] = useState(!covered);
  const [cityInput, setCityInput] = useState('');
  const [miss, setMiss] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keep focus on the field when it opens or after a miss (field stays open).
  useEffect(() => {
    if (fieldOpen) inputRef.current?.focus();
  }, [fieldOpen, miss]);

  function playPrefill() {
    if (!prefill) return;
    router.push(`/${prefill.slug}/${window}`);
  }

  function commitCity(e: React.FormEvent) {
    e.preventDefault();
    const slug = slugify(cityInput);
    if (slug && geoForCity(slug)) {
      router.push(`/${slug}/${window}`);
      return;
    }
    setMiss(true);
  }

  return (
    <div className="flex flex-col gap-6">
      <WindowChips value={window} onChange={setWindow} />

      {covered && prefill ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={playPrefill}
            className="inline-flex items-center gap-2 self-start rounded-[4px] bg-riso-pink px-6 py-4 font-display text-3xl font-extrabold uppercase tracking-[-0.02em] text-canvas outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri sm:text-4xl"
          >
            <PlayIcon className="h-[0.8em] w-[0.8em] shrink-0" />Play {prefill.displayName}
          </button>
          <button
            type="button"
            onClick={() => setFieldOpen((o) => !o)}
            aria-expanded={fieldOpen}
            className="self-start text-sm text-ash underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri hover:text-ink"
          >
            not {prefill.displayName}?
          </button>
        </div>
      ) : (
        <p className="inline-flex items-center gap-2 font-display text-3xl font-extrabold uppercase tracking-[-0.02em] text-ink sm:text-4xl">
          <PlayIcon className="h-[0.8em] w-[0.8em] shrink-0" />Play your city
        </p>
      )}

      {/* GPS upgrade — jump straight to the visitor's precise city. Prompts the
          browser geolocation permission ONLY on click, never on mount. */}
      <UseMyLocation window={window} />

      {fieldOpen && (
        <form onSubmit={commitCity} className="flex flex-col gap-2" noValidate>
          <label htmlFor="city-field" className="text-xs uppercase tracking-[0.2em] text-ash">
            Your city
          </label>
          <input
            id="city-field"
            ref={inputRef}
            type="text"
            name="city"
            autoComplete="off"
            value={cityInput}
            onChange={(e) => {
              setCityInput(e.target.value);
              if (miss) setMiss(false);
            }}
            aria-invalid={miss}
            aria-describedby={miss ? 'city-field-error' : 'city-field-hint'}
            placeholder="Type a city, then press Enter"
            className="w-full max-w-sm rounded-[4px] border border-line bg-surface px-3 py-2 text-base text-ink outline-none placeholder:text-ash-quiet focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri"
          />
          {miss ? (
            <p id="city-field-error" role="alert" className="text-sm text-stamp-amber">
              {MISS_COPY}
            </p>
          ) : (
            <p id="city-field-hint" className="text-xs text-ash-quiet">
              Covered: {COVERED_CITIES}
            </p>
          )}
        </form>
      )}

      {/* Privacy one-liner — approximate location only, nothing stored. */}
      <p className="text-[11px] leading-snug text-ash-quiet">
        We use your approximate location to show nearby gigs — no account, no
        cookies, nothing stored.
      </p>
    </div>
  );
}
