'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TimeWindow } from '../lib/types';
import { nearestCity } from '../lib/api/geo';

/**
 * UseMyLocation — the optional GPS "upgrade" (tier 2 of automatic location
 * detection). Unlike the IP redirect (tier 1, in middleware) this prompts the
 * browser's precise-geolocation permission — so it fires ONLY ON CLICK, never
 * on mount. On success it snaps the exact coords to the nearest covered city
 * (`nearestCity`) and routes there; a mid-Atlantic / out-of-range fix shows a
 * quiet "not in your area yet"; a denied/failed prompt shows a quiet
 * "couldn't get your location". Never throws.
 */

export interface UseMyLocationProps {
  window?: TimeWindow;
  className?: string;
}

type Status = 'idle' | 'locating' | 'out-of-range' | 'error';

export function UseMyLocation({ window: timeWindow, className }: UseMyLocationProps) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('idle');

  function handleClick() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('error');
      return;
    }
    setStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const hit = nearestCity(pos.coords.latitude, pos.coords.longitude);
        if (hit) {
          router.push(`/${hit.slug}/${timeWindow ?? 'next-14-days'}`);
          return;
        }
        setStatus('out-of-range');
      },
      () => setStatus('error'),
    );
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'locating'}
        className="self-start text-sm text-ash underline underline-offset-4 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-weekday-fri hover:text-ink disabled:opacity-60"
      >
        {status === 'locating' ? 'Locating…' : 'Use my exact location'}
      </button>
      {status === 'out-of-range' && (
        <p role="status" className="mt-1 text-xs text-ash-quiet">
          We&apos;re not in your area yet.
        </p>
      )}
      {status === 'error' && (
        <p role="status" className="mt-1 text-xs text-ash-quiet">
          Couldn&apos;t get your location.
        </p>
      )}
    </div>
  );
}
