// ---------------------------------------------------------------------------
// Target — the arithmetic engine.
//
// Six numbers, one three-digit target, and the four operations. The phone
// earns its place by solving the puzzle too: at the buzzer it can show the way
// in, which is only possible because there is a search running in your pocket.
//
// THE DEAL INVARIANT: every puzzle Target hands out is exactly solvable, and
// the solution it shows is arithmetically valid — each step combines two
// numbers actually available at that moment, never divides unevenly, never
// goes negative, and the final step lands exactly on the target. `dealPuzzle`
// only returns a puzzle it has already solved, so "there was always a way" is
// a property of the dealer rather than a hope.
// tests/targetEngine.test.ts re-verifies it over thousands of deals in CI.
//
// The player-side rules in `applyOp` are deliberately the SAME rules the
// solver searches under, so nothing the app can find is a move the table is
// forbidden from making.
// ---------------------------------------------------------------------------

export type Op = '+' | '−' | '×' | '÷';

export interface Step { a: number; op: Op; b: number; r: number; }

export interface Puzzle {
    numbers: number[];
    target: number;
    solution: Step[];
}

export type Difficulty = 'classic' | 'tough';

export const LARGE = [25, 50, 75, 100];
export const ROUNDS = 5;

// Countdown's scoring, and it is hard to improve on: exact is worth a lot more
// than nearly, and past ten away nothing at all.
export const scoreFor = (best: number | null, target: number): number => {
    if (best === null) return 0;
    const d = Math.abs(best - target);
    if (d === 0) return 10;
    if (d <= 5) return 7;
    if (d <= 10) return 5;
    return 0;
};

/**
 * Apply one operation under the game's rules. Returns null when the move is
 * illegal, which is the single definition of legality shared by the solver and
 * the player's board: results must stay positive whole numbers.
 */
export const applyOp = (x: number, op: Op, y: number): number | null => {
    switch (op) {
        case '+': return x + y;
        case '×': return x * y;
        case '−': return x - y > 0 ? x - y : null;
        case '÷': return y !== 0 && x % y === 0 && x / y > 0 ? x / y : null;
    }
};

/**
 * Depth-first search for an exact solution, stopping at the first one found.
 *
 * Pruning that matters, in order of how much it saves:
 *  - each unordered pair is tried once (a+b is a+b), taking the larger first
 *    so subtraction and division never need the mirrored case;
 *  - a−b is skipped when a === b (a zero is never useful);
 *  - ×1 and ÷1 are skipped (they are no-ops that double the search tree);
 *  - a÷b only when it divides evenly.
 *
 * The pool is mutated in place and restored on the way out rather than copied
 * per branch — with six numbers the copying dominates everything else.
 */
export function findSolution(numbers: readonly number[], target: number): Step[] | null {
    const pool = [...numbers];
    const steps: Step[] = [];

    const search = (n: number): Step[] | null => {
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const x = pool[i];
                const y = pool[j];
                const a = x >= y ? x : y;
                const b = x >= y ? y : x;
                const savedI = pool[i];
                const savedJ = pool[j];
                const last = pool[n - 1];

                const tryOp = (op: Op, r: number): Step[] | null => {
                    steps.push({ a, op, b, r });
                    if (r === target) { const out = steps.slice(); steps.pop(); return out; }
                    if (n > 2) {
                        pool[i] = r;
                        pool[j] = last;
                        const got = search(n - 1);
                        pool[i] = savedI;
                        pool[j] = savedJ;
                        pool[n - 1] = last;
                        if (got) { steps.pop(); return got; }
                    }
                    steps.pop();
                    return null;
                };

                let got = tryOp('+', a + b);
                if (got) return got;
                if (a !== b) { got = tryOp('−', a - b); if (got) return got; }
                if (b !== 1) { got = tryOp('×', a * b); if (got) return got; }
                if (b !== 1 && a % b === 0) { got = tryOp('÷', a / b); if (got) return got; }
            }
        }
        return null;
    };

    return search(pool.length);
}

/** Is the target reachable using at most `k` of the numbers? Used to keep the
 *  Tough deal from having a two-move answer sitting in plain sight. */
export function solvableWithAtMost(numbers: readonly number[], target: number, k: number): boolean {
    const n = numbers.length;
    const subsets: number[][] = [];
    const build = (start: number, cur: number[]) => {
        if (cur.length >= 2 && cur.length <= k) subsets.push([...cur]);
        if (cur.length === k) return;
        for (let i = start; i < n; i++) { cur.push(numbers[i]); build(i + 1, cur); cur.pop(); }
    };
    build(0, []);
    return subsets.some(s => findSolution(s, target) !== null);
}

const pick = <T,>(arr: readonly T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length)];

const dealNumbers = (largeCount: number, rnd: () => number): number[] => {
    const large = [...LARGE];
    const out: number[] = [];
    for (let i = 0; i < largeCount; i++) out.push(...large.splice(Math.floor(rnd() * large.length), 1));
    // small numbers are 1-10, two of each, exactly as the television set works
    const small: number[] = [];
    for (let v = 1; v <= 10; v++) { small.push(v, v); }
    for (let i = 0; i < 6 - largeCount; i++) out.push(...small.splice(Math.floor(rnd() * small.length), 1));
    return out;
};

const RANGE: Record<Difficulty, { min: number; max: number; large: number[] }> = {
    classic: { min: 101, max: 499, large: [1, 2] },
    tough: { min: 300, max: 999, large: [2, 3, 4] },
};

/**
 * Deal a puzzle that is guaranteed exactly solvable.
 *
 * Unsolvable selections are simply re-rolled. Tough additionally rejects any
 * board the target can be reached on with three numbers or fewer, because a
 * board with a two-move answer is not tough, it is a coin toss over whether
 * someone spots it in the first five seconds.
 */
export function dealPuzzle(difficulty: Difficulty = 'classic', rnd: () => number = Math.random): Puzzle {
    const cfg = RANGE[difficulty];
    let fallback: Puzzle | null = null;

    for (let attempt = 0; attempt < 200; attempt++) {
        const numbers = dealNumbers(pick(cfg.large, rnd), rnd);
        const target = cfg.min + Math.floor(rnd() * (cfg.max - cfg.min + 1));
        const solution = findSolution(numbers, target);
        if (!solution) continue;
        const puzzle: Puzzle = { numbers, target, solution };
        if (difficulty === 'tough' && solvableWithAtMost(numbers, target, 3)) {
            // still a perfectly good puzzle — hold it in case Tough's extra
            // condition proves stubborn, rather than ever failing to deal
            fallback ??= puzzle;
            continue;
        }
        return puzzle;
    }
    if (fallback) return fallback;
    // Unreachable in practice; a guaranteed-solvable last resort beats a throw
    // in the middle of a party.
    return { numbers: [100, 75, 50, 25, 10, 1], target: 250, solution: findSolution([100, 75, 50, 25, 10, 1], 250)! };
}

/** "75 × 4 = 300" */
export const stepText = (s: Step): string => `${s.a} ${s.op} ${s.b} = ${s.r}`;
