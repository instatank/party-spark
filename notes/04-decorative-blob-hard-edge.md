# The decorative corner "blob" needs to be a gradient, not a circle

**Date:** 2026-08-23 · found while building The Tell

## What we do everywhere

Premium cards in PartySpark get a soft colour wash in one corner. The pattern
that got copy-pasted around the codebase is an oversized absolutely-positioned
circle, pushed off the card and clipped by `overflow-hidden`:

```tsx
<div className="absolute -top-[70px] -right-[70px] w-[180px] h-[180px] rounded-full pointer-events-none"
     style={{ background: accent + '22' }} />
```

## What broke

On the shorter cards (a ~130px tile, not a ~360px hero card) the circle is
nearly as tall as the card, so its edge lands *inside* the card instead of
outside it. You get a visible hard-edged disc — and because the fill is a
low-alpha warm colour over a dark navy surface, it desaturates into a flat
grey blob. It reads as a rendering bug, not a glow.

It looks fine on the big hero cards, which is why it survived this long: the
circle's edge is off-canvas there, so you only ever see the soft middle.

## The fix

A radial gradient that fades to `transparent` has no edge to expose, so it
works at *any* card height:

```tsx
<div className="absolute inset-0 pointer-events-none"
     style={{ background: `radial-gradient(95% 75% at 100% 0%, ${accent}2E, transparent 62%)` }} />
```

`inset-0` means no magic offsets to retune per card, and `at 100% 0%` / `at 0% 0%`
picks the corner. All seven blobs in `TheTellGame.tsx` plus the Truth or Drink
tile use this now.

## Lesson

If a decorative shape relies on being clipped to look right, it is only correct
at the size you happened to test. Prefer a fill that fades out on its own.

## Bonus gotcha (test harness, not the app)

Chrome's `innerText` returns text **after** `text-transform`. Thirteen drive
assertions failed against copy styled with Tailwind's `uppercase` even though
the app was perfectly correct. Compare case-insensitively when asserting
against uppercase UI copy.
