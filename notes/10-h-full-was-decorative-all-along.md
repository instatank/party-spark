# `h-full` on a game screen has never done anything

**Date:** 2026-09-06 · found while building The Line

## The pattern every game copies

Game screens open with a full-height flex column and push a footer to the
bottom by letting the middle region grow:

```tsx
<div className="h-full flex flex-col">
  <ScreenHeader … />
  <div className="flex-1 overflow-y-auto"> …content… </div>
  <div> …the footer / hand / buttons… </div>
</div>
```

## What broke

None of it works. `App.tsx`'s shell is

```tsx
<div className="min-h-screen bg-app text-ink p-4 …">
```

`min-height` is not a definite height, so `h-full` on the child resolves to
`auto`, the flex column is content-sized, `flex-1` has nothing to fill, and
`overflow-y-auto` never overflows. Every game screen has therefore been laid
out in plain document flow, with its "pinned" footer sitting wherever the
content happened to end and empty space below it.

On most screens that is invisible — the content is roughly a screenful, so
"ends where the content ends" and "fills the viewport" look the same. The Line
is the screen where it stopped being invisible: its middle region is a list
that **grows every turn**, so by the eighth card the player's own hand had been
pushed off the bottom of the screen and every turn began with a scroll past the
whole line to reach it.

Nothing caught it. The engine tests were green, the browser drive was green
across nine runs and four decks — the drive clicks by `data-*` attribute, and
an element that is off screen is still perfectly clickable. It was found by
taking a screenshot and looking at it.

## The fix (for this screen)

Give the column a real height so the flexbox does what it always claimed to:

```tsx
<div className="flex flex-col h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)]">
  …
  <div className="flex-1 min-h-0 overflow-y-auto"> …the line… </div>
  <div className="flex-shrink-0"> …the hand… </div>
```

`min-h-0` matters as much as the height: without it a flex child refuses to
shrink below its content and scrolls the page instead of itself.

A second trap sits right behind it. Once the region scrolls, "centre the
content when it is short" must **not** be `justify-content: center` — a centred
flex child that overflows gets clipped at the *top*, with no way to scroll back
to it, which here would have hidden the smallest cards permanently. Two
collapsing spacers do the same job safely:

```tsx
<div className="flex-1 min-h-2" />
<div className="grid …">…</div>
<div className="flex-1 min-h-2" />
```

They centre a short line and collapse to nothing when it outgrows the region.
Verified at a deliberately short 480px viewport with a 15-card line: still
scrollable to the first row.

## Lesson

A layout rule that depends on an ancestor can be dead for years while looking
alive, because on a screenful of content "fills the space" and "ends where the
content ends" render identically. The tell is not the CSS, it is the **content
that grows**: a list, a chat, a leaderboard, anything unbounded is where a
collapsed `flex-1` finally shows up — and it shows up as an interaction cost
(scroll to reach your own controls), which is exactly the kind of defect no
assertion is looking for.

Corollary for this repo: `h-full` on a game root is currently decorative
everywhere. Any new screen with a growing region should set its own definite
height rather than inherit the pattern and assume it works.
