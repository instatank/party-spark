# PartySpark — what I learned building it

## What this was
A party-game web app that lives in your browser (no app-store download — you just save it to your home screen). Ten-ish games for groups: charades, trivia, word puzzles, an AI roast tool, etc. Most games are pure data + a stopwatch. A few use AI to generate cards on demand or to roast a selfie. I never wrote a line of code myself — I worked with a coding agent (Claude) in turn-by-turn conversation, told it what I wanted, audited what it did, and shipped to production maybe forty times over the course of the build.

## The 6 things I'd tell myself on day one

**1. The dataset is the product.** I spent the bulk of my time curating cards, not writing features. The features are commodity; what makes Taboo *fun* is the words, not the timer. Treat your content pool the way a magazine treats its editorial — audit it, dedupe it, tone-match it, and never paste a batch in without a second read.

**2. Audit before you merge — every single time.** Every batch of cards I dropped in, the agent ran checks: counts, dupes, schema, semantic near-duplicates. Several times the audit caught real problems my eyes would have missed (a "new" question that was just an existing one reworded; a batch that claimed 75 cards but had 81). Make this non-negotiable. The cost of a five-second audit is nothing; the cost of two identical questions appearing in one session is the player's trust.

**3. Ship the change, see it on your phone, then decide what's next.** I never planned more than one move ahead. I'd ask for a tweak, hit "ship to production," reload the home-screen icon, play with it for two minutes, then come back with the next thought. Plans drawn at a desk lied about what the experience actually felt like in my hand.

**4. Order matters way more than I expected.** Reordering the home-screen tiles changed how the app *felt* completely — twice. Moving a button from the right to the left of the card. Putting the player-names screen *before* the difficulty picker instead of after. None of these were "features" but they were the difference between flow and friction. Reserve a slot every session for "just look at the order of things."

**5. Don't trust the catchphrase over the timer.** I kept "5 in 5 seconds" as the 5 Alive tagline even after I changed the actual timers to 6 seconds. Stale copy hides in plain sight because you wrote it once and stopped looking. Whenever you change a mechanic, grep your own marketing for what's now a lie.

**6. Confirm-before-quit is the cheapest UX win in the building.** One small modal across every game, asking "are you sure you want to quit?" mid-play. Took half a session to ship. The number of times someone fat-fingers home mid-round is enormous. If your app has *anything* the player can lose, this is the single highest-leverage afternoon you'll spend.

## Working with Claude — what stuck

- **Auto-ship by default, audit by reflex.** I told the agent to push to production after the build passed, every time, unless I explicitly said hold. That kept momentum. The audit-before-merge habit kept it safe.
- **Lean on the agent for judgment, then overrule.** I asked Claude to rank my games. Useful starting point — but I changed the top three. The pattern was: ask for a take, take what's useful, ignore the rest. Don't *outsource* the choice; outsource the *first draft* of the choice.
- **When the agent goes long, push back hard.** Claude defaults verbose. "Be more concise" worked. So did silence after a too-long answer. Don't be polite about brevity — it's a real cost when you're nine hours in.
- **State the *why* in the brief, not just the what.** "Add a recap screen *because* I keep losing track of my score across rounds" got me a better screen than "add a recap screen." The agent picks up on the why and gets the details right.
- **When you paste from another project by mistake, the agent will spot it.** Twice I dropped something from a different repo's session by accident; both times Claude asked instead of guessing. Don't treat that as friction — it's the only thing standing between you and a Frankenstein commit.

## My pre-ship checklist

- [ ] **Build passes.** The agent runs this automatically; double-check the line that says "built in N seconds."
- [ ] **Audit on any data batch.** Counts, dupes within the batch, dupes against existing pool, no entry breaks the rules (length, schema, etc.).
- [ ] **Look at the diff before merging.** A two-line read of "what changed" caught typos and stale comments more than once.
- [ ] **Open it on your phone, not the laptop preview.** Especially audio (the buzzer/bell), touch targets, and the play-screen card under one finger. Things that look fine in dev tools feel wrong on actual glass.
- [ ] **Check the next state, not just the current one.** "Does the back button do the right thing? What about play-again?" Always click one screen past where you think you're testing.
- [ ] **If you changed copy or a number, search the codebase for the old version.** Stale tagline, stale comment, stale doc — they hide.

## What surprised me

- **The agent shipped to production through a pull request — I never typed a git command.** Every "push to production" went through the agent creating a request, then merging it. Felt like deploying with a coworker.
- **The 403 error on direct deploys was a feature, not a bug.** My main branch was protected. The agent's permissions only let it push to a side branch, then ask for a merge. I was annoyed at first. Then I realised it had saved me from a half-tested push a dozen times.
- **The AI-roast feature looked impressive but didn't replay well.** Top wow-factor on first use, dead by the third. Generated images cost me real money per tap. The party games people came back to were the cheap, simple, social ones.
- **An audit found a "spy on the user" risk that wasn't there.** I had a thing called `VITE_ROAST_LIMIT` in my settings and the prefix made it look like a leaked secret. It was a number that capped roasts per session. The agent flagged it; we checked; it was fine. False alarms are part of the process — investigate calmly.
- **The icon for a soccer ball didn't exist in my icon library.** Tiny problem with no clean fix. We used the emoji ⚽ as the icon for that one tile. Not every constraint is worth a heroic workaround; sometimes the emoji is the answer.

## Starter rules for my next project

1. Pick the smallest possible thing that has a "round" and ship that first.
2. Curate the content pool yourself; don't let the AI write it without your eyes on every entry.
3. One change, one commit, one preview check, one decision. Don't batch.
4. Audit data on every merge, even when you "know" it's fine.
5. Look at the home screen / tile order every Monday and ask if it still ranks right.
6. Test on the actual phone, not the laptop, before declaring anything done.
