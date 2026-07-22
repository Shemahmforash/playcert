/**
 * StubBack — the flipped-over ticket-stub back face (Task 2.3).
 *
 * SSOT: docs/design/2026-07-19-phase2-design-system.md §2.1. Entirely the
 * box-office mono voice (`--font-mono`) on `--surface-raised`: venue + doors +
 * date, the billing sentence (opener → "opening for {headliner}" with the
 * headliner in `--riso-blue`; headliner → "— headlining"), optional same-bill
 * mini-rows, and the full-width `Tickets ▸` admission-stamp deep link (the
 * required TM attribution).
 *
 * This face is rendered by TrackRow inside the 3D flip container; TrackRow owns
 * whether it is visible/inert. StubBack itself is pure presentation.
 */

export interface SameBillItem {
  artist: string;
  onPlay: () => void;
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
  onClose,
}: StubBackProps) {
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
    </div>
  );
}
