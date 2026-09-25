import { describe, expect, it } from 'vitest';
import data from '../src/data/rank_me.json';
import {
    scoreRanking, tierFor, cardPool, pickCard, recordDeal, startingOrder,
    MAX_CARD_POINTS, type RankCard, type DealState,
} from '../src/services/rankMeEngine';

const cards = (data as { cards: RankCard[] }).cards;
const decks = (data as { categories: { id: string; spicy: boolean; count: number }[] }).categories;
const ABCDE = ['A', 'B', 'C', 'D', 'E'];
const seq = (s: string) => s.split('');

// Every permutation of five items, for exhaustive checks.
const perms = (xs: string[]): string[][] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map(p => [x, ...p]));

describe('Rank Me scoring (the brief\'s reference table)', () => {
    it.each([
        ['ABCDE', 14],
        ['BACDE', 11],
        ['ABCED', 11],
        ['EDCBA', 2],
        ['CDEAB', 0],
    ])('%s scores %i against ABCDE', (pred, expected) => {
        expect(scoreRanking(ABCDE, seq(pred)).points).toBe(expected);
    });

    it('the ranker\'s #1 and #5 count double, the middle three single', () => {
        const r = scoreRanking(ABCDE, ABCDE);
        expect(r.items.map(i => i.weight)).toEqual([2, 1, 1, 1, 2]);
        expect(r.items.map(i => i.points)).toEqual([4, 2, 2, 2, 4]);
        expect(r.exact).toBe(5);
        expect(r.percent).toBe(100);
    });

    it('is a property of the ranker\'s order, not of the item names', () => {
        const ranker = ['Tea', 'Coffee', 'Juice', 'Water', 'Soda'];
        expect(scoreRanking(ranker, ['Coffee', 'Tea', 'Juice', 'Water', 'Soda']).points).toBe(11);
    });

    it('over all 120 predictions: always 0..14, never 13, and only the exact order scores 14', () => {
        const all = perms(ABCDE).map(p => ({ p, s: scoreRanking(ABCDE, p).points }));
        expect(all).toHaveLength(120);
        for (const { s } of all) expect(s).toBeGreaterThanOrEqual(0);
        for (const { s } of all) expect(s).toBeLessThanOrEqual(MAX_CARD_POINTS);
        expect(all.filter(x => x.s === 13)).toHaveLength(0);
        expect(all.filter(x => x.s === 14).map(x => x.p.join(''))).toEqual(['ABCDE']);
        // The JSON's "a random guess averages about 5" — pin it, loosely.
        const mean = all.reduce((t, x) => t + x.s, 0) / all.length;
        expect(mean).toBeGreaterThan(4);
        expect(mean).toBeLessThan(6);
    });

    it('refuses a prediction that is not a reordering of the same items', () => {
        expect(() => scoreRanking(ABCDE, seq('ABCDF'))).toThrow();
        expect(() => scoreRanking(ABCDE, seq('ABCD'))).toThrow();
        expect(() => scoreRanking(ABCDE, seq('AACDE'))).toThrow();
    });

    it('tiers', () => {
        expect(tierFor(14).label).toBe('Mind reader');
        for (const p of [10, 11, 12]) expect(tierFor(p).label).toBe('Close');
        for (const p of [7, 8, 9]) expect(tierFor(p).label).toBe('Getting there');
        for (const p of [0, 3, 6]) expect(tierFor(p).label).toBe('Guesswork');
    });
});

describe('Rank Me data', () => {
    it('ships the three decks, with only After Dark spicy', () => {
        expect(decks.map(d => d.id)).toEqual(['reallife', 'whatif', 'afterdark']);
        expect(decks.filter(d => d.spicy).map(d => d.id)).toEqual(['afterdark']);
        for (const d of decks) expect(cards.filter(c => c.deck === d.id).length, d.id).toBe(d.count);
    });

    it('every spicy card is in After Dark, and every After Dark card is spicy', () => {
        for (const c of cards) expect(c.spicy, c.id).toBe(c.deck === 'afterdark');
    });

    it('every card is five distinct, short items with both labels', () => {
        expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
        for (const c of cards) {
            expect(c.items, c.id).toHaveLength(5);
            expect(new Set(c.items).size, c.id).toBe(5);
            for (const i of c.items) expect(i.length, `${c.id}: ${i}`).toBeLessThanOrEqual(22);
            expect(c.top && c.bottom && c.prompt && c.theme, c.id).toBeTruthy();
        }
    });
});

describe('Rank Me dealing', () => {
    const none: DealState = { sessionUsed: new Set(), seen: new Set(), lastTheme: null };

    it('After Dark never enters the pool without the adult unlock', () => {
        const all = ['reallife', 'whatif', 'afterdark'];
        expect(cardPool(cards, { decks: all, adultAllowed: false, keepItSweet: false }).some(c => c.spicy)).toBe(false);
        expect(cardPool(cards, { decks: all, adultAllowed: true, keepItSweet: false }).some(c => c.spicy)).toBe(true);
    });

    it('"keep it sweet" drops every card that mentions an ex, and only those', () => {
        const all = ['reallife', 'whatif', 'afterdark'];
        const loose = cardPool(cards, { decks: all, adultAllowed: true, keepItSweet: false });
        const sweet = cardPool(cards, { decks: all, adultAllowed: true, keepItSweet: true });
        expect(sweet.some(c => c.ex)).toBe(false);
        expect(loose.length - sweet.length).toBe(cards.filter(c => c.ex).length);
        expect(cards.filter(c => c.ex).length).toBeGreaterThan(0);
    });

    it('only deals from the decks that were picked', () => {
        const pool = cardPool(cards, { decks: ['whatif'], adultAllowed: true, keepItSweet: false });
        expect(pool.every(c => c.deck === 'whatif')).toBe(true);
    });

    it('never repeats a card within a session until the pool is spent', () => {
        const pool = cardPool(cards, { decks: ['whatif'], adultAllowed: false, keepItSweet: false });
        const used = new Set<string>();
        let seen = new Set<string>();
        let lastTheme: string | null = null;
        for (let i = 0; i < pool.length; i++) {
            const d = pickCard(pool, { sessionUsed: used, seen, lastTheme })!;
            expect(used.has(d.card.id)).toBe(false);
            used.add(d.card.id);
            seen = recordDeal(seen, d, pool);
            lastTheme = d.card.theme;
        }
        expect(used.size).toBe(pool.length);
    });

    it('prefers cards this device has not seen, and resets quietly when they run out', () => {
        const pool = cards.filter(c => c.deck === 'reallife').slice(0, 5);
        const seen = new Set(pool.slice(0, 4).map(c => c.id));
        for (let i = 0; i < 20; i++) {
            const d = pickCard(pool, { ...none, seen }, Math.random)!;
            expect(d.card.id).toBe(pool[4].id);
            expect(d.resetSeen).toBe(false);
        }
        const allSeen = new Set(pool.map(c => c.id));
        const d = pickCard(pool, { ...none, seen: allSeen })!;
        expect(d.resetSeen).toBe(true);
        const after = recordDeal(new Set([...allSeen, 'other-deck-card']), d, pool);
        expect([...after].sort()).toEqual([d.card.id, 'other-deck-card'].sort());
    });

    it('never deals the same theme twice in a row when another theme is available', () => {
        const pool = cardPool(cards, { decks: ['reallife'], adultAllowed: false, keepItSweet: false });
        const used = new Set<string>();
        let last: string | null = null;
        for (let i = 0; i < 60; i++) {
            const d = pickCard(pool, { sessionUsed: used, seen: new Set(), lastTheme: last })!;
            expect(d.card.theme).not.toBe(last);
            used.add(d.card.id);
            last = d.card.theme;
        }
    });

    it('gives way on theme rather than stalling when only one theme is left', () => {
        const pool = cards.filter(c => c.deck === 'afterdark');
        const d = pickCard(pool, { ...none, lastTheme: pool[0].theme });
        expect(d).not.toBeNull();
    });

    it('the reader never starts on the ranker\'s answer', () => {
        for (let i = 0; i < 500; i++) {
            const order = startingOrder(ABCDE, ABCDE);
            expect(order.join('')).not.toBe('ABCDE');
            expect([...order].sort()).toEqual(ABCDE);
        }
        // A degenerate rnd that always returns the identity still gets moved.
        expect(startingOrder(ABCDE, ABCDE, () => 0.9999).join('')).not.toBe('ABCDE');
    });
});
