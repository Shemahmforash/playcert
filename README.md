# Small Font

**The best band on the poster is the one you can't read yet.**

Small Font turns the concerts near you into an instantly playable mixtape — and it reads the gig poster from the bottom up. Open `/{city}/{window}` and press play: one 30-second preview per artist playing your city, in show order, each stamped with its gig (venue, date, ticket link). No account, no app, no login wall — the whole product is a shareable URL. Its signature control, the **Small Font dial**, fades the arena headliners you already know out of the mix and rebuilds it around the openers and small-room acts.

This repository is a greenfield rebuild. The design lives in [`docs/plans/`](docs/plans/) — start with `2026-07-19-small-font.md` (the implementation plan) and the reimagining that produced it.

---

## How it works

The page is a **pure function of `(city, window, font-stop)`** encoded in the URL (e.g. `/london/next-14-days/small-print`), edge-cached for an hour, so everyone in a city gets the same shareable artifact. On a cache miss the server builds a `CityWindowBundle` through this pipeline:

```
URL (/{city}/{window}/{fontStop})
  → geo            resolve the city to lat/long
  → fetchShows     Ticketmaster Discovery events near it (auto-widen if sparse)
  → extractArtists every attraction, normalized + deduped, tributes flagged
  → resolveTracks  iTunes exact-match → MusicBrainz cross-check → silent-drop
  → order          chronological, openers-before-headliner, 30-cap, encore
  → cache          1h TTL (120s "degraded" when the playlist is thin)
  → Player         one reused <audio> element chains 30s previews
```

The **Small Font dial** is a pure client-side filter over the fully-resolved bundle — it never touches the network, so changing it can't invalidate the cache.

## Architecture principles

- **State lives in the URL.** No database, no accounts, no cookies. Taste memory (hearts/skips) is `localStorage` only.
- **Source-agnostic.** Everything is a `Show[]` with source-prefixed IDs (`tm:…`), so a second concert source drops in behind the same contract.
- **Rate-limit-safe.** Every external API goes through a per-API `RateQueue` (Ticketmaster 4/s, iTunes ~17/min, MusicBrainz 1/s + jitter) with permanent per-artist caches; a cache hit never consumes a queue slot.
- **Strictly non-fatal enrichment.** MusicBrainz/name-collision failures widen silent-drops; they never break a page. A wrong preview is worse than none.
- **Honest degradation.** Sparse markets auto-widen (radius 30→50 km, then the time window) before rendering, with honest copy; thin bundles get a short cache TTL so they keep refilling.

## Tech stack

- **Next.js 16** (App Router, Cache Components) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS 4** · **Zod** (validating every external response)
- **Vitest** (fixture-driven, network-free) · **pnpm** · **Node 22**
- Target host: **Vercel**
- **APIs:** [Ticketmaster Discovery](https://developer.ticketmaster.com/) (events), [iTunes Search](https://performance-partners.apple.com/search-api) (keyless — 30s previews), [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API) (disambiguation)
- **Explicitly NOT used:** the Spotify Web API — in 2026 it caps new apps at 5 users and has deprecated the endpoints this product would need. Only keyless iTunes previews + deep links are relied on for playback.

## Getting started

**Prerequisites:** Node 22, pnpm 10, and a free Ticketmaster Discovery API key ([developer.ticketmaster.com](https://developer.ticketmaster.com/) → your **Consumer Key**).

```bash
pnpm install

# Add your key (gitignored — never committed):
echo "TICKETMASTER_KEY=your-consumer-key" > .env.local

pnpm dev
```

Then open **http://localhost:3000/london/next-14-days**.

> **Note — market coverage.** The launch market is **London**. Ticketmaster has **zero coverage in Portugal** (and thin coverage in some markets), so Lisbon and other non-Ticketmaster cities return nothing until an additional data source is added. See `docs/plans/` for the deferred multi-source plan.
>
> The first load of a city is slow while the walking-skeleton route resolves artists sequentially; it's cached and instant afterwards. (The production rate-limited pipeline replaces that pacing — see status below.)

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Dev server (Turbopack) |
| `pnpm build` | Production build |
| `pnpm start` | Serve the production build |
| `pnpm test` | Run the Vitest suite |
| `pnpm typecheck` | `tsc --noEmit` (also enforced in CI) |

## Project structure

```
src/
  app/
    [city]/[window]/[[...fontStop]]/page.tsx   the URL route (Suspense + use-cache)
  components/Player.tsx                        sequential 30s-preview player
  hooks/usePlayer.ts                           pure player reducer
  lib/
    urlState.ts                                parse/validate the URL triple
    queue.ts                                   per-API RateQueue
    cache.ts                                   in-flight memo, key builders, TTL profiles
    api/         ticketmaster.ts · itunes.ts · musicbrainz.ts · geo.ts
    pipeline/    fetchShows.ts · extractArtists.ts · resolveTracks.ts · order.ts
tests/
  unit/          fixture-driven, network-free
  fixtures/      recorded API responses (Ticketmaster, iTunes, MusicBrainz)
docs/plans/      the design + implementation plan (source of truth)
```

## Testing

Test-driven throughout: every module has a failing test written before its implementation. External APIs are hit once to **record fixtures** (committed under `tests/fixtures/`); CI never touches the network. CI runs `typecheck → test → build` on Node 22.

## Status

**Phase 0 (walking skeleton): complete** — a real London route renders playable previews end-to-end; verified playing and auto-chaining in desktop and mobile Safari.

**Phase 1 (core pipeline): in progress** — the URL parser, rate queue, cache profiles, hardened Ticketmaster client, sparse-market widen ladder, artist extraction, MusicBrainz cross-check, track resolution, and playlist ordering are all built and tested. Remaining: the `buildBundle` orchestrator, real geocoding, wiring the hardened pipeline into the page, and the wrong-artist report endpoint. Until that wiring lands, the live route is still the Phase 0 skeleton.

Deployment is intentionally deferred. See `docs/plans/2026-07-19-small-font.md` for the full roadmap and `docs/plans/2026-07-19-small-font-personalization-future-paths.md` for the personalization backlog.
