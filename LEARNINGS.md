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
