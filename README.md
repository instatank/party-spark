# PartySpark

A premium, AI-spiced party game app: a dozen-plus pass-the-phone and solo games (Charades, Taboo, 5 Alive, Scramble, Truth or Drink, Roast Me, …). Offline-first — question banks ship as static JSON, and AI generation (Claude + Gemini, proxied server-side) is optional spice, never a hard dependency.

## Stack

- React + TypeScript via **Vite 7**, styled with **Tailwind CSS v4**
- No router — a state-based `switch` in `src/App.tsx` driven by the `GameType` enum
- **Vercel** hosting + serverless functions under `api/` (all AI calls go through `/api/ai`; API keys are server-side only)

## Development

```bash
npm install
vercel dev        # full app INCLUDING /api/* serverless functions
npm run dev       # Vite only — /api/* does NOT run; AI features 404. UI-only work.
npm run build     # tsc -b && vite build (type-checks src/ AND api/)
npm run check:api # landmine linter for api/ (run before pushing api/ changes)
```

> **Gotcha:** `npm run dev` does not serve the serverless functions. Anything touching AI must be tested with `vercel dev` or on a Vercel preview deploy. Local env: copy `.env.example` → `.env.local` with server-side `GEMINI_API_KEY` / `ANTHROPIC_API_KEY`.

## Deployment

Vercel GitHub integration: every branch push gets a preview deploy; merges to `main` deploy production.

## Full context

See **`CLAUDE.md`** for architecture, the design system, AI service layout, critical `api/` landmines, and the game roster. `HANDOFF.md` covers recent session state.
