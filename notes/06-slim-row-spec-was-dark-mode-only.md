# The documented tile spec only existed in dark mode

**Date:** 2026-09-05 · found while building Ballpark

## What the design system said

`CLAUDE.md` gives an exact recipe for the "Slim Row" category tile that every
new picker screen is supposed to copy:

```tsx
className="bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 …
           hover:bg-white/[0.08] hover:border-t-white/20 hover:border-r-white/20"
```

Ballpark's pack picker followed it to the letter. Build clean, drive clean,
sixteen assertions green.

## What broke

Nothing — in dark mode. On the navy ground a 5%-white fill and a 10%-white
border are a soft glass panel, exactly as intended.

The light theme's ground is `#EEF4FA`. A 5%-white fill on near-white is
*nothing*, and a 10%-white border is less than nothing. The tile stopped
existing: three chunks of unbounded text, each with a green bar floating to its
left and a chevron floating to its right. It didn't look broken enough to throw
an error and it didn't look right enough to ship.

Nothing caught it. It cannot be caught by a test that asks "did the tile
render" — it did render, at full opacity, in the colour it was asked for. It
was found by taking a screenshot in light mode and looking at it.

## The fix

The app already has semantic surface tokens that flip with the theme
(`--c-surface-alt`, `--c-border`, `--c-app-tint`). The whole recipe works in
both themes if the alpha-white literals are swapped for those:

```tsx
className="bg-surface-alt backdrop-blur-sm border border-divider border-l-4 …
           hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25"
```

`CLAUDE.md`'s Design System section now carries the token version, with the
old one recorded as the dark-mode-only trap it is.

## Lesson

A design-system spec written before a second theme existed is a **dark-mode
spec wearing a design-system label**, and copying it faithfully is exactly how
the defect spreads to every new screen. Any hardcoded `white/N` or `black/N` in
a surface, border or hover state is a theme bug that has not been noticed yet;
the token is not a stylistic preference, it is the only version that means the
same thing twice.

The corollary for process: this repo's screenshot pass is not a formality after
the drives go green. It is the *only* check that covers this entire class of
defect, and it has now caught one on both of the last two games built.
