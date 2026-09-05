# The generator was provably correct and quietly ruined the game

**Date:** 2026-09-05 · found while building Shortlist

## What the generator had to guarantee

Shortlist hides one of sixteen suspects and feeds the table truthful clues.
Four properties make a case fair:

1. every clue is true of the hidden suspect;
2. the suspect therefore survives every clue;
3. each clue strictly narrows the surviving set;
4. the last clue leaves exactly **one** suspect standing.

(4) is the one that matters most — without it a case can end in a coin flip,
and the whole promise ("it's always solvable") is a lie.

All four were enforced in `buildCase`, and `tests/shortlistEngine.test.ts`
checked them across 9,000 generated cases. Green. The browser drive replayed
real cases, re-derived every clue's meaning from the JSON rather than trusting
the screen, and confirmed the app's hidden suspect really was the one its own
clues pointed at. Also green.

The game was still broken.

## What broke

The clue-picking heuristic aimed to roughly halve the field each time, which
is the obvious thing to want:

```ts
const target = Math.max(1, Math.round(items.length / Math.pow(2, clues.length + 1)));
```

On a 16-suspect board that is 16 → 8 → 4 → 2 → 1. **Always exactly four
clues.** Every case. On every board.

Nothing above notices. Every invariant holds perfectly. But the entire scoring
system is built on clue count — close on clue 1 for 10 points, clue 5 for 3 —
and if every case runs to four clues then every case pays the same, and "should
we guess now or take another clue?" has one correct answer forever. The game's
only real decision had been deleted, by a heuristic chosen for tidiness.

It was found by reading the drive's own summary line, which printed
`clues 4+4+4+4+4=20` and looked, for a moment, like a coincidence.

## The fix

Each case picks a target *chain length* first and follows a geometric curve to
one survivor over exactly that many clues:

```ts
const CHAIN_LENGTHS = [3, 3, 4, 4, 4, 5, 5];
const target = Math.max(1, Math.round(Math.pow(items.length, (wanted - step) / wanted)));
```

Three-clue cases are now worth gambling on early; five-clue cases genuinely
grind. And the property is pinned where it can't silently regress:

```ts
const lengths = new Set(solvedIn);
expect(lengths.size).toBeGreaterThanOrEqual(3);
expect(Math.min(...solvedIn)).toBeLessThanOrEqual(3);
expect(Math.max(...solvedIn)).toBeGreaterThanOrEqual(5);
```

A second pass added the same treatment to clue *variety* — the generator was
free to follow "fewer than 6 letters" with "fewer than 5 letters", which is
valid deduction that reads like the app running out of ideas. It now prefers a
different attribute from the previous clue, and the test caps back-to-back
repeats at 10%.

## Lesson

Correctness invariants describe what a generator may **never** do. They say
nothing about what it always does. A generator can satisfy every rule you
wrote down and still produce the same experience every single time — and
because each individual case is flawless, no per-case assertion can see it.

The properties worth testing about generated content are therefore of two
kinds, and the second is the one that gets forgotten:

- **per-case:** this case is valid. (Fairness.)
- **across cases:** the cases are not all the same. (Whether it's a game.)

Distribution is a testable property. `new Set(lengths).size >= 3` is one line,
and it is the line that would have caught this on the first run.
