import { describe, it, expect } from 'vitest';
import {
    ROAST_THEMES,
    isThemeAvailable,
    availableThemes,
    resolveThemeKey,
    themeByKey,
    localDayKey,
    pickCollageThemes,
    COLLAGE_PANES,
} from '../src/data/roastThemes';
import {
    ROAST_THEME_PROMPTS,
    COMPOSITE_DIRECTIVES,
    getThemeDef,
    getCompositeDirective,
    buildCompositePrompt,
    IDENTITY_LOCK,
    DEFAULT_THEME,
    type PickFn,
} from '../api/_lib/roast-themes';
import { quadrantRects, QUADRANT_LABELS } from '../src/services/imageQuadrants';

// Deterministic pick so prompt assertions are reproducible — production uses
// randomPick, which would make these flaky for no benefit.
const firstPick: PickFn = (arr) => arr[0];
const ctx = { pick: firstPick };

describe('theme registry parity', () => {
    // THE FAILURE THIS GUARDS: themes now live in two files — the client catalog
    // (src/data/roastThemes.ts) decides what a user can pick, the server registry
    // (api/_lib/roast-themes.ts) holds the prompts. They are joined only by
    // matching string keys, and nothing at runtime notices when they disagree.
    //
    // A catalog entry with no server prompt does not crash: getThemeDef falls
    // back to the default, so the user taps DIWALI and silently receives a
    // generic caricature. That is invisible in a build, invisible in a type
    // check, and only visible to whoever paid for the generation.
    it('every catalog theme has a server prompt definition', () => {
        const missing = ROAST_THEMES.filter((t) => !ROAST_THEME_PROMPTS[t.key]).map((t) => t.key);
        expect(missing).toEqual([]);
    });

    it('every catalog theme has a composite directive', () => {
        const missing = ROAST_THEMES.filter((t) => !COMPOSITE_DIRECTIVES[t.key]).map((t) => t.key);
        expect(missing).toEqual([]);
    });

    it('every server prompt has a catalog entry', () => {
        // The other direction: an orphaned server prompt is dead weight nobody
        // can reach, and usually means a rename was only half applied.
        const orphans = Object.keys(ROAST_THEME_PROMPTS).filter((k) => !themeByKey(k));
        expect(orphans).toEqual([]);
    });

    it('catalog keys are unique', () => {
        const keys = ROAST_THEMES.map((t) => t.key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});

describe('theme content', () => {
    it('every theme carries the identity lock in its caricature prompt', () => {
        // Roast Me's whole promise is that the output is recognisably the person
        // who uploaded the photo. A theme that quietly ships without the lock
        // produces a stranger's face, which is the single worst failure mode
        // this product has.
        for (const t of ROAST_THEMES) {
            const prompt = ROAST_THEME_PROMPTS[t.key].caricature(ctx);
            expect(prompt, `${t.key} caricature`).toContain('IDENTITY LOCK');
        }
    });

    it('every theme produces substantial, non-empty prompts', () => {
        for (const t of ROAST_THEMES) {
            const def = ROAST_THEME_PROMPTS[t.key];
            expect(def.caricature(ctx).length, `${t.key} caricature`).toBeGreaterThan(IDENTITY_LOCK.length + 100);
            expect(def.roast(ctx).length, `${t.key} roast`).toBeGreaterThan(80);
        }
    });

    it('rock honours its punk/classic variant on both prompts', () => {
        const punkImg = ROAST_THEME_PROMPTS.rock.caricature({ ...ctx, variant: 'punk' });
        const classicImg = ROAST_THEME_PROMPTS.rock.caricature({ ...ctx, variant: 'classic' });
        expect(punkImg).not.toBe(classicImg);
        // Assert on tokens that actually discriminate the two lanes. The scene
        // copy describes punk without using the word, so checking for 'punk'
        // here would be testing the label rather than the content.
        expect(punkImg).toContain('mohawk');
        expect(punkImg).toContain('1977');
        expect(classicImg).toContain('stadium');

        // Image and caption must land on the same side of the genre line —
        // a punk photo with a classic-rock caption reads as a bug.
        expect(ROAST_THEME_PROMPTS.rock.roast({ ...ctx, variant: 'punk' })).toContain('punk');
        expect(ROAST_THEME_PROMPTS.rock.roast({ ...ctx, variant: 'classic' })).toContain('classic-rock');
    });

    it('picker labels fit the 4-column grid', () => {
        // The tile is roughly 80px wide at 10px type. Longer labels wrap and
        // break the grid's alignment, which is invisible until you look at a phone.
        for (const t of ROAST_THEMES) {
            expect(t.label.length, `${t.label} too long`).toBeLessThanOrEqual(8);
        }
    });
});

describe('unknown and retired keys resolve rather than throw', () => {
    // These arrive from a real place: the PWA precaches the app shell, so a
    // phone that installed the app before a theme retired can still POST that
    // key weeks later. Serving it beats 500-ing it.
    it('getThemeDef falls back to the default for an unknown key', () => {
        expect(getThemeDef('not-a-theme').key).toBe(DEFAULT_THEME);
        expect(getThemeDef(undefined).key).toBe(DEFAULT_THEME);
        expect(getThemeDef('').key).toBe(DEFAULT_THEME);
    });

    it('retired themes still resolve to their own prompts server-side', () => {
        // worldcup is retired from the picker but must keep working over the wire.
        expect(getThemeDef('worldcup').key).toBe('worldcup');
        expect(getThemeDef('worldcup').caricature(ctx)).toContain('IDENTITY LOCK');
    });

    it('getCompositeDirective falls back for an unknown key', () => {
        expect(getCompositeDirective('not-a-theme')).toBe(COMPOSITE_DIRECTIVES[DEFAULT_THEME]);
    });
});

describe('seasons', () => {
    const on = (iso: string) => new Date(`${iso}T12:00:00`);

    it('evergreen themes are always available', () => {
        const evergreen = ROAST_THEMES.filter((t) => t.season.kind === 'evergreen');
        expect(evergreen.length).toBeGreaterThan(0);
        for (const t of evergreen) {
            expect(isThemeAvailable(t, on('2020-01-01'))).toBe(true);
            expect(isThemeAvailable(t, on('2030-12-31'))).toBe(true);
        }
    });

    it('retired themes are never available', () => {
        const retired = ROAST_THEMES.filter((t) => t.season.kind === 'retired');
        expect(retired.map((t) => t.key)).toContain('worldcup');
        for (const t of retired) {
            expect(isThemeAvailable(t, on('2020-01-01'))).toBe(false);
            expect(isThemeAvailable(t, on('2026-09-14'))).toBe(false);
            expect(isThemeAvailable(t, on('2030-12-31'))).toBe(false);
        }
    });

    it('windowed themes are inclusive of both boundary days', () => {
        for (const t of ROAST_THEMES) {
            if (t.season.kind !== 'window') continue;
            const { from, to } = t.season;
            expect(isThemeAvailable(t, on(from)), `${t.key} on open day`).toBe(true);
            expect(isThemeAvailable(t, on(to)), `${t.key} on close day`).toBe(true);
        }
    });

    it('the Diwali window actually covers Diwali', () => {
        // The point of a seasonal theme is being live for its occasion. A window
        // that mechanically works but closes before the festival is a silent miss,
        // so this pins the semantic, not just the arithmetic.
        const diwali = themeByKey('diwali');
        expect(diwali).toBeDefined();
        expect(isThemeAvailable(diwali!, on('2026-11-08'))).toBe(true);   // Diwali 2026
        expect(isThemeAvailable(diwali!, on('2026-11-07'))).toBe(true);   // eve
        expect(isThemeAvailable(diwali!, on('2027-02-01'))).toBe(false);  // long gone
    });

    it('at least nine themes are offered today', () => {
        // The founder's floor. Seasonal windows mean the count is a function of
        // the date, so a window that silently lapses could drop the picker below
        // it without anyone noticing.
        expect(availableThemes(new Date()).length).toBeGreaterThanOrEqual(9);
    });

    it('twelve themes are offered on the day this shipped', () => {
        expect(availableThemes(on('2026-09-14')).length).toBe(12);
    });

    it('resolveThemeKey rescues an out-of-season or unknown selection', () => {
        expect(resolveThemeKey('worldcup')).not.toBe('worldcup');
        expect(resolveThemeKey('not-a-theme')).toBeTruthy();
        expect(themeByKey(resolveThemeKey('not-a-theme'))).toBeDefined();
        // An in-season pick is returned untouched.
        expect(resolveThemeKey('animate')).toBe('animate');
    });

    it('localDayKey uses local calendar days, not UTC', () => {
        // A date-only string parsed as a Date is UTC midnight, which lands on the
        // previous day for anyone west of Greenwich. Seasons are calendar things,
        // so they are compared as local yyyy-mm-dd strings instead.
        expect(localDayKey(new Date(2026, 10, 8, 23, 30))).toBe('2026-11-08');
        expect(localDayKey(new Date(2026, 0, 1, 0, 1))).toBe('2026-01-01');
    });
});

describe('composite prompt', () => {
    it('assigns the four themes to quadrants in order', () => {
        const prompt = buildCompositePrompt(['figurine', 'movie', 'digicam', 'yearbook']);
        const tl = prompt.indexOf('TOP-LEFT');
        const tr = prompt.indexOf('TOP-RIGHT');
        const bl = prompt.indexOf('BOTTOM-LEFT');
        const br = prompt.indexOf('BOTTOM-RIGHT');
        expect(tl).toBeGreaterThan(-1);
        expect(tr).toBeGreaterThan(tl);
        expect(bl).toBeGreaterThan(tr);
        expect(br).toBeGreaterThan(bl);

        // The order here must match quadrantRects' TL/TR/BL/BR output order, or
        // every pane gets labelled with the wrong theme and the whole comparison
        // is nonsense in a way that looks like the model ignoring the prompt.
        expect(prompt.slice(tl, tr)).toContain(COMPOSITE_DIRECTIVES.figurine);
        expect(prompt.slice(tr, bl)).toContain(COMPOSITE_DIRECTIVES.movie);
        expect(prompt.slice(bl, br)).toContain(COMPOSITE_DIRECTIVES.digicam);
        expect(prompt.slice(br)).toContain(COMPOSITE_DIRECTIVES.yearbook);
    });

    it('carries the identity lock and the grid geometry rules', () => {
        const prompt = buildCompositePrompt(['animate', 'tabloid', 'movie', 'rock']);
        expect(prompt).toContain('IDENTITY LOCK');
        // Anything the model draws between panes — a border, a caption strip —
        // shifts content off the mathematical quarters and misaligns every crop.
        expect(prompt).toContain('NO borders');
        expect(prompt).toContain('NO text labels');
        expect(prompt).toContain('exactly equal in size');
    });

    it('tolerates unknown keys and over-long lists', () => {
        expect(() => buildCompositePrompt(['nope', 'also-nope'])).not.toThrow();
        const five = buildCompositePrompt(['animate', 'movie', 'rock', 'agra', 'tabloid']);
        // Only four quadrants exist; the fifth must be dropped, not squeezed in.
        expect(five).not.toContain(COMPOSITE_DIRECTIVES.tabloid);
    });
});

describe('quadrant geometry', () => {
    it('splits into exact quarters at zero inset', () => {
        const r = quadrantRects(1000, 800, 0);
        expect(r).toHaveLength(4);
        for (const q of r) {
            expect(q.w).toBe(500);
            expect(q.h).toBe(400);
        }
        // TL, TR, BL, BR — the order the composite prompt assigns themes in.
        expect(r[0]).toEqual({ x: 0, y: 0, w: 500, h: 400 });
        expect(r[1]).toEqual({ x: 500, y: 0, w: 500, h: 400 });
        expect(r[2]).toEqual({ x: 0, y: 400, w: 500, h: 400 });
        expect(r[3]).toEqual({ x: 500, y: 400, w: 500, h: 400 });
    });

    it('covers the whole image with no overlap at zero inset', () => {
        const r = quadrantRects(1024, 1024, 0);
        const area = r.reduce((sum, q) => sum + q.w * q.h, 0);
        expect(area).toBe(1024 * 1024);
    });

    it('inset shrinks each pane and keeps it inside its own quadrant', () => {
        const inset = 0.04;
        const r = quadrantRects(1000, 1000, inset);
        for (const q of r) {
            expect(q.w).toBeLessThan(500);
            expect(q.h).toBeLessThan(500);
        }
        // Top-left pane must not cross the centre seam into its neighbours.
        expect(r[0].x).toBeGreaterThan(0);
        expect(r[0].x + r[0].w).toBeLessThan(500);
        // Bottom-right pane must stay inside the image.
        expect(r[3].x + r[3].w).toBeLessThanOrEqual(1000);
        expect(r[3].y + r[3].h).toBeLessThanOrEqual(1000);
    });

    it('a 4K composite yields panes at least as large as a 2K solo generation', () => {
        // This is the whole fidelity argument in one assertion: 4K is ~2048px,
        // so a quarter of it is ~1024px — the same pixel count a 2K single
        // generation delivers. Panes are not a resolution compromise.
        const panes = quadrantRects(2048, 2048, 0);
        expect(panes[0].w).toBeGreaterThanOrEqual(1024);
    });
});


describe('collage theme draw', () => {
    it('draws four DISTINCT themes', () => {
        // A repeated theme would waste a pane on a look the sheet already has,
        // and the pane labels would name the same theme twice.
        for (let i = 0; i < 200; i++) {
            const picked = pickCollageThemes();
            expect(picked).toHaveLength(COLLAGE_PANES);
            expect(new Set(picked.map((t) => t.key)).size).toBe(COLLAGE_PANES);
        }
    });

    it('never draws a theme that is out of season', () => {
        const live = new Set(availableThemes().map((t) => t.key));
        for (let i = 0; i < 200; i++) {
            for (const t of pickCollageThemes()) {
                expect(live.has(t.key), `${t.key} is not in season`).toBe(true);
            }
        }
    });

    it('actually varies — it is a draw, not a fixed set', () => {
        // The whole point of randomising is that a second collage does not look
        // like the first. A shuffle bug that returned the pool's first four
        // every time would pass every other test in this block.
        const seen = new Set<string>();
        for (let i = 0; i < 200; i++) {
            seen.add(pickCollageThemes().map((t) => t.key).join(','));
        }
        expect(seen.size).toBeGreaterThan(20);
    });

    it('is deterministic under an injected rng', () => {
        const fixed = () => 0.42;
        expect(pickCollageThemes(4, new Date(), fixed).map((t) => t.key))
            .toEqual(pickCollageThemes(4, new Date(), fixed).map((t) => t.key));
    });

    it('returns fewer rather than repeating when the pool is small', () => {
        // A season could in principle close enough windows to drop the roster
        // below four. Padding the grid by repeating a theme would be worse than
        // a short sheet.
        const picked = pickCollageThemes(99);
        expect(picked.length).toBe(availableThemes().length);
        expect(new Set(picked.map((t) => t.key)).size).toBe(picked.length);
    });

    it('quadrant labels line up with the rects they name', () => {
        // The label strip, the crop order, and the order the prompt assigns
        // themes in must all agree, or every panel is captioned with the wrong
        // theme — which looks like the model ignoring the prompt.
        expect(QUADRANT_LABELS).toHaveLength(quadrantRects(100, 100).length);
        expect(QUADRANT_LABELS).toHaveLength(COLLAGE_PANES);
    });
});
