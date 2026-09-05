// ---------------------------------------------------------------------------
// Shortlist — the clue engine.
//
// The app hides one suspect on a 16-tile board and then feeds the table
// truthful clues, one at a time. Nothing is authored per case: clues are
// generated from each suspect's structured attributes, which is what lets
// three small boards produce an endless supply of cases.
//
// THE CASE INVARIANT, which everything below exists to guarantee:
//   1. every clue shown is TRUE of the hidden suspect;
//   2. the suspect therefore survives every clue;
//   3. each clue strictly shrinks the surviving set;
//   4. the last clue leaves exactly ONE suspect standing.
//
// (4) is what makes the game fair — a case can always be closed by pure
// deduction, never by a coin flip. It holds because every pair of suspects on
// a board differs on at least one attribute (asserted by the drive), so while
// two or more survive there is always a clue true of the suspect and false of
// a rival. `buildCase` throws rather than hand the UI a case that breaks it.
// ---------------------------------------------------------------------------

export interface SLItem { e: string; w: string; a: Record<string, string | number | boolean>; }

export interface SLAttr {
    k: string;
    kind: 'cat' | 'num' | 'bool';
    phrase?: Record<string, string>;   // cat: value -> "a mammal"
    yes?: string;                      // bool: "can fly"
    no?: string;                       // bool: "cannot fly"
    more?: string;                     // num: "has more than {n} legs"
    fewer?: string;
    exact?: string;
    zero?: string;                     // num: nicer phrasing for 0
}

export interface SLBoard {
    id: string; name: string; tagline: string; emoji: string;
    cases: string[]; attrs: SLAttr[]; items: SLItem[];
}
export interface ShortlistData { boards: SLBoard[]; }

export const MAX_CLUES = 6;

/** Letters in a suspect's name, ignoring spaces. */
export const lettersOf = (w: string): number => (w.match(/[a-z]/gi) ?? []).length;

// Name length is derived rather than authored: it is what keeps two otherwise
// identical suspects (Eagle and Owl share all six creature attributes)
// distinguishable, so invariant (4) still holds for them.
const LETTERS_KEY = '__letters';
const LETTERS_ATTR: SLAttr = {
    k: LETTERS_KEY, kind: 'num',
    more: 'has more than {n} letters in its name',
    fewer: 'has fewer than {n} letters in its name',
    exact: 'has exactly {n} letters in its name',
};

const valueOf = (it: SLItem, k: string): string | number | boolean =>
    (k === LETTERS_KEY ? lettersOf(it.w) : it.a[k]);

export interface Predicate { text: string; key: string; holds: (it: SLItem) => boolean; }

/**
 * Every clue this board can express, in a deterministic order. A test harness
 * can rebuild the identical set from the same JSON and map a clue's rendered
 * text back to the suspects it keeps — which is how the drive checks the
 * invariant without trusting anything the app told it.
 */
export function allPredicates(board: SLBoard): Predicate[] {
    const out: Predicate[] = [];
    for (const a of [...board.attrs, LETTERS_ATTR]) {
        if (a.kind === 'cat') {
            const vals = [...new Set(board.items.map(i => String(valueOf(i, a.k))))].sort();
            for (const v of vals) {
                const p = a.phrase?.[v] ?? v;
                out.push({ text: `is ${p}`, key: a.k, holds: i => String(valueOf(i, a.k)) === v });
                out.push({ text: `is not ${p}`, key: a.k, holds: i => String(valueOf(i, a.k)) !== v });
            }
        } else if (a.kind === 'bool') {
            if (a.yes) out.push({ text: a.yes, key: a.k, holds: i => valueOf(i, a.k) === true });
            if (a.no) out.push({ text: a.no, key: a.k, holds: i => valueOf(i, a.k) !== true });
        } else {
            const vals = [...new Set(board.items.map(i => Number(valueOf(i, a.k))))].sort((x, y) => x - y);
            for (const n of vals) {
                if (n === 0 && a.zero) out.push({ text: a.zero, key: a.k, holds: i => Number(valueOf(i, a.k)) === 0 });
                else if (a.exact) out.push({ text: a.exact.replace('{n}', String(n)), key: a.k, holds: i => Number(valueOf(i, a.k)) === n });
                if (a.more) out.push({ text: a.more.replace('{n}', String(n)), key: a.k, holds: i => Number(valueOf(i, a.k)) > n });
                if (a.fewer) out.push({ text: a.fewer.replace('{n}', String(n)), key: a.k, holds: i => Number(valueOf(i, a.k)) < n });
            }
        }
    }
    return out;
}

/** The full sentence the table reads out. */
export const clueSentence = (p: Predicate): string => `Our suspect ${p.text}.`;

export interface BuiltCase {
    secret: number;
    clues: Predicate[];
    /** survivorsAfter[i] = indices still standing once clue i has been read. */
    survivorsAfter: number[][];
}

/** How many clues a case should ideally take. Weighted towards four: a
 *  three-clue case is a sprint, a five-clue case is a slog. */
const CHAIN_LENGTHS = [3, 3, 4, 4, 4, 5, 5];

/**
 * Build one case.
 *
 * The narrowing curve matters more than it looks. Halving the board every time
 * sounds right and is wrong: on a 16-suspect board it lands on exactly four
 * clues, every single case, so the payout is always the same and "do we know
 * enough yet?" stops being a question. Instead each case picks a target chain
 * length and follows a geometric curve to one survivor over exactly that many
 * clues — so a three-clue case really is worth gambling on early, and a
 * five-clue case really does grind.
 *
 * Falls back to the fastest-possible chain if the curve overruns MAX_CLUES.
 */
export function buildCase(board: SLBoard, maxClues: number = MAX_CLUES, rnd: () => number = Math.random): BuiltCase {
    const items = board.items;
    const secret = Math.floor(rnd() * items.length);
    const preds = allPredicates(board);

    const attempt = (greedy: boolean, wanted: number): BuiltCase | null => {
        let survivors = items.map((_, i) => i);
        const clues: Predicate[] = [];
        const survivorsAfter: number[][] = [];
        const used = new Set<string>();

        while (survivors.length > 1) {
            if (clues.length >= maxClues) return null;
            const all = preds
                .filter(p => !used.has(p.text) && p.holds(items[secret]))
                .map(p => ({ p, next: survivors.filter(i => p.holds(items[i])) }))
                // must keep the suspect (>=1) and must actually narrow the field
                .filter(o => o.next.length >= 1 && o.next.length < survivors.length);
            if (!all.length) return null;
            const lastKey = clues[clues.length - 1]?.key;
            const varied = all.filter(o => o.p.key !== lastKey);
            const opts = varied.length ? varied : all;

            let chosen: { p: Predicate; next: number[] };
            if (greedy) {
                const min = Math.min(...opts.map(o => o.next.length));
                const best = opts.filter(o => o.next.length === min);
                chosen = best[Math.floor(rnd() * best.length)];
            } else {
                // geometric descent from the full board to exactly one survivor
                // across `wanted` clues
                const step = clues.length + 1;
                const target = Math.max(1, Math.round(Math.pow(items.length, (wanted - step) / wanted)));
                const scored = opts
                    .map(o => ({ o, d: Math.abs(o.next.length - target) }))
                    .sort((x, y) => x.d - y.d);
                const band = scored.filter(s => s.d === scored[0].d);
                chosen = band[Math.floor(rnd() * band.length)].o;
            }
            used.add(chosen.p.text);
            clues.push(chosen.p);
            survivors = chosen.next;
            survivorsAfter.push([...survivors]);
        }
        return { secret, clues, survivorsAfter };
    };

    const wanted = CHAIN_LENGTHS[Math.floor(rnd() * CHAIN_LENGTHS.length)];
    for (let i = 0; i < 12; i++) {
        const c = attempt(false, wanted);
        if (c) return c;
    }
    // the wanted length may be unreachable for this suspect — try the others
    for (const alt of [...new Set(CHAIN_LENGTHS)]) {
        const c = attempt(false, alt);
        if (c) return c;
    }
    const g = attempt(true, wanted);
    if (g) return g;
    // Unreachable for a sound board; better a loud failure than a case the
    // table cannot possibly close.
    throw new Error(`shortlist: no solvable case for board "${board.id}"`);
}

/** Points for closing a case, by how many clues it took. Floors at 2. */
export const POINTS_BY_CLUES = [10, 8, 6, 4, 3, 2];
export const pointsFor = (cluesUsed: number): number => POINTS_BY_CLUES[cluesUsed - 1] ?? 2;
