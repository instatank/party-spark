import { describe, it, expect } from 'vitest';
import raw from '../src/data/charades_clues.json';
import { dealClues, packClues, MIX_PACK, type CharadesClueData, type Clue } from '../src/services/charadesClues';

const data = raw as unknown as CharadesClueData;
const every: Clue[] = data.packs.flatMap(p => p.clues);
const words = (c: Clue) => c.t.trim().split(/\s+/).length;

// ---------------------------------------------------------------------------
// THE ONE-CLUE BAR.
//
// This deck exists because the rapid-fire deck was the wrong shape for the way
// the game gets played: one clue, one 30/60s clock, land it or don't. A card
// that reads "Don" is three seconds of charades no matter how long the clock
// is, and the old dataset was a third one-word entries because it was built
// for a format that rewards volume.
//
// So the property worth pinning is not "clues are long" — a one-word title
// with a whole plot behind it (Drishyam, Titanic) is fine — it is that the
// deck as a whole cannot DRIFT BACK toward being a list of nouns. That is
// measurable, and it is the thing a future "let's add 200 quick ones" PR
// would quietly undo.
// ---------------------------------------------------------------------------
describe('the one-clue bar', () => {
    it('is not a list of one-word cards', () => {
        const oneWord = every.filter(c => words(c) === 1).length;
        expect(oneWord / every.length).toBeLessThan(0.12); // rapid-fire deck sits at ~32%
    });

    it('holds that bar pack by pack, not just on average', () => {
        for (const p of data.packs) {
            const share = p.clues.filter(c => words(c) === 1).length / p.clues.length;
            expect(share, `pack "${p.id}" is ${(share * 100).toFixed(0)}% one-word cards`).toBeLessThan(0.3);
        }
    });

    it('gives an actor something to do for a minute', () => {
        const avg = every.reduce((n, c) => n + words(c), 0) / every.length;
        expect(avg).toBeGreaterThan(4);
    });
});

// ---------------------------------------------------------------------------
// Structural sanity. Cheap, and each one has a way of going wrong by hand.
// ---------------------------------------------------------------------------
describe('charades_clues.json', () => {
    it('declares every kind it uses', () => {
        for (const c of every) expect(Object.keys(data.kinds)).toContain(c.k);
    });

    it('grades every clue 1-3', () => {
        for (const c of every) expect([1, 2, 3]).toContain(c.d);
    });

    it('never repeats a clue, in a pack or across them', () => {
        const seen = new Map<string, string>();
        for (const p of data.packs) {
            for (const c of p.clues) {
                const key = c.t.toLowerCase().replace(/[.!]+$/, '');
                expect(seen.has(key), `"${c.t}" is in both ${seen.get(key)} and ${p.id}`).toBe(false);
                seen.set(key, p.id);
            }
        }
    });

    it('has no clue too long to read off a phone', () => {
        for (const c of every) expect(c.t.length, c.t).toBeLessThanOrEqual(70);
    });

    // dealClues() opens easy and ends hard. A pack missing a tier silently
    // flattens that curve for every match played from it.
    it('stocks all three tiers in every pack', () => {
        for (const p of data.packs) {
            for (const tier of [1, 2, 3]) {
                expect(p.clues.some(c => c.d === tier), `pack "${p.id}" has no tier-${tier} clue`).toBe(true);
            }
        }
    });

    // The pack list the SETUP screen decorates (PACK_META in CharadesGame)
    // is keyed by these ids. Adding a pack here without an icon there falls
    // back to the Mix styling silently — this makes it fail loudly instead.
    it('ships exactly the packs the game has art for', () => {
        expect(data.packs.map(p => p.id)).toEqual(
            ['scenes', 'screen', 'desi', 'sayings', 'characters', 'family'],
        );
    });
});

// ---------------------------------------------------------------------------
// dealClues — a match is dealt whole, so its shape is a property of the deal.
// ---------------------------------------------------------------------------
describe('dealClues', () => {
    const pool = packClues(data, MIX_PACK);

    it('unions every pack under the Mix id', () => {
        expect(pool.length).toBe(every.length);
        expect(packClues(data, 'scenes').length).toBe(data.packs[0].clues.length);
        expect(packClues(data, 'nope')).toEqual([]);
    });

    it('deals exactly what was asked for, with no clue twice', () => {
        for (const n of [1, 3, 6, 14, 21]) {
            for (let run = 0; run < 40; run++) {
                const got = dealClues(pool, n);
                expect(got.length).toBe(n);
                expect(new Set(got.map(c => c.t)).size).toBe(n);
            }
        }
    });

    it('never invents a clue that is not in the pool', () => {
        const inPool = new Set(pool.map(c => c.t));
        for (const c of dealClues(pool, 30)) expect(inPool.has(c.t)).toBe(true);
    });

    it('gives up gracefully when the pool is smaller than the match', () => {
        const tiny = pool.slice(0, 4);
        const got = dealClues(tiny, 10);
        expect(got.length).toBe(4);
        expect(new Set(got.map(c => c.t)).size).toBe(4);
    });

    // The shape, stated independently of the implementation: across many
    // deals, the last clue of a match is harder than the first. A uniform
    // draw — the obvious thing to "simplify" this into — fails this.
    it('opens easier than it ends', () => {
        const N = 400, LEN = 6;
        let first = 0, last = 0;
        for (let i = 0; i < N; i++) {
            const m = dealClues(pool, LEN);
            first += m[0].d;
            last += m[LEN - 1].d;
        }
        expect(last / N).toBeGreaterThan(first / N + 0.8);
    });

    it('handles a one-clue match', () => {
        expect(dealClues(pool, 1).length).toBe(1);
        expect(dealClues([], 5)).toEqual([]);
    });
});
