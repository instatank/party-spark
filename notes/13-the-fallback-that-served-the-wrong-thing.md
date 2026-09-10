# The dataset was fine. It was fine for the wrong game.

> **Lesson:** Content isn't right or wrong on its own — it's right or wrong *for a
> format*. And when a pool is too small for the format, the fallback that covers
> for it will happily serve a different kind of thing entirely, silently.

**Date:** 2026-09-07 · found while upgrading the Charades dataset

## The report

"The short one-word clues seem based on this being a timed game trying to get as
many in. The way we prefer to play is one clue and a 30s/60s timer to get that
one clue."

Nothing in the data was *incorrect*. `Titanic` is a film, `Toaster` is a thing
in a house, `Penguin waddling` is a penguin waddling. The complaint was that a
third of the deck was single words, and a card that reads "Don" is three seconds
of charades no matter how long you leave on the clock. The deck had been authored
for a format that rewards volume, and it was being played in one that rewards a
performance.

The fix was not to lengthen the existing cards. Rapid Fire *wants* "Titanic". So:
a second deck (`charades_clues.json`), a second format, and a rule written into
CLAUDE.md that they must not be merged.

## The three things the audit found that nobody reported

Reading the file before changing it turned up more than the complaint did.

**1. Everything was stored twice.** `mix_movies` held all 200 Hollywood entries,
all 200 Bollywood entries, and 41 extras. `family_mix` held the exact union of
its three sub-pools. `CharadesGame` then unioned them again at deal time — so the
duplication was a complete no-op that nothing could ever surface as a bug. It
just shipped ~35KB of the same strings twice in a lazily-loaded chunk. 963 stored
strings became 628, and the dealt pools came out the same size to the item.

**2. Two spellings of the same film.** `Terminator` and `The Terminator`;
`Silence of the Lambs` and `The Silence of the Lambs`. Because they lived in
different categories, dedupe-on-union never saw them as the same card.

**3. The one that actually mattered.** Family Mix dealt from 61 unique items
against a 30-card batch. Two rounds and the local pool was empty, at which point
`startGame` falls through to `generateCharadesWords(cat, needed)` — whose prompt
read:

```
Generate a list of ${count} popular and recognizable Movie Titles for a game of Charades.
The category is: ${category}.
```

The category was interpolated into a sentence that had already decided the
answer was film titles. So the family deck, once exhausted, quietly started
dealing movies. No error, no console warning, no failing test — the fallback did
exactly what it was written to do, and what it was written to do was wrong for
four of the seven categories. It only surfaced by reading the prompt while
counting pool sizes for an unrelated reason.

The prompt now carries a per-category brief, and the family pools grew 61 → 191
so the fallback is reached far less often in the first place.

## Lesson

A fallback is a second implementation of the same requirement, and it is the one
nobody looks at. When the primary path is a hand-authored file and the fallback
is a generated one, they will drift — and the drift shows up only in the state
where the primary path is *exhausted*, which is exactly the state nobody tests.
Two habits fall out of this:

- **Size every pool against how fast the game consumes it.** "61 items" means
  nothing; "61 items against a 30-card batch" means the fallback is load-bearing
  by round three.
- **When you audit content, read the code that makes more of it.** The generator
  is part of the dataset.

The new deck's test (`tests/charadesClues.test.ts`) is written in that spirit: it
does not assert clue texts, it asserts the deck's *shape* — the general pack
stays under 10% one-word cards, every pack holds at least a round's worth, and
each pack stays inside its own lane. Those are the properties a future "let's
add 200 quick ones" would undo, and the only ones worth defending in CI.

*(Updated 2026-09-10: the deck was later reorganised into Hollywood / Bollywood
/ Movie Mix / Everything Else, and the one-word bar moved onto the general pack
alone — plenty of real films are called "Sholay". The lesson above is unchanged;
only the shape being defended moved.)*
