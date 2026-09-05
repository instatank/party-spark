import { describe, it, expect } from 'vitest';
import {
    dealGame, placeCard, correctGap, gapIsCorrect, assertLine, formatValue,
    HAND_SIZE, SOLO_LIVES, soloOver, LineInvariantError,
    type GameState, type LineCard, type LineDeck, type LineData,
} from '../src/services/lineEngine';
import raw from '../src/data/the_line.json';

const data = raw as unknown as LineData;

// ---------------------------------------------------------------------------
// The invariant, re-implemented here on purpose. The engine checks itself in
// `assertLine`; a test that only called that would be asking the accused to
// testify. This version is written from the rule, not from the code.
// ---------------------------------------------------------------------------
const violation = (s: GameState, cards: readonly LineCard[]): string | null => {
    const piles = [s.order, ...s.hands, s.discard, s.draw];
    const all = piles.flat();
    if (all.length !== cards.length) return `${all.length} cards in play, deck has ${cards.length}`;
    if (new Set(all).size !== all.length) return 'a card is in two places at once';
    for (let i = 1; i < s.order.length; i++) {
        if (!(cards[s.order[i]].value > cards[s.order[i - 1]].value)) {
            return `the line falls at ${i}: ${cards[s.order[i - 1]].label} then ${cards[s.order[i]].label}`;
        }
    }
    return null;
};

// A deck whose AUTHORED ORDER deliberately disagrees with its value order.
// The shipped JSON is authored ascending, so a comparison that used the deck
// index instead of the value would look perfect on real data forever. This
// deck is the only thing that can see that bug.
const scrambled: LineCard[] = [
    { id: 'a', label: 'nine', value: 9, note: '' },
    { id: 'b', label: 'two', value: 2, note: '' },
    { id: 'c', label: 'seven', value: 7, note: '' },
    { id: 'd', label: 'one', value: 1, note: '' },
    { id: 'e', label: 'five', value: 5, note: '' },
    { id: 'f', label: 'twelve', value: 12, note: '' },
    { id: 'g', label: 'three', value: 3, note: '' },
    { id: 'h', label: 'eight', value: 8, note: '' },
    { id: 'i', label: 'four', value: 4, note: '' },
    { id: 'j', label: 'eleven', value: 11, note: '' },
    { id: 'k', label: 'six', value: 6, note: '' },
    { id: 'l', label: 'ten', value: 10, note: '' },
];

// Deterministic PRNG so a failure is reproducible.
const lcg = (seed: number) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
};

/** Play a whole game, checking the invariant after EVERY placement. */
const playOut = (
    cards: readonly LineCard[], players: number, rnd: () => number, accuracy: number,
): { truths: number[]; state: GameState; turns: number } => {
    let s = dealGame(cards, players, rnd);
    const truths: number[] = [];
    let turns = 0;
    let seat = 0;
    while (turns < 500 && s.hands.every(h => h.length > 0)) {
        const hand = s.hands[seat];
        const cardIdx = hand[Math.floor(rnd() * hand.length)];
        const truth = correctGap(s.order, cards, cardIdx);
        truths.push(truth);
        // Play correctly most of the time, otherwise pick any other gap — the
        // miss branch has to be exercised or half the mutations never run.
        let gap = truth;
        if (rnd() > accuracy && s.order.length > 0) {
            gap = Math.floor(rnd() * (s.order.length + 1));
        }
        const out = placeCard(s, cards, seat, cardIdx, gap);
        expect(out.correct).toBe(gap === truth);
        s = out.state;
        const bad = violation(s, cards);
        if (bad) throw new Error(`turn ${turns}: ${bad}`);
        seat = (seat + 1) % players;
        turns += 1;
    }
    return { truths, state: s, turns };
};

describe('the line invariant', () => {
    for (const deck of data.decks) {
        it(`${deck.name}: 60 full games stay sorted and never lose or clone a card`, () => {
            const rnd = lcg(deck.id.length * 7919 + 11);
            for (let g = 0; g < 60; g++) {
                const players = 1 + Math.floor(rnd() * 8);
                const { state, turns } = playOut(deck.cards, players, rnd, 0.7);
                expect(turns).toBeGreaterThan(0);
                expect(violation(state, deck.cards)).toBeNull();
                // the engine's own checker must agree with ours
                expect(() => assertLine(state, deck.cards)).not.toThrow();
                // somebody emptied a hand, and only by placing correctly
                const done = state.hands.findIndex(h => h.length === 0);
                expect(done).toBeGreaterThanOrEqual(0);
                expect(state.placed[done] + state.misses[done]).toBeGreaterThanOrEqual(HAND_SIZE);
            }
        });
    }

    it('holds on a deck whose authored order disagrees with its values', () => {
        const rnd = lcg(4242);
        for (let g = 0; g < 200; g++) {
            const { state } = playOut(scrambled, 2, rnd, 0.6);
            expect(violation(state, scrambled)).toBeNull();
            // the placed line must rise by VALUE — not by deck index
            const vals = state.order.map(i => scrambled[i].value);
            expect(vals).toEqual([...vals].sort((a, b) => a - b));
        }
    });

    it('a wrong placement never touches the line, and is replaced while the pile lasts', () => {
        const s = dealGame(scrambled, 2, lcg(9));
        const card = s.hands[0][0];
        const truth = correctGap(s.order, scrambled, card);
        const wrong = truth === 0 ? 1 : 0;
        const out = placeCard(s, scrambled, 0, card, wrong);
        expect(out.correct).toBe(false);
        expect(out.state.order).toEqual(s.order);
        expect(out.state.discard).toContain(card);
        expect(out.state.hands[0]).not.toContain(card);
        expect(out.state.hands[0]).toHaveLength(HAND_SIZE);   // replaced
        expect(out.state.misses[0]).toBe(1);
        expect(violation(out.state, scrambled)).toBeNull();
    });

    it('a correct placement shrinks a multiplayer hand but refills a solo run', () => {
        // multiplayer: the hand shrinks, which is the only way anyone wins
        const multi = dealGame(scrambled, 2, lcg(21));
        const c1 = multi.hands[0][0];
        const a = placeCard(multi, scrambled, 0, c1, correctGap(multi.order, scrambled, c1));
        expect(a.correct).toBe(true);
        expect(a.state.hands[0]).toHaveLength(HAND_SIZE - 1);
        expect(a.state.order).toContain(c1);

        // solo: it refills, so the run keeps going until the lives are spent
        const one = dealGame(scrambled, 1, lcg(21));
        expect(one.endless).toBe(true);
        const c2 = one.hands[0][0];
        const b = placeCard(one, scrambled, 0, c2, correctGap(one.order, scrambled, c2));
        expect(b.correct).toBe(true);
        expect(b.state.hands[0]).toHaveLength(HAND_SIZE);
        expect(violation(b.state, scrambled)).toBeNull();
    });

    it('a solo run really ends — on three misses, or on a deck run dry', () => {
        const rnd = lcg(88);
        for (let g = 0; g < 60; g++) {
            let s = dealGame(scrambled, 1, rnd);
            let turns = 0;
            while (!soloOver(s) && turns < 400) {
                const card = s.hands[0][Math.floor(rnd() * s.hands[0].length)];
                const truth = correctGap(s.order, scrambled, card);
                const gap = rnd() > 0.55 ? truth : (truth === 0 ? 1 : 0);
                s = placeCard(s, scrambled, 0, card, gap).state;
                expect(violation(s, scrambled)).toBeNull();
                turns += 1;
            }
            expect(soloOver(s)).toBe(true);
            expect(s.misses[0] >= SOLO_LIVES || s.hands[0].length === 0).toBe(true);
        }
    });

    it('refuses a card the player does not hold, and a gap that is not a slot', () => {
        const s = dealGame(scrambled, 2, lcg(3));
        const notMine = s.hands[1][0];
        expect(() => placeCard(s, scrambled, 0, notMine, 0)).toThrow(LineInvariantError);
        expect(() => placeCard(s, scrambled, 0, s.hands[0][0], 99)).toThrow(LineInvariantError);
        expect(() => placeCard(s, scrambled, 0, s.hands[0][0], -1)).toThrow(LineInvariantError);
    });

    it('catches a hand-rolled state that breaks either half of the rule', () => {
        const s = dealGame(scrambled, 2, lcg(5));
        // a card in two piles at once
        const cloned = { ...s, discard: [s.hands[0][0]] };
        expect(() => assertLine(cloned, scrambled)).toThrow(LineInvariantError);
        // a line that descends
        const two = placeCard(s, scrambled, 0, s.hands[0][0], correctGap(s.order, scrambled, s.hands[0][0])).state;
        if (two.order.length > 1) {
            const flipped = { ...two, order: [...two.order].reverse() };
            expect(() => assertLine(flipped, scrambled)).toThrow(LineInvariantError);
        }
    });

    it('rejects a deck with duplicate hidden values rather than serving an ambiguous gap', () => {
        const dupes = scrambled.map((c, i) => (i === 3 ? { ...c, value: scrambled[0].value } : c));
        expect(() => dealGame(dupes, 2, lcg(1))).toThrow(LineInvariantError);
    });
});

// ---------------------------------------------------------------------------
// Distribution — the properties no single game can show you (notes/07). A
// dealer can be perfectly correct and still hand out the same game every time.
// ---------------------------------------------------------------------------
describe('the deal is a game, not a formality', () => {
    it('correct gaps spread across the line instead of piling on one position', () => {
        const deck = data.decks[0].cards;
        const rnd = lcg(777);
        const truths: number[] = [];
        for (let g = 0; g < 120; g++) truths.push(...playOut(deck, 6, rnd, 1).truths);

        const counts = new Map<number, number>();
        for (const t of truths) counts.set(t, (counts.get(t) ?? 0) + 1);
        expect(counts.size).toBeGreaterThanOrEqual(8);
        const biggest = Math.max(...counts.values()) / truths.length;
        expect(biggest).toBeLessThan(0.45);
    });

    it('no fixed gap is a winning strategy — always guessing the same slot loses', () => {
        const deck = data.decks[1].cards;
        const rnd = lcg(31337);
        const truths: number[] = [];
        for (let g = 0; g < 120; g++) truths.push(...playOut(deck, 6, rnd, 1).truths);
        for (const fixed of [0, 1, 2]) {
            const rate = truths.filter(t => t === fixed).length / truths.length;
            expect(rate).toBeLessThan(0.35);
        }
    });

    it('the starter card varies, and never comes from the extremes of the deck', () => {
        for (const deck of data.decks) {
            const rnd = lcg(deck.cards.length);
            const starters = new Set<number>();
            const sorted = [...deck.cards].sort((a, b) => a.value - b.value);
            const third = Math.floor(sorted.length / 3);
            const lo = sorted[third].value;
            const hi = sorted[sorted.length - third - 1].value;
            for (let n = 0; n < 200; n++) {
                const s = dealGame(deck.cards, 2, rnd);
                const v = deck.cards[s.order[0]].value;
                expect(v).toBeGreaterThanOrEqual(lo);
                expect(v).toBeLessThanOrEqual(hi);
                starters.add(s.order[0]);
            }
            expect(starters.size).toBeGreaterThanOrEqual(10);
        }
    });
});

describe('the shipped decks', () => {
    it('every deck can seat eight players and has unique values, labels and ids', () => {
        expect(data.decks.length).toBeGreaterThanOrEqual(4);
        for (const deck of data.decks as LineDeck[]) {
            expect(deck.cards.length).toBeGreaterThanOrEqual(8 * HAND_SIZE + 1);
            expect(new Set(deck.cards.map(c => c.value)).size).toBe(deck.cards.length);
            expect(new Set(deck.cards.map(c => c.label)).size).toBe(deck.cards.length);
            expect(new Set(deck.cards.map(c => c.id)).size).toBe(deck.cards.length);
            for (const c of deck.cards) {
                expect(Number.isFinite(c.value)).toBe(true);
                expect(c.note.length).toBeGreaterThan(0);
                expect(c.label.length).toBeGreaterThan(0);
            }
            expect(deck.units.length).toBeGreaterThan(0);
        }
    });

    it('no card label collides across decks — the drive looks cards up by name', () => {
        const all = data.decks.flatMap(d => d.cards.map(c => `${d.id}:${c.label}`));
        expect(new Set(all).size).toBe(all.length);
    });
});

describe('the unit ladder', () => {
    const kg = data.decks.find(d => d.id === 'heavy')!.units;
    const kmh = data.decks.find(d => d.id === 'fast')!.units;
    const year = data.decks.find(d => d.id === 'when')!.units;

    it('says numbers the way a person would', () => {
        expect(formatValue(0.058, kg)).toBe('58 g');
        expect(formatValue(7.26, kg)).toBe('7.26 kg');
        expect(formatValue(396890, kg)).toBe('397 tonnes');
        expect(formatValue(5900000000, kg)).toBe('5.9 million tonnes');
        expect(formatValue(1079252849, kmh)).toBe('1.08 billion km/h');
        expect(formatValue(0.05, kmh)).toBe('0.05 km/h');
        expect(formatValue(1969, year)).toBe('1969');
    });

    it('never turns two different values into the same string on one deck', () => {
        for (const deck of data.decks) {
            const shown = deck.cards.map(c => formatValue(c.value, deck.units));
            expect(new Set(shown).size).toBe(shown.length);
        }
    });
});

describe('gapIsCorrect', () => {
    it('agrees with correctGap and accepts exactly one slot', () => {
        const s = dealGame(scrambled, 2, lcg(17));
        const card = s.hands[0][0];
        const ok = [...Array(s.order.length + 1).keys()].filter(g => gapIsCorrect(s.order, scrambled, card, g));
        expect(ok).toEqual([correctGap(s.order, scrambled, card)]);
    });
});
