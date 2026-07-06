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

### 2026-07-06 — New bottom sheet rendered invisible: an old animation was silently holding it hostage
- What happened: the new "Pick For Us" reveal sheet used `position: fixed` (pin to the screen), which had worked for other modals. It rendered 900px below the visible screen. Cause: the home screen's entrance animation (`animate-slide-up`) finishes but *keeps* its final `transform` style (fill-mode `forwards`) — and any element with a transform becomes the anchor that "fixed" children measure from, instead of the screen. The overlay was pinned to the bottom of the tall scrolling page, not the bottom of the viewport.
- Concept: `position: fixed` means "fixed to the screen" ONLY if no ancestor has a `transform` (or `filter`/`backdrop-filter`) — any such ancestor quietly becomes the new anchor. Entrance animations that keep their end state leave an invisible transform behind long after they finish. The robust fix is a React *portal*: render the overlay directly under `<body>`, outside every animated ancestor.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: Your full-screen modal shows up stuck halfway down the page or off-screen, and it sits inside a container that slides in when the screen loads. What's the likely culprit, and what's the fix?
- Internalized: no
