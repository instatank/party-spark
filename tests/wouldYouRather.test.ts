import { describe, expect, it } from 'vitest';
import data from '../src/data/would_you_rather.json';

// THE DILEMMA BAR. A Would You Rather card is only worth dealing if the room
// can genuinely split on it, so the deck is held to a few measurable rules.
// The percentages are authored ESTIMATES (the card footnote says so) — these
// tests pin their shape, not their truth.

type Card = { id: string; optionA: string; optionB: string; stats: { a: number; b: number } };
type Deck = { id: string; name: string; tagline: string; icon?: string; color: string; adult: boolean; items: Card[] };
const decks = (data as { categories: Deck[] }).categories;
const cards = decks.flatMap(d => d.items);

describe('Would You Rather deck', () => {
    // Three decks, split by who is in the room. Only Spicy is adult-gated —
    // Friends & Family has to be safe with parents and kids at the table.
    it('ships the three room-shaped decks, with only Spicy behind the gate', () => {
        const byId = Object.fromEntries(decks.map(d => [d.id, d]));
        expect(decks.map(d => d.id)).toEqual(['general', 'couples', 'spicy']);
        expect(byId.general.adult).toBe(false);
        expect(byId.couples.adult).toBe(false);
        expect(byId.spicy.adult).toBe(true);
    });

    it('every deck is deep enough for several rounds of 10', () => {
        for (const d of decks) expect(d.items.length, d.id).toBeGreaterThanOrEqual(40);
    });

    // Ids are session-dedupe keys: renumbering one resurfaces cards a table
    // has already played. New cards append; the general deck's first 100 keep
    // the ids they shipped with.
    it('ids are prefixed by deck, and the original 100 keep their ids', () => {
        const prefix: Record<string, string> = { general: 'g_', couples: 'c_', spicy: 's_' };
        for (const d of decks) for (const c of d.items) expect(c.id.startsWith(prefix[d.id]), c.id).toBe(true);
        const general = decks.find(d => d.id === 'general')!;
        expect(general.items.slice(0, 100).map(c => c.id)).toEqual(
            Array.from({ length: 100 }, (_, i) => `g_${String(i + 1).padStart(3, '0')}`),
        );
    });

    it('every deck carries what the picker renders', () => {
        for (const d of decks) {
            expect(d.name, d.id).toBeTruthy();
            expect(d.tagline, d.id).toBeTruthy();
            expect(d.color, d.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });

    it('ids are unique, and no option text appears twice across all decks', () => {
        expect(new Set(cards.map(c => c.id)).size).toBe(cards.length);
        const options = cards.flatMap(c => [c.optionA, c.optionB].map(o => o.toLowerCase()));
        expect(new Set(options).size).toBe(options.length);
    });

    it('splits add to 100 and no card is a foregone conclusion (20–80)', () => {
        for (const c of cards) {
            expect(c.stats.a + c.stats.b, c.id).toBe(100);
            expect(c.stats.a, c.id).toBeGreaterThanOrEqual(20);
            expect(c.stats.a, c.id).toBeLessThanOrEqual(80);
        }
    });

    it('options fit the card: one line of thought, no trailing punctuation, no "Would you rather" prefix', () => {
        for (const c of cards) {
            for (const o of [c.optionA, c.optionB]) {
                expect(o.length, `${c.id}: ${o}`).toBeLessThanOrEqual(80);
                expect(o, c.id).not.toMatch(/[.?!]$/);
                expect(o, c.id).not.toMatch(/^would you rather/i);
            }
        }
    });

    it('the retired psychoanalysis copy is gone', () => {
        for (const c of cards) expect(Object.keys(c), c.id).not.toContain('analysisA');
    });
});
