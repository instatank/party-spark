---
name: ship
description: PartySpark pre-push ship ritual - run before every push that reaches users. Runs the build + api landmine gates, refuses to push red. Use when about to commit/push changes, or when the user says "ship it".
---

# /ship — PartySpark

Repo-specific config for the shared playbook's `SOP-ship.md` (in `playbook/` of `instatank/time-tracker` — read it for the why and the full ordering). Never push red.

1. `git status` + `git diff` — confirm the diff contains only the asked-for change (no bundled fixes).
2. **No service-worker bump here** — PartySpark has no SW cache key. Skip that step.
3. **Gates (all must pass):**
   - `npm run build` (runs `tsc -b && vite build` — type-checks `src/` AND `api/`).
   - If anything under `api/` changed: `node scripts/check-api-landmines.mjs` (`.js` relative imports, no static `@google/genai`, tsconfig.api.json reference). These landmines pass every local check and die on Vercel cold start as `FUNCTION_INVOCATION_FAILED`.
   - If a NEW Tailwind accent color was added: verify it exists in the compiled CSS — `grep "text-{color}-400" dist/assets/index-*.css`. Tailwind v4 JIT silently drops template-literal class names.
4. **Silent-failure question** for any new write/scheduled/external path in the diff (PLAYBOOK Rule 4).
5. Commit (clear message) and push to the working branch.
6. **Deploy path:** `main` is branch-protected — changes ship via PR into `main`; every branch push gets a Vercel preview deploy, merge to `main` deploys production.
7. **NEVER test AI features with `npm run dev`** — it does not run `/api/*` (404s). Use `vercel dev` locally or the preview deploy URL.
