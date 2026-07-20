/**
 * AttributionFooter — the quiet, always-present source credit (Task 5.1).
 *
 * A legal/ToS ship-blocker, not decoration. Two data-provider linkbacks are
 * REQUIRED on every rendered surface (landing, playlist, empty, error):
 *   - JamBase supplies the concert listings → on-site credit + linkback.
 *   - Apple Music supplies the 30s previews + artwork → on-site credit + linkback.
 * (The per-TRACK Apple linkback — the `itunesUrl` on each stub back — is the
 * other half of Apple's terms and lives in StubBack; this footer is the standing
 * site-wide credit.)
 *
 * Mounted ONCE in the root layout so every page carries it. Deliberately
 * recessive: one wrapping mono line at 11px in the quiet ash tones, `·`-separated,
 * with a coverage-honesty aside. Static text + links only — it never reads geo,
 * headers, or the bundle. Bottom padding keeps it clear of the sticky RadioPlayer.
 */
export function AttributionFooter() {
  return (
    <footer
      className="mx-auto w-full max-w-xl px-5 pb-28 pt-10 text-center font-mono text-[11px] leading-relaxed"
      style={{ color: 'var(--ash-quiet)' }}
    >
      <p className="text-balance">
        Concert listings via{' '}
        <a
          href="https://www.jambase.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: 'var(--ash)' }}
        >
          JamBase
        </a>
        {' · '}
        Previews &amp; artwork via{' '}
        <a
          href="https://music.apple.com"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2"
          style={{ color: 'var(--ash)' }}
        >
          Apple Music
        </a>
        {' · '}
        the smallest rooms may not be here yet.
      </p>
    </footer>
  );
}
