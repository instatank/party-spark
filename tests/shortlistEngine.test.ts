import { describe, it, expect } from 'vitest';
import boardsData from '../src/data/shortlist.json';
import { buildCase, allPredicates, lettersOf, pointsFor, MAX_CLUES, type ShortlistData } from '../src/services/shortlistEngine';

// Shortlist's whole premise is that a case can always be closed by deduction
// rather than a coin flip. That is a property of the generator, not of any one
// case, so it is checked over a few thousand randomly-built cases per board —
// one green case would prove nothing.
const data = boardsData as unknown as ShortlistData;
const CASES_PER_BOARD = 3000;

describe('shortlist boards', () => {
    for (const board of data.boards) {
        it(`${board.id}: every pair of suspects is distinguishable`, () => {
            const sig = (i: (typeof board.items)[number]) =>
                board.attrs.map(a => String(i.a[a.k])).join('|') + '|' + lettersOf(i.w);
            const seen = new Map<string, string>();
            for (const it of board.items) {
                const s = sig(it);
                expect(seen.has(s), `${it.w} is indistinguishable from ${seen.get(s)}`).toBe(false);
                seen.set(s, it.w);
            }
            expect(board.items).toHaveLength(16);
        });

        it(`${board.id}: every authored attribute value has a clue phrase`, () => {
            for (const a of board.attrs) {
                for (const it of board.items) {
                    expect(it.a[a.k], `${it.w} is missing ${a.k}`).toBeDefined();
                    if (a.kind === 'cat') expect(a.phrase?.[String(it.a[a.k])]).toBeTruthy();
                }
                if (a.kind === 'bool') { expect(a.yes).toBeTruthy(); expect(a.no).toBeTruthy(); }
            }
            expect(allPredicates(board).length).toBeGreaterThan(10);
        });
    }
});

describe('buildCase holds the case invariant', () => {
    for (const board of data.boards) {
        it(`${board.id}: ${CASES_PER_BOARD} cases all narrow to exactly one suspect`, () => {
            const solvedIn: number[] = [];
            let sameKeyRuns = 0;
            for (let n = 0; n < CASES_PER_BOARD; n++) {
                const c = buildCase(board);
                const suspect = board.items[c.secret];

                expect(c.clues.length).toBeGreaterThan(0);
                expect(c.clues.length).toBeLessThanOrEqual(MAX_CLUES);
                // no clue is repeated
                expect(new Set(c.clues.map(p => p.text)).size).toBe(c.clues.length);

                let prev = board.items.length;
                c.clues.forEach((clue, i) => {
                    // 1. every clue is true of the hidden suspect
                    expect(clue.holds(suspect), `"${clue.text}" is false of ${suspect.w}`).toBe(true);
                    const survivors = c.survivorsAfter[i];
                    // 2. the suspect survives it
                    expect(survivors).toContain(c.secret);
                    // survivorsAfter really is what the clue leaves standing
                    const recomputed = board.items
                        .map((_, idx) => idx)
                        .filter(idx => c.clues.slice(0, i + 1).every(p => p.holds(board.items[idx])));
                    expect(survivors).toEqual(recomputed);
                    // 3. it strictly narrows the field
                    expect(survivors.length).toBeLessThan(prev);
                    prev = survivors.length;
                });
                // 4. the last clue leaves exactly one suspect
                expect(prev).toBe(1);
                expect(c.survivorsAfter[c.survivorsAfter.length - 1][0]).toBe(c.secret);
                // two clues in a row about the same attribute read like the
                // app running out of ideas; the generator avoids it whenever
                // another attribute can still narrow the field
                for (let i = 1; i < c.clues.length; i++) {
                    if (c.clues[i].key === c.clues[i - 1].key) sameKeyRuns += 1;
                }
                solvedIn.push(c.clues.length);
            }
            // Chain length must actually VARY. A generator that halves the
            // board every time lands on exactly four clues for all 16-suspect
            // cases, which silently flattens the whole scoring curve: every
            // case pays the same and guessing early is never a real gamble.
            const lengths = new Set(solvedIn);
            expect(lengths.size, `every case took ${[...lengths]} clues`).toBeGreaterThanOrEqual(3);
            expect(Math.min(...solvedIn)).toBeLessThanOrEqual(3);
            expect(Math.max(...solvedIn)).toBeGreaterThanOrEqual(5);
            const totalPairs = solvedIn.reduce((a, b) => a + b - 1, 0);
            expect(sameKeyRuns / totalPairs, 'too many back-to-back clues about the same attribute').toBeLessThan(0.1);
            const avg = solvedIn.reduce((a, b) => a + b, 0) / solvedIn.length;
            expect(avg).toBeGreaterThan(2);
            expect(avg).toBeLessThan(MAX_CLUES);
        });
    }
});

describe('scoring', () => {
    it('pays less the more clues it took, and floors at 2', () => {
        expect(pointsFor(1)).toBe(10);
        expect([1, 2, 3, 4, 5, 6].map(pointsFor)).toEqual([10, 8, 6, 4, 3, 2]);
        expect(pointsFor(7)).toBe(2);
        for (let n = 1; n < 6; n++) expect(pointsFor(n)).toBeGreaterThan(pointsFor(n + 1));
    });
});
