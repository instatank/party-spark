// Roast Me — the client-side theme catalog.
//
// This file decides WHAT A USER MAY PICK. The matching prompts live server-side
// in api/_lib/roast-themes.ts, keyed by the same strings; tests/roastThemes.test.ts
// asserts the two never drift apart.
//
// Deliberately a .ts module rather than the .json used elsewhere in src/data —
// it carries types and the availability predicate, and it needs to be importable
// by a test directly. It is metadata only (labels, colours, seasons), no prompt
// text, so it stays tiny and rides inside the already-lazy Roast chunk.
//
// ---------------------------------------------------------------------------
// WHY SEASONS EXIST
// ---------------------------------------------------------------------------
// The FIFA 2026 theme was great in June and dead weight by September — a tile
// advertising a tournament that finished. Themes that chase the moment decay,
// and the old design made retiring one a code change in two files.
//
// So availability is data. A theme is either:
//   evergreen  — always offered
//   window     — offered between two dates, then quietly disappears
//   retired    — never offered again, but kept here as a record of what we tried
//
// Retiring a theme is now a one-line edit. Its prompts stay on the server on
// purpose: the PWA precaches the app shell, so a phone that installed the app
// in June can still be running that build in September and POST 'worldcup'.
// The server answers it rather than 500-ing.

export type ThemeSeason =
    | { kind: 'evergreen' }
    | { kind: 'window'; from: string; to: string; note: string }
    | { kind: 'retired'; since: string; note: string };

/**
 * How well this theme is expected to hold a recognisable face. Drives nothing
 * in the product yet — it exists because it is the axis that decides whether a
 * theme survives being generated as one quarter of a composite image, and the
 * Roast Lab sorts by it so the riskiest themes get tested first.
 */
export type FidelityTier = 'high' | 'medium' | 'low';

export interface RoastThemeMeta {
    key: string;
    /** Picker tile label — kept to 8 characters so it fits the 4-column grid. */
    label: string;
    emoji: string;
    /** Active-tile fill colour. Literal hex, not a Tailwind class (see CLAUDE.md's JIT gotcha). */
    color: string;
    /** One line, shown in the Roast Lab. Not surfaced in the picker. */
    blurb: string;
    season: ThemeSeason;
    fidelity: FidelityTier;
}

// Order is tap order: the grid is 4 across, so the first four tiles get the
// most attention. Newest and most viral lead, classics follow.
export const ROAST_THEMES: RoastThemeMeta[] = [
    {
        key: 'figurine',
        label: 'FIGURE',
        emoji: '🧸',
        color: '#0EA5E9',
        blurb: 'You, sealed in a blister pack with accessories from your own life.',
        season: { kind: 'window', from: '2026-09-01', to: '2027-03-31', note: 'Toy-ification — the dominant AI photo trend of 2026. Review in Q1 2027.' },
        fidelity: 'low',
    },
    {
        key: 'digicam',
        label: 'DIGICAM',
        emoji: '📸',
        color: '#7C3AED',
        blurb: 'A 2007 house party, harsh flash, timestamp in the corner.',
        season: { kind: 'window', from: '2026-09-01', to: '2027-06-30', note: 'Anti-AI / authentic-imperfection swing. Long window; it may well earn evergreen.' },
        fidelity: 'high',
    },
    {
        key: 'animate',
        label: 'CARTOON',
        emoji: '🎨',
        color: '#E15B82',
        blurb: 'Boardwalk caricature, proportions pushed well past flattery.',
        season: { kind: 'evergreen' },
        fidelity: 'medium',
    },
    {
        key: 'tabloid',
        label: 'TABLOID',
        emoji: '📰',
        color: '#0F1E33',
        blurb: 'Supermarket scandal rag, and you are the exclusive.',
        season: { kind: 'evergreen' },
        fidelity: 'high',
    },
    {
        key: 'movie',
        label: 'MOVIE',
        emoji: '🎬',
        color: '#D83A3A',
        blurb: 'Action-thriller poster with a crushingly mundane tagline.',
        season: { kind: 'evergreen' },
        fidelity: 'medium',
    },
    {
        key: 'wanted',
        label: 'WANTED',
        emoji: '🤠',
        color: '#92400E',
        blurb: 'Old West bounty poster for a deeply petty modern crime.',
        season: { kind: 'evergreen' },
        fidelity: 'high',
    },
    {
        key: 'yearbook',
        label: 'YEARBOOK',
        emoji: '🎓',
        color: '#DB2777',
        blurb: '1985 mall-studio glamour shot, lasers and all.',
        season: { kind: 'evergreen' },
        fidelity: 'high',
    },
    {
        key: 'linkedin',
        label: 'LINKEDIN',
        emoji: '💼',
        color: '#0A66C2',
        blurb: 'Corporate headshot plus the humblebrag post underneath it.',
        season: { kind: 'evergreen' },
        fidelity: 'high',
    },
    {
        key: 'rock',
        label: 'ROCK',
        emoji: '🎸',
        color: '#B91C1C',
        blurb: 'Basement punk or stadium rock — picked per run, image and caption matched.',
        season: { kind: 'evergreen' },
        fidelity: 'medium',
    },
    {
        key: 'anime',
        label: 'ANIME',
        emoji: '🌸',
        color: '#14B8A6',
        blurb: 'Soft-painted animation portrait being far too kind to you.',
        season: { kind: 'evergreen' },
        fidelity: 'medium',
    },
    {
        key: 'agra',
        label: 'ROYAL',
        emoji: '🕌',
        color: '#B8922F',
        blurb: 'Mughal court portrait at the Taj, worn like a costume.',
        season: { kind: 'evergreen' },
        fidelity: 'medium',
    },
    {
        key: 'diwali',
        label: 'DIWALI',
        emoji: '🪔',
        color: '#F59E0B',
        blurb: 'Diya-lit festive portrait, and a relative who compliments like a knife.',
        season: { kind: 'window', from: '2026-09-01', to: '2026-11-20', note: 'Diwali falls 8 Nov 2026; window opens with the festive build-up and closes after.' },
        fidelity: 'medium',
    },

    // --- retired ---------------------------------------------------------
    {
        key: 'worldcup',
        label: 'FIFA',
        emoji: '⚽',
        color: '#1D4ED8',
        blurb: 'Stadium crowd shot in your team’s kit.',
        season: { kind: 'retired', since: '2026-09-14', note: 'Tournament ended July 2026. A tile advertising a finished event reads as a stale app.' },
        fidelity: 'medium',
    },
];

/** ISO yyyy-mm-dd in LOCAL time — the user's calendar, not UTC's. */
export const localDayKey = (d: Date): string => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/**
 * Is this theme offered today? String comparison is safe and intentional:
 * yyyy-mm-dd sorts lexicographically, and it sidesteps the timezone bugs that
 * come from constructing Dates out of date-only strings (which parse as UTC
 * midnight and can land on the wrong local day).
 */
export const isThemeAvailable = (theme: RoastThemeMeta, now: Date = new Date()): boolean => {
    switch (theme.season.kind) {
        case 'evergreen':
            return true;
        case 'retired':
            return false;
        case 'window': {
            const today = localDayKey(now);
            return today >= theme.season.from && today <= theme.season.to;
        }
    }
};

/** The themes the picker should show, in tap order. */
export const availableThemes = (now: Date = new Date()): RoastThemeMeta[] =>
    ROAST_THEMES.filter((t) => isThemeAvailable(t, now));

export const themeByKey = (key: string): RoastThemeMeta | undefined =>
    ROAST_THEMES.find((t) => t.key === key);

/** Fallback when a stored/selected theme is out of season or unknown. */
export const DEFAULT_THEME_KEY = 'animate';

/**
 * Resolve a possibly-stale selection to something currently offered. A user's
 * last pick can go out of season between sessions; silently falling back beats
 * sending them to a tile that no longer exists.
 */
export const resolveThemeKey = (key: string | undefined, now: Date = new Date()): string => {
    const found = key ? themeByKey(key) : undefined;
    if (found && isThemeAvailable(found, now)) return found.key;
    const first = availableThemes(now)[0];
    return first ? first.key : DEFAULT_THEME_KEY;
};
