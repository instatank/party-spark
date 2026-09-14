import { describe, it, expect } from 'vitest';
import { mulberry32, seededShuffle, newSeed, roundSeed } from '../src/services/seededRandom';
import { dealPuzzle } from '../src/services/targetEngine';
import { dealGame, assertLine, type LineCard } from '../src/services/lineEngine';

// =============================================================================
// THE ROOM INVARIANT
//
//   Two devices holding the same seed and the same round number must produce
//   BYTE-IDENTICAL content, without exchanging any of that content.
//
// This is what lets multiplayer send a 4-byte integer instead of a question
// bank, and it is the single assumption every synced game rests on. If it ever
// breaks, two players sit in the same room looking at different puzzles and
// comparing scores that were never comparable — a bug that would look like a
// scoring problem and be nothing of the kind.
//
// The tests below deliberately re-derive content through TWO independent
// generator instances, the way two phones would, rather than calling one
// generator twice. Reusing a single stream would pass even if the seed were
// being ignored entirely.
// =============================================================================

const DEVICES = 2;
const TRIALS = 200;

describe('mulberry32', () => {
    it('produces an identical stream on two independent instances', () => {
        for (let t = 0; t < TRIALS; t++) {
            const seed = newSeed();
            const phoneA = mulberry32(seed);
            const phoneB = mulberry32(seed);
            for (let i = 0; i < 25; i++) expect(phoneA()).toBe(phoneB());
        }
    });

    it('produces different streams for different seeds', () => {
        // A generator that ignored its seed would satisfy every "identical"
        // assertion above, so pin the other half of the property too.
        const a = mulberry32(1);
        const b = mulberry32(2);
        const sameCount = Array.from({ length: 50 }, () => (a() === b() ? 1 : 0)).reduce((x: number, y: number) => x + y, 0);
        expect(sameCount).toBe(0);
    });

    it('stays inside [0, 1)', () => {
        const rnd = mulberry32(12345);
        for (let i = 0; i < 10_000; i++) {
            const v = rnd();
            expect(v).toBeGreaterThanOrEqual(0);
            expect(v).toBeLessThan(1);
        }
    });
});

describe('seededShuffle', () => {
    const pool = Array.from({ length: 40 }, (_, i) => `q${i}`);

    it('gives every device the same order, and does not mutate the source', () => {
        for (let t = 0; t < TRIALS; t++) {
            const seed = newSeed();
            const orders = Array.from({ length: DEVICES }, () => seededShuffle(pool, mulberry32(seed)));
            for (const order of orders) expect(order).toEqual(orders[0]);
            expect(pool[0]).toBe('q0');
        }
    });

    it('is a true permutation — nothing dropped, nothing duplicated', () => {
        for (let t = 0; t < TRIALS; t++) {
            const out = seededShuffle(pool, mulberry32(newSeed()));
            expect(out).toHaveLength(pool.length);
            expect([...out].sort()).toEqual([...pool].sort());
        }
    });

    it('actually reorders — a no-op shuffle would pass every test above', () => {
        // Guards the notes/07 failure class: provably correct, quietly useless.
        const identical = Array.from({ length: 100 }, (_, i) =>
            seededShuffle(pool, mulberry32(i)).join() === pool.join() ? 1 : 0,
        ).reduce((a: number, b: number) => a + b, 0);
        expect(identical).toBeLessThan(3);
    });
});

describe('roundSeed', () => {
    it('is stable per (seed, round) across devices', () => {
        for (let t = 0; t < TRIALS; t++) {
            const seed = newSeed();
            for (let round = 0; round < 8; round++) {
                expect(roundSeed(seed, round)).toBe(roundSeed(seed, round));
            }
        }
    });

    it('gives every round in a game a distinct seed', () => {
        // Without this, round 5 of a 5-round match deals what round 1 dealt and
        // the whole match is one puzzle repeated.
        for (let t = 0; t < TRIALS; t++) {
            const seed = newSeed();
            const seeds = Array.from({ length: 10 }, (_, r) => roundSeed(seed, r));
            expect(new Set(seeds).size).toBe(seeds.length);
        }
    });

    it('gives different rooms different content for the same round', () => {
        const perRoom = Array.from({ length: 500 }, () => roundSeed(newSeed(), 3));
        // Allow a couple of collisions from 32-bit birthday odds, but the
        // seeds must not be dominated by the round number.
        expect(new Set(perRoom).size).toBeGreaterThan(490);
    });
});

describe('content is reproducible from a seed alone', () => {
    it('Target deals the identical puzzle on every device', () => {
        for (let t = 0; t < 120; t++) {
            const seed = newSeed();
            const deals = Array.from({ length: DEVICES }, () =>
                dealPuzzle('classic', mulberry32(seed)));
            for (const d of deals) {
                expect(d.numbers).toEqual(deals[0].numbers);
                expect(d.target).toBe(deals[0].target);
                // The printed solution must match too — a near-miss reveal that
                // differed per device would be worse than no reveal at all.
                expect(d.solution).toEqual(deals[0].solution);
            }
        }
    });

    it('Target deals different puzzles across the rounds of one match', () => {
        const seed = newSeed();
        const targets = Array.from({ length: 5 }, (_, r) => dealPuzzle('classic', mulberry32(roundSeed(seed, r))).target);
        expect(new Set(targets).size).toBeGreaterThan(1);
    });

    it('The Line deals the identical game on every device, invariant intact', () => {
        // A synthetic deck, deliberately NOT in value order — the shipped JSON
        // happens to be sorted, which would hide an index/value confusion.
        const cards: LineCard[] = Array.from({ length: 60 }, (_, i) => ({
            id: `c${i}`,
            text: `card ${i}`,
            value: ((i * 37) % 60) + 1,
        })) as LineCard[];

        for (let t = 0; t < 60; t++) {
            const seed = newSeed();
            const games = Array.from({ length: DEVICES }, () => dealGame(cards, 2, mulberry32(seed)));
            for (const g of games) {
                expect(g.order).toEqual(games[0].order);
                expect(g.hands).toEqual(games[0].hands);
                expect(g.draw).toEqual(games[0].draw);
                // Determinism must not have come at the cost of a legal deal.
                expect(() => assertLine(g, cards)).not.toThrow();
            }
        }
    });
});
