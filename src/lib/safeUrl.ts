/**
 * Boundary guard for URLs sourced from UNTRUSTED upstream APIs (JamBase offers,
 * iTunes preview/artwork/linkback) before they cross into the bundle and get
 * bound to `<a href>` / `<img src>` / `<audio src>` on the client.
 *
 * React does NOT neutralise `javascript:` (or `data:`) hrefs in a production
 * build — it only warns in dev. So an upstream row carrying
 * `ticketUrl: "javascript:…"` would execute in-origin when the user taps the
 * link. We allow ONLY absolute http(s) URLs through; anything else
 * (javascript:, data:, blob:, file:, protocol-relative, relative, garbage)
 * collapses to '' so the caller renders no link/stream.
 *
 * The URL parser (not a regex) is deliberate: it strips the leading-space and
 * embedded-tab/newline tricks (`java\tscript:`, ` javascript:`) that a naive
 * scheme regex misses, folding them back to their real protocol first.
 *
 * A valid URL is returned VERBATIM (original string, utm/query untouched) — we
 * never re-serialise via URL.href, which would normalise and could alter it.
 */
export function safeHttpUrl(raw: string | undefined | null): string {
  if (!raw) return '';
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return ''; // not absolute / unparseable
  }
  return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? raw : '';
}
