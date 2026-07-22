# Favicon design — Earshot

**Date:** 2026-07-22
**Status:** validated

## Problem

`src/app/favicon.ico` is still the stock Next.js default. Earshot needs a
proper favicon that carries the riso-print / gig-poster identity.

## The mark

A single hand-authored SVG, 512×512 viewBox:

- **Tile**: full-bleed rounded square (~15% corner radius) in bitumen
  `#16120d` (`--canvas` dark) — the pasted-poster black. Constant look on
  both light and dark browser tab strips.
- **Mark**: a filled dot (the stage) left-of-center on the horizontal axis,
  with three concentric arcs radiating right in riso-pink `#ff4d82`
  (`--riso-pink`) — literally "within earshot". Chunky strokes (~the dot's
  diameter) so at 16px the arcs render as ~1.5–2px of clean ink, not
  hairlines. Round caps, ~90° arc span, spacing widening slightly outward.
- No text, no misregistration — one ink, one ground, legible at 16px.

Rejected alternatives: riso "E" lettermark (less unique to the name),
ticket-stub motif (too busy at 16px), two-ink misregistration (mud risk at
16px), transparent background (contrast depends on browser theme).

## Files

1. `src/app/icon.svg` — source of truth; modern browsers take the SVG
   directly via the App Router file convention (verify convention against
   `node_modules/next/dist/docs` before writing — per AGENTS.md).
2. `src/app/favicon.ico` — replace stock file with 16+32px renders of the
   same mark, for legacy consumers and pinned tabs.
3. `src/app/apple-icon.png` — 180×180, square-cornered full-bleed (iOS
   applies its own mask); Apple ignores SVG favicons.

## Generation

PNG/ICO rendered from the SVG by a one-off script using `sharp` (already
present as a Next dependency) — nothing new ships in deps. The script is
throwaway (scratchpad), only the three assets land in the repo.

## Verification

- `pnpm build` passes; view page source shows the icon links emitted.
- Load the app and confirm the tab icon at 16px on a light and a dark
  browser theme.
