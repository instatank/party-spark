import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import raw from '../src/data/five_alive.json';

// ---------------------------------------------------------------------------
// THE DECK PARITY BAR.
//
// 5 Alive's decks live in two places joined only by matching string keys: the
// tile catalog inside FiveAliveGame.tsx (what a player may pick) and the pools
// in five_alive.json (what gets dealt). A tile with no pool does NOT crash —
// drawTurnCategories does `(data as Record<Difficulty, string[]>)[diff] || []`,
// shuffles nothing and deals nothing, so the player taps the tile and gets five
// blank cards. That is invisible to the build, the typecheck and a browser
// drive that only opens Easy. Same failure class as the Roast theme registry
// (see tests/roastThemes.test.ts) — so it is pinned the same way, in both
// directions. The tile ids are read out of the component SOURCE rather than
// imported, because exporting a non-component from a component file trips
// react-refresh/only-export-components.
// ---------------------------------------------------------------------------

const pools = raw as unknown as Record<string, string[]>;
// vitest runs with the repo root as cwd; import.meta.url is not a file URL
// under the jsdom environment this suite shares with the render smoke test.
const source = readFileSync(resolve('src/components/games/FiveAliveGame.tsx'), 'utf8');

const tileIds = (() => {
    const block = source.match(/const DIFFICULTY_TILES[\s\S]*?\n\];/);
    if (!block) throw new Error('DIFFICULTY_TILES block not found in FiveAliveGame.tsx');
    return [...block[0].matchAll(/\bid:\s*'([a-z_]+)'/g)].map(m => m[1]);
})();

// Five categories per game (one per round). A deck under this is a deck that
// starts repeating itself inside a single evening.
const MIN_POOL = 150;
// The longest shipped category is 33 chars; the card truncates past ~34.
const MAX_LEN = 34;

// Normalised form used to catch near-duplicates the eye misses across 1,600
// entries: "Toolbox items" and "Things in a tool box" are the same round.
const STOP = new Set(['things', 'thing', 'stuff', 'items', 'item', 'a', 'an', 'the', 'in',
    'on', 'at', 'of', 'you', 'your', 'that', 'are', 'is', 'with', 'to', 'for', 'and',
    'them', 'it', 'their', 'every', 'some']);
const norm = (s: string) =>
    (s.toLowerCase().match(/[a-z0-9']+/g) ?? [])
        .filter(w => !STOP.has(w))
        .map(w => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
        .sort()
        .join(' ');

describe('5 Alive — deck catalog / pool parity', () => {
    it('finds the tile catalog', () => {
        expect(tileIds.length).toBeGreaterThanOrEqual(3);
    });

    it('every pickable tile has a pool with enough categories in it', () => {
        for (const id of tileIds) {
            expect(pools[id], `tile '${id}' has no pool in five_alive.json`).toBeDefined();
            expect(pools[id].length, `pool '${id}' is too small`).toBeGreaterThanOrEqual(MIN_POOL);
        }
    });

    it('every pool is reachable from a tile', () => {
        for (const id of Object.keys(pools)) {
            expect(tileIds, `pool '${id}' has no tile — nobody can ever play it`).toContain(id);
        }
    });
});

describe('5 Alive — category hygiene', () => {
    it('categories are trimmed, non-empty and short enough to fit the card', () => {
        for (const [id, pool] of Object.entries(pools)) {
            for (const c of pool) {
                expect(c, `${id}: empty category`).toBeTruthy();
                expect(c, `${id}: '${c}' has stray whitespace`).toBe(c.trim());
                expect(c.length, `${id}: '${c}' is ${c.length} chars`).toBeLessThanOrEqual(MAX_LEN);
                // A category is a prompt, not a sentence — no trailing punctuation.
                expect(/[.!?:;]$/.test(c), `${id}: '${c}' ends in punctuation`).toBe(false);
            }
        }
    });

    it('no pool repeats a category, even in a reworded form', () => {
        for (const [id, pool] of Object.entries(pools)) {
            const seen = new Map<string, string>();
            for (const c of pool) {
                const k = norm(c);
                expect(seen.has(k), `${id}: '${c}' duplicates '${seen.get(k)}'`).toBe(false);
                seen.set(k, c);
            }
        }
    });

    // easy / hard / spicy are the general-purpose trio — a player moves between
    // them looking for a different game, so a category may only live in one.
    // desi and kids are THEMED selections off the same everyday ground, so they
    // are allowed to reuse a general category; they just may not duplicate each
    // other.
    const exclusive: [string, string][] = [
        ['easy', 'hard'], ['easy', 'spicy'], ['hard', 'spicy'], ['desi', 'kids'],
    ];
    it.each(exclusive)('%s and %s share no category', (a, b) => {
        const left = new Map(pools[a].map(c => [norm(c), c]));
        for (const c of pools[b]) {
            expect(left.has(norm(c)), `'${c}' (${b}) duplicates '${left.get(norm(c))}' (${a})`).toBe(false);
        }
    });
});
