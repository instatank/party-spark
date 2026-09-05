# The game politely ended the turn, and the test kept typing

**Date:** 2026-09-05 · found while building Target

## The behaviour

Target ends your turn the instant you land on the number. Nothing beats exact,
so there is no reason to make anyone tap "I'm done" after hitting it:

```ts
if (r === target) {
    hapticSuccess(); playPangram();
    setTimeout(() => finishRef.current(true), 700);
}
```

That is a good rule and it stays.

## What broke

The browser drive plays the solver's own solution back through the UI, tap by
tap, to prove the board accepts exactly what the solver says is possible. It
walked the whole chain:

```js
for (const s of solution) {
  await tapNumber(s.a);
  await tapOp(s.op);
  await tapNumber(s.b);
}
```

Most of the time the target arrives on the final step and this is fine. But an
**intermediate** step can already equal the target — `75 × 4 = 300` when the
target is 300 and the chain had two more steps to run. The app correctly ended
the turn, moved to the next screen, and the drive kept tapping at a board that
no longer existed:

```
Error: no operator +
```

It failed roughly one run in four. The three runs before it were green, which
is exactly the shape of failure that gets waved through as "flaky".

## The fix

The drive now asks the app whether it is still on the board, before every tap:

```js
const onBoard = () => page.evaluate(() =>
  [...document.querySelectorAll('button')].some(b => /i'm done/i.test(b.textContent)));

const playSteps = async steps => {
  for (const st of steps) {
    if (!(await onBoard())) return false;   // the app ended the turn under us
    ...
  }
};
```

and it stops the chain at the first step that reaches the target, because that
is where a real player's turn would end too.

A second seat in the same drive plays a deliberate near miss, and it needed the
same insight from the other direction: its alternate solution is only usable if
**none of its intermediate values equal the target**, or the turn ends early as
an exact hit and the near-miss branch never gets exercised at all.

```js
if (sol && sol.every(st => st.r !== tgt)) near = { value: alt, sol };
```

## Lesson

A test that drives a UI is a second actor in the app, and it has no right to
assume it is the only one making things happen. Any screen that can advance
**by itself** — a timer expiring, a win condition firing, an animation
unlocking a button — will eventually advance in the middle of the test's
sequence, and the failure surfaces as a nonsense error a long way from the
cause ("no operator +", when the real event was "you won three taps ago").

Two habits that fix the whole class:

1. **Re-check the screen before each step of a multi-step interaction**, not
   just at the start of it. Cheap, and it converts a mysterious crash into a
   clean early return.
2. **Wait on the state you need, not on a duration.** The same drive was also
   scraping the solution mid-animation because it slept 600ms instead of
   waiting for the Next button to unlock — and produced a "solution" of two
   steps that genuinely did not reach the target, which looked like a solver
   bug and was not.

Both are the same rule: synchronise on the app's state, never on your own
optimism about its timing.
