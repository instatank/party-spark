# PartySpark — Session Handoff (v2)

> **Updated:** end of a long working session, ~85% context. This file exists so
> a fresh session/agent can pick up cleanly. Read `CLAUDE.md` first (the
> canonical project doc) — this file covers **what changed recently, the
> current state, and the conventions worth knowing**.

---

## 🔖 Quick state

| Thing | Value |
|---|---|
| Production branch | `main` (auto-deploys to Vercel) |
| Working branch this session | `claude/resume-partyspark-w3qJq` |
| Latest production commit | last shipped via PR #32 ("Roast Me #1") — `main` at `f5f6ed7` (or later, check `git log origin/main`) |
| Open PRs | none — everything is merged |
| Uncommitted local changes | only ever in the working branch; commit and push when done |

Everything below is **already live in production** unless explicitly noted.

---

## 🎮 Current game roster — Play Now (in display order)

Home order (from `GAMES` array in `src/constants.tsx`):

1. **Roast Me** — AI image roast. 6 themes: Animate / Tabloid / Movie / Rock Star / Mughal / FIFA 2026. Rock and FIFA have sub-variants (rock = punk vs classic, FIFA = team picker). Client picks `variant`/`team` and sends to BOTH the image and the caption call so they stay coherent. All prompts include the IDENTITY-LOCK preamble.
2. **Most Likely To** — 6 decks + Create-Your-Vibe AI. ~400 cards.
3. **5 Alive** — speed recall. 3 levels: Easy (300) / Hard (300) / Spicy (151, PIN-gated 18+). 5 rounds: name 5/4/3/2/1 in 6/5/4/3/2 seconds. Synthesised bell at the end of each round. Per-turn scoring + recap screen.
4. **Fact or Fiction** — 6 categories: Animal Kingdom (50) / Science (50) / General Knowledge (50) / Sports (50) / History (50) / FIFA World Cup Football (81). Difficulty cascades down one level at a time when the current level runs out.
5. **Charades** — 7 categories: Hollywood (200) / Bollywood (200) / Mix (441) / Family Mix (61) / Everyday Actions (20) / Around the House (20) / The Zoo (21).
6. **Taboo** — Easy (298) / Medium (167) / Hard (75).
7. **Truth or Drink** — 5 decks (215 cards) + Create-Your-Vibe. Adult-gated.
8. **Linked** — word puzzle. Easy (78) / Hard (36). Pass-and-Play (60s, Skip and Got-It both flash the answer) + Just Play.
9. **Never Have I Ever** — 5 decks (220).
10. **The Forecast** (Compatibility Test) — 3 modes (friends / couples / bunny), 30 Qs each. Adult-gated.
11. **Imposter** — pass-and-play deduction.

### Coming Soon tab (in `comingSoonGameIds` in `App.tsx`)
WILTY, Icebreakers, Mini Mafia (The Traitors), Would You Rather. Order in that tab is driven by `comingSoonGameIds.map()`, not by their position in `GAMES`.

---

## 🚦 Mid-game exit confirmation (across every game)

There is a shared modal (`src/components/ui/ConfirmDialog.tsx`) + hook (`useExitConfirm` in `src/components/ui/useExitConfirm.tsx`). `ScreenHeader` gained an opt-in prop `confirmOnExit`. Mid-play screens across **every game** have this turned on, so tapping back/home prompts "Leave the game? Your progress will be lost." Setup / category-select / loading / end screens navigate freely.

- Games that use `ScreenHeader confirmOnExit` directly: Charades, Taboo (READY), NHIE, TOD, Forecast (all 7 in-play screens), Fact or Fiction (4 screens), Imposter (4 screens), 5 Alive (3 screens), Linked (3 screens), WYR.
- Games with custom headers that use the `useExitConfirm` hook directly: **Taboo PLAYING**, **MLT PLAYING**, **WILTY (whole game)**.
- Mafia keeps its own internal confirm flow (separate state).
- Icebreakers + Roast Me are single-shot — no progress to lose, untouched.

If you add a new game, follow the same pattern (prop on the mid-play screens, or hook for custom headers).

---

## 📦 Recent dataset state (this session)

| Game / category | Now |
|---|---|
| **5 Alive** | Easy 300, Hard 300, **Spicy 151** (new, adult-gated). All ≤ 5 words. |
| **Linked** | Easy 78, Hard 36 (puzzle data unchanged this session). |
| **Fact or Fiction** | 5 base categories of 50 each + new **FIFA World Cup Football (81)**. ⚽ emoji tile (lucide has no soccer-ball glyph, so `TOPIC_META` supports `emoji` as an alternative to `Icon`). Difficulty cascade walks down one level at a time when the current is dry. |
| **Charades** | Hollywood **200** (replaced), Bollywood **200** (replaced), Mix **441** (existing 50 kept + 400 appended, 9 dupes). |
| **Taboo** | Easy **298** (+48 from a 99-batch, 51 dupes skipped), Medium **167** (full replace), Hard 75. |
| **Roast Me** | Added FIFA 2026 theme + Rock Star (replaced Disco). MUGHAL label (was AGRA ROYAL). Identity-lock prompt + scene variants on FIFA + Rock. Rock's punk/classic variants are routed via a `variant` field so image and caption agree. |

---

## 🛠 Conventions (do follow / don't break)

### Workflow
1. **One feature = one `claude/<slug>` branch off `main`.** Direct push to `main` is 403'd — `main` is branch-protected. Ship via GitHub PR (`mcp__github__create_pull_request` then `mcp__github__merge_pull_request`).
2. **`npm run build` must pass clean before every commit.** Strict TS catches `api/` errors too via `tsconfig.api.json`.
3. **Real commit messages.** First line summarises the *why*, body explains the *what*. No co-author footers unless asked.
4. **Merge to `main` with `--no-ff` semantics** (the GitHub merge button does this) — that's what triggers prod deploy.
5. **Data edits via Python.** Match the existing indent per file (`never_have_i_ever.json` and `linked.json` use 2-space; `five_alive.json` uses 4-space; `games_data.json` uses 2-space; `fact_or_fiction.json` uses 2-space). Dedupe case-insensitively.
6. **Audit before merge** for any incoming card batch: schema-strict, ≤ N words where applicable, no within-bucket dupes, no cross-bucket overlap unless explicit.

### Hard rules (don't touch)
- **PIN gate `0438`** in `src/components/ui/PinGate.tsx`. Don't refactor. Don't change the PIN. Keep the 5-attempt lockout. `sessionStorage` flag stays.
- **No `react-router-dom` / Next.js.** State-based `switch` in `App.tsx` is intentional.
- **No utility classes inside `@theme`** in `src/index.css`. Tailwind v4 build error.
- **No template-literal Tailwind class names.** Use static class maps. Tailwind v4 JIT only detects complete static strings. (e.g. `text-${color}-400` won't compile.)
- **API keys are server-only.** Read from `process.env` inside `api/_lib/clients.ts`. NO `VITE_` prefix on AI keys. The audit I ran confirmed zero exposure. Only `VITE_ROAST_LIMIT` (a number) is intentionally client-side.
- **`api/` is server-only.** Never import from `api/` inside `src/`.
- **Don't reinstate `PlayerRosterRow`** (it was built then reverted at the user's request — only `TeamRosterRow` survives).

### AI service flow
All AI calls go through **`/api/ai`** (a Vercel serverless function). Client → `callAI<T>('type', params)` from `src/services/aiClient.ts` → POST `/api/ai` → server dispatcher (`api/ai.ts`) → handlers. Adding a new AI feature:
1. Add handler in `api/_lib/handlers-gemini.ts` (or `handlers-custom.ts` for Claude-first flows)
2. Register the type in `api/ai.ts`'s `DISPATCH` table
3. Thin wrapper in `src/services/geminiService.ts` calls `callAI('your_type', {...})`
4. Component calls the wrapper

### `api/` landmines (still active — don't undo)
1. Relative imports in `api/` MUST end in `.js` (even though source is `.ts`). Vercel ESM resolver won't auto-resolve extensionless paths.
2. Never `import` `@google/genai` statically at top of any `api/` file — it crashes cold start on Node 24. Use the lazy getter in `clients.ts`.
3. `api/` is in the strict typecheck via `tsconfig.api.json`. Don't remove the reference.

---

## 🚀 Deployment

Vercel auto-deploys from GitHub. Every push to any branch creates a preview build; every merge to `main` triggers the production deploy.

**Required Vercel env vars** (Production + Preview + Development scopes):
- `GEMINI_API_KEY` (server-only, no `VITE_` prefix)
- `ANTHROPIC_API_KEY` (server-only, no `VITE_` prefix)
- `VITE_ROAST_LIMIT` — optional, numeric (per-session roast cap). Safe to be client-visible.

`/api/health` returns `{ ok, claude, gemini, node }` for a cheap deploy sanity check.

App icon assets are at `public/icons/*` (generated from `public/_source/partyspark-icon-master.png`). Manifest references the PNG set. To regenerate from a new source image, write the source PNG/JPG to disk and run the Pillow script previously used (Bash heredoc with the `corner_lum` / `LANCZOS` resize pattern).

---

## 🧭 Quick orientation checklist for the next agent

1. Read `CLAUDE.md` (canonical) then this file.
2. `git checkout main && git pull && git log --oneline -5` to confirm latest.
3. Create a new branch `claude/<slug>` for any feature work. **Do not push to `main` directly** — token is scoped to `claude/*` branches; main is branch-protected.
4. Run `npm install` once (Pillow already installed in this image — `pip install Pillow --break-system-packages` if needed).
5. `npm run build` must pass before every commit.
6. Ship via PR (`mcp__github__create_pull_request` → `mcp__github__merge_pull_request`).

### Tools you'll lean on
- GitHub MCP: `mcp__github__*` for PR + repo ops (no `gh` CLI).
- Bash for `git`, `npm`, `python3` scripts.
- Vercel MCP available for deployment introspection.

### Things I'd suggest for the next session (optional)
- **Bigger Linked dataset.** 78E + 36H is the smallest play-now pool. Adding 50–100 more easy puzzles would round it out.
- **Mafia / WYR / Icebreakers / WILTY** are still in Coming Soon. They mostly work — they were dropped to that tab for content reasons, not technical ones. Could be promoted with curation passes.
- **Vercel preview** for the branch isn't always auto-watched — if the user wants you to watch a PR for review comments / CI, use `mcp__github__subscribe_pr_activity` and act on events as they arrive.
- **Roast Me variants** (rock punk/classic, FIFA team) work via a `variant` / `team` field that the client picks once and forwards to both the image and the caption call. If you add a new themed variant flow, follow the same pattern so image and caption stay coherent.

---

## 💡 Open ideas / parked threads

Things that came up but weren't built. Use as a menu, not a roadmap.

1. **Promote Coming Soon games to Play Now.** WYR, Icebreakers, WILTY, and Mafia are routed and playable; they're parked there for content/quality, not because they're broken. Each needs a curation pass (WYR's dataset is the thinnest — see counts in HANDOFF; WILTY has only 10 topics; Icebreakers leans on AI generation).
2. **Bigger Linked pool.** 78 Easy + 36 Hard is the smallest pool in Play Now. Adding ~100 more Easy puzzles + ~40 more Hard would round it out. The runtime gracefully repeats from the full pool when fresh-this-session runs low, but a thicker pool means longer freshness.
3. **More Roast Me themes.** The themed-variant pattern (`variant` + `team`) is reusable. Easy adds: Cricket fan-cam (counterpart to FIFA), 90s yearbook, Met Gala, '60s mod, etc. Each theme = (a) new key in `RoastTheme`, (b) `getCaricaturePrompt` + `getRoastSystemPrompt` case in `api/_lib/handlers-image.ts`, (c) tile in `ImageUpload.tsx`. Identity-lock preamble is already shared — reuse it.
4. **Spread the "Spicy" tile pattern.** 5 Alive got a third, adult-gated difficulty. NHIE already has "No Filter" (PG-13ish). Taboo could get a Spicy pool. MLT has X-Rated. There's no strict consistency across games — could be unified into one "after dark" sub-deck pattern with the same PIN-gate hook.
5. **AI Custom Vibe for more games.** MLT and TOD have it. Could extend to NHIE (custom statements with group context), Charades (custom word packs), and FoF (custom topic + 10 generated Q/A). Server side: add a new `handlers-custom.ts` case; client side: similar setup flow to existing Custom Vibe screens.
6. **Roast Me rate limit UX.** `VITE_ROAST_LIMIT` is a hard cap with an `alert()`. The session tracks usage via `SessionManager.getUsageCount('ROAST')`. Could surface "X of Y roasts left" inline before the upload, and add a graceful "come back later" screen instead of the alert.
7. **Vercel Pro for image generation.** Hobby tier caps function duration at 10s. The Gemini 3 Pro image edit (`generate_roast` / `edit_image`) can take 15–30s and may time out. Mitigations: (a) upgrade to Pro (60s), (b) convert just that route to an Edge function, (c) pre-warm with a tiny call on Roast tile tap.
8. **Daily challenge / streak.** Mentioned in the original Linked spec as a future. Could apply to Linked + 5 Alive + FoF — a single "today's challenge" surfaced on home, a streak counter in `SessionManager` extended to persistent localStorage. Simple but adds a return-visit hook.
9. **Hint system for Linked.** Was in the spec, deferred. Could reveal one letter after the player has been stuck for ~20s. Adds friction-reduction for harder puzzles.
10. **Bundle size.** Current `dist/assets/index-*.js` is ~700KB (200KB gzipped). Vite's chunk warning fires at 500KB. Code-splitting per-game with `React.lazy()` would cut the initial download dramatically. Not urgent — the app is fast — but the warning is real.
11. **Screen mirroring / viewer mode** — was explicitly **parked** in an earlier session (phone B watches phone A's gameplay via a passcode; needs a realtime backend, ~1–2 weeks of work, the user decided the pass-the-phone model covers the in-room case). Don't build unless the user revisits it.
12. **`PlayerRosterRow`** — was built and reverted at the user's explicit request. Don't reinstate. Only `TeamRosterRow` (team-name persistence) survives.

---

## 🗣 Working style with this user

- They prefer **terse, direct replies** — no walls of text, no preamble. State the action, take it, report concisely.
- They auto-ship most changes ("push to production"). Default to shipping after build passes, unless the change is risky or they explicitly say "hold."
- They like to see **audit results before merging dataset changes** — counts, dupes, schema, semantic-near-duplicate checks. They'll usually ask for the audit if you don't volunteer it; you should always volunteer it.
- For card-pool additions: dedupe **case-insensitively**, match the file's existing indent, report `added/skipped` counts in the commit message.
- Commit messages explain the **WHY**. No co-author footers.
- They occasionally paste data from a different project by mistake. If something doesn't fit the PartySpark domain (e.g. "Projects page", "Today page"), confirm before acting.
