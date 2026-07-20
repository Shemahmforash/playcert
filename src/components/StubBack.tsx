'use client';

import { useState } from 'react';

/**
 * StubBack — the flipped-over ticket-stub back face (Task 2.3).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.1. Entirely the
 * box-office mono voice (`--font-mono`) on `--surface-raised`: venue + doors +
 * date, the billing sentence (opener → "opening for {headliner}" with the
 * headliner in `--riso-blue`; headliner → "— headlining"), optional same-bill
 * mini-rows, the full-width `Tickets ▸` admission-stamp deep link (the required
 * TM attribution), and the fire-once `wrong artist?` beacon that becomes
 * `Thanks — noted`.
 *
 * This face is rendered by TrackRow inside the 3D flip container; TrackRow owns
 * whether it is visible/inert. StubBack itself is presentation + the beacon.
 */

/** A `next-14-days`-style listing window, matching the report endpoint's Zod enum. */
export type ReportWindow = 'tonight' | 'this-weekend' | 'next-14-days';

export interface SameBillItem {
  artist: string;
  onPlay: () => void;
}

export interface StubReport {
  city: string;
  window: ReportWindow;
  artistId: string;
  showId: string;
}

export interface StubBackProps {
  artist: string;
  venue: string;
  dateLabel: string;
  doors?: string;
  ticketUrl: string;
  /**
   * Apple linkback for THIS track (Track.itunesUrl). Apple's API terms REQUIRE a
   * linkback to the track on Apple wherever we use its preview/artwork, so every
   * rendered track surfaces it here as a quiet "Apple Music ▸" next to Tickets.
   */
  itunesUrl?: string;
  /** 'opener' bills "opening for {headliner}"; 'headliner' bills "— headlining". */
  role?: 'opener' | 'headliner';
  headliner?: string;
  sameBill?: SameBillItem[];
  /** Payload POSTed to /api/report-artist when `wrong artist?` is tapped. */
  report?: StubReport;
  /** Flip back to the front (the ✕ close). */
  onClose: () => void;
}

export function StubBack({
  artist,
  venue,
  dateLabel,
  doors,
  ticketUrl,
  itunesUrl,
  role,
  headliner,
  sameBill,
  report,
  onClose,
}: StubBackProps) {
  // The `wrong artist?` beacon fires exactly once: once noted, the control
  // disables and never fetches again (fire-and-forget, errors swallowed).
  const [noted, setNoted] = useState(false);

  function reportWrongArtist() {
    if (noted) return;
    setNoted(true);
    try {
      void fetch('/api/report-artist', {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          report ?? { city: '', window: 'next-14-days', artistId: '', showId: '' },
        ),
      }).catch(() => {
        // fire-and-forget — the client never depends on the response.
      });
    } catch {
      // swallow — a missing fetch / sync throw must never surface to the user.
    }
  }

  return (
    <div
      className="flex h-full flex-col gap-2 px-3 py-2 font-mono text-xs"
      style={{ background: 'var(--surface-raised)', color: 'var(--ink)' }}
    >
      {/* ✕ close — top-right, flips back to the front face. */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate uppercase" style={{ color: 'var(--ink)' }}>
            {venue}
            {doors ? ` · DOORS ${doors}` : ''}
          </div>
          <div className="uppercase" style={{ color: 'var(--ash)' }}>
            {dateLabel}
          </div>
        </div>
        <button
          type="button"
          aria-label="Close stub"
          onClick={onClose}
          className="flex shrink-0 items-center justify-center rounded-full leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: '44px', height: '44px', color: 'var(--ash)' }}
        >
          <span aria-hidden>✕</span>
        </button>
      </div>

      {/* Billing framing. */}
      <p style={{ color: 'var(--ink)' }}>
        {role === 'opener' && headliner ? (
          <>
            {artist} opening for{' '}
            <span style={{ color: 'var(--riso-blue)' }}>{headliner}</span>
          </>
        ) : (
          <>{artist} — headlining</>
        )}
      </p>

      {/* Same-bill mini-rows — small tappable rows in the inversion ink. */}
      {sameBill && sameBill.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {sameBill.map((item, i) => (
            <li key={`${item.artist}-${i}`}>
              <button
                type="button"
                onClick={item.onPlay}
                className="w-full truncate text-left focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: 'var(--riso-blue)', minHeight: '32px' }}
              >
                ▸ {item.artist}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Full-width Tickets deep link — the pink ADMIT ONE rubber stamp. */}
      <a
        href={ticketUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center uppercase focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          minHeight: '44px',
          border: '1px solid var(--riso-pink)',
          borderRadius: 'var(--radius-chip, 2px)',
          color: 'var(--riso-pink)',
          letterSpacing: '0.08em',
          transform: 'rotate(-1deg)', // slight rubber-stamp misregistration
        }}
      >
        Tickets ▸
      </a>

      {/* Apple linkback for this track — a ToS requirement wherever we use the
          Apple-hosted preview/artwork. Quiet mono row beneath the Tickets stamp;
          rendered whenever the track carries an itunesUrl (always, in the list). */}
      {itunesUrl ? (
        <a
          href={itunesUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center uppercase focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: '32px', color: 'var(--ash)', letterSpacing: '0.06em' }}
        >
          Apple Music ▸
        </a>
      ) : null}

      {/* wrong artist? — fires the beacon once, then reads "Thanks — noted". */}
      <div className="mt-auto flex justify-end">
        <button
          type="button"
          onClick={reportWrongArtist}
          disabled={noted}
          className="text-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
          style={{ color: 'var(--ash)' }}
        >
          {noted ? 'Thanks — noted' : 'wrong artist?'}
        </button>
      </div>
    </div>
  );
}
