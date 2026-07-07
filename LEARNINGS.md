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

### 2026-07-06 — Pricing research for the Roast Me cost model: primary source blocked, mirrors disagreed
- What happened: while budgeting Roast Me v2, Google's official Gemini pricing page returned 403 through the session proxy, and the first third-party "pricing guide" that ranked in search mixed two different models' prices in one paragraph (quoted the cheap Flash-Image $0.039/image figure inside a Gemini 3 Pro Image article whose real price is ~$0.134/image — a 3.4× error). Building the cost plan on that one source would have made image generation look 3× cheaper than it is.
- Concept: numbers that drive money decisions need two independent sources or one primary source — SEO pricing blogs are often auto-generated and conflate similar products. When the primary source is unreachable, triangulate (a second independent mirror + the provider's announced launch pricing) and write the assumption down next to the number so it can be re-checked.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: A blog post tells you an API costs $0.04 per call and you're about to size a feature around it — what two things do you do before trusting that number?
- Internalized: no (streak 0 — founder answers pending)

### 2026-07-07 — Four of five poster templates had invisible layout bugs that only showed up by looking
- What happened: the Roast Central poster generators (canvas-drawn images) built cleanly, passed the type-checker, and produced files without a single error — but when the rendered images were actually opened and looked at, four of the five had real defects: roast text overlapping the REWARD line, flavor text running off the card's bottom edge, a gold seal stamped on top of the date, and a signature scribble striking through the footer. Two render-inspect-fix rounds later, all five were clean.
- Concept: code that produces something visual (images, PDFs, share cards, emails, print layouts) cannot be verified by tests or compilers — those only prove it *ran*, not that it *looks right*. The only real test is rendering the output and putting eyes on it, ideally with awkward inputs (longest text, widest photo). Budget a render→look→fix loop into any visual feature; the first render is a draft, never the deliverable.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: your app generates a shareable image and all tests pass — what's still unverified, and what's the only way to verify it?
- Internalized: no (streak 0 — founder answers pending)

### 2026-07-07 — The handoff said "already shipped" — but on a different branch than the one I was assigned
- What happened: the task said to read `docs/ROAST_ME_V2_PLAN.md` and reuse the "already-shipped" Phase 1+2 roast code. But that plan doc and all the Phase 1+2 code (RoastCentralGame, roastCards, the roast API handlers) did not exist on my assigned branch (`…-goabyu-k5kfr9`) — they lived on a sibling branch (`…-goabyu`, no suffix). My assigned branch actually held an unrelated, already-merged feature ("Today's Pick", PR #91). Diagnosing this took real time: grepping git history across every branch to find where the foundation actually was. Two smaller versions of the same trap rode along — the handoff's list of `EndScreen` props omitted two the real component requires (`onPlayAgain`/`onExit`), and a local `origin/…-k5kfr9` remote-tracking ref pointed at a commit even though no such branch existed on the remote (it nearly tricked me into an unnecessary force-push). Each was caught by checking the actual code/refs instead of trusting the handoff's description.
- Concept: a handoff describes what a *previous* session believed and did — it's a claim, not ground truth, and the ground can differ (wrong branch, moved files, stale refs, incomplete API signatures). Before building on "it already exists," verify WHERE it exists and WHAT its real shape is against the live code on the branch you're actually on. Trust the handoff for intent and history; trust the repository for facts. One line — "which branch / which commit" — in a handoff would have saved the whole hunt.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: a handoff says "reuse function X that shipped last session" and X isn't where the note implies — before assuming the note is wrong, what do you check, and what do you trust the handoff for vs. the repo for?
- Internalized: no (streak 0 — founder answers pending)
