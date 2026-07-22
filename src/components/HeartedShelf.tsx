'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { HeartedSong } from '../hooks/useTasteMemory';
import { dateLabelFor } from '../lib/playlistGrouping';
import { PauseIcon, PlayIcon } from './icons';

/**
 * HeartedShelf — the slide-over shelf where hearts finally DO something
 * (Hearted Shelf design, 2026-07-22, Parts 2–3).
 *
 * A ShareSheet-family overlay (same z-40 backdrop / z-50 dialog ladder, same
 * focus trap): title in the print voice — "YOUR HEARTED" with a stamped tally —
 * over a newest-first list of compact stubs, one per stored `HeartedSong`
 * snapshot. Everything renders from the snapshot alone: ZERO fetches (the €5/mo
 * JamBase cap), and taste data never leaves the browser (the privacy rule) —
 * the "full tour →" link is an outbound navigation the USER clicks, not data we
 * send.
 *
 * Audio discipline: the shelf owns its OWN single `<audio>` element — it never
 * touches the screen's radio element. But two previews at once is noise, so
 * before a shelf preview sounds we fire `onWillPlay` and the screen pauses the
 * main radio. Opening the shelf alone plays nothing and pauses nothing.
 *
 * NO fame sizing anywhere: the shelf is YOUR list, not the bill — billing-driven
 * prominence rules don't apply here, so titles and artists sit in plain
 * newsprint `--ink`.
 */

export interface HeartedShelfProps {
  /** The stored snapshots, straight from `useTasteMemory().heartedSongs`. */
  songs: HeartedSong[];
  /** ✕-unheart — no confirmation; the heart on the main list is the undo. */
  onUnheart: (song: HeartedSong) => void;
  /**
   * Fired BEFORE a shelf preview starts. The screen wires this to pause the
   * main radio (its audio element + player state are screen-local, so the
   * shelf can't — and shouldn't — reach them directly).
   */
  onWillPlay: () => void;
  /** Esc / ✕ / backdrop. The parent owns the open state and unmounts us. */
  onClose: () => void;
}

// Same focusable roster as ShareSheet's trap — keep the two overlays in step.
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

// Outbound tour pointer — a JamBase SEARCH link, keeping attribution with the
// data source while never spending an API call (design: "a link-out, never a
// fetch").
const JAMBASE_SEARCH = 'https://www.jambase.com/search?q=';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** One copyable line per song: `Fontaines D.C. — Starburster · https://…`. */
function playlistLine(song: HeartedSong): string {
  return `${song.artist} — ${song.title} · ${song.itunesUrl}`;
}

export function HeartedShelf({ songs, onUnheart, onWillPlay, onClose }: HeartedShelfProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  // Which stub is sounding (itunesTrackId), or null. The SONG rides in a ref so
  // the audio `onError` can name the right Apple fallback even if the list
  // re-sorts between play and failure.
  const [playingId, setPlayingId] = useState<number | null>(null);
  const activeSongRef = useRef<HeartedSong | null>(null);
  const [copied, setCopied] = useState(false);
  // Clipboard denied → the list goes into a selectable box instead of a toast.
  const [copyFallback, setCopyFallback] = useState<string | null>(null);

  // Newest-first by heartedAt — the shelf reads as "what you just kept".
  const sorted = useMemo(
    () => [...songs].sort((a, b) => Date.parse(b.heartedAt) - Date.parse(a.heartedAt)),
    [songs],
  );
  const listText = useMemo(() => sorted.map(playlistLine).join('\n'), [sorted]);

  // Focus trap + Esc — ShareSheet's pattern, but keyed on MOUNT (the parent
  // mounts us only while open). `onClose` rides in a latest-handler ref (the
  // screen recreates it per render) so the trap subscribes exactly once and
  // never re-runs its focus-into step mid-session.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusables = () =>
      Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );

    // Move focus INTO the dialog on open.
    (focusables()[0] ?? dialog).focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, []);

  // A detached media element can keep sounding in some browsers — never let the
  // shelf's preview outlive the shelf (mirrors PlaylistScreen's unmount pause).
  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  const playSong = (song: HeartedSong) => {
    const el = audioRef.current;
    if (!el) return;
    if (playingId === song.itunesTrackId) {
      // Tapping the sounding stub pauses it — the main radio stays paused;
      // resuming the radio is the player bar's job, not the shelf's.
      el.pause();
      setPlayingId(null);
      return;
    }
    // Pause the main radio FIRST, then start ours synchronously inside the same
    // gesture (the iOS unlock rule the screen's audio also lives by).
    onWillPlay();
    activeSongRef.current = song;
    el.src = song.previewUrl;
    void el.play().catch(() => {});
    setPlayingId(song.itunesTrackId);
  };

  const unheart = (song: HeartedSong) => {
    // Unhearting the sounding stub silences it — a removed stub must not keep
    // playing from beyond the list.
    if (playingId === song.itunesTrackId) {
      audioRef.current?.pause();
      setPlayingId(null);
    }
    onUnheart(song);
  };

  async function handleCopyList() {
    try {
      if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function'
      ) {
        await navigator.clipboard.writeText(listText);
        setCopied(true);
        setCopyFallback(null);
        return;
      }
    } catch {
      // denied — fall through to the selectable box
    }
    setCopyFallback(listText);
  }

  async function handleShare() {
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ text: listText });
        return;
      } catch {
        // user dismissed / unavailable — fall back to copy below
      }
    }
    await handleCopyList();
  }

  const reduced = prefersReducedMotion();

  return (
    <>
      {/* Backdrop — click to close. z-40 covers the fixed player bar (an
          aria-modal dialog must not leave Play/Skip clickable behind it), the
          dialog rides above at z-50 — the same ladder as ShareSheet/LineupPoster. */}
      <div
        data-testid="hearted-shelf-backdrop"
        onClick={onClose}
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(0,0,0,0.4)' }}
        aria-hidden
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Your hearted songs"
        tabIndex={-1}
        className="fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[85dvh] max-w-md flex-col gap-4 overflow-y-auto rounded-t-2xl p-5"
        style={{
          background: 'var(--surface-raised)',
          borderTop: '1px solid var(--line)',
          paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))',
          transition: reduced ? 'none' : 'transform 200ms ease-out',
        }}
      >
        {/* The shelf's OWN single audio element. A stale previewUrl (Apple
            rotates them) fails here → open the song on Apple Music instead, so
            the play tap still lands somewhere honest. */}
        <audio
          ref={audioRef}
          preload="none"
          onEnded={() => setPlayingId(null)}
          onError={() => {
            const song = activeSongRef.current;
            activeSongRef.current = null;
            setPlayingId(null);
            if (song) window.open(song.itunesUrl, '_blank', 'noopener');
          }}
        />

        {/* Masthead: the print-voice title + the stamped tally + ✕. */}
        <div className="flex items-center justify-between gap-2">
          <h2
            className="font-display uppercase"
            style={{ color: 'var(--ink)', fontSize: '28px', letterSpacing: '-0.02em', lineHeight: 1 }}
          >
            YOUR HEARTED{' '}
            {songs.length > 0 ? (
              // The tally, stamped in the heart's own ink — a VALUE, not billing.
              <span
                className="align-middle font-mono text-sm"
                style={{
                  color: 'var(--riso-pink)',
                  border: '1px solid var(--riso-pink)',
                  borderRadius: 'var(--radius-chip, 2px)',
                  padding: '1px 5px',
                  display: 'inline-block',
                  transform: 'rotate(-2deg)',
                }}
              >
                {songs.length}
              </span>
            ) : null}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex shrink-0 items-center justify-center rounded-full leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ width: '44px', height: '44px', color: 'var(--ash)', outlineColor: 'var(--admission)' }}
          >
            <span aria-hidden>✕</span>
          </button>
        </div>

        {sorted.length === 0 ? (
          // The sheet still opens empty — the message teaches what a heart does.
          <p className="text-sm" style={{ color: 'var(--ash)' }}>
            Heart a song on the bill and it’s kept here — with its gig.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {sorted.map((song) => {
              const isPlaying = playingId === song.itunesTrackId;
              // Honest keepsake: a gig whose start has passed is struck through
              // and stamped, never silently dropped — you hearted the song AT
              // that show, and the stub remembers.
              const played = Date.parse(song.gig.startsAt) < Date.now();
              const gigLabel = dateLabelFor(song.gig.startsAt);
              return (
                <li
                  key={song.itunesTrackId}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{
                    background: 'var(--surface)',
                    border: '1px solid var(--line)',
                    borderRadius: 'var(--radius-stub, 3px)',
                  }}
                >
                  {/* Punched-hole play — quiet outline, --admission while
                      sounding, same as the bill's rows. */}
                  <button
                    type="button"
                    aria-label={`${isPlaying ? 'Pause' : 'Play'} ${song.artist} — ${song.title}`}
                    aria-pressed={isPlaying}
                    onClick={() => playSong(song)}
                    className="flex shrink-0 items-center justify-center rounded-full text-sm leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{
                      width: '44px',
                      height: '44px',
                      background: isPlaying ? 'var(--admission)' : 'var(--canvas)',
                      color: isPlaying ? 'var(--canvas)' : 'var(--ink)',
                      border: isPlaying ? 'none' : '1px solid var(--ink)',
                      outlineColor: 'var(--admission)',
                    }}
                  >
                    {isPlaying ? <PauseIcon aria-hidden /> : <PlayIcon aria-hidden />}
                  </button>

                  {/* Artwork thumb — decorative; the text beside it names the song. */}
                  <img
                    src={song.artworkUrl}
                    alt=""
                    aria-hidden
                    className="h-10 w-10 shrink-0 rounded-sm object-cover"
                    style={{ border: '1px solid var(--line)' }}
                  />

                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    {/* Title + artist in plain newsprint — NO fame sizing (your
                        list, not the bill). Faces differ so the pair still reads. */}
                    <span className="truncate text-sm" style={{ color: 'var(--ink)' }}>
                      {song.title}
                    </span>
                    <span
                      className="truncate font-mono text-xs uppercase"
                      style={{ color: 'var(--ink)', letterSpacing: '0.02em' }}
                    >
                      {song.artist}
                    </span>

                    {/* The gig line, mono: `SAT 20 · PARADISE · LISBON` → tickets. */}
                    <span className="flex min-w-0 items-center gap-2">
                      <a
                        href={song.gig.ticketUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate font-mono text-xs uppercase underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2"
                        style={{ color: 'var(--ash)', outlineColor: 'var(--admission)' }}
                      >
                        <span style={{ textDecoration: played ? 'line-through' : undefined }}>
                          {gigLabel}
                        </span>
                        {` · ${song.gig.venue.toUpperCase()} · ${song.gig.city.toUpperCase()}`}
                      </a>
                      {played ? (
                        // Amber rubber-stamp overprint, slight misregistration —
                        // the same stamp voice as PREVIEW UNAVAILABLE.
                        <span
                          className="shrink-0 font-mono text-[11px] uppercase"
                          style={{
                            color: 'var(--stamp-amber)',
                            border: '1px solid var(--stamp-amber)',
                            borderRadius: 'var(--radius-chip, 2px)',
                            padding: '1px 4px',
                            opacity: 0.85,
                            transform: 'rotate(-1.5deg)',
                            display: 'inline-block',
                          }}
                        >
                          PLAYED
                        </span>
                      ) : null}
                    </span>

                    {/* Outbound tour pointer — a search LINK, never a fetch. */}
                    <a
                      href={`${JAMBASE_SEARCH}${encodeURIComponent(song.artist)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Full tour dates for ${song.artist}`}
                      className="self-start font-mono text-xs focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ color: 'var(--riso-blue)', outlineColor: 'var(--admission)' }}
                    >
                      full tour →
                    </a>
                  </div>

                  {/* ✕-unheart, no confirmation — the row heart is the undo. */}
                  <button
                    type="button"
                    aria-label={`Unheart ${song.artist} — ${song.title}`}
                    onClick={() => unheart(song)}
                    className="flex shrink-0 items-center justify-center rounded-full leading-none focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={{ width: '44px', height: '44px', color: 'var(--ash)', outlineColor: 'var(--admission)' }}
                  >
                    <span aria-hidden>✕</span>
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        {/* Footer — the v1 "playlist" takeaway. Only when there's a list to take. */}
        {sorted.length > 0 ? (
          <div
            className="flex flex-col gap-2 pt-3"
            style={{ borderTop: '1px dashed var(--line)' }}
          >
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCopyList}
                className="flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  outlineColor: 'var(--admission)',
                }}
              >
                <span>{copied ? 'Copied — one line per song' : 'Copy list'}</span>
                <span aria-hidden>{copied ? '✓' : '⧉'}</span>
              </button>
              <button
                type="button"
                onClick={handleShare}
                className="flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                  outlineColor: 'var(--admission)',
                }}
              >
                <span>Share</span>
                <span aria-hidden>↗</span>
              </button>
            </div>
            {copyFallback !== null ? (
              // Clipboard denied/absent → the list in a selectable box, so the
              // takeaway still works by hand. readOnly, never editable.
              <textarea
                readOnly
                aria-label="Your hearted list"
                value={copyFallback}
                rows={Math.min(sorted.length + 1, 6)}
                className="w-full rounded-lg p-2 font-mono text-xs"
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--line)',
                  color: 'var(--ink)',
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
