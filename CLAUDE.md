# PartySpark — Developer Context & Guidelines

> **Last reconciled with code:** 2026-04-21. If you're reading this and something in the codebase doesn't match what's described here, **the code is the source of truth** — please update this file in the same PR that makes the change.

## 🤖 Role & Core Directives

You are the lead developer and architect of **PartySpark**, a premium, AI-powered party game application.

- **Primary directive:** Maintain the "Wow" factor. Every UI component must feel premium — glassmorphism, dynamic gradients, smooth micro-animations, high-contrast text. Simple or basic MVPs are unacceptable.
- **Secondary directive:** Offline reliability. Most games must work without an internet connection using local fallback datastores. AI generation is optional "spice," never a hard dependency. If the AI call fails, the user should still get a playable deck.

## 🏗️ Architecture & Tech Stack

- **Framework:** React + TypeScript via Vite 7
- **Styling:** Tailwind CSS v4
- **Routing:** State-based `switch` in `App.tsx` driven by the `GameType` enum — no React Router, no Next.js
- **Data Strategy:** Offline-first. Questions/cards live in static JSON files under `src/data/*.json`
- **AI Integration:** Hybrid. See the **AI Services** section below for the current provider layout.

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
- **Tile:** `bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 {accentBorderLeft} border-b-2 {accentBorderBottom} hover:bg-white/[0.08] hover:border-t-white/20 hover:border-r-white/20 rounded-xl py-3 px-4 transition-colors`
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

## 🚫 Explicit Constraints & "Do Not Touch" Rules

### 1. Adult Content PIN Gate (`0438`)

- **Do NOT refactor to a backend/DB.** `PinGateModal` in `src/components/ui/PinGate.tsx` intentionally uses frontend-only `sessionStorage` (`partyspark_adult_unlocked`). Stateless, frictionless, prevents accidental kid access during shared tablet use.
- **Do NOT change the PIN.** Must remain `0438`.
- **Do NOT remove the 5-attempt lockout.** Prevents brute-force; session-locked via `sessionStorage`.

### 2. Tailwind v4 Animation Constraints

- **Anti-Pattern:** custom CSS classes inside the `@theme` block in `src/index.css`
- **Reason:** Tailwind v4 throws a build error if `@theme` contains anything other than custom properties or `@keyframes`. Keyframes go in `@theme`, utility classes go outside it.

### 3. Routing Mechanism

- **Do NOT introduce `react-router-dom` or Next.js.** The single-page `switch` in `App.tsx` is an intentional architectural limit — tiny bundle, instant transitions. Use `setActiveGame(GameType.HOME)` as the navigation back-stack.

### 4. Game Navigation UI

- **Every single game screen MUST render `ScreenHeader` with working `onBack` and `onHome` props.** No orphaning users deep in a flow.

## 🎮 Game Roster & Current State

### Active & playable (routed in `App.tsx`)

| Game | GameType | Mechanic | AI | Notes |
|---|---|---|---|---|
| Charades | `CHARADES` | Describe without forbidden words | Gemini (refills) | Timer-based |
| Taboo | `TABOO` | Word guessing with banned terms | Local + Gemini fallback | |
| Roast Me | `ROAST` | AI roast from uploaded image | Gemini (image + text) | Uses image gen, can't swap to Claude |
| Imposter | `IMPOSTER` | Find the fake among friends | Gemini | |
| Would You Rather | `WOULD_YOU_RATHER` | Paired dilemmas | Local static data | |
| Most Likely To | `MOST_LIKELY_TO` | Vote on friends | **Claude → Gemini fallback** | Has "Create Your Vibe" AI custom deck |
| Would I Lie To You | `WOULD_I_LIE_TO_YOU` | Truth vs lie storytelling | Gemini | |
| Never Have I Ever | `NEVER_HAVE_I_EVER` | Stand up if you've done it | Gemini | Has curated "Rehaan"/"Agra"/"BBF" decks; no Claude custom yet |
| Mini Mafia (The Traitors) | `MINI_MAFIA` | Pass-and-play betrayal | Gemini (narration) | |
| Icebreakers | `ICEBREAKERS` | Conversation starters | Gemini | Partial — SELECT→PLAY only |
| Fact or Fiction | `FACT_OR_FICTION` | Beat the clock on true facts | Local static | |
| The Forecast (Compatibility Test) | `COMPATIBILITY_TEST` | Player A predicts Player B's answers | Static (`compatibility_test.json`) | Adult-gated. Modes: Couples / Friends / Bunny. Known issue: deeper screens use dynamic Tailwind classes — see Known Issues. |
| **Truth or Drink** | `TRUTH_OR_DRINK` | Confess or sip | **Claude → Gemini fallback** | Adult-gated. 5 decks (Classic/Spicy/Deep Cuts/Ex Files/Chaos) + "Create Your Vibe" AI custom deck. 2-10 players, 10 rounds. |

### Orphaned (component exists, GameType enum entry exists, NOT routed)

These three compile but are not in the `App.tsx` switch and not in the `GAMES` constant — they can't be reached from the home menu.

| Game | File | GameType | Status |
|---|---|---|---|
| Trivia | `src/components/games/TriviaGame.tsx` | `TRIVIA` | Full state machine, Gemini-backed. Just needs routing. |
| Simple Selfie | `src/components/games/SimpleSelfieGame.tsx` | `SIMPLE_SELFIE` | Full camera flow, AI-backed roast/toast. Camera-denied path has no fallback UI (will show a blank video if permission refused). |
| Agra Quest | `src/components/games/AgraQuestGame.tsx` | `AGRA_QUEST` | Partial — vault/riddle logic unfinished. |

**Decision needed:** route them, finish them, or delete them. Leaving unrouted code rots.

## 🤖 AI Services

There are two providers in play. The default for **custom generation** (user-described group content) is Claude; everything else is Gemini. Do not mix SDKs in a single file.

### Claude — custom generation (Haiku 4.5)

- **SDK:** `@anthropic-ai/sdk`
- **Model:** `claude-haiku-4-5` (cheap, fast, great for single-shot JSON)
- **Why Haiku 4.5:** user-approved tradeoff — these are short JSON list generations, Haiku is the right tier
- **Structured output:** use `output_config.format` with a `json_schema` — no prompt-engineering the JSON shape
- **Browser usage:** `dangerouslyAllowBrowser: true` (matches the existing Gemini SDK pattern). **TODO for production:** proxy through a backend so the key isn't in client JS.
- **Env var:** `VITE_ANTHROPIC_API_KEY` (required for Claude path; fallback to Gemini if unset)
- **Service file:** `src/services/claudeService.ts`
- **Functions currently using Claude:**
  - `generateCustomMostLikelyToClaude` — MLT "Create Your Vibe"
  - `generateCustomTruthOrDrinkClaude` — TOD "Create Your Vibe"

### Gemini — legacy + image generation

- **SDK:** `@google/genai`
- **Model:** `gemini-2.0-flash-001` (via `modelFlash`)
- **Still used for:** image generation (Roast Me), charades/taboo/trivia generation, all non-custom card generation
- **Env var:** `VITE_API_KEY`
- **Service file:** `src/services/geminiService.ts`
- **Known quota issue:** Google's free-tier Gemini limits are low (~15 RPM, ~1500/day). If you see `RESOURCE_EXHAUSTED` 429s, the project has hit its quota. Either wait, enable Gemini billing, or port more features to Claude.

### Claude-first, Gemini-fallback pattern

In `geminiService.ts`, the public functions `generateCustomMostLikelyTo` and `generateCustomTruthOrDrink` orchestrate:

```
if (isClaudeConfigured()) {
  const viaClaude = await ...Claude(...);
  if (viaClaude.length > 0) return viaClaude;
  // else fall through to Gemini
}
return ...ViaGemini(...);
```

The Gemini-only implementations are kept as `...ViaGemini` helpers. If Claude is not configured (no key) OR returns empty (error, empty response), we fall through. Component callers see the unchanged public name and never know which provider served them.

### Adding Claude to another game

Copy the pattern from `generateCustomTruthOrDrink`:
1. Add `generateCustom{Game}Claude` to `claudeService.ts` with a game-specific system prompt
2. Rename the existing Gemini implementation to `...ViaGemini`
3. Wrap it in the if-Claude-else-Gemini orchestrator

Candidates for porting (ranked): **Never Have I Ever custom** → Would You Rather custom → (Forecast is complex, defer).

## 🚀 Build & Deployment Pipeline

**We use Vercel's GitHub integration.** Each git push to a branch triggers a Vercel preview build. Merges to `main` trigger the production deploy.

- **Local dev:** `npm run dev`
- **Local build:** `npm run build` (runs `tsc -b && vite build`)
- **Deployment target:** Vercel, auto-triggered by `git push`
- **Preview URL format:** `party-spark-git-{branch-slug}-{scope}.vercel.app` (has "Deployment Protection" enabled — you'll see a 401 on manifest.json that can be ignored)
- **Production URL:** set by the user's Vercel project config (deployed from `main`)

### Environment variables (CRITICAL — Vercel)

Vite bakes env vars into the JS bundle at build time. Since Vercel is the one building, env vars must be set in **Vercel's dashboard**, not in your local `.env.local`.

**Location:** Vercel dashboard → project → Settings → Environment Variables

| Variable | Scope | Purpose |
|---|---|---|
| `VITE_API_KEY` | Production + Preview + Development | Google Gemini API key |
| `VITE_ANTHROPIC_API_KEY` | Production + Preview + Development | Anthropic Claude API key |

**Tick all three environments**, not just Production — preview branch deploys need them too. After adding or changing a var, **redeploy without build cache** (Deployments → ⋯ → Redeploy → uncheck "Use existing Build Cache"). Env var changes don't apply to existing builds.

### Local `.env.local` (for `npm run dev` only)

Copy `.env.example` → `.env.local` in the repo root and fill in both keys. `.env.local` is gitignored. This is ONLY used when running `npm run dev` locally — Vercel ignores it completely.

## 🛠️ Known Issues / Technical Debt

Flagged during the 2026-04-21 audit. None blocking, but worth cleaning up when you're already in the area.

### High-value / low-cost

1. **The Forecast has 7 dynamic Tailwind classes** in `CompatibilityTestGame.tsx` at lines 273, 284, 339, 360, 375, 378, 403 — template literals like `text-${accentColor}-400` that Tailwind v4's JIT won't reliably compile. The MODE_SELECT screen is clean; the PREDICT / ANSWER / PASS_TO_* states may be rendering without accent colors on mobile. Replace with static class maps following the Slim Row pattern.

2. **Three orphan game components** (Trivia, Simple Selfie, Agra Quest) — see Game Roster table above. Route them, finish them, or delete them.

3. **`comingSoonGameIds` in `App.tsx`** (~line 113) is stale — lists WILTY / Icebreakers / WYR / NHIE as "coming soon" but all four are routed and playable. Audit and correct.

### Medium

4. **`RoastGame.tsx` line ~156** — LOADING state has `onBack={() => {}}`. User is stuck during image generation. Change to `onExit` or a state-specific handler.

5. **NHIE has no Claude fallback yet.** `generateNeverHaveIEver` is Gemini-only. Same quota vulnerability TOD/MLT had before the port.

6. **`SimpleSelfieGame` camera-denied path** — error is logged to console but no fallback UI is shown; user sees a blank video element. If we route this game, fix first.

### Low

7. **Leftover `console.log`s** in production code — `CharadesGame` (3x), `TabooGame` (1x). Remove or demote to `console.debug`.

8. **Duplicate `useContent` import** in `CharadesGame.tsx` around line 5-6.

9. **API keys are in client JS** (both Gemini and Claude). Fine for testing, but before merging to production-facing work, proxy through a backend. Anyone can inspect the bundle and pull the keys.

## 📁 Key files

```
src/
├── App.tsx                          # Game router (state-based switch)
├── types.ts                         # GameType enum, shared types
├── constants.tsx                    # GAMES list, category configs
├── components/
│   ├── ui/
│   │   ├── Layout.tsx               # Card, Button, ScreenHeader (reuse)
│   │   └── PinGate.tsx              # Adult content gate (0438) — DO NOT REFACTOR
│   └── games/                       # One file per game
├── contexts/
│   └── ContentContext.tsx           # AI content prefetch cache
├── data/                            # Static JSON question banks
├── services/
│   ├── geminiService.ts             # Gemini client + Claude-first orchestrators
│   ├── claudeService.ts             # Anthropic client (Haiku 4.5 + structured output)
│   ├── LocalGameService.ts          # Static data readers
│   └── SessionManager.ts            # sessionStorage wrapper (used content tracking)
└── index.css                        # Tailwind v4 @theme (custom props + keyframes only)
```
