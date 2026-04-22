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
| `api/ai.ts` | Dispatcher. Reads `body.type`, routes to the right handler. Returns `{ ok, data }` or `{ ok: false, error }`. |
| `api/_lib/clients.ts` | Lazy SDK singletons (one GoogleGenAI + one Anthropic per cold start). |
| `api/_lib/handlers-custom.ts` | Custom MLT + custom TOD. Tries Claude first, falls back to Gemini. |
| `api/_lib/handlers-gemini.ts` | Charades, Taboo, NHIE, WILTY, Mafia, WYR, Imposter, MLT, contextual lies. |
| `api/_lib/handlers-image.ts` | `generate_roast` (image → roast text), `edit_image` (image → caricature), `roast_or_toast`. |
| `src/services/aiClient.ts` | Single `callAI<T>(type, params)` helper that POSTs to `/api/ai`. |
| `src/services/geminiService.ts` | **Despite the filename,** this file no longer calls Google directly. It's thin fetch wrappers around `callAI`. Filenames + exports preserved so no component imports break. |
| `src/services/claudeService.ts` | Same pattern — fetch wrappers. Kept for backwards-compat with imports. |

### Models

- **Claude Haiku 4.5** (`claude-haiku-4-5`) — custom generation paths. Cheap, fast, structured output via `output_config.format`.
- **Gemini 2.0 Flash** (`gemini-2.0-flash-001`) — all other text generation + Roast Me text captions.
- **Gemini 3 Pro Image Preview** (`gemini-3-pro-image-preview`) — image editing for Roast Me caricatures.

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

## 🚀 Build & Deployment Pipeline

**We use Vercel's GitHub integration.** Each git push to a branch triggers a Vercel preview build. Merges to `main` trigger the production deploy.

- **Local dev:** `vercel dev` (runs both Vite AND serverless functions). Or `npm run dev` if you're only touching client UI.
- **Local build:** `npm run build` (runs `tsc -b && vite build`)
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

Flagged during the 2026-04-21 audit. None blocking, but worth cleaning up when you're already in the area.

### High-value / low-cost

1. **The Forecast has 7 dynamic Tailwind classes** in `CompatibilityTestGame.tsx` at lines 273, 284, 339, 360, 375, 378, 403 — template literals like `text-${accentColor}-400` that Tailwind v4's JIT won't reliably compile. The MODE_SELECT screen is clean; the PREDICT / ANSWER / PASS_TO_* states may be rendering without accent colors on mobile. Replace with static class maps following the Slim Row pattern.

2. **`comingSoonGameIds` in `App.tsx`** (~line 113) is stale — lists WILTY / Icebreakers / WYR / NHIE as "coming soon" but all four are routed and playable. Audit and correct.

### Medium

3. **`RoastGame.tsx` line ~156** — LOADING state has `onBack={() => {}}`. User is stuck during image generation. Change to `onExit` or a state-specific handler.

4. **NHIE has no Claude fallback yet.** `generateNeverHaveIEver` is Gemini-only. Same quota vulnerability TOD/MLT had before the port.

### Low

5. **Leftover `console.log`s** in production code — `CharadesGame` (3x), `TabooGame` (1x). Remove or demote to `console.debug`.

6. **Duplicate `useContent` import** in `CharadesGame.tsx` around line 5-6.

7. **API keys are in client JS** (both Gemini and Claude). Fine for testing, but before merging to production-facing work, proxy through a backend. Anyone can inspect the bundle and pull the keys.

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
