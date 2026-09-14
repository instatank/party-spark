> **Lesson:** A `return null` early guard turns any screen added below it into a silent blank page — no error, no warning, nothing in the console. React returning null looks exactly like a component that meant to.

# The guard that swallowed the screen

Wiring multiplayer into Target, the new room-lobby screen rendered as a
completely empty page. Not an error page — an empty one. `document.body.innerText`
was `""`, `innerHTML` was 136 characters of app shell with nothing inside, and
the console was clean: no `pageerror`, no React warning, no failed import.

The cause, once found, is embarrassing in the way these always are:

```tsx
if (stage === 'SETUP') { … }

if (!puzzle) return null;      // ← here

if (stage === 'ROOM')    { … } // unreachable in the lobby
if (stage === 'PLAY')    { … }
```

Target deals a puzzle when a game starts. The lobby, by definition, runs
*before* that — so `puzzle` is null, the guard fires, and the component returns
null. React dutifully renders nothing at all.

The exact same shape sat in `TheLineGame` (`if (!deck || !state) return null;`),
and it caught the second wiring too, because I had already forgotten the first.

## Why it cost so much time

Every instinct was wrong, in order:

1. **Assumed a crash.** Added console listeners for `pageerror` and every
   console level. Silence — because nothing threw.
2. **Assumed a stale build.** Rebuilt, then discovered a second dev server
   still bound to port 4173 from an earlier run, serving alongside the new one.
   That produced `ERR_CONNECTION_RESET` noise which looked causal and was not.
   (Kill by name before restarting a long-lived dev server; `EADDRINUSE` in the
   log of the *new* process means the *old* one is still answering.)
3. **Assumed the JSX was broken.** It typechecked and built fine, because it
   was fine.

None of those were the problem. The problem was three lines above the code I
kept staring at.

## The rule

**When adding a screen to an existing stage machine, check what early returns
sit between the top of the component and where you are inserting.** A guard
like `if (!x) return null` encodes an assumption — "by this point we have
dealt" — that a new pre-game screen breaks by design.

Generalises: `return null` is the quietest failure a React component can have.
Prefer putting a new stage's block immediately after the other pre-game stages
(SETUP and friends) rather than next to the stage it visually resembles.

## Debug tip that actually worked

When a page is blank and the console is clean, read `document.body.innerHTML`,
not `innerText`. `innerText` of an empty tree and of a tree that failed to
mount are both `""`; the HTML tells you whether the shell rendered and the
child returned nothing (guard / null) or the whole tree is missing (crash).
