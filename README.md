# Earshot

**The best band on the poster is the one you can't read yet.**

Earshot turns the concerts near you into an instantly playable mixtape — and it reads the gig poster from the bottom up. Open `/{city}/{window}` and press play: one 30-second preview per act playing your city, in show order, each stamped with its gig (venue, date, ticket link). No account, no app, no login wall — the whole product is a shareable URL. Its signature control, the **Earshot dial**, pulls the top-billed headliners out of the mix and rebuilds it around the openers and small-room acts.

Live at **[earshotlive.com](https://earshotlive.com)** (auto-locates you to the nearest covered city). The design and roadmap live in [`docs/plans/`](docs/plans/) — start with `2026-07-19-earshot.md` (read its **STATUS UPDATE** block first — the product diverged from the original plan in a few deliberate ways, captured there).

---

## How it works

The page is a **pure function of `(city, window, font-stop)`** encoded in the URL (e.g. `/london/next-14-days/small-print`), edge-cached, so everyone in a city gets the same shareable artifact. On a cache miss the server builds a `CityWindowBundle` through this pipeline:

```
URL (/{city}/{window}/{fontStop})
  → geo            resolve the city to lat/long  (or IP auto-locate → nearest covered city)
  → fetchShows     JamBase events near it — at most ONE call per build (usually zero: 72h per-city shows cache), local window filter
  → extractArtists every act, normalized + deduped, in BILLED order (opener → headliner)
  → resolveTracks  iTunes exact-match → MusicBrainz cross-check → silent-drop
  → score          prominence + tier from the poster's OBJECTIVE billing (headliner 1 … opener 0)
  → order          chronological, openers-before-headliner, 30-cap, encore
  → cache          3h TTL (2h "degraded" when thin) via `use cache: remote`; shows layer 72h
  → Player         one reused <audio> element chains 30s previews
```

The **Earshot dial** (Marquee → No Arenas → Small Print) is a pure client-side filter over the fully-resolved bundle — it never touches the network, so changing it can't invalidate the cache or cost an API call.

## Architecture principles

- **State lives in the URL.** No database, no accounts, no cookies. Taste memory (hearts/skips) is `localStorage` only.
- **Ranking is objective billing order, not fame.** Prominence/tier come from the poster's own billing (opener→headliner), computed from `billingSlots` — not any subjective popularity signal. (An earlier ListenBrainz "fame" pipeline was removed; the API is dead and the metric was subjective.)
- **Source-agnostic concert data.** Everything is a `Show[]` with source-prefixed IDs. **JamBase** is the primary source (`jb:…`) behind a swappable adapter; Ticketmaster (`tm:…`) was the original source, now retired and removed. JamBase was chosen because it covers markets Ticketmaster doesn't (incl. Portugal) **and** exposes a reliable headliner/support billing order, which the whole product depends on.
- **Cost-capped by construction (≤ €5/month).** JamBase's free tier is 1,000 calls/month. We stay under it without a runtime counter: **at most one JamBase call per bundle build** — usually zero, because the single call lives in a **72h per-city shows cache** that bundle rebuilds reuse (one wide fetch, then all window/radius narrowing is local) — so calls scale with shows-cache refreshes (worst case 560/month across all 56 cities), not visitors. The surest belt: no payment method on the JamBase account → it physically stops at 1,000.
- **Auto-located, no prompt.** Middleware snaps the visitor's IP (Vercel geo headers) to the nearest covered city and redirects `/` → `/{city}/{window}` — geo is read only in middleware (before the edge cache), so the playlist page stays a pure cacheable URL. An optional "use my exact location" (browser GPS, on click) and the `/?pick=1` picker cover the rest.
- **Rate-limit-safe & non-fatal.** Every external API goes through a per-API `RateQueue` with durable per-artist caches; a cache hit never consumes a slot. MusicBrainz/name-collision failures widen silent-drops — a wrong preview is worse than none.
- **Honest degradation.** Sparse markets auto-widen before rendering, with honest copy; thin bundles keep refilling on later rebuilds.

## Tech stack

- **Next.js 16** (App Router, Cache Components / PPR) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS 4** · **Zod** (validating every external response)
- **Vitest** (fixture-driven, network-free) · **pnpm** · **Node 22** · **Vercel**
- **APIs:** [JamBase Concert Data](https://data.jambase.com/) (events + billing order), [iTunes Search](https://performance-partners.apple.com/search-api) (keyless — 30s previews + Apple linkback), [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) (disambiguation). Location uses Vercel's IP-geo headers + optional browser Geolocation.
- **Explicitly NOT used:** the Spotify Web API (caps new apps at 5 users in 2026), OAuth, any database/KV, cookies, analytics SDKs. Ticketmaster is retired (no Portugal coverage, no reliable billing order); ListenBrainz is gone (dead endpoint + subjective).

## Getting started

**Prerequisites:** Node 22, pnpm 10, and a free **JamBase Developer** API key ([data.jambase.com](https://data.jambase.com/) → the free Developer tier, 1,000 calls/month).

```bash
pnpm install

# Add your key (gitignored — never committed):
echo "JAMBASE_KEY=your-jambase-key" > .env.local

pnpm dev
```

See `.env.example` for the full set: `NEXT_PUBLIC_SITE_URL` (absolute URLs for metadata/OG) and the optional `MOCK_APIS=1`, which swaps in mock API deps — no key, no network — and is what `pnpm test:e2e` runs against.

Then open **http://localhost:3000/london/next-14-days** (or just `/` — auto-location routes you). 56 covered cities across Europe and North America (London, Manchester, Dublin, Madrid, Barcelona, Paris, Berlin, Amsterdam, Lisbon, Porto, New York, Los Angeles, …) — the full list is `CITY_TABLE` in `src/lib/api/geo.ts`.

> **Cost note.** The free JamBase tier is €0 for 1,000 calls/month; the app makes at most one call per city every 72h thanks to the per-city shows cache (worst case 560/month across all 56 cities). To guarantee you're never charged, keep the JamBase account with **no payment method on file** (it hard-stops at 1,000). On Vercel, set `JAMBASE_KEY` in the project's Environment Variables (Production/Preview) too — the deploy fails loudly without it.
>
> **Portugal works.** Lisbon and Porto now return real gigs (they were empty under Ticketmaster) because JamBase covers PT.

The first load of a cold city can take ~30s: the server spends up to its 25s resolution budget matching artists to previews (the loading theater covers the wait, giving up at 45s). It's cached and instant afterwards, and fills out further on later rebuilds.

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm test` | Run the Vitest suite (network-free) |
| `pnpm typecheck` | `tsc --noEmit` (also enforced in CI) |

## Project structure

```
src/
  middleware.ts                                IP auto-location redirect + route validation
  app/
    page.tsx                                   landing / picker (+ GPS, privacy line)
    layout.tsx                                 root metadata / metadataBase
    [city]/[window]/[[...fontStop]]/page.tsx   the URL route (Suspense + use cache: remote)
    [city]/[window]/opengraph-image.tsx        branded OG card (URL-derived, no API)
  components/
    PlaylistScreen.tsx   client container: audio, dial, share sheet, poster trigger
    EarshotDial.tsx · PlaylistList.tsx · TrackRow.tsx · RadioPlayer.tsx
    ShareSheet.tsx · LineupPoster.tsx · UseMyLocation.tsx · CityPicker.tsx
  hooks/       usePlayer.ts · useShareThreshold.ts · useTasteMemory.ts …
  lib/
    urlState.ts · queue.ts · cache.ts · title.ts · downloadPoster.ts
    api/         jambase.ts (primary) · itunes.ts · musicbrainz.ts · geo.ts
    pipeline/    fetchShows.ts · extractArtists.ts · resolveTracks.ts · score.ts (billing) ·
                 applyFontStop.ts · order.ts · buildBundle.ts · realDeps.ts · posterLayout.ts
tests/
  unit/          fixture-driven, network-free (~401 tests)
  fixtures/      recorded API responses (JamBase, iTunes, MusicBrainz)
docs/plans/      the design + implementation plan (read the STATUS UPDATE block first)
```

## Testing

Test-driven throughout: modules have failing tests written before implementation. External APIs are hit once to **record fixtures** (committed under `tests/fixtures/`); CI never touches the network. CI runs `typecheck → test → build` on Node 22.

## Status

**Live on Vercel** at [earshotlive.com](https://earshotlive.com).

- **Phase 0 — walking skeleton:** ✅ complete.
- **Phase 1 — core pipeline:** ✅ complete (URL→bundle engine: validated params, rate-limited queues, sparse-market widen, artist extraction, iTunes + MusicBrainz resolution with silent-drop, chronological/bill-mirrored ordering, edge-cached bundle; invalid routes 404 via middleware).
- **Phase 2 — the UI ("The Bill"):** ✅ complete (warm bitumen/newsprint palette, day-grouped ticket-stub rows with flip-to-gig-info, sticky radio player with iOS-safe playback, crate-digging loading theater, landing page, empty/sparse/error/404 states, taste memory, keyboard shortcuts, contrast-verified tokens).
- **Phase 3 — the Earshot dial:** ✅ complete (billing-driven prominence/tier, the 3-detent dial, zero-fetch client re-filter, in-place rebuild choreography with playback continuity, "Small Print runs dry" escape hatch).
- **Phase 4 — share loop + lineup poster:** ✅ complete (canonical metadata + branded OG cards; an *earned* share sheet — copy-link, native share, Spotify/Apple search deep-links, and a "Hear your own city" CTA; share suppression on thin/empty bills; the downloadable **Lineup Poster** — long-press → peel-reveal → client-side 1080×1920 PNG). YouTube export is deferred.

- **Phase 5 — compliance, verification & launch:** ✅ automated work complete (attribution proofs: JamBase + ticket seller + Apple; the single e2e smoke; budget verification against the €5 JamBase cap; the launch checklist itself).

**Next: the manual go-live checklist in [`LAUNCH.md`](LAUNCH.md)** — the handful of operational steps no test can assert (Vercel env key, JamBase payment-method check, key rotation, domain decision, ToS attribution wording).

Beyond the main plan, `docs/plans/2026-07-19-earshot-personalization-future-paths.md` holds the personalization backlog.
