# PartySpark — Developer Context & Guidelines

> **Last reconciled with code:** 2026-09-06 (**Multiplayer rooms** shipped — `api/room.ts` + `api/_lib/roomStore.ts` + `src/services/roomService.ts` + `src/services/seededRandom.ts` + `src/components/ui/RoomPanel.tsx`, the app's FIRST server-side state and first feature that does not work offline. **Four games are wired**: Scramble head-to-head, Ballpark live (blind simultaneous brackets), Target live (same six numbers, same clock) and The Line live (turn-based via a replayed move log — the only one where hands are genuinely private). Guarded in CI by `tests/roomSync.test.ts` (THE ROOM INVARIANT) and out of CI by four *two-browser* drives plus `scripts/serve-with-api.mjs`, because `vite preview` does not run `/api/*`. **Requires a Redis store provisioned on Vercel** — see Multiplayer below.)
>
If you're reading this and something in the codebase doesn't match what's described here, **the code is the source of truth** — please update this file in the same PR that makes the change.
>
> There is also a `notes/` directory — one *lesson* per file (what was tried, what broke, what fixed it). Architecture facts live here; war stories live there.

## Working environment (read before giving instructions)

This repo is built entirely in Claude Code cloud sessions — there is no local checkout, no local terminal, and no local dev environment for the founder. **Never hand him `cd` / `git clone` / `npm install` / `./script.sh` steps to run on his machine** — anything that must execute runs in the agent's own container, or in the deployed app.

- **Egress is allowlisted.** A host can fail with "Host not in allowlist" — that means blocked, not down. Say so and propose another route.
- **No secrets store here** (Anthropic's own docs say not to put API keys in Claude Code cloud env vars). Secrets live in Vercel's env vars — never ask the founder to paste one into chat or a local file.
- **Blocked host or needs real credentials?** Build it as a route in the deployed app and hand over a URL to open — not a script to run.
- **Steps the founder performs are browser/dashboard steps** — name the site, the menu, the button.

## Shared playbook (cross-project — read at session start)

The single source of truth for global working rules, transferable lessons, and the ship / sync / deploy / verify SOPs is the **`playbook/` folder of `instatank/time-tracker`** (`PLAYBOOK.md` first). Read `/home/user/time-tracker/playbook/PLAYBOOK.md` if that repo is cloned locally; otherwise fetch it via GitHub `get_file_contents` on `instatank/time-tracker`, path `playbook/PLAYBOOK.md`. Before ending a session that shipped commits, run the **`/wrap`** skill (a Stop hook nudges once if forgotten) — it reconciles this file's "Last reconciled with code" line against reality, appends friction cards to `LEARNINGS.md`, and asks the founder the learning questions from `playbook/LEARNING_METHOD.md`. Pre-push ritual = the **`/ship`** skill.

## 🤖 Role & Core Directives

You are the lead developer and architect of **PartySpark**, a premium, AI-powered party game application.

- **Primary directive:** Maintain the "Wow" factor. Every UI component must feel premium — glassmorphism, dynamic gradients, smooth micro-animations, high-contrast text. Simple or basic MVPs are unacceptable.
- **Secondary directive:** Offline reliability. Most games must work without an internet connection using local fallback datastores. AI generation is optional "spice," never a hard dependency. If the AI call fails, the user should still get a playable deck.

## 🏗️ Architecture & Tech Stack

- **Framework:** React + TypeScript via Vite 7
- **Styling:** Tailwind CSS v4
- **Routing:** State-based `switch` in `App.tsx` driven by the `GameType` enum — no React Router, no Next.js
- **Code splitting:** Every game is `React.lazy` in `App.tsx` (one shared `<Suspense>` boundary with the bouncing-dots `GameLoading` fallback). The initial bundle carries only the home screen; each game is its own chunk.
- **Data Strategy:** Offline-first. Questions/cards live in static JSON files under `src/data/*.json`, but they are **dynamic-imported**, never statically imported — each dataset is its own lazy chunk. House pattern: a module-level memoized `import('../../data/x.json').then(m => m.default)` promise resolved with React 19's `use()` inside the component (suspends into the App-level boundary). `games_data.json` is shared by Charades + Taboo and loads through `loadGamesData()` in `LocalGameService`. Adding a static JSON import to a game undoes its code splitting — don't.
- **Offline/PWA:** `vite-plugin-pwa` in `vite.config.ts` (registerType `autoUpdate`, registered in `main.tsx`). The service worker precaches every built asset (all game + data chunks, icons, splash), so the whole app works offline after first load. The existing `public/manifest.json` stays the single manifest (`manifest: false` in the plugin). `/api/*` is never cached and is denylisted from the SPA navigate fallback. Google Fonts get runtime caching.
- **AI Integration:** Hybrid. See the **AI Services** section below for the current provider layout.

### Shared modules (use these — do not re-duplicate per game)

- `src/hooks/useCountdown.ts` — the round-timer driver for all 6 timer games (Charades, Taboo, Fact or Fiction, 5 Alive, Linked, Scramble). rAF against a `performance.now()` deadline; `{ running, durationMs, restartKey?, onSecond?, onExpire? }` → `{ remainingMs, secondsLeft }`. No game should own a `setInterval`/rAF countdown again.
- `src/services/audio.ts` — the Web Audio synth kit (lazy singleton `AudioContext`, `unlockAudio()`, `beep()`, `playBell`, `playBuzzer`, `playTick`, `playDing`). Formerly duplicated in 5 Alive / Linked / Scramble.
- `src/services/haptics.ts` — `hapticLight` / `hapticSuccess` / `hapticError` / `hapticHeavy` on `navigator.vibrate` (feature-checked; iOS Safari never supports it — Android/Chrome only). Wired at the same moments as sounds.
- `src/components/ui/EndScreen.tsx` — the ranked-leaderboard end screen (winner tint + trophy, tie line, optional expandable row detail, Play Again/exit footer). Used by 5 Alive, Linked, Charades, Taboo. Fact or Fiction / Scramble / Truth or Drink end screens are structurally different and intentionally NOT on it — don't force them without a design pass.
- `src/components/ui/TimerSetting.tsx` + `TeamRosterRow.tsx` — as before (see Design System).
- `src/components/ui/RoomPanel.tsx` — the shared multiplayer front door: create or join a room by 4-digit code, then a lobby until the host starts. Owns the room lifecycle and **no game state**, which is what keeps wiring the next game cheap. Used by Scramble (head-to-head) and Ballpark (live). See the Multiplayer section.
- `src/components/ui/SpinTheBottle.tsx` — the shared "who goes next?" decider. Circular table of name chips + a rotating bottle whose neck ends in an arrowhead; a sight-line ray fades in on landing so the target is unambiguous. **The winner is picked first (uniform random), then the rotation is solved backwards** to land inside that seat's sector with jitter — so the result can never disagree with where the arrow points. rAF ease-out over `spinMs` (default 5000), transform written straight to the DOM node (zero re-renders during the spin); wheel ticks fire on each seat-boundary crossing so the click cadence decelerates for free. Honours `prefers-reduced-motion` (1.2s, one turn). Props: `names`, `accent`, `mode` (`'single'` | `'pair'` — pair does two spins, who-asks → who-answers), `spinMs`, `onPick`, `ctaLabel`/`onCta`. Owns no game state and no storage. Fewer than 2 names falls back to an internal numbered-seat stepper (2–12) so it's testable without a roster.

  **Status: built, not yet baked in.** It currently lives only as a test screen inside Truth or Drink (`gameState === 'BOTTLE'`, tile on the category screen, amber `#F59E0B`). Wiring it into a game means calling it from that game's turn-advance path and seeding `turnIndex` from `onPick` — no changes to this component should be needed.

## 🎨 Design System (current standard)

The category/deck picker pattern is consistent across Most Likely To, Truth or Drink, and Never Have I Ever. **New games should follow this pattern.** The Forecast's MODE_SELECT follows it too.

### Glass-on-navy "Slim Row" pattern

```
┌─[4px colored L accent bar]─────────────────────┐
│ 🎯 icon  Title                            →    │
│          Short one-line tagline                │
└─[2px colored bottom bar]───────────────────────┘
```

- **Container:** `grid gap-3 max-w-[340px] mx-auto w-full` (narrow, with dead-space on sides)
- **Tile:** `bg-surface-alt backdrop-blur-sm border border-divider border-l-4 {accentBorderLeft} border-b-2 {accentBorderBottom} hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25 rounded-xl py-3 px-4 transition-colors`
  - ⚠️ The original spec was `bg-white/5` + `border-white/10` + `hover:bg-white/[0.08]`. Those are **dark-mode-only** — a 5%-white fill and a 10%-white border are invisible on the light theme's near-white ground, so the tile reads as loose text next to a coloured bar. Use the semantic surface tokens above, which flip with the theme. Ballpark and Echo do. (`notes/06`)
- **Hover scoped to top+right** so the colored L accent stays stable
- **Icon:** Lucide icon, `size={16}`, colored with `{accentText}`
- **ChevronRight:** `size={16} text-gray-500 group-hover:text-white` on the far right
- **Taglines:** one line max (tiles truncate), ~4 words

### Tailwind v4 JIT gotcha (critical)

**Do NOT use template literals for accent classes.** Tailwind v4 only detects class names that appear as complete static strings in source.

❌ Wrong — silently won't compile:
```tsx
className={`text-${color}-400 border-l-${color}-500`}
```

✅ Right — static class maps:
```tsx
const ACCENT: Record<string, {text: string; borderL: string}> = {
  violet: { text: 'text-violet-400', borderL: 'border-l-violet-500' },
};
// ...
className={`${ACCENT[id].text} ${ACCENT[id].borderL}`}
```

This bit us several times. If you add a new accent color, verify it in the compiled CSS: `grep "text-{color}-400" dist/assets/index-*.css`.

### Action-button convention (in-play choices)

- **Green/positive on the RIGHT, red/negative on the LEFT** — Tinder-style, consistent across games (NHIE, Truth or Drink, Fact or Fiction, Linked Just Play, Charades, Taboo, Scramble).
- **Outline style** is the standard for binary in-play choices: `bg-transparent border-2 border-{emerald|rose}-500/60 text-{emerald|rose}-600 hover:bg-{…}-500/10 hover:border-{…}-500` (the "Never Have I Ever" look). Emerald = correct/positive, rose = negative/skip. Charades/Taboo/FoF were migrated to this from filled buttons (sizes kept).

### Shared round-timer chip

`src/components/ui/TimerSetting.tsx` — a compact "⏱ 60s round ✎" chip that opens a bottom-sheet of presets (30/60/90/120 + custom 15–300s). Used by **Scramble, Charades, Taboo** (each passes its own `accent` hex + persists its own localStorage key via `loadTimerPref`/`saveTimerPref`). Default 60s. There is no dedicated "pick a timer" step — the chip lives on each game's setup/difficulty/category screen.

### Home screen (`App.tsx`)

- **Tabs hidden:** the old "Play Now / Coming Soon" tab bar is gated behind a `SHOW_TABS` flag (currently `false`) — the front end shows only the Play Now games. All Coming Soon games + tab logic stay in code; flip `SHOW_TABS = true` to bring them back for testing.
- **Games / NEW tabs:** the newest games (`NEW_GAME_IDS` in `App.tsx` — The Line, Target, Shortlist, Echo, Ballpark, House Rules) are split out of the main list into their own **NEW** tab above the filter pills, so the front page stays a short list. The tab strip hides itself while a search is running, because **search deliberately spans both tabs** — a game the user typed the name of must never come back "no games match" because it sits on the other tab. Moving an id out of `NEW_GAME_IDS` returns that game to the main list, nothing else to change. This is separate from the `SHOW_TABS` Play Now / Coming Soon bar above. **Dev drives must click the NEW tab** (`button[aria-label="New games"]`) before those six game cards exist in the DOM — `drive-games.mjs` and the six per-game drives already do.
- **Filter pills** (`HOME_FILTERS` in `constants.tsx`): All / Quick / Solo / Couples / Crowd / Spicy. `quick` matches by short duration; the rest match by tag in `GAME_RICH_META[id].tags`.
- **Game cards** use tightened vertical padding (`!px-4 !py-2.5`) and the header spacing is compact.
- **Splash** is 1.5s max and tap-skippable — never make users wait on it.
- **"Tonight's crew" banner**: when the shared session roster (`sessionService.getTeams()`) is non-empty, Home shows a gold banner listing the names with an X to clear — this is how users discover that names carry across games.
- **Quick-action row**: two slim tiles above the filter pills — Game Night (violet, shows "live · Next up: X" during an active night) and Daily Scramble (gold, shows streak / done state). Header buttons ride the "Always Invited" tagline row itself (absolutely positioned, zero extra height): Trophy (Stats screen) in the left corner, mute toggle + ThemeToggle in the right corner.
- **Today's Pick tile**: full-width tile between the quick-action row and the crew banner — one game spotlighted per day (`pickOfTheDay()` in `App.tsx`: FNV-1a over `dayKey()`, same pick for everyone). Deliberately warmer than its neighbours but static, no animation: gold border + soft glow + gold gradient wash, Sparkles eyebrow, the game's own icon/color blob, chevron. Adult-gated and coming-soon games are excluded from the rotation so a tap always drops straight into play (no PIN speed bump). The picked game still appears in the list below (under the NEW tab, if it is one of the new six) — the tile is a spotlight, not the only entry.

## 🔁 Engagement layer (Phase 2, added 2026-07-03)

Cross-game retention + sharing systems. All localStorage, **no accounts, ever**; all fully offline.

| Piece | Where | What it does |
|---|---|---|
| **Share cards** | `src/services/shareCard.ts` | Canvas-rendered 1080×1350 result card (navy/gold/game-accent) → `navigator.share`, download fallback. Wired into the end screens of 5 Alive, Scramble, Linked, Fact or Fiction, Charades, Taboo, Truth or Drink (named), NHIE recap, Game Night recap. `shareText()` for text-only shares. Redesigned 2026-07-06: ticket frame + seeded confetti, glowing hero emoji, medal-ranked rows with 👑 on the winner (`plainRows: true` for stat rows like NHIE's), three optional per-call fields — `tagline` (what the game is), `context` (what the points mean), `challenge` (CTA line) — and a challenge CTA band whose "Play free → {host}" link resolves from `window.location` (nothing hardcoded; the challenge + link also ride `navigator.share`'s `text`). Layout self-fits: hero shrinks at 4+ rows, emoji drops at 6+, overflow rows collapse to "+N more". |
| **Shared audio + haptics** | `src/services/audio.ts` | ONE Web Audio synth module (the old per-game copies in 5 Alive/Linked/Scramble were extracted verbatim) + `navigator.vibrate` helpers. App-wide mute (toggle on Home header, `partyspark_muted`) silences both. Taboo/NHIE/Forecast/Imposter got sounds+haptics; new games should import from here, never hand-roll a synth. |
| **Game Night** | `src/services/gameNightService.ts` + `src/components/GameNightScreen.tsx` (route `GameType.GAME_NIGHT`) | Crew + 3–5 game playlist → hub with running leaderboard (3 pts for topping a game, 1 for playing) → recap + share card. Scored games call `reportResult()` from their end screens (no-op when inactive); `App.tsx` reroutes game exits to the hub while a night is active. **Playlist deliberately excludes adult-gated games** (hub launch bypasses the Home PIN gate). |
| **Daily Scramble** | `src/services/dailyChallenge.ts` + Daily mode in `JumbleGame` | Same date-seeded easy set for everyone (FNV hash of local date), 60s, one attempt/day, streak with ONE freeze/ISO-week, spoiler-free emoji-grid share. Home tile deep-links via sessionStorage `partyspark_open_daily`. |
| **Lifetime stats** | `src/services/statsStore.ts` + `src/components/StatsScreen.tsx` (route `GameType.STATS`, trophy button on Home) | Plays / bests / wins-per-player-name across all scored games; backfills `jumble_best_*`. Two-tap reset. |
| **First-play rules** | `src/services/firstPlay.ts` | Each game's How-To-Play auto-expands on first open (`useState(() => shouldAutoExpandRules('key'))`), collapsed forever after. |

## 🔗 Multiplayer rooms (added 2026-09-06)

Two or more phones playing the same game at the same time, joined by a 4-digit
room code. **This is the only part of the app that needs a connection** — every
other game stays fully offline, so multiplayer is always an opt-in branch off a
game's setup screen and never sits on the default path.

### The core idea: a shared seed, not a shared screen

Room state is NOT a replica of anyone's UI. Two phones exchange a **seed** and a
**per-player results inbox**, nothing else:

- **Content never crosses the wire.** Every engine already accepts an injectable
  `rnd: () => number` (`dealGame`, `dealPuzzle`, `buildCase`) or an index
  (`setAtIndex`), because Daily Scramble and the invariant tests needed
  determinism. `src/services/seededRandom.ts` (`mulberry32`, `seededShuffle`,
  `roundSeed`) turns that into "both phones deal the identical puzzle from one
  32-bit integer".
- **Timers sync on a server-stamped DEADLINE, never a "go" message.** The client
  asks for a duration; `api/room.ts` decides when it lands. Each client counts
  down using a measured clock offset (`serverNow()` / `msUntil()` in
  `roomService.ts`). A phone that hears about the round a second late, on a
  device whose clock is minutes wrong, still buzzes at the same instant. **Never
  accept an absolute deadline from a client** — that reintroduces exactly the
  skew this design removes.

### Key layout — one writer per key

Room state is split so no two writers ever touch the same key:

```
room:{code}:meta          host only  (phase, round, seed, deadlineAt, config)
room:{code}:members       Redis SET of player ids (SADD/SREM are atomic)
room:{code}:p:{playerId}  that player only  (name + their state blob)
```

A single-document room would need read-modify-write, and two phones posting a
score in the same tick would silently clobber one another. Partitioning by
writer makes the lost update **unrepresentable** rather than merely unlikely —
no locks, no WATCH/MULTI, no Lua. Don't "simplify" this back into one document.

A new round does **not** clear anyone's state (the host would have to write keys
it doesn't own). Instead every player doc carries `stateRound`; readers use
`stateForRound(player, round)` and stale payloads are ignored. Cumulative fields
(e.g. Ballpark's `total`) are read off `player.state` directly, outside the
round gate.

### Files

| File | Purpose |
|---|---|
| `src/services/seededRandom.ts` | `mulberry32` / `seededShuffle` / `roundSeed` / `newSeed`. Not cryptographic — reproducible, not unguessable. |
| `api/_lib/roomStore.ts` | Upstash Redis over REST, 3h TTL refreshed on every write. In-process `Map` fallback for `vercel dev` — `isPersistent()` reports which, and the lobby surfaces it. |
| `api/_lib/roomSchemas.ts` | zod per action. Routes on **`action`**, not `type`, to sidestep the notes/01 dispatcher collision entirely. |
| `api/room.ts` | `create` / `join` / `poll` / `patch` / `host` / `leave`. Every response carries the server's `now`. Host-only guard on `host`. |
| `src/services/roomService.ts` | Transport + clock offset + `useRoom()` hook. **The whole network boundary** — swapping polling for websockets means reimplementing this file only. |
| `src/components/ui/RoomPanel.tsx` | Shared create/join + lobby. Owns the room lifecycle, never game state — which is what keeps wiring the next game cheap. Props: `game`, `config`, `startDurationMs`, `hostControls`, `onStart`, `onCancel`. |

### Wired games

- **Scramble → Head-to-head** (`mode: 'versus'`). Same seven letters from the
  seed, deadline-synced clock, opponent's score ticking live, shared end screen.
  Scores **RAW**, unlike Pass and Play's unique-word rule — the live ticker is
  the whole mode, and a number that silently repriced itself at the buzzer would
  make it a lie for the whole round. Shared words appear on the end screen as a
  stat, not as scoring.
- **Ballpark → Play live on separate phones**. Everyone brackets **blind and
  simultaneously**; the reveal waits for the entire room before the truth drops
  onto the number line. This is what the signature screen was drawn for —
  pass-and-play's HANDOFF means everyone after the first player has already
  watched somebody think. Session dedupe is deliberately **skipped** in live
  play: it reads this device's localStorage, so two phones would filter
  different questions out of the pack and deal different games from one seed.
- **Target → Race on separate phones**. Five rounds; `dealPuzzle` runs its own
  search from the shared seed on each device, so every phone independently
  arrives at the same six numbers, target *and* solution. The live ticker
  publishes **distance, never the number** — "Priya is 2 away" is pressure, the
  number would hand over part of the answer. An exact hit ends a turn early, so
  the reveal gate is load-bearing: the solution stays hidden until everyone is
  done.
- **The Line → Play on separate phones**. The only game where separate phones do
  something pass-and-play physically cannot: **your hand stays yours**. See the
  turn-based pattern below — it is the one wired game that needs more than a
  seed.

### Turn-based games: replay a move log (The Line)

Three of the four wired games are simultaneous — everyone acts at once and only
results are exchanged. The Line is turn-based, so the board depends on what
people **did**, not only on what was dealt, and a seed alone is not enough.

It still needs no authoritative server. The deal is deterministic, `placeCard`
is a pure function, and turns rotate strictly, so:

- each move is published as **(global turn number → cardIdx, gap)**;
- only the player whose turn it is writes turn N (still one writer per key);
- every device merges the move maps into one turn-indexed log and replays it.

Two properties fall out for free, and are worth copying for any future
turn-based game:

- **Whose turn it is is derived**, not announced: `turnCount % players`. Nothing
  broadcasts it and no two devices can disagree about it.
- **The ending is derived too.** `winnerSeat()` is a property of the replayed
  board, so every phone reaches it alone. This is the one game with no "host
  finished but nobody told the guests" bug to have — a failure both Ballpark and
  Target needed explicit `phase: 'END'` handling for.

The replay **must refuse to move the board backwards** past what the device has
already applied, or a move made optimistically under the player's thumb gets
yanked back out by a poll that has not seen it yet.

Hand privacy is **UI-level, not cryptographic** — every device can compute every
hand from the deterministic deal. That matches the rest of the room layer
(scoring is already client-authoritative among friends) and is stated in the
code rather than implied. Don't market it as secrecy.

### Wiring another game

1. Add a stage/mode for the room, render `<RoomPanel>` from it.
2. On `onStart(session, room)`, derive content from `room.meta.seed` (+
   `roundSeed` for multi-round) — never from `Math.random`, never from anything
   in localStorage.
3. `patch()` this player's result; read others via `stateForRound`.
4. Only the host calls `host({ round })` / `host({ phase })`; everyone else
   reacts to the change arriving on a poll. **Two devices advancing
   independently is how a room ends up on two different questions.**
5. Ending is a ROOM event, not a local one, and leaving must free the seat —
   both were real bugs (notes/11). Turn-based games get both for free from the
   replayed log; simultaneous ones must signal `phase: 'END'` explicitly.
6. **Put the room screen ABOVE any `if (!state) return null` guard.** The lobby
   runs before anything is dealt, so a room stage below that guard renders a
   silent blank page — React returning null looks exactly like a component that
   meant to. This bit both Target and The Line (notes/12).

### Constraints

- **Scoring is client-authoritative** and always will be. Anti-cheat among
  friends in a room costs more than it protects. Nothing in `api/room.ts` is a
  security boundary.
- **No accounts, ever** (unchanged). A room holds a nickname and a score, and
  everything expires on a 3h TTL, so there is no cleanup job to forget.
- Multiplayer must **fail gracefully back to solo**. Never put it on a path a
  player has to cross to reach an offline game.

### Verifying it actually works

Two browser-openable diagnostics, because the local drives **cannot** cover
this: `scripts/serve-with-api.mjs` has no Upstash credentials, so every
two-browser drive exercises the in-process `Map`. The Redis path (REST
pipeline, `SADD`/`SMEMBERS`, `EXPIRE`, TTL refresh) only ever runs on a real
deployment.

| URL | Answers |
|---|---|
| `/api/health` | `roomStore: "redis" \| "memory"` — is a store wired to *this deployment*? Env vars are per-deployment, so a build made before the store was connected still says `memory`. |
| `/api/room?action=selftest` | Does the store actually work? Round-trips a document with a TTL, checks the expiry is armed, adds and reads a member set, then cleans up. Writes only to a `selftest:` key namespace, so it can never touch a live room. |

Run the self test after provisioning, after changing store plans, and on any
deployment where multiplayer misbehaves — "two phones can't see each other" and
"the store is misconfigured" look identical from inside the game.

### ⚠️ Requires provisioning (browser step)

Without a Redis store the server falls back to an in-process `Map`, which cannot
work across serverless instances — two phones "in the same room" never see each
other. The lobby shows an amber warning when this is the case. To fix, in the
Vercel dashboard: **party-spark → Storage → Create Database → Upstash for Redis
→ Connect**, then redeploy. The integration injects `UPSTASH_REDIS_REST_URL` +
`UPSTASH_REDIS_REST_TOKEN` (the store also accepts the older `KV_REST_API_*`
names). Free tier is far more than enough — a 2-player, 5-minute game is roughly
600 requests.

## 🚫 Explicit Constraints & "Do Not Touch" Rules

### 1. Adult Content PIN Gate (`0438`)

- **Do NOT refactor to a backend/DB.** `PinGateModal` in `src/components/ui/PinGate.tsx` intentionally uses frontend-only `sessionStorage` (`partyspark_adult_unlocked`). Stateless, frictionless, prevents accidental kid access during shared tablet use.
- **Do NOT change the PIN.** Must remain `0438`.
- **Do NOT remove the 5-attempt lockout.** Prevents brute-force; session-locked via `sessionStorage`.
- **`PinGateModal` is parameterised** (additive, defaults preserve the 0438 adult gate): optional `pin` / `storageKey` / `title` / `subtitle` props let a *separate* gate be layered on extra-sensitive content with its own PIN + own `sessionStorage` key + own lockout. Used by **Intimate Drinking** (PIN `2525`, key `partyspark_intimate_unlocked`) inside Truth or Drink. Generic `isUnlocked(key)` exported; `isAdultUnlocked()` stays for the default gate. Don't change the 0438 default.

### 2. Tailwind v4 Animation Constraints

- **Anti-Pattern:** custom CSS classes inside the `@theme` block in `src/index.css`
- **Reason:** Tailwind v4 throws a build error if `@theme` contains anything other than custom properties or `@keyframes`. Keyframes go in `@theme`, utility classes go outside it.

### 3. Routing Mechanism

- **Do NOT introduce `react-router-dom` or Next.js.** The single-page `switch` in `App.tsx` is an intentional architectural limit — tiny bundle, instant transitions. Use `setActiveGame(GameType.HOME)` as the navigation back-stack.

### 4. Stats ids must equal the `GameType` string

`StatsScreen` labels a row by looking the stats id up in `GAMES` as a
`GameType`. So `statsStore.recordPlay('BALLPARK')` renders as "Ballpark", while
a bespoke id (House Rules once used `'house_rules'`) renders as the raw string.
Always pass the `GameType` value.

### 5. Game Navigation UI

- **Every single game screen MUST render `ScreenHeader` with working `onBack` and `onHome` props.** No orphaning users deep in a flow.

## 🎮 Game Roster & Current State

### Active & playable (routed in `App.tsx`)

| Game | GameType | Mechanic | AI | Notes |
|---|---|---|---|---|
| Charades | `CHARADES` | Describe without forbidden words | Gemini (refills) | Round timer editable via the shared `TimerSetting` chip on SETUP (default 60s, persisted) |
| Taboo | `TABOO` | Word guessing with banned terms | Local + Gemini fallback | Round timer editable via the shared `TimerSetting` chip on the CATEGORY screen (default 60s, persisted) |
| Roast Me | `ROAST` | AI roast from uploaded image | Gemini (image + text) | Uses image gen, can't swap to Claude |
| Imposter | `IMPOSTER` | Find the fake among friends | Gemini | |
| Would You Rather | `WOULD_YOU_RATHER` | Paired dilemmas | Local static data | |
| Most Likely To | `MOST_LIKELY_TO` | Vote on friends | **Claude → Gemini fallback** | Has "Create Your Vibe" AI custom deck (not PIN-gated; adult decks still are). Plays in 10-card rounds with a ROUND_END break screen (next 10 / change deck) |
| Would I Lie To You | `WOULD_I_LIE_TO_YOU` | Truth vs lie storytelling | Gemini | |
| Never Have I Ever | `NEVER_HAVE_I_EVER` | Stand up if you've done it | Gemini | Has curated "Rehaan"/"Agra"/"BBF" decks; no Claude custom yet. "Someone Has / All Clean" buttons record a room verdict per card; every 10 cards a RECAP screen scores the group's innocence. Custom Vibe not PIN-gated |
| Mini Mafia (The Traitors) | `MINI_MAFIA` | Pass-and-play betrayal | Gemini (narration) | |
| Icebreakers | `ICEBREAKERS` | Conversation starters | Gemini | Partial — SELECT→PLAY only |
| Fact or Fiction | `FACT_OR_FICTION` | Beat the clock on true facts | Local static | |
| The Forecast (Compatibility Test) | `COMPATIBILITY_TEST` | Player A predicts Player B's answers | Static (`compatibility_test.json`) | Adult-gated. Modes: Couples / Friends / Bunny. |
| **Truth or Drink** | `TRUTH_OR_DRINK` | Confess or sip | **Claude → Gemini fallback** | Adult-gated. 5 decks (Classic/Spicy/Deep Cuts/Ex Files/Chaos) + "Create Your Vibe" AI custom deck. 10 rounds. No dedicated roster screen — a deck tap drops straight into play. Optional compact `TeamRosterRow` on the category screen: add 2+ names → named mode (per-player truths/drinks leaderboard), else pass-the-phone just-play (like MLT/NHIE). Roster persists across games via the shared session team store. Custom deck routes to its context screen first. Also exposes an **Intimate Drinking** tile (adult dice sub-game, `IntimateDiceGame`) gated by a *separate* PIN `2525` — three classic two-dice modes ("The Action" = action × target-zone; "The High-Stakes Countdown" = sensation × duration, rolled number × 10s; "Positions" = position × twist/modifier) plus the featured **"The Slow Burn"** date-night mode: 15 rolls in three escalating acts (The Tease / The Heat / The Inferno), each act with its own action+modifier dice tables and house rule (Act I bans lip-kissing), a gradient heat meter (amber→orange→rose; `emberPulse` keyframe lives in `@theme`), doubles deal a no-repeat **Wildfire** interrupt card, drink-ritual intermissions between acts, and a "Last Ember" finale card that deliberately ends the game at peak (Encore restarts). Consent-forward trade rule (two sips → partner rewrites the dare) footnoted in play. Offline, mappings live in the component. Also hosts **The Tell** and **Nerve** (their own rows below) and the **Spin the Bottle** test screen (ungated tile on the category screen → `gameState === 'BOTTLE'`) — a parking spot for the shared `SpinTheBottle` decider while we decide which games it gets wired into. |
| **The Tell** | *(no GameType — a sub-screen of `TRUTH_OR_DRINK`)* | Secret mission vs. the partner who has to name it | None (offline) | Strictly 2 players, date-night shaped. Each round one player (the Operative) is shown a mission only they can see — blurred until press-and-hold; a timer runs with the phone face down while they try to pull it off; at the buzzer their partner picks what it was from 3 options (the real one + 2 decoys from the same tier). Correct guess = **Caught** (Operative pays the mission's forfeit); wrong = **Clean getaway** (guesser pays the mission's spoils); the Operative can also self-report **bottled it** for the tier's bust penalty. Optional **Double Down** on the brief screen is a private bluff — doubles both stakes, revealed only at the verdict. Any mission can be swapped for another in the same tier before the clock starts (consent-forward, same spirit as Slow Burn's trade rule). 12 rounds, alternating, 4 per tier across 3 escalating tiers. Two decks in `src/data/the_tell.json` (8 missions x 3 tiers each): **Sips** (drinking, clothes on, ungated beyond TOD's own 0438 gate) and **After Dark** (explicit; gated by PIN `2525`, reusing Intimate Drinking's `partyspark_intimate_unlocked` key so one unlock covers both). Reuses `useCountdown`, `TimerSetting` (`the_tell_timer_secs`, default 90s), `TeamRosterRow` (max 2), `audio` / `haptics`, and per-theme accent palettes. Bespoke end screen (cleans + reads per player) — deliberately NOT on the shared `EndScreen`. No share card, no Game Night reporting, no stats: the content isn't shareable. |
| **Nerve** | *(no GameType — a sub-screen of `TRUTH_OR_DRINK`)* | Two-player chicken up a ladder of escalating dares | None (offline) | Strictly 2 players. One ladder of 6 rungs per round, each worse than the last; players alternate. On your turn: **Do it** (the ladder climbs one rung and passes to your partner) or **Fold** (round over — you pay the forfeit printed on the rung you refused, and they take the round). Clearing the top rung wins the round outright and the other player pays the tier's `top` price. Best of 3 — one round per tier, and the opening player alternates each round so neither always draws rung 1. The fold screen reveals the rung you dodged. **No timer and no RNG in the play loop** — the only pressure is who blinks first, which is what separates it from Intimate Drinking (dice) and The Tell (deduction). One **swap** per player per round is the consent affordance; folding itself is a legitimate move rather than a failure state. Two decks in `src/data/nerve.json` (8 rungs x 3 tiers each, authored in escalating order): **Sips** and **After Dark** (PIN `2525`, same `partyspark_intimate_unlocked` key as Intimate Drinking / The Tell). **Ladders are stored as authored indices, not rung objects, and every mutation must keep them ascending** — see `notes/05-invariant-held-by-constructor-only.md`. Reuses `TeamRosterRow` (max 2), `audio` / `haptics`, `PinGateModal`, per-theme accents. Bespoke end screen; no share card / Game Night / stats, same reasoning as The Tell. |
| **House Rules** | `HOUSE_RULES` | Laws accumulate; the phone is the rulebook | None (offline) | 3–8 players (4–5 ideal), the first proper group drinking game since NHIE. Each round one player is the **Lawmaker**: the phone hands them a law that binds the whole table for the rest of the session (laws never expire), and before reading it out they secretly pick a **Mark** — who they think breaks it first. Play continues normally; when someone slips, the table taps in which law and who, and that player drinks the law's sips. Mark was right → Lawmaker scores 2; anyone else → the Lawmaker drinks the same sips for the bad call (**except** when the Lawmaker broke their own law, where they've already paid — don't "fix" that into a double charge). 9 laws over 3 escalating tiers (2/3/4 sips) from `src/data/house_rules.json` (30 laws, 3 drawn per tier); `{maker}` in a law's text/detail is substituted with the Lawmaker's name at deal time. **The Book of Laws is the hub screen** and the whole reason this is an app rather than a card deck. Uses the shared `EndScreen` (`accent="theme"`, `footerExtra` share button), `TeamRosterRow` seeded from `sessionService.getTeams()`, `statsStore`, `gameNightService.reportResult`, and a share card. Not adult-gated, so it *is* Game Night eligible. |
| **Ballpark** | `BALLPARK` | Bracket the number, don't guess it | None (offline) | 1–6 players and the app's second true **solo** game. Every question has one true number; you never name it, you commit a LOW and a HIGH. The bracket is priced off its **ratio** (`high / low`), not its width, so a tier means the same thing whether the answer is 12 or 6 billion — Wild 1 / Loose 2 / Solid 4 / Sharp 6 / Sniper 10, and a single exact number is a 20-point **Bullseye**. Miss and you score zero however close you were. Because the price is computable from the player's own two numbers, the badge prices the bracket **live while they type** (with a haptic tick on every tier crossing) — that is the whole feel of the game. Signature screen: every player's bracket on one **log-scaled number line**, then the truth drops in on top of them; a miss stays visible (player colour, dashed, 30% opacity) so you can see *where* you were wrong. The end screen scores the thing trivia never does — a **calibration read** (hit rate against geometric-mean bracket width) verdicting each player Deadly / Playing it safe / Well calibrated / Overconfident / Wildly overconfident. 120 authored questions over 3 packs (Mixed Bag / Planet & Cosmos / Body & Beasts), each with a one-line fact note shown on reveal; 8 per game, session-deduped via `SessionManager`. Uses the shared `EndScreen` (`accent="theme"`, calibration card + share button in `footerExtra`), `TeamRosterRow`, `statsStore` (`recordBest` in solo), `gameNightService.reportResult`, and a share card. Not adult-gated, so Game Night eligible. |
| **Echo** | `ECHO` | Recite the growing chain, then choose what breaks the next player | None (offline) | 2–6 players. One shared chain; on your turn you tap the whole thing back **in order** from a 16-tile board with nothing marked, and only then do you **choose** the next item to add. The choice is the mechanic — every board is stocked with deliberate lookalikes (Lemon/Melon, Fish/Prawns, Potato/Sweet potato, Lion/Tiger), so you're picking the item you think they'll confuse. A clean recital pays the **length of the chain you carried**; one wrong tap or the clock ends the round. 3 rounds, and the opening player rotates so nobody always draws the empty chain. Signature screen: the public **chain replay**, each chip landing a semitone higher than the last. The break screen shows exactly what you tapped against exactly what you needed. 4 boards x 16 items in `src/data/echo.json`. **THE CHAIN INVARIANT: it only ever grows, by exactly one item, never reorders and never repeats** — it is stored as authored indices, not item objects, so the property is measurable at the point of mutation, and `scripts/drive-echo.mjs` asserts the invariant itself at every replay (see `notes/05`). Reuses `useCountdown` + `TimerSetting` (`echo_timer_secs`, default 45s), `TeamRosterRow`, `EndScreen`, `audio`/`haptics`, `statsStore`, `gameNightService`, share card. Not adult-gated, so Game Night eligible. |
| **Shortlist** | `SHORTLIST` | Sixteen suspects, one culprit, clues that cost you points | None (offline) | 2–8 players and **the app's first cooperative game** — nobody plays each other, everyone plays the app. It hides one of sixteen suspects and feeds truthful clues one at a time; the table crosses suspects off, argues, and names someone. Closing on clue 1 pays 10 and it drops (10/8/6/4/3/2) with every clue taken, so the whole game is one question asked five times: *do we know enough yet?* A wrong name costs one of 3 lives and forces another clue; 0 lives ends the night. **Content is GENERATED, not authored** — `src/services/shortlistEngine.ts` derives every clue from each suspect's structured attributes (plus a derived name-length attribute, which is what keeps Eagle and Owl distinguishable), so three 16-suspect boards in `src/data/shortlist.json` produce endless cases. **THE CASE INVARIANT: every clue is true of the hidden suspect, the suspect survives every clue, each clue strictly narrows the field, and the last clue leaves exactly ONE suspect standing** — that last part is what makes a case closable by deduction rather than a coin flip; `buildCase` throws rather than serve a case that breaks it. `tests/shortlistEngine.test.ts` asserts it over 9,000 generated cases **in CI**, and also pins two properties invisible in any single case: chain length must vary (a plain halving curve lands on exactly 4 clues for every 16-suspect case, flattening the whole scoring curve) and clues should not repeat an attribute back-to-back. Signature screen: the clue tape stacking above the striking-through board. Crossing off is the table's own bookkeeping — the app never reacts to it, because reacting would do the deduction for them. Bespoke end screen (one shared result, no leaderboard); reports the shared score to Game Night but writes **nothing** to the per-player wins board, because a co-op game has no individual winner. Not adult-gated, so Game Night eligible. |
| **Target** | `TARGET` | Six numbers, one three-digit target, four operations | None (offline) | 1–6 players, solo-capable. Reach the target with + − × ÷, each number used at most once. **The phone earns its place by solving the puzzle too**: at the buzzer it shows the way in, and knowing the answer was always there is what makes a near miss sting properly. That reveal is the signature screen. Numbers are combined by **tapping** (tile → operator → tile, and the two collapse into their result) rather than typed as an expression, which makes every illegal move unreachable instead of rejected — there is no way to enter a fraction or a negative. Scoring is Countdown's: exact 10, within 5 is 7, within 10 is 5, further is nothing; your closest number counts automatically so there is nothing to declare, and an exact hit ends the turn on the spot. 5 rounds, two difficulties (Classic: 1–2 large, target 101–499; Tough: 2–4 large, target 300–999 **and** rejected if the target is reachable with three numbers or fewer). **THE DEAL INVARIANT: every puzzle dealt is exactly solvable, and the printed solution is valid — each step combines two numbers available at that moment, never divides unevenly or goes negative, and the last step lands on the target.** `dealPuzzle` only returns a puzzle it has already solved, so "there was always a way" is a property of the dealer rather than a hope; `tests/targetEngine.test.ts` re-verifies it over 800+ deals in CI. `applyOp` is deliberately the single definition of legality shared by the solver and the player's board. **The only game with no `src/data` file** — engine in `src/services/targetEngine.ts` (~6ms per deal, so it deals synchronously). Reuses `useCountdown` + `TimerSetting` (`target_timer_secs`, default 60s), `TeamRosterRow`, `EndScreen`, `audio`/`haptics`, `statsStore` (`recordBest` in solo), `gameNightService`, share card. Not adult-gated, so Game Night eligible. |
| **The Line** | `THE_LINE` | Never say the number — say where it goes | None (offline) | 1–8 players, solo-capable. Every card is a claim with a **hidden** number; one starter is face up, and from then on a player only ever chooses the **gap** in the shared line where their card belongs. Correct → it locks in and the value turns over. Wrong → it is discarded, the truth is shown, and they draw a replacement. First to empty a hand of 4 wins; level scores break on fewest misses. **THE LINE INVARIANT: the line is always strictly ascending by hidden value, and line / hands / discard / draw always partition the deck exactly** — enforced in `assertLine`, which every mutation runs on its OWN RESULT, not just at construction (`notes/05`). The line is stored as **deck indices**, never card objects, so both halves are measurable at the point of mutation. Nothing in the engine assumes the JSON is authored in value order — it happens to be, which is exactly why a comparison that used the index would look correct on the shipped data forever; `tests/lineEngine.test.ts` pins that with a deliberately value-shuffled deck, re-implements the invariant independently, and runs it over hundreds of full games in CI. Content is 208 authored cards over **four single-axis decks** — How Tall (m), How Fast (km/h), How Long Ago (year), How Heavy (kg) — each mixing subjects onto ONE unit, which is the thing a printed deck cannot do. Values are deliberately non-drifting (heights, speeds, years, masses; no populations, prices or "as of" caveats), and each deck carries a **unit ladder** in its JSON so a nine-order-of-magnitude range still reads like something a person would say ("58 g", "397 tonnes", "5.9 million tonnes"). Design calls: hand of 4; a wrong card is **replaced, not lost**, so a miss costs tempo rather than snowballing; **no timer**, because the argument at the table is the game; solo is a **1-player game, not a mode** — the same loop with a different terminator (3 misses instead of an empty hand), which is the one rule that lives on the state (`endless`) so `placeCard` cannot be called with the wrong refill policy. Signature screen: the line itself, which opens into tappable gaps labelled with the **range each one claims** ("under 96 m", "452 m – 979 m", "over 6,190 m"). Reuses `TeamRosterRow`, `EndScreen` (`accent="theme"`, final-line card + share button in `footerExtra`), `audio`/`haptics`, `statsStore` (`recordBest` in solo), `gameNightService`, share card. Not adult-gated, so Game Night eligible. |
| **5 Alive** | `FIVE_ALIVE` | Name N in N seconds, beat the bell | None (offline) | 5 descending rounds — name 5/4/3/2/1, timed 6/5/4/3/2s (extra second to read the clue) — perfect-round bonus, judge tallies. Easy + Hard category pools in `src/data/five_alive.json` (Easy = 124 mainstream + Indian-context; Hard = 106 recall-pressure categories). End-of-round bell + tick synthesized via Web Audio (no bundled assets); the landing screen uses the shared compact `TeamRosterRow` (collapsed gold prompt) for optional player names (persists across games via the shared session team store), difficulty picked after. Also has a "Just Play" no-scoring mode. |
| **Linked** | `LINKED` | One connector word pairs with all 3 clues (e.g. water/down/rain → FALL) | None (offline) | Two modes: **Pass and Play** (60s per player, self-reported "Got it!"/"Skip", leaderboard, both flash the answer before advancing) and **Just Play** (no timer, group shout, Reveal → self-reported Correct/Incorrect tiles that score a running "solved" count and advance). Easy (78) + Hard (36) puzzle pools in `src/data/linked.json` — shape `{ clues: [3], answer, position? }` (`position` optional, defaults `'suffix'`; bundled data is all-suffix). Buzzer + tick + got-it ding synthesized via Web Audio. Per-puzzle session dedupe via `SessionManager`. |
| **Scramble** | `JUMBLE` | Find as many words as possible from 7 scrambled letters before the timer | None (offline) | Display name is **Scramble**; the internal `GameType`, component (`JumbleGame`), engine (`jumbleEngine`), data (`jumble_sets.json`), and `jumble_*` localStorage keys all stay `JUMBLE`/`jumble` (renaming would reset saved bests + move the data path). PartySpark's first true **solo** game (also Pass-and-Play). **No authored content + no dictionary shipped** — a dev script (`scripts/build-jumble-sets.mjs`) runs the ENABLE word list (172k inflected words) + an OpenSubtitles top-50k frequency list (both cached gitignored under `scripts/.cache/`) once and bakes 300 easy + 250 hard 7-letter sets, each with its FULL answer key, into `src/data/jumble_sets.json` (~320KB, lazy-loaded via dynamic import so it's code-split out of the initial bundle). At play time validation = O(1) answer-key lookup + a local formability check; zero API, fully offline. Engine in `src/services/jumbleEngine.ts`. **Easy** is SEEDED from a common 7-letter word so its pangram is always a normal everyday word (never Scrabble-obscure); it accepts any real word but the end-screen "missed words" + % of max are measured against the common subset (`commonWords`). **Hard** = full ENABLE (obscure OK) + every word must use the amber **center** tile. Words must be 4+ letters (3-letter words excluded). Length-weighted scoring (4/5/6/7 = 2/4/6/10; 7-letter = pangram + celebration). User-set timer (30/60/90/120/custom 15–300s, persisted to localStorage). **Solo**: beat-your-best (localStorage per difficulty), end screen shows found + high-value missed words + pangram. **Pass and Play** (2–8): same letters + timer for all, pass-to-next gate, **unique-word scoring** (words found by 2+ players cancel) + leaderboard. To refresh/resize the set pack, re-run the build script (needs the dictionary; fetch it to `scripts/.cache/enable1.txt` if missing). |

### Previously orphaned (deleted 2026-04-21)

Three components — Trivia, Simple Selfie, Agra Quest — used to exist as unrouted files. They were deleted along with their GameType enum entries, their TRIVIA_CATEGORIES and TriviaQuestion type, the `generateTriviaQuestions` service function, and the trivia buffer path in `ContentContext`. If you want any of them back, start from scratch rather than restoring old code.

## 🤖 AI Services

**All AI calls go through `/api/ai` — a Vercel Serverless Function.** The API keys live server-side only. They are **NEVER** shipped in the client bundle.

### Architecture

```
Browser ─── fetch('/api/ai', {type, ...}) ───► Vercel Serverless Function
                                               (api/ai.ts)
                                               │
                                               ├── handlers-custom.ts  (Claude-first, Gemini-fallback)
                                               ├── handlers-gemini.ts  (Gemini-only)
                                               ├── handlers-image.ts   (image analysis + edit)
                                               │
                                               └── SDK clients hold keys from process.env
                                                   (GEMINI_API_KEY, ANTHROPIC_API_KEY)
```

### Key files

| File | Purpose |
|---|---|
| `api/ai.ts` | Dispatcher. Reads `body.type`, routes to the right handler. Validates params with zod before dispatch (invalid → 400 naming the failing field). Returns `{ ok, data }` or `{ ok: false, error }`. |
| `api/_lib/schemas.ts` | One zod schema per request type (`z.looseObject` — extra keys pass through; only what handlers genuinely require is enforced). `AIRequestType` is derived from this map, so schemas and dispatch can't drift. Adding a handler = add its schema here + dispatch entry in `ai.ts`. |
| `api/_lib/clients.ts` | Lazy SDK singletons (one GoogleGenAI + one Anthropic per cold start). |
| `api/_lib/handlers-custom.ts` | Custom MLT + custom TOD. Tries Claude first, falls back to Gemini. |
| `api/_lib/handlers-gemini.ts` | Charades, Taboo, NHIE, WILTY, Mafia, WYR, Imposter, MLT, contextual lies. |
| `api/_lib/handlers-image.ts` | `generate_roast` (image → roast text), `edit_image` (image → caricature), `roast_or_toast`. |
| `src/services/aiClient.ts` | Single `callAI<T>(type, params)` helper that POSTs to `/api/ai`. |
| `src/services/geminiService.ts` | **Despite the filename,** this file no longer calls Google directly. It's thin fetch wrappers around `callAI`. Filenames + exports preserved so no component imports break. |
| `src/services/claudeService.ts` | Same pattern — fetch wrappers. Kept for backwards-compat with imports. |

### Models

- **Claude Haiku 4.5** (`claude-haiku-4-5`) — custom generation paths. Cheap, fast, structured output via `output_config.format`.
- **Gemini 2.5 Flash** (`gemini-2.5-flash`) — all other text generation + Roast Me text captions. (Was `gemini-2.0-flash-001`, which Google shut down 2026-06-01; the 2.0 retirement is what broke all text generation until this bump.)
- **Gemini 3 Pro Image** (`gemini-3-pro-image`) — image editing for Roast Me caricatures. (Bumped 2026-07-02 from the preview model, which was slated to retire ~2026-07-17 — same failure class as the 2.0-flash text shutdown that broke prod on 2026-06-01. Lesson: never leave a `-preview` model id in production; check model retirement dates monthly.) Image gen also depends on the Gemini billing account being funded — an empty balance 404s/errors it.

### Claude-first, Gemini-fallback (custom flows)

In `api/_lib/handlers-custom.ts`:
1. If `ANTHROPIC_API_KEY` is set, call Claude with structured JSON output schema
2. If Claude returns a non-empty array, return it
3. Otherwise fall through to Gemini with the same prompt
4. The client never sees which provider answered

### Adding a new AI-backed feature

1. Add a handler function in `api/_lib/handlers-gemini.ts` (or `handlers-custom.ts` if it needs Claude-first logic)
2. Register its type in `api/ai.ts`'s `DISPATCH` table
3. Add a thin wrapper in `src/services/geminiService.ts` that calls `callAI('your_type', {...})`
4. Call the wrapper from your component

### Gotchas

- **Local dev:** `npm run dev` (Vite) does NOT run `/api/*` functions. Use `vercel dev` instead. Or build + `vercel deploy --prod=false` and test on the preview URL.
- **Vercel plan limits:** Hobby tier has 10s max duration per serverless function. Image generation via `edit_image` can take 15-30s and may time out on Hobby. If that happens, either upgrade to Pro (60s) or convert that one route to an Edge Function.
- **Cold starts:** first request after 15+ minutes of idle has ~300-500ms SDK-init overhead. Warm requests are fast.

### ⚠️ Critical landmines — discovered the hard way

These three rules apply to anything under `api/`. Breaking any of them gives `FUNCTION_INVOCATION_FAILED 500` with no useful client-side info, and the actual error only shows up in Vercel function logs (or in a hand-rolled diagnostic endpoint that wraps the failure in a try/catch).

1. **Relative imports in `api/` MUST end in `.js`** — even though they're `.ts` source files. Node's ESM resolver (which Vercel uses because `package.json` has `"type": "module"`) will not auto-resolve extensionless paths. TypeScript and `tsx` happily resolve them locally, which is why this slips through every local check.
   ```ts
   // ❌ Looks fine, fails on Vercel cold start
   import { getClaude } from './_lib/clients';

   // ✅ Use this everywhere in api/
   import { getClaude } from './_lib/clients.js';
   ```

2. **Never statically import `@google/genai` at the top of any `api/` file** — its CJS/ESM interop crashes the function on cold start under Node 24/20. `clients.ts` exposes `getGemini()` as a lazy async getter that does `await import('@google/genai')` on first call. Use that. Same pattern works for `@anthropic-ai/sdk` and is used for symmetry, even though Anthropic alone happens to work statically.

3. **`api/` is in the local typecheck via `tsconfig.api.json`** — referenced from the root `tsconfig.json`. So `npm run build` now catches strict-mode TS errors in `api/` files. Don't drop the reference; without it, errors there only surface on Vercel.

### Custom-prompt structure

`api/_lib/handlers-custom.ts` holds the Claude-first, Gemini-fallback flows for all three custom games (MLT, TOD, NHIE). Each game uses a single "advanced" prompt: a long system message with voice rules, coverage targets, hallucination guard, and a worked calibration example. Group type and tone IDs (e.g. `'friends'`, `'cheeky'`) are expanded server-side via shared `GROUP_TYPE_GUIDANCE` / `TONE_DEFINITIONS` maps.

The basic / env-var-switched mode was simplified out once advanced was validated (commit `893989f` if you ever want it back). The Anthropic SDK's `messages.create()` does NOT accept `output_config` (that's only on `messages.parse()`), so structured output is enforced via prompt instruction + a lenient three-tier JSON parser in `parseClaudeJson()` that handles bare JSON, ```json fences, and prose-wrapped arrays.

### Diagnostics

`/api/health` returns `{ ok, claude, gemini, node }` based purely on env-var presence. Useful for confirming a deploy is healthy without burning provider quota. The 6 deeper diagnostic endpoints used to debug the cold-start saga were removed in commit `<this commit>` — see git history if needed.

## 🚀 Build & Deployment Pipeline

**We use Vercel's GitHub integration.** Each git push to a branch triggers a Vercel preview build. Merges to `main` trigger the production deploy.

- **Local dev:** `vercel dev` (runs both Vite AND serverless functions). Or `npm run dev` if you're only touching client UI.
- **Local build:** `npm run build` (runs `tsc -b && vite build`)
- **Tests:** `npm test` → vitest render smoke test (`tests/App.smoke.test.tsx`: splash → home menu through the real module graph; jsdom, fetch/matchMedia stubbed in `tests/setup.ts`) + the Shortlist, Target and The Line engine invariants + THE ROOM INVARIANT (`tests/roomSync.test.ts`). Config in `vitest.config.ts` (deliberately separate from `vite.config.ts`).
- **CI:** `.github/workflows/ci.yml` — on push to `main` + PRs: `npm ci`, `npm run build`, `npm test`. **Lint is NOT in CI** — `npm run lint` currently fails with 62 pre-existing errors (mostly `no-explicit-any` and `react-refresh/only-export-components`); add it back once that debt is paid.
- **Browser regression drives (dev-only, not in CI):** `scripts/drive-games.mjs` (opens the 18 Play Now games headless — all 22 with `--tabs` — and fails on console errors) and `scripts/deep-drive.mjs` (countdown/expiry/score flows in the 6 timer games) and `scripts/drive-the-tell.mjs` (plays a full 12-round game of The Tell and asserts every outcome branch) and `scripts/drive-nerve.mjs` (plays a best-of-3 of Nerve and asserts the ladder-escalation invariant) and `scripts/drive-house-rules.mjs` (plays a 9-law session and checks the app's scoring against an independently-computed tally) and `scripts/drive-ballpark.mjs` (a 3-player and a solo game, every expected score recomputed from the JSON) and `scripts/drive-echo.mjs` (asserts the chain-growth invariant at every replay) and `scripts/drive-shortlist.mjs` (re-derives every clue's meaning from the JSON rather than trusting the screen) and `scripts/drive-target.mjs` (re-solves every dealt board itself and replays the app's printed solution back through the UI) and `scripts/drive-the-line.mjs` (checks the rendered line rises by the JSON's values on every single turn, that the piles partition, and that no hand card leaks its number) and the four **two-browser** multiplayer drives `scripts/drive-versus.mjs` + `scripts/drive-ballpark-live.mjs` + `scripts/drive-target-live.mjs` + `scripts/drive-the-line-live.mjs` (which all need `node scripts/serve-with-api.mjs 4173` instead of `vite preview`, since preview does not run `/api/*`) against — the last three draw randomised content, so run them a few times — `npm run build && npx vite preview --port 4173`. See `notes/02-browser-regression-drive.md` for the gotchas. Run these after touching shared game code.
- **Deployment target:** Vercel, auto-triggered by `git push`
- **Preview URL format:** `party-spark-git-{branch-slug}-{scope}.vercel.app` (has "Deployment Protection" enabled — you'll see a 401 on manifest.json that can be ignored)
- **Production URL:** set by the user's Vercel project config (deployed from `main`)

### Environment variables (CRITICAL — Vercel)

Server-side env vars (no `VITE_` prefix) are read by `api/*.ts` serverless functions. They are **never** bundled into the client JS.

**Location:** Vercel dashboard → project → Settings → Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | Production + Preview + Development | Google Gemini API key (server-side only) |
| `ANTHROPIC_API_KEY` | Production + Preview + Development | Anthropic Claude API key (server-side only) |

**Tick all three environments**, not just Production — preview branch deploys need them too. After adding or changing a var, **redeploy without build cache** (Deployments → ⋯ → Redeploy → uncheck "Use existing Build Cache").

**Migration note:** The old `VITE_API_KEY` and `VITE_ANTHROPIC_API_KEY` variables are no longer used and should be deleted from Vercel. Those were client-exposed — the whole point of this refactor was to remove them.

### Local `.env.local` (for `vercel dev`)

Copy `.env.example` → `.env.local` in the repo root and fill in both keys. `.env.local` is gitignored. Without Vercel CLI (`npm run dev` alone), the `/api/*` endpoints don't run — you'll hit 404s on any AI-backed feature.

## 🛠️ Known Issues / Technical Debt

Reconciled against code 2026-07-02. Several items from the 2026-04-21 audit were verified fixed and removed (Forecast dynamic Tailwind classes, Roast LOADING back-trap, stray `console.log`s, duplicate `useContent` import, client-side API keys — the last is fully solved by the `/api/ai` proxy).

1. **Coming Soon tab is hidden on the front end** via the `SHOW_TABS = false` flag in `App.tsx` (the strong games all live in Play Now now). `comingSoonGameIds` (WILTY / Icebreakers / Mini Mafia / WYR) + the tab logic still exist in code so the tabs can be re-enabled for testing by flipping the flag. All of those games are routed and playable. Icebreakers in particular should stay hidden until it's a real game loop (today it's a single screen swapping one AI line, with no offline fallback).

2. **NHIE has no Claude fallback yet.** `generateNeverHaveIEver` is Gemini-only. Same quota vulnerability TOD/MLT had before the port.

3. **Multiplayer needs a Redis store provisioned on Vercel.** Until then `/api/room` falls back to an in-process Map, which cannot work across serverless instances — two phones in "the same" room never see each other, and the lobby shows an amber warning saying so. Browser steps in the Multiplayer section above. Four games are wired (Scramble, Ballpark, Target, The Line); Echo is the natural next one — it is turn-based, so it follows The Line's move-log pattern rather than the seed-only one.

4. **`npm run lint` fails with 62 pre-existing errors** (`no-explicit-any` in data-loading code, `react-refresh/only-export-components` in contexts/UI). Lint is therefore excluded from CI. Pay this down, then add `npm run lint` to `.github/workflows/ci.yml`.

5. **A handler param named `type` can never reach `/api/ai` handlers** — the dispatcher strips `type` as its routing key, and the client spread can even overwrite it (breaks the icebreaker "deep" and roast_or_toast "toast" variants over the wire). Details + the fix recipe: `notes/01-api-type-param-collision.md`.

~~Old items "No code splitting" and "No service worker" removed 2026-07-03: fixed by Phase 1 hardening — every game is `React.lazy`, every data JSON is a dynamic import, and vite-plugin-pwa precaches the shell (see Key files).~~

*(2026-07-02/03 sweep: the leftover `console.log`s in CharadesGame/TabooGame, the duplicate `useContent` import in CharadesGame, the Forecast dynamic Tailwind classes, and the Roast LOADING back-trap were all verified already fixed in code — removed from this list. The old "API keys are in client JS" item was resolved by the `/api/ai` proxy refactor described in AI Services.)*

## 📁 Key files

```
src/
├── App.tsx                          # Game router (state-based switch) + Home (SHOW_TABS flag)
├── types.ts                         # GameType enum, shared types
├── constants.tsx                    # GAMES list, GAME_RICH_META, HOME_FILTERS, getIcon
├── components/
│   ├── ui/
│   │   ├── Layout.tsx               # Card, Button, ScreenHeader (reuse)
│   │   ├── PinGate.tsx              # PIN gate — 0438 default (DO NOT change); parameterised for extra gates (e.g. 2525)
│   │   ├── TeamRosterRow.tsx        # Shared optional player/team-names row (gold pill, persists)
│   │   ├── TimerSetting.tsx         # Shared editable round-timer chip (Scramble/Charades/Taboo)
│   │   ├── EndScreen.tsx            # Shared ranked-leaderboard end screen (5 Alive/Linked/Charades/Taboo)
│   │   ├── SpinTheBottle.tsx        # Shared "who goes next?" bottle spinner (test screen inside Truth or Drink)
│   │   └── RoomPanel.tsx            # Shared multiplayer create/join + lobby (Scramble versus, Ballpark live)
│   └── games/                       # One file per game (incl. JumbleGame = "Scramble", IntimateDiceGame, TheTellGame, NerveGame, HouseRulesGame, BallparkGame, EchoGame, ShortlistGame, TargetGame, TheLineGame)
├── contexts/
│   └── ContentContext.tsx           # AI content prefetch cache
├── data/                            # Static JSON question banks — dynamic-imported only (each is a lazy chunk)
├── hooks/
│   └── useCountdown.ts              # Shared rAF-deadline round timer (all 6 timer games)
├── services/
│   ├── geminiService.ts             # Thin fetch wrappers around /api/ai (not a direct Google client)
│   ├── claudeService.ts             # Thin fetch wrappers (back-compat)
│   ├── jumbleEngine.ts              # Scramble runtime: set picker, validation, scoring, missed-words
│   ├── shortlistEngine.ts           # Shortlist runtime: generates each case's clue chain + holds the case invariant
│   ├── targetEngine.ts              # Target runtime: deals a guaranteed-solvable puzzle AND solves it (shared legality rules)
│   ├── lineEngine.ts                # The Line runtime: deals, judges a placement, and holds THE LINE INVARIANT on every mutation
│   ├── seededRandom.ts              # mulberry32 / seededShuffle / roundSeed — same seed ⇒ same content on every device
│   ├── roomService.ts               # Multiplayer transport + clock offset + useRoom() — the ENTIRE network boundary
│   ├── audio.ts                     # Shared Web Audio synth kit + app-wide mute + compact haptic aliases
│   ├── haptics.ts                   # hapticLight/Success/Error/Heavy (navigator.vibrate; no-op on iOS; respects the mute switch)
│   ├── shareCard.ts                 # Canvas share cards + shareText (see Engagement layer)
│   ├── gameNightService.ts          # Game Night playlist/leaderboard store
│   ├── statsStore.ts                # Lifetime plays/bests/wins (localStorage)
│   ├── dailyChallenge.ts            # Daily Scramble seed + streak store
│   ├── firstPlay.ts                 # First-open auto-expand for How-To-Play
│   ├── LocalGameService.ts          # Static data readers (async — games_data.json loads lazily via loadGamesData)
│   └── SessionManager.ts            # localStorage-backed session store (used-content tracking, shared team roster; 2h sliding window)
└── index.css                        # Tailwind v4 @theme (custom props + keyframes only)

api/_lib/schemas.ts                  # zod schema per /api/ai request type (see AI Services)
api/_lib/roomSchemas.ts              # zod schema per /api/room action (routes on `action`, not `type`)
api/_lib/roomStore.ts                # Room storage: Upstash Redis REST + in-process dev fallback; one writer per key
api/room.ts                          # Multiplayer rooms — the app's only stateful endpoint
tests/App.smoke.test.tsx             # vitest render smoke test (run by CI)
tests/shortlistEngine.test.ts        # vitest: Shortlist's case invariant over 9,000 generated cases (run by CI)
tests/targetEngine.test.ts           # vitest: Target's deal invariant — every dealt puzzle solvable, every printed solution valid (run by CI)
tests/lineEngine.test.ts             # vitest: The Line's ordering + partition invariant over hundreds of full games, plus its gap distribution (run by CI)
tests/roomSync.test.ts               # vitest: THE ROOM INVARIANT — same seed + round ⇒ byte-identical content on every device (run by CI)
.github/workflows/ci.yml             # CI: npm ci, build, test (lint excluded — see Known Issues)
notes/                               # One lesson per file (what broke + fix); see notes/README.md
scripts/build-jumble-sets.mjs        # DEV-only generator → src/data/jumble_sets.json (needs cached dicts under scripts/.cache/)
scripts/drive-games.mjs              # DEV-only headless-browser drive: opens the 18 Play Now games (22 with --tabs), fails on console errors
scripts/deep-drive.mjs               # DEV-only deep flows for the 6 timer games (countdown/expiry/scoring)
scripts/drive-the-tell.mjs           # DEV-only full 12-round drive of The Tell (both guess branches, bust, swap, Double Down, PIN gate)
scripts/drive-nerve.mjs              # DEV-only best-of-3 drive of Nerve (fold + full-clear endings, ladder-order invariant, swap, PIN gate)
scripts/drive-house-rules.mjs        # DEV-only 9-law drive of House Rules (Mark hit/miss/self-break scoring, book accumulation, {maker} substitution)
```

## 🎓 End of Session Learning Recap

When the user types the session recap commands, generate a session recap using this exact structure.
Keep it brief, plain English, no jargon without explanation.
The user is a non-technical founder learning by building — prioritize conceptual understanding over syntax.

**Scope — read carefully.** Both commands below cover **only the current working session** (the conversation since the last recap, or since the session started). They are NOT a summary of the whole chat history, the whole branch, or the whole project. If nothing substantive happened this session, say so plainly rather than padding with prior work.

### Session Recap Commands

#### `wrap and teach`
Generate a structured session recap. Plain English only — no jargon without a brief explanation. User is a non-technical founder learning by building.

**SESSION WRAP — [date]**

**What we built**
- [2–4 bullets: what actually shipped today]

**Key concepts encountered**
- [concept]: [one plain-English sentence — what it is, why it matters]
- [repeat for 2–4 concepts max — only what was genuinely touched today]

**One thing worth remembering**
- [Single most transferable insight from this session]

**Friction point** *(only if something broke or took unexpectedly long)*
- [What it was and why]

---

#### `summarize learnings`
3–5 bullet points. What was built, what was learned. One line each. No headers, no padding.
