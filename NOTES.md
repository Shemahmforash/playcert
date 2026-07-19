# NOTES

## Task 0.2 — Ticketmaster spike

Minimal Ticketmaster Discovery API client (`src/lib/api/ticketmaster.ts`) built
against **live recorded fixtures** (`scripts/record-fixtures.ts` → `tests/fixtures/ticketmaster/`).
Recorder is not run in CI. All queries used `classificationName=Music`, `size=100`,
`sort=date,asc`, `unit=km`.

### CRITICAL: Ticketmaster has NO coverage in Portugal
The planned Lisbon query (`latlong=38.7223,-9.1393`, 14-day window) returned
**HTTP 200 with `page.totalElements: 0`** — zero events. Confirmed with three
independent variants, all 0 events:
- `latlong=38.7223,-9.1393&radius=100` (no date filter)
- `countryCode=PT`
- `city=Lisbon`

`tests/fixtures/ticketmaster/lisbon-14d.json` is the honest empty recording (kept
as evidence). **Ticketmaster is not a viable primary source for a Lisbon product.**
This is why the plan already anticipates a v1.1 SeatGeek merge and an iTunes
enrichment path (Task 0.3) — but note SeatGeek's Iberia coverage is also thin;
the primary Lisbon listings source likely needs revisiting (e.g. Bandsintown,
Songkick, or local venue feeds).

To actually exercise the client and answer the API-shape questions, we recorded
**Madrid** (nearest large covered market — TM API conventions are source-level,
not market-specific):
- `madrid-14d.json` — same 14-day window, **2 events** (sparse).
- `madrid-120d.json` — 120-day / 50 km window, **48 events**, used as the primary
  parser test fixture because it contains multi-attraction (headliner + support) events.

### Pagination shape
`page` object: `{ size, totalElements, totalPages, number }`.
- Empty result (Lisbon): `{ size: 100, totalElements: 0, totalPages: 0, number: 0 }`.
- Madrid 120d: `{ size: 100, totalElements: 48, totalPages: 1, number: 0 }` — one page.
- `number` is the 0-based current page index; `totalPages = ceil(totalElements/size)`.
- No fixture approached the ~1000-event deep-paging cap (TM caps `page*size` at 1000);
  all our result sets fit in a single page, so cursor/deep-paging was not stress-tested.
  When it matters, page via `&page=N` until `number + 1 === totalPages`.

### Billing order (CRITICAL) — HEADLINER-FIRST
`_embedded.attractions` is ordered **headliner first, support/openers after**.
Evidence from `madrid-120d.json` (both multi-attraction acts):
- Event `"The Weeknd: After Hours Til Dawn Tour"` → `attractions = [The Weeknd, Playboi Carti]`.
  The Weeknd (the headliner, and the artist in the event title) is at index **0**;
  Playboi Carti (support) is index 1.
- Event `"Pitbull - I'm Back!"` → `attractions = [Pitbull, Lil Jon]`.
  Pitbull (headliner / event-title artist) index 0; Lil Jon (support) index 1.

**Conclusion:** in every multi-attraction event, the artist named in `event.name`
(the headliner) is at `attractions[0]`. The product should treat
`attractions[0]` as the headliner and later indices as openers. The client
**preserves TM's array order exactly** — do not sort.
(7 of 48 events were multi-attraction; the rest single-attraction.)

### Field sparsity
Across the recorded fixtures:
- **`priceRanges`: ABSENT in 100% of events** (0/48 in madrid-120d, 0/2 in madrid-14d).
  TM's EU inventory rarely exposes price via Discovery. `priceFrom` must be optional
  and is effectively never populated from TM — do not build UX that depends on it.
- **`dates.start.dateTime`: present in 100%** of the recorded events (48/48, 2/2).
  However TM omits it for TBA-time events (returns only `localDate`), so the schema
  keeps it optional with a `localDate`(+`localTime`) fallback for `startsAt`.
- `_embedded.venues[0].name` and `.city.name`: present in 100% of recorded events.
- `url` (ticket deep link): present in 100%.

### 429 shape (rate limiting)
- Default quota is **5000 requests/day** and ~**5 requests/second** burst.
  We tripped a 429 on the 5th rapid request during probing — the per-second burst
  limit is easy to hit; space requests or add backoff.
- Successful (200) responses carry rate headers:
  `Rate-Limit: 5000`, `Rate-Limit-Available: <remaining>` (e.g. 4994),
  `Rate-Limit-Reset: <epoch-ms>`.
- A 429 body is TM's standard fault JSON (`{ fault: { faultstring, detail } }`),
  not the events envelope. We did **not** deliberately trigger a 429 to inspect its
  headers in depth. `fetchEventsPage` throws on non-2xx so the caller can back off
  on 429 using `Rate-Limit-Reset`.

### Zod schema adaptations vs the plan
The schema was loosened to match reality so `parseEventsPage` never throws on live data:
- `priceRanges` → optional (absent in 100% of data); `priceRange.min`/`currency` optional.
- `dates.start.dateTime` → optional, with `localDate`/`localTime` fallback for `startsAt`.
- `_embedded` (both `venues` and `attractions`) → optional/defaulted to `[]`.
- `venue.name`, `venue.city.name`, `venue.address.line1` → optional.
- `event.url` → optional (empty-string fallback for `ticketUrl`).
- Schemas are non-strict (unknown keys ignored) so TM can add fields without breaking us.
- `id` is emitted as `tm:{eventId}` for the v1.1 multi-source merge.

### Notes for downstream tasks
- **Task 0.3 (iTunes):** TM gives no genre tags or artist IDs we can trust for
  enrichment, and no images/price in EU. Plan for iTunes/MusicBrainz to supply
  artist canonicalization; `Show.artistIds` is intentionally `[]` out of the parser.
- **Phase 1 (extractArtists):** source names from `attractions[]` (order = billing,
  index 0 = headliner). When `attractions` is empty, fall back to parsing `event.name`
  (support acts and openers are otherwise unavailable). Populate `Show.artistIds`.
- **Source strategy:** given zero TM coverage in Portugal, confirm the real primary
  listings source for Lisbon before building further on TM.

## Task 0.3 — iTunes spike

**Goal:** minimal KEYLESS iTunes Search API client + measure how well
Ticketmaster artist names resolve to a playable (previewUrl-bearing) track via a
strict case-insensitive exact-name picker.

### Client
- `src/lib/api/itunes.ts`: `parseSearch` (Zod-validated, filters to rows that
  HAVE a `previewUrl`), `pickExact` (trimmed, case-insensitive exact
  `artistName` match), `searchArtistTracks` (live fetch, 10s AbortController
  timeout, throws on non-2xx).
- Endpoint: `https://itunes.apple.com/search?term={name}&entity=musicTrack&limit=25`
  — **no key**.
- Fixture recorded live for **Joe Bonamassa** → **HTTP 200**, `resultCount: 25`,
  all 25 rows carried a `previewUrl`. Recorded via new
  `scripts/record-fixtures.ts itunes "<name>"` mode.

### Exact-match hit rate over the REAL Madrid bill (`madrid-120d.json`)
Measured live against every unique Ticketmaster attraction name (throttled
~3 req/s; no 403/429 seen).

- **Total unique names: 29**
- **Exact hits: 29**
- **Misses: 0**
- **Hit rate: 100.0%**

Every headliner on this bill resolved to an exact case-insensitive artistName
match with a playable preview. Several names that LOOK like they would break the
strict picker still matched cleanly:
- `CA7RIEL & Paco Amoroso` — leetspeak + " & " collaboration billing → exact hit
  (Apple stores the artist under the identical combined string).
- `Kitty, Daisy & Lewis` — internal comma + ampersand → exact hit.
- `Hermanos Gutiérrez`, `Gonzalo Alhambra`, `Eva Ayllon` — accented Spanish
  names → exact hit (accents preserved on both sides).
- `Dimash Qudaibergen` — Kazakh artist, Cyrillic track titles → exact hit on the
  Latin-transliterated artist name.
- `ElGrandeToto` — no-space stylization → exact hit.

**Honest caveat on the 100%:** this is a favourable sample — entirely
Latin-alphabet touring acts with real commercial catalogs (TM only covers
Madrid; there is no Portugal/Lisbon data). It does NOT prove the picker is
robust; it proves it is not the bottleneck for mainstream touring artists. The
categories that WILL produce misses in production (none present here, so
UNTESTED against real failures) remain:
  - " & " / " x " / "feat." collaboration billing where TM and Apple format the
    joined string differently (here they happened to agree — brittle).
  - Non-Latin scripts where TM gives a localized/native name and Apple stores a
    transliteration (or vice-versa).
  - Tribute / cover / "The X Experience" acts — Apple returns the ORIGINAL
    artist, so `pickExact` correctly returns null (silent drop, desired).
  - DJs / very local / brand-new acts with no iTunes catalog → 0 candidates → null.
Each becomes a **silent drop** in production under the strict picker.

### previewUrl shape / longevity
- Host: **`audio-ssl.itunes.apple.com`** (path
  `/itunes-assets/AudioPreview.../…plus.aac.p.m4a`) — Apple-hosted 30s AAC
  stream. Per plan this is played DIRECTLY, **never proxied**.
- Artwork host: `is1-ssl.mzstatic.com` (`…/100x100bb.jpg`).
- Linkback (`itunesUrl`): `https://music.apple.com/us/album/...?i=<trackId>&uo=4`
  (Apple Music track view) — satisfies the ToS attribution requirement.
- **Longevity UNVERIFIED.** Preview URLs are widely believed stable but can be
  signed/rotated. Could not wait >1h in-spike to confirm. **Needs a later
  check:** re-fetch a recorded previewUrl after 1h / 24h and confirm 200.

### OPEN FOLLOW-UP — mobile Safari playback chaining (UNVERIFIED)
The product's core play loop is auto-advancing through preview clips. iOS Safari
gates programmatic `audio.play()` behind a user gesture and is hostile to gapless
chaining of successive `src` swaps without a fresh gesture. **This has NOT been
verified** — deploy is deferred and there is no device available. Flagging
explicitly: **the core play loop depends on mobile-Safari autoplay chaining
working, and that assumption is currently untested.** Must be validated on a real
iOS device before committing to the play-loop UX.

### Zod adaptations vs the plan
- Result rows carry many fields (collection*, disc*, *Explicitness, prices,
  genre…); schema validates ONLY the consumed fields and is non-strict so Apple
  can add/drop keys freely.
- `previewUrl`, `trackName`, `artworkUrl100`, `trackViewUrl`, `artistViewUrl`
  modeled optional (music-video / non-song rows can omit `previewUrl`);
  `parseSearch` filters out any row without a `previewUrl` so a candidate always
  has a playable stream and parsing never throws.
- `artistId`/`trackId` arrive as NUMBERS. `artistId` coerced to string (matches
  `Track.artistId`); `itunesTrackId` kept numeric.
- `itunesUrl` = `trackViewUrl` with `artistViewUrl` fallback.

### Phase 1 `resolveTracks` implications
- `pickExact` is a high-precision, lower-recall first pass: when the TM name
  equals the Apple `artistName`, take it as `confidence: 'exact'`. On this sample
  that alone yields 100% recall for mainstream acts.
- For residual misses (collab formatting, transliteration, no-catalog), do a
  **MusicBrainz cross-check**: resolve the TM name → MBID → canonical
  aliases/name, then re-run `pickExact` against the alias set. A track confirmed
  via that path is `confidence: 'mb-confirmed'`, not `'exact'`.
- Silent-drop policy: if neither exact nor mb-confirmed yields a candidate, DROP
  the artist silently (no fuzzy track — a wrong preview is worse than none). On
  this bill the drop rate would be 0%, but do NOT hard-code that assumption;
  instrument the real drop rate in production, since the untested miss categories
  above are the ones that matter.

## Task 1.7 — MusicBrainz spike

Cross-check client `src/lib/api/musicbrainz.ts` (`crossCheckArtist`) is built and
fixture-tested (`tests/fixtures/musicbrainz/{match,mismatch}.json`,
`tests/unit/musicbrainz.test.ts`, 4 tests green). Design:
- Serialized via `mbQueue` (1 req/s + up to 300ms jitter), mandatory MB-ToS
  `User-Agent`, 8s `AbortSignal.timeout`, zod-parsed response.
- Confirmation rule: top artist (exact-name match, else first result) is CONFIRMED
  when `country === ctx.countryCode` OR any tag contains a genre hint; else UNCONFIDENT.
- STRICTLY NON-FATAL: any throw (network error, timeout, non-2xx, parse failure)
  is swallowed → `{ status: 'unconfident' }`. No retry (timeout test asserts a
  single `rawFetch` call).

### UNVERIFIED / DEFERRED (the live spike question)
Whether MusicBrainz tolerates a serialized 1 req/s burst from Vercel's shared
egress IPs without 503s or IP blocks is **UNVERIFIED** — it can only be answered
from a deployed function, and deploy is deferred (same status as the mobile-Safari
check). Follow-up: a deployed-function burst test hitting the live MB endpoint.
CAUTION: because the client is strictly non-fatal, a live block does NOT surface as
an error — it silently degrades every cross-check to `unconfident`, which only
*widens* the silent-drop rate. Instrument confirmed/unconfident ratio in prod so a
block is observable rather than invisible.

## Task 3.1 — ListenBrainz client

Keyless listen-count signal `src/lib/api/listenbrainz.ts` (`getArtistListenCount`),
fixture-tested (`tests/fixtures/listenbrainz/counts.json`,
`tests/unit/listenbrainz.test.ts`). Design mirrors the MB client:
- MBID-centric. Without an `mbid` (and no injected `rawFetch`) it returns `null` —
  we can't query by name reliably in v1. The MBID comes from the MB cross-check
  when confidence is `mb-confirmed`.
- Live path serialized via `lbQueue` (1 req/s courtesy), mandatory descriptive
  `User-Agent` (keyless API — UA only), 8s `AbortSignal.timeout`, zod-parsed.
- STRICTLY NON-FATAL: any non-2xx / timeout / parse failure / missing count → `null`
  (never throws). The scorer treats `null` as "unknown" → 0 pre-normalization.

### UNVERIFIED / DEFERRED (needs a later live-verification spike)
Endpoint used: `GET https://api.listenbrainz.org/1/popularity/artist?artist_mbids=<mbid>`,
reading `total_listen_count` from the returned per-MBID array. The exact endpoint
path AND response shape are hand-crafted to a Zod schema and NOT live-verified in CI
(same status as the MusicBrainz-on-Vercel-IPs spike). Follow-up: confirm the field
names (`total_listen_count`) and the array/object envelope against the live LB API
from a deployed function. Because the client is strictly non-fatal, a wrong
endpoint/shape degrades silently to `null` (contributes 0), so instrument the
null-rate in prod to make a mismatch observable.
