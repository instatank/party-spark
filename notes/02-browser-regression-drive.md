# Regression-testing PartySpark by driving a real browser

> **Lesson:** The only trustworthy way to verify a shared-code refactor across all games is to drive the built app in headless Chromium — and the drive scripts only mean something if you first run them against the PRE-refactor build (baseline), otherwise you can't tell a script bug from a regression.

## The tools (committed, dev-only)
- `scripts/drive-games.mjs` — opens every game from the home screen, fails on
  any console/page error. `--tabs` also covers the 4 hidden Coming Soon games
  (needs a temporary `SHOW_TABS=true` build of `src/App.tsx`).
- `scripts/deep-drive.mjs` — per-game flows for the 6 timer games: asserts the
  countdown visibly decreases, 5 Alive auto-expires into its tally screen and
  restarts round 2, Charades/Taboo score increments on "Correct", Fact or
  Fiction's mm:ss ticks, Linked works in both modes, Scramble solo ticks.
- Both run against `npm run build && npx vite preview --port 4173`.

## What broke on the way (first run: 0/16 "passed")
1. **Google Fonts + `/api/*` failures are environment noise, not app bugs.**
   The dev sandbox has no external network (fonts fail) and `vite preview` /
   any static server has no serverless functions (`/api/ai` background refills
   501/404 — the games correctly fall back to local data). The scripts filter
   failures by URL; don't "fix" the app for these.
2. **Four games aren't reachable from the home screen at all** (Would I Lie To
   You, Icebreakers, The Traitors, Would You Rather) — they're behind
   `SHOW_TABS = false` in `App.tsx`. Any "test every game" pass must flip the
   flag, rebuild, drive with `--tabs`, and revert.
3. **Parsing "the timer" out of innerText is positional.** 5 Alive's screen
   says "Round 1 of 5" before the countdown, so the first integer on screen is
   the round number, not the timer (assert `1 -> 1` forever). Taboo has a
   "START TIMER" ready-gate screen between category pick and play.
4. **PIN gates**: seed `sessionStorage.partyspark_adult_unlocked = 'true'`
   (and `partyspark_intimate_unlocked`) via `evaluateOnNewDocument` instead of
   driving the 4-digit inputs.
5. Chromium lives at `/opt/pw-browsers/chromium` in the Claude Code sandbox;
   the scripts fall back to puppeteer's bundled Chrome elsewhere.

## Baseline discipline that paid off
Before the audio/useCountdown extraction, the deep drive was run against a
frozen copy of the pre-refactor dist (`cp -r dist …/dist-baseline` + a static
server). It failed 3/7 — all three were script bugs (items 1 and 3 above),
found while the app was known-good. After fixing the script: 7/7 on baseline,
then 7/7 on the refactored build = real signal that the extraction preserved
behavior.
