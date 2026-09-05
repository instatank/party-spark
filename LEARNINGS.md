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

### 2026-07-11 — Date-seeded Today's Pick tile broke the home smoke test — on a different game than it shipped with
- What happened: the CI smoke test asserted game titles with exact single-match queries (`getByText`). The Today's Pick tile duplicates ONE game's title on Home, and the seeded pick rotates daily — so the suite passed on the day the tile shipped (2026-07-06) and turned red five days later when the rotation landed on Taboo, with zero code change in between. (Same family as the 2026-07-06 drive-selector card, but the new twist is the *time* dimension, not the selector.)
- Concept: date-seeded UI makes tests time-dependent — "passes today" proves nothing about tomorrow. Any test that touches a screen with seeded/rotating content must be written to hold on EVERY date (tolerate duplicates with `getAllByText`, or pin the date in the test) — and the day a seeded feature ships is precisely the day its tests are least likely to catch the rotation.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: The home screen spotlights a different game every day and the smoke test passed all week — why can it still go red on Friday with no code change, and what makes the test date-proof?
- Internalized: no

### 2026-08-16 — Rebuilt a browser-drive script from scratch and got it wrong three times, while a working one sat in `scripts/`
- What happened: to verify the new Spin the Bottle landed where it pointed, I wrote a fresh headless-browser script. It failed three times in a row: it imported Playwright (this repo uses puppeteer), it clicked game titles as `button` elements (Home cards aren't buttons — the title is `.game-card h3`), and it waited on fixed `setTimeout`s for the splash instead of the screen actually rendering. Every one of those three problems was already solved, correctly, in `scripts/drive-games.mjs` — the repo's own regression driver, ~20 lines I could have copied.
- Concept: before writing a new tool, check whether the repo already contains one that solved the same problem — the existing one encodes fixes for environment quirks you haven't hit yet and will otherwise rediscover one failure at a time. This is the same "reuse the shared module" rule CLAUDE.md applies to game code (useCountdown, audio.ts, EndScreen), applied to the dev-tooling layer, which is exactly where it's easiest to forget because the script feels throwaway.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: You need a one-off script to poke at the running app. What should you look at before you write the first line, and why is "it's throwaway" the wrong reason to skip that?
- Internalized: no

### 2026-08-16 — The automated check said the arrow was correct while the screenshot showed it pointing past the name
- What happened: I wrote a geometric assertion for the bottle spinner — read the rotation off the DOM, compute the angle, compare it with the highlighted seat's position. It reported `MATCH=true` on every spin. Then I looked at the screenshot: the sight-line ray ran from the bottle out to the rim, which put its arrowhead *past* the name chip rather than at it. Numerically dead-on; visually it read as pointing at whatever was behind the winner.
- Concept: an assertion proves the property you thought to encode, not that the interface communicates. Geometry, contrast, spacing and overlap can each be provably "right" and still read wrong to a human, because what the user reads is the relationship between elements, not any single measured value. On anything visual, a passing check licenses you to *look* — it doesn't replace looking. Note: this concept paid out on 2026-08-23 — The Tell's drive script passed every assertion with zero console errors, and the screenshot review is the only thing that caught a decorative element rendering as a grey disc. The card predicted the failure class; that's the ladder working.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: Your test confirms the pointer's angle matches the winner's angle to within a degree, and it passes every run. Name a way the screen can still show the wrong thing to a player at the table.
- Internalized: no

### 2026-08-23 — A decorative "glow" was really a clipped circle, and it only looked right on tall cards
- What happened: premium cards in this app get a soft colour wash in one corner. The pattern everyone copy-pastes is an oversized circle pushed off the card edge and hidden by `overflow-hidden` — on the big hero cards you only ever see its soft middle, so it reads as a glow. I reused it on the new game's shorter tiles, where the circle is nearly as tall as the card, so its hard edge landed *inside* the card. The result was a flat grey disc that looked like a rendering bug. Every automated check passed; the screenshot is what caught it.
- Concept: if a visual effect depends on being clipped to look right, it is only correct at the size you happened to test it at — the pattern silently encodes an assumption about its container. Prefer an effect that fades out on its own (here, a radial gradient to `transparent`, positioned with `inset-0`), so there is no edge to expose and no per-card offsets to retune. This is the visual equivalent of a magic number: the `-70px` offset was never a rule, just a value that worked once.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: A card decoration looks great everywhere you've used it, and you drop it onto a new, much shorter card. What's the specific thing that can now go wrong, and what kind of effect wouldn't have that problem?
- Internalized: no

### 2026-08-23 — Thirteen tests "failed" on text the app was rendering perfectly
- What happened: the new game's drive script asserted that the screen said "Round 3 of 12". It reported thirteen failures across the run. The app was correct — the copy is styled with Tailwind's `uppercase`, and the browser property the test read (`innerText`) returns text *after* CSS text-transform, so it was handing back "ROUND 3 OF 12". The test was comparing against source truth while reading rendered truth.
- Concept: a UI test reads what the browser *renders*, not what you *wrote* — and CSS can change the rendered text (case, injected `::before`/`::after` content, ellipsis truncation) without touching the markup. When an assertion fails on something you can plainly see is right on screen, suspect the reading, not the app: compare case-insensitively, or assert against a value the styling can't rewrite.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: Your test says the screen doesn't contain "Next round", but you're looking at a button that clearly reads "NEXT ROUND". What's going on, and what's the fix?
- Internalized: no

### 2026-08-23 — The app's own "are you sure you want to leave?" guard blocked its test from moving on
- What happened: mid-play screens deliberately set a browser `beforeunload` prompt so a player can't lose a game by closing the tab. The drive script tried to navigate back to the home page while a game was in progress; the guard fired, the headless browser sat on the native dialog, and the run died on a 30-second navigation timeout with an error that said nothing about exit guards.
- Concept: safety features that interrupt the *user* also interrupt *automation*, and they surface as timeouts rather than as "a dialog is blocking you". The durable fix is to reorder the test so it leaves from a screen with no guard (here: finish the game, then use the end screen's own exit), rather than to teach the test to punch through the guard — a test that routinely dismisses safety prompts stops being able to notice when one appears that shouldn't.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: Your automated run hangs and then times out on a navigation, with no useful error. The app has an "unsaved changes / are you sure?" prompt. What's likely happening, and why is "auto-dismiss every dialog" the wrong fix?
- Internalized: no

### 2026-08-24 — Called the work shipped when it had only reached a branch, so nobody could play it
- What happened: I built The Tell, ran every gate green, pushed to the working branch, and reported it as done — including "verified" and "shipped". It wasn't on the production app. Branch pushes only ever produce a Vercel *preview*; production deploys from `main`, which still sat at the previous release. The founder found out by opening the live app and not seeing the game, and had to come back and ask. The fix was thirty seconds of work (open PR, merge) — the cost was entirely in the false "done".
- Concept: "done" is defined by the place the user actually looks, not by the last step in your own workflow. A push, a green build and a passing test suite are all evidence *about* the work; none of them is delivery. The trap here is that each local checkpoint felt terminal — the branch instruction says push when complete, so "complete" quietly got redefined as "pushed". The check that would have caught it is the one I skipped: go to the URL a user would use and confirm the change is visible there. Worth noting the SOP already said this in plain words (`/ship`: "merge to `main` deploys production") — reading the right instruction is not the same as letting it define your finish line.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: Every test passes, the build is green and you've pushed. Name the one check still missing before you can honestly say a feature is live — and why "the CI is green" doesn't cover it.
- Internalized: no

### 2026-08-30 — The rule that made the game work was only enforced in one place, so a new feature quietly broke it
- What happened: Nerve is a game of chicken — you climb a ladder of dares and whoever refuses a rung first loses. The whole thing only works if the ladder always gets worse as you climb; a mild dare after a filthy one makes folding look ridiculous. The code that *built* each ladder got that right. Then I added a "swap this rung" button, and it grabbed any unused dare from the deck — so swapping near the bottom could drop a near-the-top dare underneath milder ones, and the ladder started going down. Nothing crashed. The build was green, the test suite was green. The round just silently stopped making sense.
- Concept: a rule that only holds where a thing is first *created* isn't really being enforced — every later piece of code that edits that thing is another place the rule has to hold, and that code usually gets written later, by someone thinking about a different feature. Two things saved it, both worth copying: (1) **store the thing the rule is about** — the ladder held loose dare objects, so at the moment of editing there was no way to even ask "is this one higher or lower?"; switching to store positions made the fix obvious; (2) **test the rule, not the feature** — "swapping changes the dare" passes happily on the broken version. "Every dare shown is higher than the one before it" is what caught it. And because the ladders are randomly drawn, one green run proved almost nothing — it took running the check six times for the broken case to show up.
- In my words: (parked at founder's request — 2026-08-30)
- Where else: (parked at founder's request — 2026-08-30)
- Quiz question: A rule is guaranteed by the function that creates something. Why is that not enough, and what kind of test catches the gap — versus the kind that misses it?
- Internalized: no

### 2026-09-05 — The house style guide was written before light mode existed, so following it correctly produced a broken screen
- What happened: Ballpark's pack-picker copied the tile recipe out of `CLAUDE.md` exactly as written — a very faint white fill with a very faint white border, which is what gives every other picker in the app that frosted-glass look on the dark navy background. It looks great. Then I switched the app to light mode and took a screenshot: the tiles were gone. Not broken, not misaligned — invisible. A 5%-white panel on a near-white page is nothing at all, so what was left was three chunks of floating text with a coloured bar beside each one. Every test passed. The tiles had rendered perfectly, in exactly the colour they were asked for.
- Concept: the style guide had been written when the app only had a dark theme, so "faint white" was a safe shorthand for "slightly lighter than the background". Once a light theme existed, that shorthand became a lie in half the app — but the guide still read like a rule, so copying it faithfully was the fastest way to spread the bug to every new screen. The app already had the right tool: named colours like "surface" and "border" that automatically mean the right thing in either theme. The rule of thumb is that any hardcoded white-or-black transparency in a background or border is a theme bug nobody has noticed yet. The process half matters just as much: no automated check can catch this, because nothing is wrong — the only thing that catches it is opening the screen in both themes and looking. That pass has now caught a real defect on two consecutive games.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: A written style rule in this repo produced a screen that was invisible in one theme, and every test still passed. What made the rule wrong, and what is the only check that could have caught it?
- Internalized: no

### 2026-09-05 — Twenty-three tests "failed" on text the app was rendering perfectly. Again.
- What happened: Echo's new test script reported 23 failures in its first run. Every one was the script's fault, and both causes were already written down. Half were the trap `notes/04` records: the browser hands back text *after* the styling has been applied, so a label styled to display in capitals comes back as "CHAIN HELD — +5 POINTS" while the script was looking for "+5 points". The other half were mine: I assumed the little chain tags rendered as "🍋 Lemon" with a space, so I stripped everything up to the first space — but there is no space in the markup, so I was stripping the whole thing and comparing empty strings to empty strings.
- Concept: a recorded lesson only pays off if it's applied *before* the first run, not recognised afterwards. The cheap defence is to build the guard into the tool rather than remember it at each use — the fix here was one shared helper that compares text case-insensitively, used everywhere from the start, so the trap can't be re-entered one assertion at a time. The second half is a different rule with the same shape: don't guess how the page is built, read one real value out of it and check your assumption before writing twenty checks on top of it.
- In my words: (pending — answer at next wrap)
- Where else: (pending — answer at next wrap)
- Quiz question: You already wrote down a testing trap weeks ago and then walked straight into it again. What changes that — remembering harder, or something you build into the tool?
- Internalized: no
