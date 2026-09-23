import { describe, expect, it } from 'vitest';
import data from '../src/data/would_you_rather.json';

// THE DILEMMA BAR. A Would You Rather card is only worth dealing if the room
// can genuinely split on it, so the deck is held to a few measurable rules.
// The percentages are authored ESTIMATES (the card footnote says so) — these
// tests pin their shape, not their truth.

type Card = { id: string; optionA: string; optionB: string; stats: { a: number; b: number } };
type Deck = { id: string; name: string; tagline: string; color: string; adult: boolean; items: Card[] };
const decks = (data as { categories: Deck[] }).categories;
const cards = decks.flatMap(d => d.items);

describe('Would You Rather deck', () => {
    it('ships the general deck with 100 cards', () => {
        const general = decks.find(d => d.id === 'general');
        expect(general?.items.length).toBe(100);
        expect(general?.adult).toBe(false);
    });

    it('every deck carries what the picker renders', () => {
        for (const d of decks) {
            expect(d.name, d.id).toBeTruthy();
            expect(d.tagline, d.id).toBeTruthy();
            expect(d.color, d.id).toMatch(/^#[0-9A-Fa-f]{6}$/);
        }
    });

    it('ids are unique, and no option text appears twice', () => {
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
