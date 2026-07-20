# Earshot — Launch Checklist

**Earshot** turns a city's upcoming concert lineup into a playable radio: it reads
gig listings from JamBase, matches each act to a 30-second Apple Music preview, and
lets you *hear* your city before it happens — then dial from the headliners down to
the small print. It's live at **https://earshot-one.vercel.app**.

The whole thing runs on a **€5/month budget**: JamBase's free tier is 1,000 API
calls/month, and the account carries **no payment method**, so an overage is
physically impossible rather than merely unlikely. Everything below is engineered to
stay comfortably inside that cap.

This checklist has a rule: **every automated row points at a test or script that
actually proves it** — no "trust me" rows. The genuinely operational items that a
unit test cannot assert are quarantined in the [Before flipping live](#before-flipping-live)
section and clearly marked manual.

## Suite status (last run)

| Gate | Result |
| --- | --- |
| `pnpm test` (Vitest unit) | **398 passed** (59 files) |
| `pnpm verify:budgets` | **pass** — worst case 540 ≤ 900 ≤ 1,000 calls/mo |
| `pnpm typecheck` | **exit 0** |
| `pnpm build` | **exit 0** |
| `pnpm test:e2e` (Playwright smoke) | **pass** |

## Automated checks — every row has a proof

| Check | Proven by | Command |
| --- | --- | --- |
| JamBase + ticket-seller + Apple attributions present on **every** surface (landing, playlist, empty, error) | `tests/unit/attribution.test.tsx` | `pnpm exec vitest run tests/unit/attribution.test.tsx` |
| **Per-track** Apple linkback (`itunesUrl`) on every rendered track | `tests/unit/attribution.test.tsx` | `pnpm exec vitest run tests/unit/attribution.test.tsx` |
| Ticket deep-link (JamBase offer/seller linkback) on every opened stub | `tests/unit/attribution.test.tsx` | `pnpm exec vitest run tests/unit/attribution.test.tsx` |
| JamBase coverage-honesty line in footer ("the smallest rooms may not be here yet") | `tests/unit/attribution.test.tsx` | `pnpm exec vitest run tests/unit/attribution.test.tsx` |
| JamBase ≤ 1,000 calls/mo (€5), **one call per build**, R12 reproducibility | `scripts/verify-budgets.ts` + `tests/unit/budget.test.ts` | `pnpm verify:budgets` · `pnpm exec vitest run tests/unit/budget.test.ts` |
| Audio always streams from **Apple** — never proxied (previewUrl is an Apple host; `<audio>` is bound only to `track.previewUrl`) | `tests/unit/compliance.test.ts` | `pnpm exec vitest run tests/unit/compliance.test.ts` |
| MusicBrainz **User-Agent** is set (non-empty, names the app + contact) | `tests/unit/compliance.test.ts` | `pnpm exec vitest run tests/unit/compliance.test.ts` |
| Rate queues hold their configured floors (`tm` 350ms · `itunes` 3500ms · `mb` 1000ms · `jambase` 250ms) | `tests/unit/compliance.test.ts` (+ `tests/unit/queue.test.ts`) | `pnpm exec vitest run tests/unit/compliance.test.ts tests/unit/queue.test.ts` |
| **No cookies** — no `Set-Cookie` / `document.cookie` / `cookies()` anywhere in `src` (taste memory is `localStorage`) | `tests/unit/compliance.test.ts` | `pnpm exec vitest run tests/unit/compliance.test.ts` |
| **No database / KV** — no `pg`/`mysql`/`mongodb`/`@vercel/kv`/`redis`/`prisma`/`drizzle`/… in dependencies | `tests/unit/compliance.test.ts` | `pnpm exec vitest run tests/unit/compliance.test.ts` |
| Auto-location redirect + `/?pick=1` escape hatch (`nearestCity` / `rootRedirectSlug`) | `tests/unit/geo.test.ts` | `pnpm exec vitest run tests/unit/geo.test.ts` |
| **Geo read only in middleware** — the cached `/[city]/[window]` surface reads no request headers (cache-safe) | `tests/unit/compliance.test.ts` | `pnpm exec vitest run tests/unit/compliance.test.ts` |
| Contrast ≥ WCAG floors on both canvases | `tests/unit/contrast.test.ts` | `pnpm exec vitest run tests/unit/contrast.test.ts` |
| Reduced-motion honored | `tests/unit/reducedMotion.test.ts` | `pnpm exec vitest run tests/unit/reducedMotion.test.ts` |
| `report-artist` ("wrong artist?") sink live — validates + logs, no DB | `tests/unit/reportArtist.test.ts` + `src/app/api/report-artist/route.ts` | `pnpm exec vitest run tests/unit/reportArtist.test.ts` |
| **Full journey** works: open London → play a preview → dial to Small Print drops the headliners | `tests/e2e/smoke.spec.ts` (with the `MOCK_APIS` factory) | `pnpm test:e2e` |

Re-run everything at once:

```bash
pnpm test && pnpm verify:budgets && pnpm typecheck && pnpm build && pnpm test:e2e
```

## Before flipping live

These are **operational / manual** — no unit test can assert them. Do them by hand
before (or immediately at) go-live.

- [ ] **Set `JAMBASE_KEY` in Vercel** for **both** Production and Preview
      environments (Project → Settings → Environment Variables). Without it every
      build throws `JamBase: missing JAMBASE_KEY` and the page degrades to
      `<ErrorState />`. *(Manual — Vercel dashboard.)*
- [ ] **Confirm NO payment method on the JamBase account.** This is the real €5
      hard belt: with no card on file, the free tier simply stops serving at 1,000
      calls instead of billing for call 1,001. The TTL math (`verify:budgets`) is
      belt-and-suspenders on top of this. *(Manual — JamBase account settings.)*
- [ ] **Rotate the exposed key.** A JamBase key was committed earlier in history —
      generate a fresh one, set it in Vercel (above), and revoke the old one.
      *(Manual — JamBase dashboard + Vercel.)*
- [ ] **Decide the domain.** Currently live at `earshot-one.vercel.app`; the launch
      plan assumes `earshot.fm` (and the MusicBrainz User-Agent already advertises
      `earshot.fm`). Either register/point `earshot.fm` or update the copy to match
      the real domain. *(Manual — DNS + Vercel domains.)*
- [ ] **Confirm JamBase's ToS attribution wording.** The footer credits "Concert
      listings via JamBase" with a linkback; verify that matches JamBase's current
      required attribution text/format before launch. *(Manual — read JamBase ToS.)*

---

*Generated for Task 5.5 (final Phase 5 task). Automated rows above were verified
green on the last run recorded in [Suite status](#suite-status-last-run).*
