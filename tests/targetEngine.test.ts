import { describe, it, expect } from 'vitest';
import {
    dealPuzzle, findSolution, applyOp, scoreFor, solvableWithAtMost, LARGE,
    type Difficulty, type Step,
} from '../src/services/targetEngine';

const DEALS = 400;

// Re-play a solution from scratch: each step must combine two numbers that are
// actually available at that moment, under the same legality rules the player's
// board enforces, and the last step must land exactly on the target.
const replay = (numbers: number[], target: number, steps: Step[]): true | string => {
    const pool = [...numbers];
    for (const s of steps) {
        const i = pool.indexOf(s.a);
        if (i < 0) return `${s.a} was not available`;
        pool.splice(i, 1);
        const j = pool.indexOf(s.b);
        if (j < 0) return `${s.b} was not available`;
        pool.splice(j, 1);
        const r = applyOp(s.a, s.op, s.b);
        if (r === null) return `${s.a} ${s.op} ${s.b} is an illegal move`;
        if (r !== s.r) return `${s.a} ${s.op} ${s.b} is ${r}, not ${s.r}`;
        pool.push(r);
    }
    return steps[steps.length - 1].r === target ? true : `ended on ${steps[steps.length - 1].r}, not ${target}`;
};

describe('the deal invariant', () => {
    for (const difficulty of ['classic', 'tough'] as Difficulty[]) {
        it(`${difficulty}: ${DEALS} deals are all exactly solvable, with a valid worked solution`, () => {
            const lens: number[] = [];
            for (let n = 0; n < DEALS; n++) {
                const p = dealPuzzle(difficulty);
                expect(p.numbers).toHaveLength(6);
                expect(p.target).toBeGreaterThanOrEqual(101);
                expect(p.target).toBeLessThanOrEqual(999);
                // the six numbers are a legal television selection
                const large = p.numbers.filter(x => LARGE.includes(x));
                expect(new Set(large).size).toBe(large.length);   // larges never repeat
                for (const x of p.numbers.filter(v => !LARGE.includes(v))) {
                    expect(x).toBeGreaterThanOrEqual(1);
                    expect(x).toBeLessThanOrEqual(10);
                }
                expect(p.solution.length).toBeGreaterThan(0);
                expect(replay(p.numbers, p.target, p.solution)).toBe(true);
                lens.push(p.solution.length);
            }
            // a game where every answer is one step is not a game
            expect(Math.max(...lens)).toBeGreaterThan(2);
        }, 60_000);
    }

    it('tough never deals a board with a three-number answer', () => {
        for (let n = 0; n < 60; n++) {
            const p = dealPuzzle('tough');
            expect(solvableWithAtMost(p.numbers, p.target, 3)).toBe(false);
        }
    }, 60_000);
});

describe('the rules the solver and the player share', () => {
    it('rejects fractions, zero and negatives', () => {
        expect(applyOp(10, '÷', 4)).toBeNull();
        expect(applyOp(4, '−', 4)).toBeNull();
        expect(applyOp(3, '−', 8)).toBeNull();
        expect(applyOp(12, '÷', 4)).toBe(3);
        expect(applyOp(7, '×', 6)).toBe(42);
        expect(applyOp(7, '+', 6)).toBe(13);
    });

    it('finds a known solution and reports honestly when there is none', () => {
        expect(findSolution([100, 75, 2], 350)).not.toBeNull();
        // 1 and 2 cannot reach 999 however they are combined
        expect(findSolution([1, 2], 999)).toBeNull();
    });
});

describe('scoring', () => {
    it('pays 10 / 7 / 5 / 0 by distance', () => {
        expect(scoreFor(500, 500)).toBe(10);
        expect(scoreFor(495, 500)).toBe(7);
        expect(scoreFor(505, 500)).toBe(7);
        expect(scoreFor(490, 500)).toBe(5);
        expect(scoreFor(489, 500)).toBe(0);
        expect(scoreFor(null, 500)).toBe(0);
    });
});
