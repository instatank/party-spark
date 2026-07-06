# LEARNINGS — PartySpark friction ledger

Concept cards appended by `/wrap`. One card per friction, not per session — zero is a valid count.
Format + method: `playbook/LEARNING_METHOD.md` in `instatank/time-tracker`.

### 2026-06-01 — Gemini 2.0-flash retired and silently killed ALL text generation in production
- What happened: Google shut down `gemini-2.0-flash-001` on its own schedule; every text-generation feature in production started failing with a generic "API error" — nothing in our code had changed, and nothing told us why.
- Concept: external dependencies retire on their own schedule, not yours (PLAYBOOK L6) — never leave a `-preview`/`-beta` or soon-to-sunset model id in production, and keep a model inventory with retirement dates checked monthly. Note: the SECOND instance of this exact class — `gemini-3-pro-image-preview` (retiring ~2026-07-17) — was bumped to the stable `gemini-3-pro-image` on 2026-07-02 BEFORE it fired. The concept predicted the failure; that's the ladder working.
- In my words: "because third parties can choose to retire/discontinue whenever they like so we should be prepared"
- Where else: "claude API, (vercel and firebase changes too, especially vercel). all third party dependencies are candidates"
- Quiz question: You wire a new feature to a model id ending in `-preview` — what happens in a few months, and how do you find out?
- Internalized: no (streak 1 — teach-back + transfer correct 2026-07-04; needs a correct quiz answer on a separate day to flip to YES)

### 2026-07-06 — Share-card leaderboard drew on top of the new context line
- What happened: the redesigned share card added new bottom elements (a "what the points mean" line + a challenge banner). The leaderboard rows had a "never shrink below 64px" rule, so with 4+ players they quietly kept their size and drew straight over the new text — the first test render showed player names and the explainer line stacked on top of each other.
- Concept: on a fixed-size canvas, every element needs a space budget that the others respect. A "minimum size" rule turns "shrink to fit" into "silently overlap" the moment you add something below it — the fix is to make the layout self-fitting (shrink, then drop, then summarize "+N more"), never to hope the content stays small.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: You add a new line of text to the bottom of the share card and the card has a 7-player leaderboard — what are the three fallbacks that stop them colliding?
- Internalized: no

### 2026-07-06 — Regression drive clicked the wrong "Scramble" and had been red since the quick tiles shipped
- What happened: the deep regression drive opened games by "first button whose text contains the game name". When the Daily Scramble quick tile was added to Home (2026-07-03), "Scramble" started matching that tile first, so the drive landed on the Daily screen and failed — it had been silently red for three days, and the new Today's Pick tile would have added the same hazard for a different game each day.
- Concept: test selectors should target identity, not resemblance — match the exact title inside the specific element type (the game card's heading), because substring matching breaks the moment the UI grows a second element with an overlapping name. Verified pre-existing by stashing the day's changes and re-running before fixing.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: A regression test finds its button by checking the text "contains Scramble" — what kind of UI change breaks it, and what should it match instead?
- Internalized: no
