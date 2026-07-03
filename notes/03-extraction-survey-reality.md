# Survey the duplication before extracting — the folklore numbers were wrong

> **Lesson:** Every "duplicated across N games" claim shrank on inspection (countdown: "10 games" → 6 games in 2 distinct patterns; end screens: "7 games" → 4 that genuinely share the shape). Extract what the survey proves, not what the backlog says — forcing the rest would have meant a config-schema component, which is worse than the duplication.

## What the 2026-07-03 survey actually found

- **Audio**: exactly 3 in-file Web Audio kits (5 Alive, Linked, Scramble), as
  expected → all 3 now on `src/services/audio.ts`.
- **Countdown**: 6 games, two shapes — rAF + `performance.now()` deadline
  (5 Alive, Linked, Scramble) and 1-second `setInterval` (Charades, Taboo,
  Fact or Fiction). One deadline-based hook (`src/hooks/useCountdown.ts`)
  covered both; the setInterval games got *better* (no drift, no
  background-tab stretch) with identical visible behavior. The other games
  (Roast loading spinner, Intimate Dice flicker) use intervals as animation
  loops, not countdowns — deliberately left alone.
- **End screens**: only 4 games share the ranked-leaderboard shape (5 Alive,
  Linked, Charades, Taboo) → `src/components/ui/EndScreen.tsx`. The
  lookalikes that did NOT fit: Fact or Fiction (Card-wrapped, rose-themed,
  different row anatomy), Scramble (rank column + word-chip sections +
  different footer), Truth or Drink (unranked truths-vs-drinks recap),
  The Forecast (couple verdict), Mini Mafia (roles reveal). Converting them
  would have needed ~6 appearance props each — that's a second design
  system, not deduplication.

## Transferable rule
Before extracting "shared" code: open every alleged duplicate side by side and
sort into (a) byte-similar → extract, (b) same idea, different structure →
leave, revisit only with a design pass. The extraction component's prop list
is the smell test: if it grows a prop per adopting game, stop.
