# The coverage check was green because the deal cooperated

**Date:** 2026-09-06 · found while building The Line

## What it was supposed to prove

The Line's browser drive plays deliberate misses so the wrong-placement path is
exercised rather than assumed. A miss aimed **past the bottom of the line** is a
different render path from one aimed between two cards, so the drive added an
assertion that it had actually been reached:

```js
check(bottomMissSeen, 'exercised a miss aimed past the bottom of the line');
```

and picked its card at random, aiming the miss at `vals.length` whenever that
happened to be wrong.

## What broke

It went green, then red, then green fifteen times, then red again.

The drive can only miss "past the bottom" with a card that does **not** belong
at the bottom — aiming a genuine bottom card there is a *correct* placement. In
a two-player game the miss-playing seat gets exactly two turns, and early lines
are two or three cards long, so a decent share of deals hand it nothing but
cards above the line's ceiling. Roughly one run in twenty, the branch was never
reached and the assertion failed.

Both readings of that are bad:

- red → looks like an app regression, and it is not;
- green → says the branch was covered, and in some runs it simply was not.

The first fix made it worse in the honest direction: alternating on a counter
(`wrongBranch % 2 === 0`). With two seats every wrong turn fell on the same
parity, so the "alternation" aimed *every* miss the same way and covered
nothing at all — while still passing whenever luck supplied a bottom miss.

## The fix

Stop waiting for the situation and *create* it. The drive now steers its own
card choice only until the branch is claimed, then goes back to random:

```js
if (bottomMissSeen)      pick = random(hand);                    // stop steering
else if (playWrong)      pick = smallest(hand);                  // least likely to BE the bottom
else                     pick = largest(hand);                   // raises the ceiling for the next hand
```

Playing the largest card on the correct turns is the part that actually does
the work: it pushes the top of the line up, which makes the next hand interior,
which makes a bottom-aimed miss available. 15 runs, then 9 more after a layout
change: no failures.

## Lesson

An assertion that a branch was exercised is only as good as the drive's
*guarantee* of reaching it. If reaching it depends on randomised content, the
check is testing the content generator, not the app — and its failures are
indistinguishable from real ones, which is how a flaky assertion trains you to
re-run instead of read.

This is `notes/07` from the other side. There the lesson was that a correct
generator can still be a boring one; here it is that a correct *test* can still
be an intermittent one. Same underlying move in both: don't assume randomness
will hand you the case you care about — arrange for it, and only randomise the
part you are not making a claim about.
