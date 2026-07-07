# Roast Me v2 — "Roast Studio" Product & Architecture Plan

> Written 2026-07-06 on branch `claude/roastme-game-enhancement-goabyu`.
> Goal: turn Roast Me from a one-shot novelty into a standalone-app-quality feature people return to, while making the unit economics commercially sane.
>
> **STATUS 2026-07-07 — Phases 1 + 2 + 3 SHIPPED, as a separate game.** Founder decision: build v2 as a new game, **Roast Central** (`GameType.ROAST_CENTRAL`, `RoastCentralGame.tsx`), leaving the existing Roast Me page untouched. **Phase 3 (Roast Battle)** shipped as a Solo/Battle toggle on Roast Central's SETUP → its own `RoastBattleGame.tsx` (pass-and-play: roster → capture → one roast+poster per player → reveal → vote-not-self → `EndScreen` → Game Night + share recap). The persona/format/spice library plus the photo/fallback/frame helpers were extracted out of `RoastCentralGame.tsx` into a shared **`src/components/games/roastShared.ts`** used by both games. No new AI plumbing — Battle rides `roast_observe` + `roast_text_batch` exactly as the solo deck does and degrades to the bundled fallback deck offline. Only **Phase 4** (premium image tier) remains. Phase 1 delivered: client downscale, `roast_observe` + sessionStorage cache, `roast_text_batch` (Claude-first) with the persona/format/spice library in `api/_lib/roast-prompts.ts`, roast deck UI + Burn Book, offline fallback deck, kid-detection wholesome override, `roast_or_toast` retired. §7's "migrate/remove `generate_roast`" no longer applies — Roast Me keeps its API path. Phase 2 delivered: 5 canvas poster templates (`src/services/roastCards.ts` — WANTED, tabloid, yearbook, trading card with observation-seeded stats, certificate) + session recap via the shared `shareCard.ts` engine (whose primitives are now exported). Movie-poster frame was cut (canvas cinematic grading wasn't hitting the quality bar). **Per founder direction, the poster is now the DEFAULT deck visual** — every roast auto-renders into a random frame (no "Make it a poster" gate); a dice + frame strip change it, tap to enlarge. Phase 4 below is next.

---

## 1. Where Roast Me stands today (verified against code)

Flow: upload/camera photo → pick 1 of 6 theme stickers (Animate, Tabloid, Movie, Rock Star, Royal, FIFA 2026) → **one submit fires two AI calls in parallel**:

| Call | Model | Cost/call (July 2026 list prices) |
|---|---|---|
| `generate_roast` (photo → caption) | Gemini 2.5 Flash | ~$0.001 |
| `edit_image` (photo → caricature) | Gemini 3 Pro Image | **~$0.134** (1K–2K image) |

Then the result screen offers 5 "refine" chips (Zombie/Anime/80s/Noir/Classic) + a free-text prompt — **each one is another full $0.134 Pro Image generation** from the original photo.

### Structural problems

1. **The cost model is inverted.** The thing users repeat (rerolls/refines) is the most expensive call in the whole app. The cheap thing (text) happens exactly once per photo and can't be rerolled at all.
2. **The photo is re-sent at full resolution on every call.** `ImageUpload` does a raw `FileReader.readAsDataURL` — no downscale. A 12MP phone photo is a 4–6MB base64 body: burns bandwidth/latency, and flirts with Vercel's 4.5MB request cap (silent failures on modern phones).
3. **One generation per theme.** Server prompts have 3–4 hand-rolled scene/vibe variants per theme (nice!), but the roast voice is fixed per theme, so repeated plays feel samey fast.
4. **Nothing is context-aware.** Pets, couples, groups, babies, food — all get the same generic "person in photo" prompt.
5. **No offline story.** Roast Me is the only game that hard-fails without network (violates the house offline-first directive; it's inherently AI, but it can degrade gracefully).
6. **Rate limit is client-side only** (`VITE_ROAST_LIMIT`, default 100/2h via SessionManager). Fine for a party app, trivially bypassed for a commercial one.
7. **Dead/broken legacy:** `roast_or_toast` has zero client callers, and its `type` param is stripped by the dispatcher (known issue, `notes/01`), so the "toast" variant can't work over the wire anyway. Retire it; Toast becomes a persona (§4).

### Cost of the status quo

Engaged session ≈ 1 submit + 2 refines ≈ **$0.41**. At 500 sessions/day ≈ **$6,100/month**; at 2,000/day ≈ **$24,500/month**. The founder's cost worry is correct — this shape doesn't scale.

---

## 2. The core idea: three tiers with opposite economics

Split the experience into three layers and route engagement toward the cheap ones:

| Tier | What | Marginal cost | Role |
|---|---|---|---|
| **T0 — Canvas cards** | User's real photo + AI roast text composited into designed frames (Canvas API, like `shareCard.ts`) | **$0.00** | The default *shareable*. Works offline. |
| **T1 — Text roasts** | Batches of 5 roasts from a persona × format × spice matrix, generated from cached photo *observations* | **~$0.003 / batch of 5** | The *addictive loop*. Effectively free to reroll. |
| **T2 — AI caricature** | Image generation. Default on Gemini 2.5 Flash Image ($0.039); Gemini 3 Pro Image ($0.134) reserved for "premium" styles | $0.039–0.134 | The *climax*. Once per session by design, style picked before generating. |

This is exactly the founder's "templated mechanisms" instinct made concrete: the **frame is a template, only the words are generated** — and for the visual wow, the user's own photo inside a designed frame reads as "made for me" without any generation at all.

**Engine principle: "Look once, riff forever."**
One cheap **observation pass** per photo (vision → structured JSON: subjects, pets, outfit, setting, expression, objects, vibe — ~$0.001, cached client-side by photo hash). Every subsequent text generation is **text-only** from those observations — no image re-upload, no vision tokens, and *more* specific roasts because the model is handed concrete details to riff on.

Division of labor (matches the house Claude-first pattern in `handlers-custom.ts`):
- **Gemini 2.5 Flash = the eye** (observation pass; cheap vision).
- **Claude Haiku 4.5 = the wit** (roast batches; $1/$5 per MTok, excellent at voice-constrained short comedy, structured JSON output), **Gemini 2.5 Flash as fallback** with the same prompt.

### New session economics

| Item | Calls | Cost |
|---|---|---|
| Observation pass (once per photo) | 1 × Gemini Flash vision | ~$0.001 |
| Roast batches (5 roasts each, Haiku: ~1.5k in / ~450 out) | 5 batches = 25 roasts | ~$0.017 |
| Canvas share cards | any number | $0.000 |
| One caricature (Flash Image default) | 1 | $0.039 |
| **Heavy session total** | | **~$0.057** |

Same 500 sessions/day ≈ **$860/month** (vs $6,100) — **~7× cheaper while delivering ~25 roasts instead of 1**. The marginal cost of the "MORE ROASTS" button — the thing an addicted user hammers — is **~$0.0007 per roast**. Text-only sessions cost ~$0.02. A truly viral day (10k sessions) is ~$570, survivable; today's architecture at 10k/day would be ~$4,100/day.

Side benefit: Flash Image generates in a few seconds vs 15–30s for Pro Image, which also de-risks the documented Vercel Hobby 10s-timeout landmine on the default path.

---

## 3. The creative engine: Persona × Format × Spice × Context

Replace "6 themes, one voice each" with a composable matrix. Every axis is a server-side prompt block (same pattern as `GROUP_TYPE_GUIDANCE` / `TONE_DEFINITIONS` in `handlers-custom.ts`).

### Personas (voice) — launch with ~10

| ID | Voice | Sample energy |
|---|---|---|
| `roastmaster` | Comedy-club legend (default, = today's Animate voice) | "savage but grinning" |
| `posh_judge` | Dry British panel-show judge | "I've seen better looks on a police sketch" |
| `grandma` | Sweet grandma, devastating backhanded compliments | "Oh honey, you tried, and that's what matters" |
| `bollywood_aunty` | Marriage-market aunty (fits the app's Indian-context content) | "Beta, with this photo, only prayers can help" |
| `hr_rep` | Corporate HR performance review | "Fails to meet expectations in the grooming KPI" |
| `bard` | Shakespearean insult sonneteer | "Thou art the human equivalent of a soggy biscuit" |
| `commentator` | Breathless sports play-by-play of the photo | "AND HE'S GOING FOR THAT HAIRSTYLE — OH NO—" |
| `astro_girlie` | Astrology girl who blames your rising sign | "This is SO Mercury-retrograde of you" |
| `drill_sgt` | Drill sergeant | all caps, disappointed |
| `hype_man` | **Toast mode** — pure unhinged gas, zero roast | replaces the dead `roast_or_toast` |

### Formats (shape) — launch with ~8

Zinger (1–2 lines) · Tabloid headline (keeps today's Tabloid) · Movie-trailer VO (keeps today's Movie) · Yearbook superlative · Dating-app profile review · WANTED-poster charges · Sarcastic award citation · Obituary for your dignity. Each format is a strict output spec (length, structure, no emoji/hashtags — the existing prompts already do this well; it becomes shared code instead of copy-paste).

### Spice (calibration)

`mild 🥛` (all-ages: outfit/vibe/background only) · `medium 🌶️` (default, today's level) · `extra 🔥` (**gated behind the existing 0438 adult PIN** — brutal, still guard-railed).

### Context modifiers (from the observation pass — the founder's "contextualize on what's in the picture")

Detected `pet` → pet angles + a **"your pet's honest opinion of you"** sub-mode (pet content is the most shared content on earth). `couple` → compatibility roast. `group` → assign each person a role ("every friend group has one..."). `food` → Gordon-Ramsay-adjacent critique. `mirror_selfie`, `gym`, `car`, `sunglasses-indoors` → each a one-line angle instruction appended to the prompt. Detected `child as main subject` → **force mild + hype_man, no roast personas** (safety, §6).

10 personas × 8 formats × 3 spice × context angles ≈ **thousands of distinct generation recipes** from ~30 maintained prompt blocks. Same photo never roasts the same way twice — plus a **"Surprise me" roulette** that spins persona+format for zero-decision replay.

### The loop (UI)

Photo → observation runs in background while user browses personas → **swipeable deck of 5 roast cards** → "MORE" (new batch, auto-rotates persona) → ❤️ saves to **Burn Book** (localStorage, like saved bests elsewhere) → "Make it a poster" (T0 canvas) or "Cartoonify" (T2 image) → share via existing `navigator.share` path. Roast text becomes re-rollable *content*, not a caption stapled to an expensive image.

---

## 4. Visuals: templates first, generation as the finisher

### T0 — Canvas template gallery (Phase 2's centerpiece, $0)

Reuse the `shareCard.ts` engine (1080×1350 canvas → share/download). Frames composite the **user's actual photo + the roast text + observation-derived flavor**:

1. **WANTED poster** — sepia photo, charges pulled from the roast, bounty amount from a "rizz score"
2. **Tabloid front page** — photo torn-edge cutout, roast as screaming headline (the current Tabloid theme without the $0.134)
3. **Yearbook page** — photo in oval, superlative + fake signatures
4. **Trading card** — photo + stat bars generated from observations ("Drip: 23/100 · Chaos: 91/100")
5. **Certificate of Roast** — formal serif certificate, gold seal, roast as citation
6. **Movie poster** — photo with cinematic grade (CSS filter), title + tagline from the movie-format roast

These are instant, work offline, and are *more* shareable than AI images because the person is actually recognizable. Each is a few hours of canvas work, zero marginal cost forever.

### T2 — AI caricature, restructured

- **Style gallery with baked-in example thumbnails** (bundled assets, generated once at dev time) — user picks the style *before* generating, so a generation is never "wasted on a surprise."
- **Default model → Gemini 2.5 Flash Image** ($0.039). Keep **Gemini 3 Pro Image** ($0.134) only for 2–3 "✨ premium" styles that genuinely need its text-rendering/fidelity (Tabloid cover, Movie poster with in-image title).
- Keep the excellent existing IDENTITY LOCK prompt blocks — they're the best part of the current implementation and move into the style library unchanged.
- **Ration it:** N free caricatures per session/day (config), then "come back tomorrow" — or spend one on the Battle winner. Refine chips draw from the same allowance instead of being unlimited $0.134 taps.

---

## 5. Party layer (what makes it PartySpark and not just an app)

**Roast Battle** (Phase 3): 2–8 players from the shared session roster (`TeamRosterRow` / `sessionService`) → everyone snaps a photo → same persona+format+spice for fairness → AI roasts each player (~$0.02/player, no image gen needed — reveals are T0 cards) → pass-the-phone reveal with the existing audio/haptics kit → **everyone votes the hardest burn (can't vote self)** → `EndScreen` leaderboard → `reportResult()` into Game Night → recap share card. A full 6-player battle costs ~$0.12 — cheaper than one of today's refine taps.

Later candidates (explicitly not now): Daily Roast (shared daily prompt, streak à la Daily Scramble), Roast Royale bracket, "roast my screenshot" mode.

### 5a. Phase 3 implementation handoff — ✅ SHIPPED 2026-07-07 (kept as the build record)

> **Done.** Roast Battle shipped exactly as scoped below: `src/components/games/RoastBattleGame.tsx` (pass-and-play state machine) + the shared `src/components/games/roastShared.ts` extracted from the solo deck; wired via a Solo/Battle toggle on Roast Central's SETUP. Reveal posters use the async `renderRoastCard` (decodes each player's photo internally — which sidestepped the per-player decoded-`<img>` gotcha below entirely). Verified: `npm run build` + `npm test` + `check:api` green, `drive-games.mjs` 13/13 (solo unregressed), and a focused `scripts/drive-roast-battle.mjs` drove roster → capture 2 → reveal → vote → EndScreen clean on the offline fallback path with a visual poster/leaderboard check. The section below is preserved as the build record.
>
> Everything below already existed in the codebase after Phases 1+2. Roast Battle was **assembly of shipped parts**, not new AI plumbing.

**Building blocks that already exist — reuse, do not rebuild:**
- `src/components/games/RoastCentralGame.tsx` — the solo game. Copy its proven helpers rather than reinventing: `downscaleDataUrl` (≤1024px), camera capture, `startObservation` + sessionStorage cache, `sampleFallback` (offline deck), `personaById`, `randomTemplate`, the `PERSONAS`/`FORMATS`/`SPICES` arrays (ids mirror the server). Consider extracting these into a shared `roastShared.ts` if Battle lives in its own component.
- `src/services/geminiService.ts` — `observeRoastPhoto(base64) → RoastObservations | null` and `generateRoastBatch(observations, persona, format, spice, count) → string[]` (Claude-first server-side, `[]` on failure). One observe + one batch per player.
- `src/services/roastCards.ts` — `renderRoastCardWithImage(imgEl, input)` (sync draw) + `ROAST_CARD_TEMPLATES`. Use for each player's reveal poster.
- `src/services/shareCard.ts` — `shareResultCard({gameTitle, accent, emoji, heading, sub, rows, footer})` for the battle recap; `shareCanvasImage`/`downloadCanvasImage` for per-player posters.
- `src/data/roast_central_fallback.json` — per-persona offline lines; battle must degrade to these so it never dead-ends.
- `src/components/ui/TeamRosterRow.tsx` + `sessionService` (`getTeams()`) — collect 2–8 player names, persists across games (shared roster; Truth or Drink / 5 Alive already use this exact pattern — copy their usage).
- `src/components/ui/EndScreen.tsx` — `import EndScreen` (default export). Props: `{ title, onBack, onHome, entries: {name, score, expand?}[], accent: 'emerald'|'indigo'|'theme', heading?, winnerText? }`. Sorts descending internally; renders winner tint + 🏆 + tie line. Votes = score.
- `src/services/gameNightService.ts` — `sessionService`-style singleton; `reportResult(gameId: string, entries: {name: string, score: number}[])` (no-op when no night active). Call from the battle end screen.
- `src/services/audio.ts` — `unlockAudio`, `playPop`, `playDingSoft`, `playBell`, `playBuzzer`, `hapticTap`, `hapticSuccess` for the pass-and-reveal beats.
- `src/components/ui/PinGate.tsx` — `isAdultUnlocked()` / `PinGateModal` for the Extra-spice gate (PIN `0438`).

**The flow (pass-and-play):**
1. **Mode select** on Roast Central's SETUP: add a "Solo / Battle" toggle (or a Battle tile). Battle = 2–8 players.
2. **Roster** via `TeamRosterRow` → then **one shared persona + format + spice** for the whole battle (fairness; host picks or "Surprise me"). Extra spice → `PinGateModal`.
3. **Capture round** — pass the phone; each named player uploads/snaps a face (reuse the solo intake). Downscale + decode each; kick off `observeRoastPhoto` per player as they're added so vision overlaps input.
4. **Generate** — for each player: one `generateRoastBatch(obs, persona, format, spice, 5)`, keep the strongest 1 (or show the deck). Fall back to `sampleFallback` when the API returns `[]`.
5. **Reveal** — pass-and-play, one player at a time: their roast rendered as a poster (`renderRoastCardWithImage`, random frame) with `playPop`/`hapticSuccess`.
6. **Vote** — after all reveals, pass the phone; each player votes the hardest burn, **cannot vote self** (disable own row). Tally.
7. **Result** — `EndScreen` with `entries = players.map(p => ({name, score: votes}))`, `accent: 'indigo'`. Then `reportResult('ROAST_CENTRAL', entries)` for Game Night + a `shareResultCard` recap ("Winner: X — N votes").

**Cost/caps:** ~$0.02/player (observe + batch, no image gen). A 6-player battle ≈ $0.12. The solo `MAX_BATCHES_PER_SESSION` cap (60/2h in the component) already covers battle volume, but count each player's batch against it.

**Gotchas carried over from Phases 1+2 (don't relearn these):**
- **Per-player images:** the solo path decodes ONE photo into `imgElRef`. Battle needs N decoded `<img>` elements (one per player) to draw posters — hold an array/map keyed by player, not a single ref.
- **U+00A0 edit trap:** an earlier edit round silently failed exact-match because a literal non-breaking space (`\xa0`) was hiding in the JSX. If an `Edit` won't match a line you can see, check for nbsp (`sed -n 'Np' file | python3 -c "import sys;print([hex(ord(c)) for c in sys.stdin.read() if ord(c)>127])"`) and splice via Python.
- **Tailwind v4 JIT:** accent classes must be complete static strings — use the `ACCENT` static-map pattern (see `EndScreen.tsx` / `RoastCentralGame.tsx`), never template literals. Verify new colors land in `dist/assets/index-*.css`.
- **Canvas output isn't test-verifiable:** render each reveal/recap and LOOK at it (dump to PNG via a headless drive, read the image). Tests only prove it ran.
- **Game Night excludes adult-gated games** from its auto-playlist. If Battle can run Extra spice, either keep Battle out of the hub playlist or force ≤ medium when launched from the hub (mirror how Truth or Drink is handled).
- **Every screen needs `ScreenHeader`** with working `onBack`/`onHome` (house rule #4).
- **No new AI types needed** — `roast_observe` + `roast_text_batch` already cover Battle. Only client work.

**Verify like Phases 1+2:** `npm run build` + `npm test`; `node scripts/drive-games.mjs` (13/13 clean — Battle must not regress the solo open); a focused headless drive of the battle flow (roster → capture 2 faces → reveal → vote → EndScreen) against `vite preview` on the offline fallback path; `/ship` gates before push. Branch: `claude/roastme-game-enhancement-goabyu` (or a fresh branch if that PR merged — see the merged-PR rule).

---

## 6. Prompting architecture & safety (the part that makes it commercial-grade)

**Composable server-side prompt:** `[shared roast-craft system core] + [persona voice block + 2 few-shot calibration examples] + [format spec] + [spice rules] + [context modifiers] + [hallucination guard] + [safety rules]`, then a user message carrying the observation JSON. Output = strict JSON array of 5 strings (Claude structured output; Gemini `responseSchema` on fallback). Batching is the big saver: input tokens dominate, so 5 roasts per call ≈ 4× cheaper per roast than 5 calls.

**Hallucination guard (why observations also improve quality):** "Roast ONLY what is present in the observations. Never guess age, name, ethnicity, religion, health, or anything not visible." Grounding on extracted facts kills the generic-roast problem *and* the making-things-up problem in one move.

**Safety rails (non-negotiable for a commercial app):**
- No protected-class content, no body-shaming (weight/skin/disability) at any spice level — outfit, expression, vibe, setting, props are the targets.
- Child detected as main subject → wholesome modes only.
- Consent framing in the system prompt ("willing participant in a party roast game they chose to play") — this also measurably reduces spurious model refusals.
- Any refusal/API failure → graceful fallback (below), never an error wall.
- Privacy stance worth advertising: the photo is processed transiently and never stored server-side; observations live only on the device.

**Offline/failure fallback (house directive):** a small bundled deck of pre-written roasts per persona×format (dev-time generated via the Batch API at 50% price, curated by hand) with `{outfit}`/`{setting}` slots filled from cached observations when available. Plus T0 templates always work. Roast Me stops being the only game that hard-fails offline.

**Server-side rate limiting:** move the cap server-side (per-IP daily token bucket — Upstash Redis free tier or equivalent — no accounts, per house rule). Gate image-gen hardest; text can stay generous because it's ~free.

---

## 7. API surface changes

| Type | Handler | Notes |
|---|---|---|
| `roast_observe` (new) | `handlers-image.ts` | photo → observation JSON (Gemini Flash vision). Zod schema per house pattern. |
| `roast_text_batch` (new) | `handlers-custom.ts` | observations+persona+format+spice+context → 5 roasts. **Claude-first, Gemini fallback.** |
| `edit_image` (extended) | `handlers-image.ts` | add `tier: 'flash' \| 'pro'` (default flash); style key replaces free theme string; keep IDENTITY LOCK blocks. |
| `generate_roast` (kept) | — | untouched during migration, removed once v2 ships. |
| `roast_or_toast` (retired) | — | dead client-side + broken `type` variant (notes/01). Delete handler, schema, wrapper. |

Client: downscale to ≤1024px JPEG (~85% quality) in `ImageUpload` **before anything else** — cuts upload 10–20×, fixes the 4.5MB risk, costs one canvas redraw. Cache observations in sessionStorage keyed by photo hash. Fold `RoastGame` state machine into PHOTO → DECK → VISUAL → SHARE.

Note on structured output: `messages.parse()` / `output_config.format` gives schema-enforced JSON on Haiku 4.5 (current SDK); the existing `parseClaudeJson()` three-tier parser stays as the belt-and-suspenders fallback. Prompt-caching footnote: Haiku's minimum cacheable prefix is 4,096 tokens, so cache the *combined* persona library as one shared system prompt if we want cache hits — but at ~$0.003/batch it's an optimization, not a requirement.

---

## 8. Phased roadmap

| Phase | Ships | Size | Cost impact |
|---|---|---|---|
| **1 — Engine** ✅ | Client downscale · observation pass + cache · `roast_text_batch` (Claude→Gemini) · persona/format/spice prompt library (start: 6 personas, 5 formats) · swipe-deck UI + MORE + Burn Book · safety rails · offline fallback deck · retire `roast_or_toast` | **L** | Kills the per-roast cost; multiplies content variety |
| **2 — Shareables** ✅ | 4–6 canvas templates · trading-card stats · share/save wiring · "roasted N times" session recap card | **M** | $0 visuals become the default share |
| **3 — Party** ✅ | Roast Battle (roster, votes, EndScreen, Game Night, audio/haptics) | **M** | New session driver, ~$0.02/player |
| **4 — Premium image** | Style gallery w/ baked thumbnails · Flash-Image default + Pro premium tier · rationing + server-side limits · reveal animation | **M** | Image spend drops ~70% and becomes bounded |

Phase 1 is the load-bearing one: every later phase builds on observations + the prompt library. Each phase is independently shippable behind the existing game route.

### Success checks (all measurable with the existing local `statsStore` — no analytics backend)
- Roasts viewed per session (target: >10, from 1 today) · shares per session · return sessions (Burn Book revisits) · caricatures per session trending *down* while satisfaction (shares) trends up.

---

## 9. Deliberately out of scope

Accounts/auth (house rule: never) · payments/credits-for-money (rationing first; monetization is a separate conversation once retention is proven) · video roasts (cost/latency not there yet) · voice TTS roast readings (fun future idea — Web Speech API could do it free — parked).

## 10. Pricing sources & assumptions (checked 2026-07-06)

Gemini 2.5 Flash $0.30/M in · $2.50/M out; Gemini 2.5 Flash Image $0.039/image; Gemini 3 Pro Image ~$0.134/image (1K–2K) — [Google pricing](https://ai.google.dev/gemini-api/docs/pricing) (verified via mirrors; official page was proxy-blocked this session). Claude Haiku 4.5 $1/M in · $5/M out — Anthropic docs. Token estimates: observation ~1.1k in/250 out; batch ~1.5k in/450 out. Re-verify monthly alongside the model-retirement check (CLAUDE.md lesson from the 2.0-flash shutdown).
