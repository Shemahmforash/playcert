# Small Font — Personalization & Taste-Matching: Future Paths

> **Status:** Not in v1 scope. This is a captured idea backlog, not a commitment.
> **Companion to:** `2026-07-19-small-font.md` (the v1 implementation plan).
> **Date:** 2026-07-19

## Why this is deliberately NOT in v1

Small Font's architecture is anti-personalization on purpose. The page is a **pure function of `(city, window, font-stop)`**, edge-cached so *everyone in a city this week gets the identical artifact*. That sameness is the point — it's what makes the URL shareable and the playlist a shared cultural object that reproduces exactly for a friend.

Personalization fights this directly: the moment output depends on *who* is asking, you can no longer cache one artifact per city, and the share link stops reproducing what the recipient heard. So taste-matching is a real trade against the product's spine, not a free add-on.

**Design principle for ALL paths below:** keep the cached city artifact identical for everyone, and layer any personalization as a **client-side re-rank / lens over the full serialized bundle** — exactly like the Small Font dial already works. The shared object stays shared; taste is a view on top of it.

---

## ⚠️ Load-bearing warning: the obvious path is a dead end

The intuitive design — "connect Spotify, read the user's top artists, score the lineup by similarity" — **is unbuildable for a small site in 2026.** Two of our own specialists contradicted each other here, and the API-reality one wins:

- Spotify Web API Development Mode is capped at **5 authorized users**, requires the app owner to hold active Premium, and (Nov 2024 → Feb 2026) **deprecated the very top-artists / top-tracks / audio-features endpoints** any Spotify-based taste vector would depend on.
- Per-visitor "save to Spotify" and per-visitor taste reads are effectively gone unless you're a registered business with ~250k MAU.

**Do not spend engineering time on a Spotify-OAuth taste feature.** This warning exists so no future engineer rediscovers it the hard way. (Source: data-scout specialist findings; the plan's "no Spotify Web API" rule enforces it.)

---

## Tier 1 — Personalize with NO account, NO backend, cache intact

These change the *experience* while the cached artifact stays byte-identical for everyone. Highest ROI, lowest architectural cost. **Recommended to ship first.**

### 1a. City-scene prior (top pick — invisible, cache-safe, on-brand)
A venue is a strong genre classifier (Paradiso ≠ jazz café). Learn `P(genre | venue)` from each venue's historical listings and let the mix lean toward the actual character of the local scene.
- Makes Berlin skew techno and Lisbon skew indie **with zero user input**.
- Stays a pure function of the city → caching is untouched.
- This is "taste-matching to the *place*, not the *person*" — perfectly aligned with the product's identity.

### 1b. Session bandit (client-side reorder)
Treat genre clusters as bandit arms. Skip < 30s = reward −1; full listen / heart = +1. Thompson sampling reorders which *pending* blocks surface next and demotes clusters the user keeps skipping.
- Lives entirely in `localStorage`; only reorders an already-fetched bundle → never hits the network, never changes the cached page (same mechanism as the dial).
- The v1 plan already reserves `localStorage` for "taste memory," so the hook exists.

### 1c. Blind Dig as a taste *sensor*
The Blind Dig wildcard (names hidden, judge by ear, reveal only what you hearted) is, underneath, the cleanest possible taste signal — preferences collected without brand bias. Feed those hearts into the session bandit (1b) to personalize purely from in-session listening, no identity required.

---

## Tier 2 — Real per-person taste that actually survives 2026

For genuine per-listener matching (not just per-place). Each still layers as a client-side re-rank so the shared artifact survives.

### 2a. ListenBrainz / Last.fm username (best fit)
User pastes a username — no OAuth dance. Both are open APIs returning listening history to build a taste vector.
- Fits the "no creepy login" ethos far better than Spotify ever did.
- **ListenBrainz is already in the v1 stack** (prominence scoring), so the client exists.

### 2b. Apple MusicKit ($99/yr upgrade)
The one mainstream service still letting a small site read a signed-in visitor's library **and create a real playlist on their account**. Already named as the plan's paid upgrade path (also unlocks full-length playback for Apple Music subscribers).

### The taste-vector algorithm (once you have listening data from 2a/2b)
```
U = user vector from top artists/tracks, embedded in a co-listen graph
for artist a in lineup:
    sim(a) = max over user_top_artists of cosine(U_emb[a], U_emb[u])
    # max, not mean: one strong anchor beats diffuse similarity
```
- Reallocate only the **flexible** playlist slots (above the per-gig minimum of 1) by `sim(a)`. The floor keeps serendipity; the flex slots personalize.
- Prefer tracks whose audio features sit inside the user's feature envelope (10th–90th percentile of their top tracks).
- UI framing doubles perceived intelligence: label blocks **"because you listen to X"** vs **"new for you"** — same algorithm, different label.

---

## Rank CONCERTS, not just songs (arguably the higher-value use)

The real job is *which show do I go to*. Any taste vector above can reorder the **show list**, not just the tracks — float gigs whose artists sit near the user's taste to the top, or badge them ("3 acts you'd like"). Two taste-adjacent signals need **no user model at all**:

- **Hometown-show detection:** if MusicBrainz `begin-area` matches the concert city, flag it and shift that artist's block toward deep cuts / early catalog. Badge: "hometown show — expect rarities." One cached lookup; reads as uncanny insight.
- **Imminence weighting:** the mix auto-drifts toward the soonest gigs (falls out of an `imminence(event.date)` weight). Feels personalized while staying a pure function of the data.

---

## Recommended sequencing

1. **v1:** ship nothing here (keep the pure-function artifact clean).
2. **Fast-follow:** **1a city-scene prior** (invisible, cache-safe, on-brand) → then **1b session bandit + 1c Blind Dig**.
3. **Post-launch, if demand shows:** **2a ListenBrainz/Last.fm username** as a client-side re-rank → **2b MusicKit** if the paid upgrade is already being taken for playback.
4. **Never:** Spotify-OAuth taste matching (see warning above).

Guardrail throughout: personalization is always a **lens over the shared, cacheable artifact** — never a per-user rebuild of the cached page.
