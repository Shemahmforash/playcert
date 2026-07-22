# Hearted Shelf — hearts that do something

**Date:** 2026-07-22 · **Status:** validated design, ready for implementation

## Problem

Hearts exist on every track row, toggle, and persist to localStorage
(`useTasteMemory`, keyed by artistId) — but nothing ever reads them except the
icon colour. A light switch wired to nothing. If it does nothing, what's the
point of existing?

## The heart's job (decided)

Hearting a song builds **a playlist of hearted songs** the listener can take
away, plus a pointer to the artist's current tour. Concretely:

- An **in-app "Hearted" shelf** — playable, with per-song Apple Music links.
  No auth, no new API cost. (A real Spotify/Apple OAuth export can layer on
  later without reshaping anything.)
- **Tour info is a link-out, never a fetch** — protects the €5/mo JamBase cap
  and the hearts-stay-local privacy rule.

## Part 1 — what a heart stores

Hearts move from **artist-level to song-level**. Tapping the heart captures a
self-contained snapshot into localStorage — everything the shelf needs, zero
fetches:

```ts
interface HeartedSong {
  itunesTrackId: number;      // stable key (dedupe/toggle)
  title: string;
  artist: string;             // normalizedName at heart-time
  artistId: string;
  previewUrl: string;         // 30s preview — playable in the shelf
  artworkUrl: string;
  itunesUrl: string;          // "open in Apple Music" per song
  heartedAt: string;          // ISO — shelf sorts newest-first
  gig: {                      // the show that introduced you
    venue: string;
    city: string;
    startsAt: string;         // ISO — lets the shelf say "past gig" honestly
    ticketUrl: string;        // JamBase deep link
  };
}
```

**Storage:** new key `earshot:taste:v2` —
`{ heartedSongs: HeartedSong[], skipped: string[] }`.

**Migration is honest:** v1's artist-keyed `hearted` set cannot be upgraded (an
artistId can't reconstruct a song). Carry `skipped` forward; let old
artist-hearts go. Nobody's attached to hearts that did nothing.

**Privacy invariant unchanged:** the snapshot lives only in the browser, never
serialized into any request. The "full tour →" link is an outbound navigation
the user clicks, not data we send.

**`useTasteMemory` keeps its name and home**, gains `heartedSongs`,
`toggleHeartSong(snapshot)`, `isHearted(itunesTrackId)`; same SSR-safe
hydrate/persist machinery, same try/catch degradation.

## Part 2 — the Hearted shelf

**Entry point:** a heart button joins the **sticky dock**, between the dial and
the poster trigger (the dock is "the controls that must stay reachable while
you scroll"). Outline heart + small mono count (`♥ 4`) in `--riso-pink` when
non-empty; quiet `--ash` outline, no count, when empty. Hearting a row ticks
the count up where the eye already is.

**The panel:** a slide-over sheet in the ShareSheet family — same overlay
conventions, z-50. Title in the print voice: **"YOUR HEARTED"** with the count
as a stamped tally. Focus-trapped, Esc/✕ closes, backdrop tap closes,
`aria-modal` dialog. Opening the shelf never touches the main audio element.

**Each hearted song renders as a compact stub** (slimmed TicketStub, not the
flippable TrackRow):

- Artwork thumb + **title** + artist name in newsprint ink — no fame sizing
  (the shelf is your list, not the bill; billing-driven prominence rules don't
  apply here)
- A play button previewing the stored `previewUrl` — one shared audio element
  inside the shelf, **pausing the main radio** while it plays
- The gig line in mono: `SAT 20 · PARADISE · LISBON`, linking to `ticketUrl`.
  Past `startsAt` → struck-through date + a small `PLAYED` stamp — the stub
  becomes a keepsake, honest about it
- **`full tour →`** — outbound per-artist link:
  `https://www.jambase.com/search?q={artist}` (keeps attribution with the data
  source); opens in a new tab
- An ✕-unheart per stub, no confirmation (the heart on the main list is the
  undo)

**Empty state:** the sheet still opens: *"Heart a song on the bill and it's
kept here — with its gig."*

## Part 3 — the takeaway, components, tests

**Takeaway (the "playlist" for v1):** shelf footer with

- **"Copy list"** — plain-text playlist to the clipboard, one line per song:
  `Fontaines D.C. — Starburster · https://music.apple.com/...`. Uses
  `navigator.clipboard` with ShareSheet's copied-feedback pattern.
- **"Share"** — same text via Web Share API where it exists (iOS).
- Per-song "open in Apple Music" via each stub's `itunesUrl`. No bulk-open
  (popup blockers; a 20-tab salvo is hostile anyway).

**Components & flow:**

- `src/hooks/useTasteMemory.ts` — v2 rework + migration
- `src/components/HeartedShelf.tsx` (new) — sheet, stub list, its own
  `<audio>`, footer actions
- `PlaylistScreen` — builds the `HeartedSong` snapshot at heart-time (it has
  track + show + artist in scope), passes `isHearted` down; mounts shelf +
  dock button
- `TrackRow` / `PlaylistList` — prop rework only: `hearted` now keyed by
  `itunesTrackId`

**Error handling:** storage full/unavailable → in-memory (existing pattern).
Stale `previewUrl` (Apple rotates them) → stub's play falls back to opening
`itunesUrl`. Clipboard denied → show the text in a selectable box.

**Tests:**

- Unit: v2 storage round-trip; v1 migration (skipped carried, artist-hearts
  dropped); toggle/dedupe by `itunesTrackId`; past-gig detection.
- Component: heart tap stores snapshot; dock count ticks; shelf renders stubs;
  unheart removes; copy-list output format; main radio pauses when a shelf
  preview plays.

## Decisions log

| Decision | Choice | Rejected |
|---|---|---|
| Heart's job | Playlist takeaway + tour pointer | Playback influence, recognition-only |
| Playlist mechanism | In-app shelf + links, zero-auth | Spotify OAuth (later), MusicKit (paid dev token) |
| Tour info | Outbound link, no fetch | JamBase artist fetch (€5 cap + privacy softening) |
| Shelf entry | Sticky-dock heart → slide-over | `/hearted` route, end-of-list section |
| Heart keying | Per-song (`itunesTrackId`) | Per-artist (v1, can't make a playlist) |
