# Handoff · PartySpark Design Refresh

## Overview

This package contains the visual direction for **PartySpark**'s home/navigation shell and the game-play flow for four games: **Most Likely To, Never Have I Ever, Would You Rather, The Forecast**. The goal is to move the existing app from its current look to the direction shown here.

Two scopes are in this handoff:

1. **App shell** — home screen + global navigation, using *Direction 05 · Hybrid* (search chrome over an editorial list).
2. **Game flow** — for each of the 4 games above, a **Category picker** screen and a **Playing** screen, in the *V1 · Editorial List* style.

Both ship with a **dark + light toggle**. Dark is the production default and matches the app's current slate-navy palette; light (Azure Mist) is additive.

## About the design files

The files in `references/` are **HTML design prototypes**, not production code. They were produced as high-fidelity mockups to show the intended look and behavior. Your job is to **recreate these designs in the target codebase's existing environment** using its established patterns and libraries — not to ship the HTML.

The current app (see the project root alongside this handoff) is **React + Tailwind v4** with slate-palette CSS theme variables (`--color-party-dark`, `--color-party-surface`, etc.). Reusing that stack is recommended but not required — if you choose a different framework, keep the tokens and component structure described below.

## Fidelity

**High-fidelity.** Exact hex values, font sizes, spacing, radii, and interaction states are specified. The prototypes use Inter (400–800) and Playfair Display (400–800, incl. italic). Pixel-perfect implementation is the goal.

---

## Screens

### Screen 1 — Home (Shell Direction 05 · Hybrid)
`screenshots/01-shell-hybrid.png`
Source component: `references/shared/shell-05-hybrid.jsx`

**Purpose.** Single entry point. User lands here on launch, picks a game, starts playing.

**Layout (390 × 820).**
- **Masthead (72px tall, padded 18px 20px).** Wordmark "PartySpark" (Playfair Display, 22px, weight 700, letter-spacing -0.015em) + a small gold sparkle glyph. Top-right: favorites button (36×36 rounded-10 surface-alt bg, border).
- **Hero headline (padded 0 20px 14px).** `"What are we\nplaying tonight?"` — Playfair Display, 28px, weight 700, letter-spacing -0.02em, line-height 1.05.
- **Search bar (padded 0 20px 10px).** Full-width pill, 44px tall, radius 12. Left: search icon 18px. Placeholder "Search games, vibes, or players…" (13px, muted). Right: ⌘K kbd chip.
- **Filter chips row (padded 0 20px 16px, horizontally scrollable).** All / Quick / Couples / Crowd / Spicy. 32px tall, radius 999. Active = ink fill + bg text. Inactive = surface bg + inkSoft text + border. 13px weight 600.
- **Game index list (padded 0 20px 20px).** Each row: 2-digit index (Playfair Display 16px, muted), colored dot (8px, per-game tile color), game title (15.5px weight 700), metadata ("Wild · 2 min · Solo" 12px muted). Right chevron. Rows separated by 1px border-soft.
- **Bottom tab bar (fixed, 74px).** 4 slots: Home (active), Played, Favorites, Profile. Icon 22px + label 10px weight 600. Active = accent (gold #EFC050 in dark, blue #2C7CD4 in light).

---

### Screens 2–9 — Game flow (V1 · Editorial List)

For each of the 4 games, there are two screens. They share the same layout grammar and differ only in data.

Source components:
- `references/shared/games-v1.jsx` — `V1Category`, `V1Play`
- `references/shared/games-data.jsx` — `GAME_CATEGORIES`, `GAME_SAMPLE_CARDS`, `GAME_META`

#### 2a. Category picker (e.g. `screenshots/02-mostLikely-category.png`)

**Layout.**
- **Top bar (padded 16 16 8).** Left: back chevron (icon 22px, strokeWidth 2.2). Right: home button (surface-alt bg, border, radius 10, 32×32, icon 18px).
- **Title block (padded 4 20 16).** Game title in Playfair Display, 28px weight 700, letter-spacing -0.015em. Sub: "Pick a category to begin. Swap anytime." — 13px muted, line-height 1.5.
- **Category list (padded 0 16 20, gap 10).** Each card:
  - Surface bg, 1px border, radius 14, padding 14 14. Scroll-y overflow.
  - **Accent bar** on the left edge: 3px wide, 2px radius, vertical, inset 12px top/bottom, colored per-category tile solid.
  - **Icon chip**: 44×44, radius 12, bg = tile.tint, icon colored tile.solid. Icon is "wand" for AI custom, "flame" for adult, else the game's primary glyph.
  - **Title** 15.5px weight 700 + optional "18+" pill (9px weight 800, letter-spacing .1em, red tint bg, red solid text, radius 4, padding 2 6).
  - **Description** 12.5px muted line-height 1.35.
  - **Chevron** right (18px muted).
  - **Custom (AI) variant**: 1.5px colored border (solid + 60% opacity), optional gradient bg in dark mode.

Categories per game are in `GAME_CATEGORIES` — 6 per game. The first is always "Create Your Vibe" (AI custom). Adult/18+ categories have the pill.

#### 2b. Play / card (e.g. `screenshots/03-mostLikely-play.png`)

**Layout.**
- **Top bar (padded 16 16 10).** Left: back chevron. Center: 2-line — uppercase game name (10px weight 700, letter-spacing .14em, muted) + category label (11.5px weight 600, tile.solid). Right: counter `N/total` (12px).
- **Progress dots (padded 4 20 14).** Horizontal row of pills, one per card. Height 3, max-width 32, radius 2. Filled = tile.solid, else border color.
- **Card (flex 1, centered, padded 8 18 18).** Portrait 3:4, max-height 460, full width minus 36px margin.
  - Surface bg, 1px border, radius 22, padding 26 24.
  - **Decorative blob**: 160×160 circle, tile.tint, opacity 0.8, positioned top -60 right -60.
  - **Header pill (top-left)**: tile.tint bg, tile.solid text. Game name uppercase, 10.5px weight 700, letter-spacing .12em, padding 5 10, radius 6.
  - **Prompt (flex middle)**: Playfair Display, 24px weight 600, line-height 1.2, letter-spacing -0.015em, ink color, textWrap: pretty.
  - **Footer**: between (verb like "Point to who fits." 11px muted) and "PartySpark" italic Playfair 12px tile.solid.
  - **Shadow**: dark `0 10px 40px rgba(0,0,0,0.5)` / light `0 2px 8px rgba(20,50,90,0.08), 0 16px 36px rgba(20,50,90,0.05)`.
- **Bottom actions (padded 0 18 22, gap 10).**
  - Skip: flex 1, surface-alt bg, 1px border, radius 14, padding 14 20, 14px weight 600 inkSoft.
  - **Reveal & Next**: flex 2, ink bg (bg-colored text), radius 14, padding 14 20, 14px weight 700, letter-spacing .02em. Right arrow icon 16px.

---

## Design tokens

### Dark mode (production — matches current `--color-party-*` slate palette)

| Token         | Hex                               | Role |
|---------------|-----------------------------------|------|
| bg            | `#1E293B` (slate-800)             | App background — **must match current `--color-party-dark`** |
| surface       | `#334155` (slate-700)             | Card background — matches `--color-party-surface` |
| surfaceAlt    | `#2C3B52`                         | Secondary surface (inputs, tab bar) |
| bgElev        | `#263449`                         | Elevated header on scroll |
| ink           | `#FFFFFF`                         | Primary text |
| inkSoft       | `#E2E8F0` (slate-200)             | Secondary text |
| muted         | `#94A3B8` (slate-400)             | Meta + placeholder |
| mutedDeep     | `#64748B` (slate-500)             | Icons low emphasis |
| border        | `#3E4C64`                         | Card/row borders |
| borderSoft    | `#2C3B52`                         | Divider lines |
| accent        | `#EFC050`                         | Gold — matches `--color-party-secondary` |
| accentSoft    | `rgba(239,192,80,0.15)`           | Gold tint |
| sparkle       | `#EFC050`                         | Sparkle glyph |

> **Critical:** dark mode is **not black**. It uses the slate-navy palette currently in production. The `bg: #1E293B` value matches `--color-party-dark` in `src/index.css`.

### Light mode (Azure Mist)

| Token         | Hex                               | Role |
|---------------|-----------------------------------|------|
| bg            | `#F3F6FA`                         | App background |
| bgElev        | `#FFFFFF`                         | Elevated header |
| bgInset       | `#E9EDF3`                         | Inset / search bg |
| surface       | `#FFFFFF`                         | Card |
| surfaceAlt    | `#F8FAFD`                         | Secondary surface |
| ink           | `#0F1E33`                         | Primary text |
| inkSoft       | `#344660`                         | Secondary text |
| muted         | `#7A8BA3`                         | Meta |
| mutedDeep     | `#AEB8C7`                         | Low-emphasis |
| border        | `#DDE4EC`                         | Borders |
| borderSoft    | `#EAEEF4`                         | Dividers |
| accent        | `#2C7CD4`                         | Hero sky-blue |
| accentSoft    | `#D7E6F6`                         | Blue tint |
| sparkle       | `#C99A26`                         | Gold sparkle |

### Per-game tile colors (shared across modes)

See `SHELL_TOKENS.dark.tiles` / `SHELL_TOKENS.light.tiles` in `references/shared/shell-tokens.jsx`. Each game has `solid`, `tint`, `ink`:

| Game          | solid (dark) | solid (light) |
|---------------|--------------|---------------|
| Most Likely To| `#8B5CE0`    | `#9266D2`     |
| Never Have I Ever | `#35B4C8`| `#4CBDCE`     |
| Would You Rather | `#6D72DD` | `#7781DB`    |
| The Forecast  | `#E66AA3`    | `#E56AA0`     |

(Other tiles — roast, imposter, taboo, etc. — also live in that file.)

### Typography

- **Display**: `'Playfair Display', serif` — weights 400, 500, 600, 700, 800, italic. Used for titles, prompts, numbers-as-display.
- **UI**: `'Inter', system-ui, sans-serif` — weights 400, 500, 600, 700, 800. Everything else.

Load via Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..800;1,400..500&family=Inter:wght@400..800&display=swap" rel="stylesheet" />
```

### Spacing / radius

- Radii: 6 (pills), 10 (small buttons), 12 (inputs, icon chips), 14 (buttons, cards), 18 (panel), 22 (prompt card), 999 (chips).
- Shadows: see component descriptions above; they differ dark vs light.

---

## Mode toggle

Add a Dark/Light toggle in Profile/Settings. Persist to localStorage. Dark is the default. Honor `prefers-color-scheme` on first load if no preference is stored.

The two token sets share identical structure (same keys), so implementation is just a runtime theme context that swaps the active token object.

---

## State management

- **Home**: `selectedFilter` (All / Quick / Couples / Crowd / Spicy). Filters the visible game list.
- **Category screen**: no state beyond tap-to-select (navigates to Play).
- **Play screen**: `cardIndex`, `categoryId`, card prompts array (loaded from content source — AI or static). Actions: Skip (advance cardIndex), Reveal & Next (advance cardIndex, optionally log reveal).

## Interactions & behavior

- **Tap category** → navigate to Play with that category's prompts loaded.
- **Tap card**: no-op (reveal is via button). Optional: tap to flip for "answer" reveal if the game has one.
- **Skip** / **Reveal & Next**: animate card exit (opacity + slight rotate + X translate, 180ms ease-out), next card animates in from opposite direction.
- **Filter chip**: instant filter; fade list rows in/out (100ms).
- **Back chevron**: standard navigation back.

## Assets

No raster assets. All icons are stroke SVGs defined in `references/shared/icons.jsx` (lucide-flavored). Reuse from the codebase's existing icon library (e.g. `lucide-react`) where possible — the names map directly: `flame`, `users`, `hand`, `split`, `heart`, `chevron-right`, `arrow-right`, `arrow-left` (back), `search`, `home`, `x` (close), `sparkles` (wand equivalent).

## Files in this bundle

```
design_handoff_partyspark_refresh/
  README.md
  screenshots/
    01-shell-hybrid.png
    02-mostLikely-category.png
    03-mostLikely-play.png
    04-never-category.png
    05-never-play.png
    06-wyr-category.png
    07-wyr-play.png
    08-forecast-category.png
    09-forecast-play.png
  references/
    PartySpark Shell Variations.html     ← open to see all shell directions incl. Dir 05
    PartySpark Game Variations.html      ← open to see all game V1 screens side-by-side
    design-canvas.jsx                    ← canvas host (not part of app; viewer only)
    ios-frame.jsx                        ← device bezel (not part of app; viewer only)
    shared/
      shell-tokens.jsx                   ← dark + light token objects (copy values from here)
      shell-05-hybrid.jsx                ← shell component — the one to ship
      games-v1.jsx                       ← V1 category + play components — the ones to ship
      games-data.jsx                     ← categories + sample prompts per game
      icons.jsx                          ← icon set reference
      data.jsx                           ← game catalogue metadata
      tokens.jsx, shell-01..04, shell-05, MostLikely.jsx, HomeMenu.jsx  ← extras, not shipped
```

## Prompt for Claude Code

Paste this to a Claude Code session alongside this folder:

> Implement the PartySpark design refresh described in `design_handoff_partyspark_refresh/README.md`.
>
> Scope: recreate (1) the home shell in *Direction 05 Hybrid* style and (2) the *V1 Editorial List* category + play screens for four games (Most Likely To, Never Have I Ever, Would You Rather, The Forecast), in both dark and light modes with a user-toggleable theme.
>
> The current app is React + Tailwind v4 in `src/`. Reuse the existing `--color-party-*` theme variables (they already match the dark-mode tokens), add the Azure Mist light-mode variables under a `[data-theme="light"]` selector, and extend the Tailwind theme to expose both sets. Do **not** change the dark-mode bg away from slate-navy `#1E293B` — full-black backgrounds are out of scope.
>
> Use `lucide-react` for icons (mappings in README). Use Playfair Display + Inter from Google Fonts as specified.
>
> Reference the HTML prototypes in `design_handoff_partyspark_refresh/references/` for exact visual behavior. Copy hex values, font sizes, spacing, and radii directly from the README tokens table. Screenshots in `screenshots/` show the target rendering.
>
> Produce a minimal PR: theme tokens + Home + one game flow (Most Likely To) end-to-end. After that works, replicate to the other three games by wiring the same components to different category/prompt data.
