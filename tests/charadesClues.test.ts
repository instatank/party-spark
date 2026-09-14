import { describe, it, expect } from 'vitest';
import raw from '../src/data/charades_clues.json';
import {
    dealClues, packClues, packMenu, MIXED_PACK, MOVIE_PACKS,
    type CharadesClueData, type Clue,
} from '../src/services/charadesClues';

const data = raw as unknown as CharadesClueData;
const every: Clue[] = data.packs.flatMap(p => p.clues);
const words = (c: Clue) => c.t.trim().split(/\s+/).length;
const pack = (id: string) => data.packs.find(p => p.id === id)!;

// ---------------------------------------------------------------------------
// THE ONE-CLUE BAR.
//
// This deck exists as a better-written alternative to the original word list,
// which was a third one-word cards. The bar belongs on the GENERAL pack: the
// two movie packs are movie titles, and plenty of real films are called
// "Sholay" or "Rocky" — a one-word title with a whole plot behind it is fine.
// A general pack drifting back toward a list of nouns is the actual regression
// worth catching, and it is what a future "let's add 200 quick ones" would do.
// ---------------------------------------------------------------------------
describe('the one-clue bar', () => {
    it('keeps the general pack off one-word cards', () => {
        const general = pack('general').clues;
        const oneWord = general.filter(c => words(c) === 1).length;
        expect(oneWord / general.length).toBeLessThan(0.1); // the original deck sits at ~32%
    });

    it('gives an actor something to do in the general pack', () => {
        const general = pack('general').clues;
        const avg = general.reduce((n, c) => n + words(c), 0) / general.length;
        expect(avg).toBeGreaterThan(4);
    });

    it('fills every pack deep enough for a round', () => {
        // A round deals 30 cards. A pack thinner than that repeats within one
        // round, which is the one content failure a player notices immediately.
        for (const p of data.packs) expect(p.clues.length, p.id).toBeGreaterThanOrEqual(30);
    });
});

// ---------------------------------------------------------------------------
// Structural sanity. Cheap, and each one has a way of going wrong by hand.
// ---------------------------------------------------------------------------
describe('charades_clues.json', () => {
    it('declares every kind it uses', () => {
        for (const c of every) expect(Object.keys(data.kinds)).toContain(c.k);
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

    // The founder asked for exactly these decks: Hollywood, Bollywood, the two
    // mixed, and one general pack for everything that is not a film. The
    // picker (PACK_META in CharadesGame) is keyed by these ids — a new pack
    // without an icon there falls back to the Mixed styling silently.
    it('ships exactly the packs the game has art for', () => {
        expect(data.packs.map(p => p.id)).toEqual(['hollywood', 'bollywood', 'general']);
        expect(packMenu(data).map(p => p.id)).toEqual([MIXED_PACK, 'hollywood', 'bollywood', 'general']);
    });

    it('keeps the movie packs to films and the general pack off them', () => {
        for (const id of MOVIE_PACKS) {
            for (const c of pack(id).clues) expect(c.k, `${id}: ${c.t}`).toBe('MOVIE');
        }
        for (const c of pack('general').clues) expect(c.k, c.t).not.toBe('MOVIE');
    });
});

// ---------------------------------------------------------------------------
// dealClues / packClues — a round's worth of cards, shuffled, no repeats.
// ---------------------------------------------------------------------------
describe('dealing a round', () => {
    const pool = packClues(data, MIXED_PACK);

    it('builds Mixed from the two movie packs and nothing else', () => {
        expect(pool.length).toBe(pack('hollywood').clues.length + pack('bollywood').clues.length);
        // The general pack must NOT leak into a movie mix.
        const generalTexts = new Set(pack('general').clues.map(c => c.t));
        for (const c of pool) expect(generalTexts.has(c.t)).toBe(false);
        expect(packClues(data, 'nope')).toEqual([]);
    });

    it('deals exactly what was asked for, with no card twice', () => {
        for (const n of [1, 5, 30]) {
            for (let run = 0; run < 40; run++) {
                const got = dealClues(pool, n);
                expect(got.length).toBe(n);
                expect(new Set(got.map(c => c.t)).size).toBe(n);
            }
        }
    });

    it('never invents a card that is not in the pool', () => {
        const inPool = new Set(pool.map(c => c.t));
        for (const c of dealClues(pool, 30)) expect(inPool.has(c.t)).toBe(true);
    });

    it('gives up gracefully when the pool is smaller than the round', () => {
        const tiny = pool.slice(0, 4);
        const got = dealClues(tiny, 30);
        expect(got.length).toBe(4);
        expect(new Set(got.map(c => c.t)).size).toBe(4);
        expect(dealClues([], 5)).toEqual([]);
    });

    // A shuffle, not an ordering: no card should be stuck near the top of the
    // deal. Deliberately loose — this catches "slice(0, n) off an unshuffled
    // pool", not a subtly biased Fisher-Yates.
    it('shuffles rather than dealing off the top', () => {
        const first = new Set<string>();
        for (let i = 0; i < 60; i++) first.add(dealClues(pool, 5)[0].t);
        expect(first.size).toBeGreaterThan(30);
    });
});
