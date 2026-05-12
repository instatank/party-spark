# PartySpark — Session Handoff

> **Created:** end of a long working session, ~80% context used. This file
> exists so a fresh session/agent can pick up cleanly. Read `CLAUDE.md` first
> (the canonical project doc) — this file only covers **what changed recently,
> what's in flight, and conventions worth knowing.**

---

## ⏭️ Immediate next task

**Finalize the "5 Alive" game and ship it to production.** Everything else this
session is already merged to `main`.

- The game is fully built on branch **`claude/five-alive-game`** (commit `f9a6e16`),
  **NOT merged to main**. It's listed under `comingSoonGameIds` so it appears in
  the home screen's "Coming Soon" tab.
- The user is testing it on the Vercel preview build for that branch.
- When the user gives feedback: apply fixes **on `claude/five-alive-game`**, push,
  let them re-test. When they approve → merge to `main` with `--no-ff` (this
  triggers the production Vercel deploy). It stays in Coming Soon either way until
  the user explicitly says to promote it.
- **Untested by the building agent (worth a real-device check before promotion):**
  buzzer latency on a mid-range phone, the iOS audio-unlock path, light/dark
  rendering of the full-screen timer screen.

### What "5 Alive" is (so you don't have to reverse-engineer it)
Pass-and-play speed-recall. 5 descending rounds: name 5 in 5 sec → 4 in 4 → 3 in 3
→ 2 in 2 → 1 in 1, with a buzzer at each cutoff. A judge taps how many the player
got; a perfect round = +1 bonus (max game = 20). Files:
- `src/types.ts` — `GameType.FIVE_ALIVE`
- `src/App.tsx` — routing + first entry in `comingSoonGameIds`
- `src/constants.tsx` — GAMES entry, GAME_RICH_META, GAME_SUBCATEGORIES, `getIcon('timer')` → lucide `Timer`
- `src/data/five_alive.json` — 100 Easy + 100 Hard categories (flat pools; rounds differ only by count+time)
- `src/components/games/FiveAliveGame.tsx` — the whole game. State machine:
  `CATEGORY_SELECT` (Easy/Hard slim-row tiles + hero block) → `SETUP` (2-10 named
  players OR "Just Play") → `PASS` (pass-the-phone gate, names the judge) →
  `REVEAL` (portrait card with the category) → `PLAYING` (RAF-driven full-screen
  countdown, draining SVG ring, green→amber→red) → `TALLY` (judge stepper 0..N,
  perfect-round bonus) → loop 5 rounds → next player → `END` (leaderboard with
  tappable per-round breakdown). "Just Play" skips names/judge/scoring.
- **Audio is synthesized via Web Audio API** (two detuned square oscillators for
  the buzz; an 880Hz click for the tick at 3/2/1s remaining). No bundled assets.
  Context unlocks on the first user gesture (tile tap / Start). If the user wants
  a sampled MP3 instead, that's an easy swap.
- **Deliberately out of the minimal PR** (per the handoff spec's "future" list):
  rounds-per-player ×2/×3 (single 5-round game per player only), AI custom
  category pools, achievements, sound themes, i18n.

---

## 🌿 Branch state

| Branch | Status |
|---|---|
| `main` | Production. All session work below is merged here EXCEPT 5 Alive. Latest: `bd009b9` (game-home hero pattern merge). |
| `claude/five-alive-game` | **Not merged.** The 5 Alive game. Awaiting user testing → fixes → merge. |
| Other `claude/*` branches | Stale — already merged into `main`. Ignore them. |

Vercel auto-deploys: every push to a branch → a preview build; every merge to
`main` → production. There's a stop-hook that nags about uncommitted changes —
commit and push your work when done.

---

## 📦 What got built this session (all merged to `main` unless noted)

**Card library expansions** (all merged):
- **Taboo**: Medium 100→250, Hard 75→250 (parity with Easy's 250). New cards in `src/data/games_data.json` under `games.taboo.categories`.
- **NHIE** (`src/data/never_have_i_ever.json`): dropped 3 dead family-gathering decks (`rehaan`, `rehaan_asks`, `agra`). Added 2 new decks: **Family Friendly** (sky, Smile icon) and **No Filter** (red, Flame icon). Then populated/expanded — current: family_friendly 40, classic 60, bbf 20, guilty_pleasures 50, no_filter 50. Also moved NHIE from coming-soon → active (positioned right after Taboo in the `GAMES` array). NHIE's deck metadata lives in `constants.tsx` `NEVER_HAVE_I_EVER_CATEGORIES` + `GAME_SUBCATEGORIES` + `NeverHaveIEverGame.tsx`'s `CATEGORY_DARK`/`CATEGORY_LIGHT` palettes.
- **Truth or Drink** (`src/data/truth_or_drink.json`): doubled every deck, then targeted +50% on spicy & chaos. Current: classic 50, spicy 75, deep 30, exes 30, chaos 50.
- **MLT** (`src/data/most_likely_to.json`): doubled the 6 surfaced decks, then targeted +50% on scandalous & chaos. Current: family_friendly 100, fun 50, scandalous 75, adult 50, chaos 75, bbf 50. (`rehaan`/`agra` keys still present but orphaned — not surfaced in any UI; candidates for cleanup.)

**Session / dedupe system** (merged — `src/services/SessionManager.ts`):
- The 2-hour session timer is now a **sliding window** (anchored to `lastActivity`, bumped on every `markAsUsed`) so a long party night = one session. Backwards-compatible with old localStorage shape.
- Exported a shared **`shuffle()` Fisher-Yates** helper — replaced all the biased `[...arr].sort(() => 0.5 - Math.random())` calls across game files + `LocalGameService.ts`.
- **Per-card session dedupe** is now wired into ALL card-pool games (Charades, Taboo, MLT, WYR, Imposter, NHIE, TOD, Forecast, Fact or Fiction, Would I Lie To You). Pattern: `sessionService.filterContent(...)` on round start → fall back to full pool if exhausted → `markAsUsed(...)` when a card is shown. Icebreakers is excluded (pure AI generation, no static deck). Mini Mafia's shuffle is for role assignment only.

**Team-name roster** (merged — `src/components/ui/TeamRosterRow.tsx`):
- Optional team names shared across **Charades, Taboo, Fact or Fiction** via `sessionService.getTeams()/setTeams()/clearTeams()`. A slim "+ Add team names (optional)" row on each game's setup screen; 2-4 teams. When set, those 3 games run alternating rounds per team with a ranked summary + trophy. When skipped, behavior is identical to before.

**⚠️ Player-name roster — BUILT THEN REVERTED. Do NOT reinstate.**
A `PlayerRosterRow.tsx` (cross-game individual-player persistence for Forecast/TOD/MLT/NHIE, and earlier also Imposter/Mafia) was built and merged, then **fully reverted** at the user's request (revert commit `f50841b`). The user didn't like it. `PlayerRosterRow.tsx` no longer exists. Forecast is back to explicit Player 1/Player 2 inputs; TOD is back to its numbered-avatar player list; Imposter/Mafia kept their self-contained setups; MLT/NHIE have no player UI. Only `TeamRosterRow` (team names, not player names) survives. **If the user asks for cross-game player persistence again, treat it as a fresh design conversation — don't resurrect the reverted code.**

**Game-home "hero" pattern** (merged for 5 games; 3 still pending):
Each game's entry screen now leads with a compact block: an emoji on its own
line (`text-3xl`, `leading-none`), a Playfair italic-emphasis tagline (`text-lg`),
a short imperative sub-text (`text-sm`), and `-mt-3` on the wrapper to close the
gap under `ScreenHeader`. Applied to:
- **Forecast** 🔮 "How well do you *really* know each other?" / "Predict their answers. Discover the truth."
- **Truth or Drink** 🍷 "How honest are you *really*?" / "Answer honestly — or take a sip."
- **Most Likely To** 👉 "Who's *really* the wildest?" / "Read the card. Everyone points on 3."
- **Fact or Fiction** 🤔 "Can you tell what's *actually* true?" / "Race the clock. 3 strikes — you're out."
- **Imposter** 🕵️ "Who's the *imposter*?" / "Everyone learns the word — except one. Find them." (screen title also renamed "Setup Game" → "Imposter")
- **5 Alive** ⏱️ "Can you beat the *buzzer*?" / "5 in 5 seconds. Then 4 in 4. Then 3 in 3…" (on the five-alive branch)

**Still pending** (drafted, user-approved copy, NOT implemented): Charades, Taboo, NHIE.
- Charades: 🎭 "Can you say it *without* saying it?" / "60-second round. Act them out — no words allowed."
- Taboo: 🚫 "Describe it — without saying *it*." / "60 seconds. Avoid the forbidden five."
- NHIE: 🫣 "What *haven't* you done?" / "Stand up if you've done it. Last one sitting wins." — *user was still mulling NHIE; confirm before implementing.*

**Roast Me redesign** (merged earlier — Direction D V2): the whole Roast Me flow
(IDLE upload screen, LOADING memo/stamp screen, COMPLETE polaroid result) was
redesigned to a "sticker-meets-sleek" system. Files: `src/components/games/roast/*`
(ImageUpload, RoastLoading, RoastResult — no more LoadingOverlay or GameHeader).
Tokens `--c-roast-red`, `--c-roast-ember`, `--c-polaroid`, `--font-display`
(Bebas Neue), and `roastStampPulse`/`roastDotPulse` keyframes in `index.css`.
Polaroid image is `object-contain` on a dark frame; tap it for a lightbox.

**Forecast deck refresh** (merged): all three Forecast modes (friends, couples,
bunny) replaced with new question sets — 30 questions each (10 per round × 3
rounds). `src/data/compatibility_test.json`. The runtime picker draws 5 random
per round.

---

## 🛠️ Things discussed but NOT built (parked)

- **Screen mirroring / viewer mode** ("phone B watches phone A's gameplay via a passcode"). I explained the realistic path is state-sync over a realtime backend (Firebase/Supabase/Ably), ~1-2 weeks of work, and recommended *not* building it yet — the in-room "pass the phone" model mostly covers it, and lighter fixes (bigger card text, a landscape "TV mode") solve most of the actual pain. **Parked. Don't build unless the user explicitly revisits.**
- **Home-screen search extraction**: the user asked for the search-bar code to hand to *another project's* agent — I gave it to them as a code snippet in chat. **No change to this repo.**

---

## 🧭 Workflow conventions (what this session followed)

1. **One feature = one branch off `main`.** Name `claude/<short-slug>`.
2. **Build-verify before every commit:** `npm run build` (runs `tsc -b && vite build`). It must pass clean. Strict TS catches `api/` errors too (via `tsconfig.api.json`).
3. **Commit with a real message** — first line = summary of the *why*, body explains the *what*. Don't add Claude/Anthropic co-author footers unless the user asks.
4. **Push to the branch, let the user review on the Vercel preview.** Only merge to `main` when they say "ship" / "push to production" / "merge to main".
5. **Merge to `main` with `--no-ff`** and a merge-commit message summarizing the branch. That push triggers the prod deploy.
6. **Data edits**: I used small Python scripts to merge new cards into the JSON files (dedupe case-insensitively, preserve order). Note the JSON files have different indent conventions — `never_have_i_ever.json` is 4-space, the others 2-space; `python json.dump(..., indent=N)` rewrites the whole file so match the existing N to keep diffs small. The Taboo expansion commit has a large diff because the indent got normalized — not a problem, just FYI.
7. **Card-generation tone**: when expanding a deck, read the existing cards first and match the voice per deck. Show the user old-vs-new samples for review before committing. For multi-word card formats (e.g. Taboo: `{word, forbidden:[5], difficulty}`), keep the shape exact.

---

## 📁 Key files (supplement to CLAUDE.md's list)

```
src/
├── App.tsx                          # Router switch + HomeMenu (search + filter pills + comingSoonGameIds live here)
├── types.ts                         # GameType enum
├── constants.tsx                    # GAMES, GAME_RICH_META, HOME_FILTERS, GAME_SUBCATEGORIES, getIcon, per-game CATEGORIES arrays
├── index.css                        # Tailwind v4 @theme — CSS vars + keyframes ONLY (no utility classes inside @theme)
├── services/
│   ├── SessionManager.ts            # sliding-window session + dedupe + shuffle() + team roster API
│   └── LocalGameService.ts          # static-data readers (uses shuffle())
├── components/
│   ├── ui/
│   │   ├── Layout.tsx               # Card, Button, ScreenHeader (title is a plain string — emoji flows inline)
│   │   ├── PinGate.tsx              # 0438 gate — DO NOT REFACTOR
│   │   ├── ThemeToggle.tsx
│   │   └── TeamRosterRow.tsx        # optional team names for Charades/Taboo/FoF
│   └── games/                       # one file per game; roast/ subdir for Roast Me's 3 screens
└── data/                            # static JSON: games_data.json (charades+taboo), never_have_i_ever, most_likely_to,
                                     # truth_or_drink, would_i_lie_to_you, would_you_rather, fact_or_fiction,
                                     # compatibility_test, five_alive (new, on the five-alive branch)
```

---

## ✅ Quick orientation checklist for the new agent

1. Read `CLAUDE.md` (canonical) then this file.
2. `git checkout main && git log --oneline -10` — confirm latest is `bd009b9`-ish.
3. If the user's first ask is about 5 Alive: `git checkout claude/five-alive-game` and work there.
4. Anything else: branch off `main`, build-verify, commit, push, wait for the user to say "merge."
5. Never reinstate `PlayerRosterRow` / cross-game player persistence (reverted on purpose).
6. Never touch the PIN gate, never add react-router, never put utility classes in `@theme`, never use template-literal Tailwind classnames.
