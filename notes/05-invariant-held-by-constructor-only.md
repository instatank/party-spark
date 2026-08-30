# The ladder was built sorted, then a later edit un-sorted it

**Date:** 2026-08-24 · found while building Nerve

## The invariant

Nerve is a chicken game: two players climb one ladder of dares and the first to
refuse a rung loses. The entire premise depends on one property — **the ladder
must always escalate.** A rung that's milder than the one below it makes folding
look absurd and the game stops working.

The constructor got this right:

```ts
const buildLadder = (tier: Tier): number[] =>
    shuffle(tier.rungs.map((_, i) => i)).slice(0, RUNGS_PER_ROUND).sort((a, b) => a - b);
```

Random *content*, fixed *direction*. Six of the tier's eight rungs, always in
authored order.

## What broke

Then a swap feature was added — one per player per round, so nobody is cornered
by a rung they don't want. Its first version looked obviously fine:

```ts
const spare = tier.rungs.filter(r => !inLadder.has(r.t));   // any unused rung
setLadder(l => l.map((r, i) => (i === rungIdx ? shuffle(spare)[0] : r)));
```

It picks *any* unused rung. So swapping at rung 2 could drop in a rung authored
at position 7 — and now rungs 3, 4 and 5 are all milder than the one below them.
The ladder descends. The whole game breaks, silently: no crash, no error, just a
round that stops making sense.

The build passed. The unit test passed. It was caught only because the browser
drive asserted the invariant directly, by recording every rung shown in a round
and checking its authored index strictly increased.

## The fix

Two changes. First, store the ladder as **authored indices**, not detached rung
objects — you cannot preserve an ordering you can't measure:

```ts
const [ladder, setLadder] = useState<number[]>([]);
```

Second, make the swap respect the invariant: only rungs above the last one
already taken are eligible, and the unplayed tail is re-sorted after
substitution.

```ts
const floor = rungIdx > 0 ? ladder[rungIdx - 1] : -1;
const spares = tier.rungs.map((_, i) => i).filter(i => !inUse.has(i) && i > floor);
// substitute, then re-sort the tail so the climb still rises
```

When no eligible rung exists the affordance says so ("Nothing left to swap in at
this height") instead of quietly breaking the order.

## Lesson

An invariant enforced only in the constructor isn't enforced. Every later
mutation is a second place it has to hold, and the mutation is usually written
weeks later by someone thinking about a different feature. Two defences that
actually worked here:

1. **Store the thing the invariant is about.** Holding rung *objects* made order
   unmeasurable at the point of mutation; holding *indices* made the fix obvious.
2. **Assert the invariant, not the feature.** "Swap changes the rung" passes on
   broken code. "Every rung index strictly increases across the round" is what
   caught it — and it caught it on the run where the swap actually fired, which
   is why the drive runs several times over randomised ladders.
