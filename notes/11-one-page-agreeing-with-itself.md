> **Lesson:** A feature whose only claim is "two devices agree" cannot be tested by one device. Both real bugs in the multiplayer build were invisible to a single page, and both were in the *other* phone's experience.

# One page agreeing with itself proves nothing

Multiplayer rooms shipped with a unit test (`tests/roomSync.test.ts`) that pins
THE ROOM INVARIANT properly: same seed + same round produces byte-identical
content, derived through two independent generator instances. That test is
good and it passed the whole time.

It also could not have caught either bug that actually shipped in the first
draft, because both lived in the gap between two devices, and a Node test has
one process, one clock, and one copy of the state.

## The two bugs

**1. The host finishing was a local event.** In Ballpark's live mode, tapping
"See the calibration read" on the last question called `finish()` — which sets
local stage to `END`, writes stats, and renders the leaderboard. On the host's
phone this looked perfect. Every *other* phone sat on the reveal of question 8
forever, waiting for a round number that was never going to change. The host
had no reason to notice: their screen was correct.

The fix is one line conceptually — ending is a ROOM event (`phase: 'END'`) that
every device acts on locally — but nothing about the host's own screen would
ever have suggested it was missing.

**2. Leaving left a ghost.** The reveal deliberately waits for every player to
commit, because blind simultaneous commitment is the whole point of the mode.
Back out mid-game and your seat stayed in the room, never bracketing, so the
gate never opened and everyone still playing was stuck. Again: the leaver's
screen was fine. They'd left.

Both are the same shape — **a state transition that is correct locally and
incomplete globally** — and that shape is exactly what a single-page drive is
blind to.

## What actually caught them

`scripts/drive-versus.mjs` and `scripts/drive-ballpark-live.mjs` open **two
separate browser contexts** (isolated localStorage and sessionStorage — a
shared context would let one phone's session leak into the other and fake the
sync). Then they assert things one page structurally cannot:

- both phones render the same seven letters / the same question
- a word typed on A appears as a score on B *without B being touched*
- both end screens name the **same winner** — two phones disagreeing about who
  won is the worst failure this feature has and the easiest to ship

## The assertion that mattered most was a negative one

Ballpark's live mode claims you commit **blind**. The happy-path checks (both
phones reveal, both agree) would pass just as cheerfully on a build that showed
you your opponent's bracket while you were still typing yours. So the drive
locks a deliberately distinctive bracket on phone A — `1234567–7654321`, a
number that cannot occur naturally — waits longer than a poll cycle, and
asserts that string is **nowhere on phone B's screen**, and that the answer is
nowhere on A's.

Generalises past multiplayer: when a feature's value is that something is
*hidden*, the test has to look for the thing and fail to find it. Asserting
that the visible parts look right measures nothing about the hidden part.

## Bonus trap: `element.click()` on a pointerdown handler

Scramble's honeycomb fires on `onPointerDown`, not `onClick`, deliberately — so
fast taps in a timed game aren't swallowed by the browser's click delay. The
drive's `el.click()` therefore did nothing at all, and the symptom was not an
error: it was **"Nobody scored."** A broken drive that reads as a legitimate
game outcome is worse than one that throws.

Dispatch the event the component actually listens for:

```js
el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
```

Same family as notes/08 and notes/09: check that your test is exercising the
path you think it is, especially when "nothing happened" is a legal result.
