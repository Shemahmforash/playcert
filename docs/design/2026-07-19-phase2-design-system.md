# Earshot — Phase 2 Visual Design System

> **⚠️ SUPERSEDED IN PART — 2026-07-20.** This doc frames prominence as **fame** ("proportional to its real fame", the "R6 prominence" model). That is no longer true: prominence/tier now come from the poster's **objective billing order** (opener→headliner), and the fame/ListenBrainz pipeline was deleted. **The VISUAL system below stands unchanged** — name size/weight/width ∝ `prominence`, the dial's un-printing choreography, the two spot inks, the point-size gauge. Only the *source* of `prominence` changed (fame → billing). Read "fame" below as "billing prominence". Also note the live app diverged on copy/labels (the dial carries plain-language captions; the gig chip is a "GIG INFO" control; rows show the song title). See `docs/plans/2026-07-19-earshot.md` STATUS UPDATE and memory `earshot-ranking-is-billing-not-fame`.

## Direction: **OVERPRINT** — *a two-color gig bill that un-prints its own headliners*

The page is one warm ink-black gig bill printed in two riso spot inks. Every act is set at a size, weight, width, and ink-coverage proportional to its real fame — arena headliners screen-printed huge in **Riso Pink**, openers set tiny in near-newsprint. The **Earshot dial is a printed point-size gauge** (72pt → 6pt) and dragging it makes the poster *un-print itself*: pink ink and 800-weight condensed scale drain **out** of the headliners into grey ghosts that shrink and collapse off the sheet, while **Riso Blue** floods **into** the openers as their type simultaneously grows, expands, and rises into the headline slot. "Read the poster from the bottom up" becomes a felt loss you drag, not a re-sort you're told about. This is the winning **Two-Color Bill** (richest signature, most free of every AI default) enriched with **The Bill's** live variable-font weight+width interpolation and 7-hue weekday-ink ledger, and **Counterfoil's** printed point-size gauge, working perforations, and player-as-counter-edge — with the halftone deliberately simplified to a client-cheap single-channel screen so the no-gloss thesis ships in v1 without a rendering pipeline. Everything that is not the dial or a headliner name stays quiet: mono box-office metadata, Inter chips, one loud pink stamp for Play.

**Why not the generic defaults:** not cream+serif+terracotta (this is inked near-black paper, condensed grotesque, two migrating spot inks); not near-black+one-neon (three structural color systems — pink/blue spot inks *plus* a 7-hue weekday ledger — and the black is warm bitumen #16120D, not cold #0E0E11); not hairline broadsheet columns (perforation tear-masks and a physically continuous receipt do the structural work, radius is intentional, type bleeds off the edge).

---

## 1. DESIGN TOKENS

### 1.1 Color

Two rendered contexts. **Dark (the wall)** is the entire interactive product — the pasted-poster night you scroll. **Light (the paper)** is used *only* for the downloadable `LineupPoster` and share card, where figure/ground flips so it reads as a physical printout. Spot inks are identical in both — that is what makes it read as *the same two inks* on different stock.

| Token | Dark (wall) | Light (paper) | Role — grounded |
|---|---|---|---|
| `--canvas` | `#16120D` | `#EFE7D6` | Bitumen — the warm pasted-poster black you scroll; inverts to aged newsprint stock on the poster. Never neutral #0E0E11. |
| `--surface` | `#221C14` | `#F6EFDF` | Ticket kraft — stub panels, sticky player, flipped stub-back; one warm step off canvas. |
| `--surface-raised` | `#2B241A` | `#FBF6EA` | Active/hovered stub, dial track well. |
| `--newsprint` | `#F0EADC` | `#211D17` | Primary printed ink — all gig metadata + body sentences; warm off-white on the wall, carbon brown-black on paper. Never pure #fff / #000. |
| `--ash` | `#A8A59D` | `#6E6A61` | Secondary/meta ink **and** the desaturated "un-printed" headliner ghost. 4.5:1 at 12px on `--canvas`. |
| `--ash-quiet` | `#7C796F` | `#8C877B` | Decorative serials, perforation shadow, played-row hint only — **never** text < 14px. |
| `--riso-pink` | `#FF4D82` | `#FF4D82` | Spot ink A. Headliner display type at Marquee; **and** the one loud stamp (Play, Tickets). Drains out of demoted acts under the dial. |
| `--riso-blue` | `#3B6BE8` | `#3B6BE8` | Spot ink B — the inversion ink. Opener display type + same-bill mini-rows; saturates and grows as the dial moves toward Small Print. |
| `--registration` | `#7B4FB0` | `#7B4FB0` | Incidental pink×blue overlap purple — used only where the two inks cross (dial mid-detent, halftone shadow), never assigned deliberately. Cosmetic; never load-bearing. |
| `--stamp-amber` | `#C99A3E` | `#B4842B` | Rubber-stamp overprint for sparse/widen/unavailable tags — the box-office annotation ink, distinct from both spot inks. |

**Weekday ink ledger (7-hue structural cycle).** Third color system, beneath the two spot inks. Used **only** on DayDivider perforation-glow, the date stamp, the active-row left-rule, the 30s progress rule, and an ≤8%-opacity panel wash — **never as a fill, never on type.** Desaturated riso values, identical dark/light:

| Mon | Tue | Wed | Thu | Fri | Sat | Sun |
|---|---|---|---|---|---|---|
| `#5AA9E6` | `#E68A5A` | `#7FB25A` | `#B27ADE` | `#E6C15A` | `#E67A9E` | `#5AE6D0` |

**Chroma-is-coupled-to-size rule (contrast safety).** Full spot-ink chroma applies **only** to display type ≥ 28px (clears 3:1 large-text). Below 28px an act's name renders in `--newsprint` with at most a 12%-tint of its ink — so the small print always stays legible, and an opener physically *gains* its blue as the dial grows it. Metadata and any text < 14px is `--newsprint` or `--ash`, never a spot ink. This resolves Riso Blue's small-text contrast weakness structurally rather than by exception.

### 1.2 Type

Three voices, one per job — poster, sentence, box-office. No face does two jobs.

- **Display — `Archivo` variable, ALL CAPS, tracking −0.02em.** *[Superseded: every "Archivo" in this document reads as **Roboto Flex** — see Confirmed decisions at the end; standard Archivo lacks the load-bearing `wdth` axis.]* The screen-printed bill. Chosen as a variable font so the dial interpolates **weight (300–900) and width** live — headliners physically condense/collapse while openers expand, not just size-swap. **See Open Question #1** — standard variable Archivo is weight-only; if a true `wdth` axis isn't available in one binary, fall back to **Roboto Flex** (`wght`+`wdth`+`opsz`) which is the safer variable choice for the signature. Weight carries hierarchy; width deepens it.
- **Body — `Inter`.** The quiet sentence/UI voice: the accessible `<ol>` row sentences, WindowChips, SparseNotice, recovery buttons. Deliberately neutral so it never competes with the poster.
- **Utility — `Spline Sans Mono`.** The box-office / thermal-ticket voice: dates, `DOORS 8PM`, prices, ticket serials (`#0417`), the NowPlayingTicker, the 30s progress numerals, `+38 KM`, `ADMIT ONE`. Dot-matrix register that says "printed at the window."

**Concrete scale** (size = prominence; the dial remaps it). `clamp()` uses vw for the bleed.

| Role | Marquee (`everything`) | Small Print (inverted) | Face / weight |
|---|---|---|---|
| Arena headliner | `clamp(56px, 20vw, 92px)` / wght 800 / wdth 75 (condensed), bleeds past column right edge | collapses → `TOKEN TRACK` line, 12px mono, `--ash` ghost | Archivo |
| Mid act | 30–40px / wght 600 / wdth 100 | 30–40px (holds) | Archivo |
| Opener / small-print | 15–18px / wght 500 / wdth 100 / `--newsprint` | **leaps to** `clamp(44px, 15vw, 72px)` / wght 800 / wdth 75 / full `--riso-blue` | Archivo |
| `TOKEN TRACK` demotion (No Arenas) | — | 12px mono / `--ash` / label `TOKEN TRACK · MARQUEE` | Spline Sans Mono |
| Body row sentence (a11y) | 14px / 500 | 14px | Inter |
| Chip / window label | 12px / 500 (bump `--ash`→`#B4B1A9` if 12px misses 4.5:1) | 12px | Inter |
| Mono metadata | 12–13px | 12–13px | Spline Sans Mono |
| Serial / attribution | 11px floor / `--ash` | 11px | Spline Sans Mono |
| Point-size gauge numerals | 72 · 24 · 6, 11px, `--ash-quiet` | — | Spline Sans Mono |

### 1.3 Spacing / radius

4px base grid. `--space-1..8` = 4/8/12/16/24/32. Single **720px** max column; mobile-first **390** (works from 320). Gutter 16 mobile / 24 desktop. Radius is intentional but small (this is paper, not a card OS): stub `--radius-stub 4px`, chip `--radius-chip 2px` (near-square box-office), dial thumb 6px, player top edge **0** (it's a tear, not a corner). Tear edges are **perforation masks**, not borders: `radial-gradient` dot punch, 6px pitch, dots = `--canvas` showing through the paper — the divider, the stub bottom, and the player top edge all use the same mask so the sheet reads as one continuous perforated object.

### 1.4 Motion

Verbs only: **drop, stamp, drain, flood, flip, peel.** Nothing shimmers, nothing bounces past 2px.

| Token | Value |
|---|---|
| `--ease-out` | `cubic-bezier(0.2, 0.8, 0.2, 1)` |
| `--dur-drop` | 180ms (row slap-down), stagger 60–90ms, 2px thud overshoot |
| `--dur-shrink` | 250ms (removed name shrinks to 40% then collapses) |
| `--dur-flip` | 400ms, perspective 1200px |
| `--dur-crossfade` | 400ms (survivor audio + halftone tier swap) |
| `--dur-dial` | ≤ 800ms total rebuild choreography (always local, never network) |
| `--dur-peel` | 550ms (poster rotateX ~8°) |
| `--gap-track` | 300ms inter-track silence |
| `--press-poster` | 500ms long-press with corner-curl progress affordance |

**Reduced-motion stance (`prefers-reduced-motion: reduce`), binding:** no fall, no thud, no pulse, no rotate. Rows fade in pre-placed; the dial rebuild cross-fades ink and size in place (no shrink-collapse travel); stub flip becomes a crossfade; poster peel becomes a fade + a filling weekday-ink ring; loading halftones fade from grey to inked without the coarse→fine resolve. **Audio behavior is identical in both modes** — motion preference never changes what plays or when.

---

## 2. COMPONENT SPECS

### 2.1 TicketStubRow  `states: idle | playing | played | unavailable · flipped · hearted`

One component with a flip state, never two. It is a torn poster strip / ticket stub on `--surface`, `--radius-stub 4px`, bottom edge a perforation mask.

**Front (top half is playable):**
- Left: a **punched-hole Play affordance** — a `--canvas` circle knocked through the paper with a thin `--newsprint` outline triangle. Row-level Play is *quiet* (outline, never the loud pink stamp — that is reserved for the player).
- Center: a **single-channel halftone thumbnail** (48px, `--radius-stub`) — the artist's iTunes 100px art run through one threshold/dither screen (see §2.5, Open Question #2), tinted with the tier's spot ink. No full-color promo photo anywhere.
- The **fame-sized name** in Archivo display (§1.2), ink and size set by tier and current dial stop.
- Right: a mono `DOORS 8PM · £14` strip and a heart (outline → filled `--riso-pink` on tap → localStorage).
- A `gig-chip` (mono, weekday-ink stamped, e.g. `SAT 19 · Hackney Social`) is the **flip trigger**.

**Interaction — flip (`B3.2`):** tapping the gig-chip only (Play/heart never flip) does `rotateY 180°, 400ms, perspective 1200px`, perforation as the visible hinge. One flipped at a time; ephemeral, never in the URL; `aria-expanded` on the chip; back face inert (`aria-hidden`) while hidden.

**Back (`StubBack`) — entirely Spline Sans Mono:** `VENUE · DOORS 8PM` · the **billing sentence** `BALTHVS opening for KHRUANGBIN` (**inverted at Small Print** → `KHRUANGBIN buried under BALTHVS`) · same-bill mini-rows (tap plays that track, `--riso-blue`) · full-width `TICKETS →` carrying the **pink ADMIT ONE stamp** (the required JamBase ticket-link attribution) · `wrong artist?` 11px bottom-right *[removed — see note below]*.

**State visuals:** `playing` = weekday-ink left-rule (3px) + perforation glow. `played` = artist name to **60% opacity** like a used stub. `unavailable` = a `PREVIEW UNAVAILABLE` **overprinted amber rubber-stamp tag** (semi-opaque, 1px misregistration, not a flat pill); mid-radio a 404 auto-skips < 500ms with the same tag. ~~`wrong artist?` tapped → `sendBeacon`, link flips to `Thanks — noted` and disables, **row keeps playing unchanged**.~~ *[Superseded: the wrong-artist report sink was deliberately removed from the product — no report route, no `sendBeacon`; the `wrong artist?` link is not built.]*

### 2.2 EarshotDial  — *the signature control*

A horizontal slider **drawn as a printed point-size gauge**: a paper ruler across the masthead reading `72 —— 24 —— 6` with tick marks, and detent labels `MARQUEE · NO ARENAS · SMALL PRINT`. A 44px **pink rubber-stamp thumb** (roundel, 1px misregistration). Three **hard detents**, drag / tap / arrow-step.

**On detent land (`B3.1`):** haptic tick + `history.pushState` (`everything` omitted from the URL) + the rebuild choreography, **always local, ≤ 800ms, never a network call** (the full serialized bundle is client-side per R7):
1. Survivors **stay put**.
2. Removed acts: spot ink **drains** to `--ash` ghost while type shrinks to 40% (250ms) and **collapses** off the sheet.
3. Growing acts: the opposite ink **floods in** while Archivo interpolates weight 500→800 and width 100→75 and size leaps — you watch the small print *become* the headline.
4. `No Arenas` demotes each headliner to one `TOKEN TRACK · MARQUEE` mono line (explicit named state, not a mystery shrink).
5. Audio: the surviving current track continues uninterrupted; a filtered-out current track does a 400ms crossfade to the nearest following survivor.

`role="slider"`, `aria-valuemin/max/now`, `aria-valuetext` per stop ("Small Print — openers and small-room acts only"), `←/→/Home/End`. **Meaning is never color-only** — size, weight, width, and the point-size numeral all move together. Reduced motion: ink + size cross-fade in place, no travel.

### 2.3 RadioPlayer  — the box-office counter edge

Sticky bottom bar, 64px + safe-area, `--surface`, **top edge is a perforation mask** so the receipt above appears to *feed up out of the counter* — physically continuous with the bill, not a docked toolbar. Owns **the single `<audio>`**; queue = **visual order, always**.

Contents: 48px halftone artwork · `NowPlayingTicker` (mono, `aria-hidden`, a polite live region announces track changes as static sentences throttled to track boundaries) · a **30s progress ring drawn as a stamp filling in the current day's weekday ink** · `▶ Play` / `‖ Pause` as **the one loud pink ADMIT ONE stamp** (the only loud UI control on the page) · `⏭ Skip` = next visual row. 300ms inter-track gap; auto-advance at preview end. **No autoplay, ever** — a shared link arrives paused, `Cueing…` on the stamp until first buffer, then flips `▶` with one pulse; sound only ever starts from a gesture (B4).

### 2.4 LineupPoster — the week as a downloadable festival bill

Long-press the masthead (500ms, corner-curl affordance; desktop = click-hold + a poster icon button). On commit the list **peels away** (`rotateX ~8°, 550ms`); **audio keeps playing**, player bar stays. Reveals the week as `{CITY} WEEK FEST` — and here the palette flips to the **light paper context** (§1.1) so figure/ground inverts and it reads as an ink-on-real-paper printout. Type ∝ prominence, **inverted at Small Print** (openers become the giant blue headline; ex-headliners shrink to pink small print at the foot). Dates/venues bottom in mono, `earshotlive.com/{city}/{window}` URL watermark, halftone/registration texture, **1080×1920 download** rendered from an offscreen canvas of the same layout, ✕ reverses. Reduced motion: fade + filling ring, no rotate.

### 2.5 Loading — the crate-digging theater (`never a spinner`)

Streams as the `<Suspense>` fallback (R2). Min 1.2s so it reads; adds ≤ 400ms over real latency; **45s hard timeout → Error** (R4); `Cueing…` can't hang — flip to Playing after 10s with the buffered-later rule.

Choreography: `READING THE SMALL PRINT…` in tiny mono that slowly *grows* (indeterminate), the point-size gauge in indeterminate mode. When the single streamed blob lands, **blank stubs slap down already stamped with their gig chip** (`--dur-drop 180ms`, 60–90ms stagger, 2px thud) and their **halftone thumbnails resolve coarse→fine** (dither pitch tightens) — a print developing. A count ticks up on arrival; the pink Play stamp reads `Cueing…` then flips `▶` with one pulse even while rows keep dropping. **Simplified halftone (buildability):** a single-channel CSS/SVG threshold screen on the iTunes 100px art — **no server-side or two-color CMYK pipeline in v1** (Open Question #2). Reduced motion: fades, no fall, no pulse, halftones fade grey→inked.

### 2.6 Sparse / Empty / Error / 404 — every state stays on paper

- **Sparse:** `SparseNotice` under the header in **amber rubber-stamp overprint** — `Quiet week in Braga — widened to 50 km.` / `…widened to next 14 days.` / both; dismissible, plain, never apologetic-cute. Widened rows carry a `+38 KM` amber overprint tag. If Small Print leaves < 8 shows: `Small Print runs dry here — try No Arenas` with a **one-tap dial link** (not just prose).
- **Empty** (only after the full internal widen ladder still yields zero): a torn-poster CSS/SVG on the bare wall — `Nothing on the poster.` / `No shows we can play near {City} in this window.` Recovery = **[Everything on the dial]** (if a stop was filtering) + **[Try another city]**. **No widen-window button** — 14 days is terminal, the `next-30-days` route does not exist. Share/player/poster unreachable.
- **Error:** `The poster wall is down.` / `We couldn't reach the listings. Nothing's wrong with your city.` One action **[Try again]**. If a stale copy exists, serve it silently with a mono `showing listings from earlier today` tag. Typed-city geocode miss: inline under CityField, `Can't find that one — try the nearest big city.`, field stays open.
- **404** (bad slug / failed round-trip / unknown window|stop): the designed poster — `That poster's not on our wall.`, a deliberately off-registration curled corner, **CityField open**, and a link to `/{city}/next-14-days` when the city part is valid. Never a stack trace, never a blank page.

---

## 3. THE ONE SIGNATURE

**The dial-driven ink transfer + live re-typesetting** — the poster un-printing its own headliners. It is the *merge* the two lead judges each asked to graft into the other: **Two-Color Bill's** color/coverage migration (pink drains out to ash ghost, blue floods in) executed **on top of The Bill's** genuine variable-font weight (500↔800) and width (100↔75) interpolation, announced by **Counterfoil's** printed point-size gauge (72→6). Four properties move at once — color, ink-coverage, weight+width, and size — so dragging toward Small Print is a *felt loss of prominence*, the single richest rendering of "read the poster from the bottom up." It is spent in exactly one place; every other surface stays disciplined. **The real, justified risk** (per the winning verdict): every act is a two-color halftone with **zero full-color promo photography** — fame never buys gloss — but shipped as a client-cheap single-channel screen so it's a v1 design choice, not infrastructure.

---

## 4. ACCESSIBILITY FLOOR (binding)

- **Contrast:** all body/meta text ≥ 4.5:1 (`--ash #A8A59D` on `--canvas` clears it at 12px; bump to `#B4B1A9` if a specific 12px chip misses); display type ≥ 28px meets 3:1 large-text; **spot-ink chroma coupled to size (§1.1)** guarantees no small blue/pink text ever falls below floor; meaning is never color-only (size+weight+width+numeral co-vary on the dial; tags carry text labels).
- **Focus:** visible focus ring on every real control (a 2px weekday-ink outline, offset 2px); focus trapped in ShareSheet/Poster and returned to the trigger on close; the dial thumb, Play, Skip, chips, and hearts are real `<button>`/slider elements, min 44px touch target.
- **Semantics:** player `role="region"`; one polite live region announcing track changes as static sentences (ticker `aria-hidden`, throttled to track boundaries); dial `role="slider"` with `aria-valuetext` per stop; rows are an `<ol>` of full sentences; flip back inert while hidden with `aria-expanded` on the chip.
- **Keyboard:** Space play/pause · →/N skip · ↑↓ move rows · Enter play-here · F flip · H heart · `?` opens the hint. Dial ←/→/Home/End. Back/forward walk dial history.
- **No autoplay ever** — sound starts only from a user gesture. `prefers-reduced-motion` honored everywhere (§1.4); audio unaffected by it.

---

## 5. WHAT WE DELIBERATELY DID NOT DO

- **No cream+serif+terracotta, no near-black+one-neon, no hairline broadsheet columns** — the three AI defaults. The black is warm bitumen; three color systems (pink/blue inks + 7-hue weekday ledger) defeat the lone-accent read; perforation masks and a continuous receipt replace hairline rules; radius is intentional.
- **No full-color promo photography and no glossy cards** — all art is one-ink halftone; fame does not buy gloss. That refusal *is* the brief.
- **No two-color CMYK / server-side halftone pipeline in v1** — single-channel CSS/SVG screen only; the richer press look is a documented v2, keeping scope buildable (the buildability judge's central concern).
- **No spinner, no toast, no autoplay, no cookie banner, no nav, no accounts** — state lives in the URL; loading is the crate-digging theater; a preview 404 auto-skips silently.
- **No `next-30-days` route and no widen-window button** — widening is internal (R5), 14 days is terminal.
- **No second loud color** — Play/Tickets are the only loud element (pink stamp). The weekday inks are washes/rules/glow only, never fills, never on type. Boldness is spent once, on the dial.
- **No fourth type voice** — poster (Archivo), sentence (Inter), box-office (Spline Sans Mono); nothing else.

*Grounding note: every token traces to the subject's world — bitumen pasted-wall black, kraft/newsprint stock, two riso spot inks + registration purple, a rubber ADMIT ONE stamp, perforation tears doing day-divider work, a typographer's point-size gauge, box-office mono print, and a per-day weekday-ink ledger. Nothing here is a generic UI default.*

## Open questions (decide before building the dial)

- **[CLOSED — see Confirmed decisions: Roboto Flex.]** Variable-font width axis: standard variable Archivo ships weight-only (100-900), NOT a wdth axis (Archivo Narrow/Expanded are separate families). The signature's live condensing therefore needs either a single Archivo binary that actually carries wdth, or a switch to Roboto Flex (wght+wdth+opsz). Confirm which face before building the dial, since the width interpolation is load-bearing for the inversion.
- Variable-font performance: animating wght+wdth across up to 30 rows on mid-tier mobile is the signature's single failure point (flagged by the buildability judge). Confirm the budget: animate only in-viewport rows, prefer transform/opacity where possible, and define the degrade threshold at which width-axis animation drops to weight-only (or to a cross-fade) so jank never breaks the mechanic.
- Halftone rendering: confirm the single-channel client-side CSS/SVG threshold screen on iTunes 100px artwork is acceptable visually and legally — the artwork needs crossorigin/CORS access to be canvas-processed client-side, and if that fails we need a same-origin proxy or a build-time step (which reintroduces the infra cost we cut). Falls back to a flat tinted thumbnail if unavailable.
- Chroma-coupled-to-size rule: confirm that openers rendering near-Newsprint (not full blue) at Marquee still reads as intentional 'fine print' and not as a bug, and that the 28px chroma threshold plus the 12% ink-tint below it satisfies both the design intent and the 4.5:1/3:1 contrast floors on the final Riso Blue value (#3B6BE8 is the riskiest ink for contrast).
- **[CLOSED — see Confirmed decisions: this document's palette supersedes B4.]** Warm palette vs Appendix B4: B4 specifies neutral canvas #0E0E11 / text #F2EFE9 as 'binding', but the brief explicitly forbids the near-black default and all three directions warm it. This system uses bitumen #16120D etc. as an intentional, brief-mandated departure — confirm B4's palette line is superseded (the weekday accent cycle and 11px/4.5:1 floors from B4 are retained unchanged).

## Confirmed decisions (2026-07-19)

- **Display face: Roboto Flex** (weight + width + optical-size axes), self-hosted via `next/font/google` (no runtime CDN). Its width axis is load-bearing for the dial's live re-typesetting — standard Archivo is weight-only, so Archivo is NOT used.
- **Palette supersedes the plan.** This warm bitumen/newsprint system replaces Appendix B4's neutral `#0E0E11` (and the plan's Task 2.1 token values). Where the implementation plan's Phase 2 rows specify colors or the day-accent hue cycle, the values in THIS document win. The plan's functional/behavioral specs (component structure, tests, acceptance criteria) still hold.
