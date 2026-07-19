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
