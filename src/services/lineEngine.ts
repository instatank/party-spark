// ---------------------------------------------------------------------------
// The Line — the sequencing engine.
//
// Every card carries a hidden number. One starter sits face up; from then on a
// player never states a number, only a POSITION: the gap in the line where
// they think their card belongs. The phone holds every hidden value, judges
// the placement instantly, and keeps the shared line — which is the whole
// reason this is an app and not a printed deck.
//
// THE LINE INVARIANT
//   1. the line is always sorted STRICTLY ASCENDING by hidden value, and every
//      accepted placement preserves that;
//   2. a card is never in two places at once — line, hands, discard and draw
//      pile always partition the deck exactly, with nothing lost or cloned.
//
// Both are enforced in `assertLine`, which every mutation runs on its OWN
// RESULT before returning it. An invariant checked only at construction is not
// enforced (notes/05): `placeCard` is the second place it has to hold, and it
// is the place a later feature will break it.
//
// The line is stored as DECK INDICES, never as detached card objects, because
// you cannot preserve an ordering you cannot measure. Indices make "is this
// still sorted?" and "is this card in exactly one pile?" both answerable at
// the point of mutation.
//
// Nothing here assumes the JSON is authored in value order. It happens to be,
// which is exactly why the engine must sort by VALUE — a comparison that
// accidentally used the index would look correct forever on the shipped data.
// tests/lineEngine.test.ts pins that with a deliberately value-shuffled deck.
// ---------------------------------------------------------------------------

export interface LineCard {
    id: string;
    label: string;
    /** The hidden number. Unique within a deck — see `dealGame`. */
    value: number;
    note: string;
}

/** One rung of a deck's display ladder: values at or above `min` are shown as
 *  `value * factor` followed by `suffix` ("58 g", "397 tonnes", "1.08 billion
 *  km/h"). The ladder is data so a deck spanning nine orders of magnitude
 *  still reads like something a person would say out loud. */
export interface UnitRung { min: number; factor: number; suffix: string; }

export interface LineDeck {
    id: string;
    name: string;
    tagline: string;
    emoji: string;
    /** "Shortest at the top, tallest at the bottom." */
    axis: string;
    /** "how tall it is" — completes "Every card is a claim about ___". */
    claim: string;
    units: UnitRung[];
    cards: LineCard[];
}

export interface LineData { decks: LineDeck[]; }

export const HAND_SIZE = 4;
/** Solo has no opponent to run out of cards before you, so it ends on misses
 *  instead: three wrong placements and the run is over. */
export const SOLO_LIVES = 3;
export const MAX_PLAYERS = 8;

export interface GameState {
    /** Deck indices, strictly ascending by card value. THE LINE. */
    order: number[];
    /** Deck indices held by each player, hidden values. */
    hands: number[][];
    /** Deck indices of cards placed wrongly — out of play, values now public. */
    discard: number[];
    /** Deck indices not yet dealt, in draw order (front first). */
    draw: number[];
    placed: number[];
    misses: number[];
    /** Deck size, so the partition check knows what a complete deck is. */
    total: number;
    /** Solo only. A one-player game cannot end by someone else emptying a
     *  hand first, so it refills after a CORRECT placement too and runs until
     *  the lives are gone. Keeping the rule on the state means `placeCard`
     *  cannot be called with the wrong refill policy by accident. */
    endless: boolean;
}

export class LineInvariantError extends Error {}

/**
 * Check THE LINE INVARIANT against a state and throw if it is broken. Run on
 * the result of every mutation, never only at construction.
 */
export function assertLine(s: GameState, cards: readonly LineCard[]): void {
    if (cards.length !== s.total) {
        throw new LineInvariantError(`deck size changed under the state: ${cards.length} cards vs total ${s.total}`);
    }

    // (2) the piles partition the deck: every index present exactly once.
    const seen = new Array<number>(s.total).fill(0);
    const count = (idx: number, where: string) => {
        if (!Number.isInteger(idx) || idx < 0 || idx >= s.total) {
            throw new LineInvariantError(`${where} holds ${idx}, which is not a card in this deck`);
        }
        seen[idx] += 1;
    };
    s.order.forEach(i => count(i, 'the line'));
    s.hands.forEach((h, p) => h.forEach(i => count(i, `player ${p}'s hand`)));
    s.discard.forEach(i => count(i, 'the discard'));
    s.draw.forEach(i => count(i, 'the draw pile'));
    for (let i = 0; i < s.total; i++) {
        if (seen[i] === 0) throw new LineInvariantError(`card ${i} (${cards[i].label}) has gone missing`);
        if (seen[i] > 1) throw new LineInvariantError(`card ${i} (${cards[i].label}) is in ${seen[i]} places at once`);
    }

    // (1) the line rises, strictly, by VALUE.
    for (let i = 1; i < s.order.length; i++) {
        const lo = cards[s.order[i - 1]];
        const hi = cards[s.order[i]];
        if (!(hi.value > lo.value)) {
            throw new LineInvariantError(
                `the line does not rise at position ${i}: ${lo.label} (${lo.value}) then ${hi.label} (${hi.value})`,
            );
        }
    }
}

/** Format a hidden value for display using the deck's unit ladder. */
export function formatValue(v: number, units: readonly UnitRung[]): string {
    const rung = [...units].reverse().find(u => v >= u.min) ?? units[0];
    const x = v * rung.factor;
    const abs = Math.abs(x);
    const dp = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 4;
    const rounded = Number(x.toFixed(dp));
    // A rung with no suffix is a bare number — the year deck. Years are never
    // written with a thousands separator, so grouping is a display bug there
    // and nowhere else.
    if (!rung.suffix) return String(rounded);
    return `${rounded.toLocaleString('en-US', { maximumFractionDigits: dp })} ${rung.suffix}`;
}

/**
 * The one gap a card belongs in: the number of cards already on the line whose
 * value is below it. Gaps run 0 (above the top of the line) to order.length
 * (below the bottom).
 */
export function correctGap(order: readonly number[], cards: readonly LineCard[], cardIdx: number): number {
    const v = cards[cardIdx].value;
    let g = 0;
    while (g < order.length && cards[order[g]].value < v) g += 1;
    return g;
}

export const gapIsCorrect = (
    order: readonly number[], cards: readonly LineCard[], cardIdx: number, gap: number,
): boolean => gap === correctGap(order, cards, cardIdx);

const shuffled = (n: number, rnd: () => number): number[] => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

/**
 * Deal a game: one starter card face up, `players` hands of HAND_SIZE, the
 * rest face down as the draw pile.
 *
 * The STARTER is drawn from the middle third of the deck by value, never the
 * extremes. A starter at either end makes the opening turns a coin flip in one
 * direction only, and — worse for the distribution — pins most early cards to
 * the same gap. tests/lineEngine.test.ts checks that correct gaps actually
 * spread out across positions rather than piling on one (notes/07).
 */
export function dealGame(
    cards: readonly LineCard[], players: number, rnd: () => number = Math.random,
): GameState {
    const need = players * HAND_SIZE + 1;
    if (cards.length < need) {
        throw new LineInvariantError(`deck of ${cards.length} cannot seat ${players} players`);
    }
    const values = new Set(cards.map(c => c.value));
    if (values.size !== cards.length) {
        // Two cards with the same hidden value would make "strictly ascending"
        // unachievable and the correct gap ambiguous — a content bug, caught
        // here rather than mid-party.
        throw new LineInvariantError('deck has duplicate hidden values');
    }

    const byValue = cards.map((_, i) => i).sort((a, b) => cards[a].value - cards[b].value);
    const third = Math.floor(byValue.length / 3);
    const middle = byValue.slice(third, byValue.length - third);
    const starter = middle[Math.floor(rnd() * middle.length)];

    const rest = shuffled(cards.length, rnd).filter(i => i !== starter);
    const hands: number[][] = [];
    for (let p = 0; p < players; p++) hands.push(rest.splice(0, HAND_SIZE));

    const state: GameState = {
        order: [starter],
        hands,
        discard: [],
        draw: rest,
        placed: hands.map(() => 0),
        misses: hands.map(() => 0),
        total: cards.length,
        endless: players === 1,
    };
    assertLine(state, cards);
    return state;
}

export interface PlaceOutcome {
    state: GameState;
    correct: boolean;
    /** The gap the card actually belonged in — shown on a miss. */
    truth: number;
}

/**
 * Place a card from a player's hand into a gap.
 *
 * Correct → it locks into the line and its value becomes public. The hand
 *            shrinks, which is how a multiplayer game is won; in an endless
 *            (solo) game it refills instead, so the run keeps going.
 * Wrong    → it is discarded face up, and the player draws a replacement while
 *            the draw pile lasts (a miss should cost tempo, not material).
 *
 * The result is checked against THE LINE INVARIANT before it is handed back,
 * so a future edit here cannot quietly un-sort the line or duplicate a card.
 */
export function placeCard(
    s: GameState, cards: readonly LineCard[], player: number, cardIdx: number, gap: number,
): PlaceOutcome {
    const hand = s.hands[player];
    if (!hand || !hand.includes(cardIdx)) {
        throw new LineInvariantError(`player ${player} does not hold card ${cardIdx}`);
    }
    if (!Number.isInteger(gap) || gap < 0 || gap > s.order.length) {
        throw new LineInvariantError(`gap ${gap} is not a slot in a line of ${s.order.length}`);
    }

    const truth = correctGap(s.order, cards, cardIdx);
    const correct = gap === truth;

    const hands = s.hands.map((h, p) => (p === player ? h.filter(i => i !== cardIdx) : [...h]));
    const draw = [...s.draw];
    const order = [...s.order];
    const discard = [...s.discard];
    const placed = [...s.placed];
    const misses = [...s.misses];

    if (correct) {
        order.splice(gap, 0, cardIdx);
        placed[player] += 1;
    } else {
        discard.push(cardIdx);
        misses[player] += 1;
    }
    // Replace only while the pile lasts; once it is dry a card really is gone,
    // which is what ends a long game. A correct placement is only replaced in
    // an endless run — otherwise nobody could ever empty a hand.
    if ((!correct || s.endless) && draw.length) hands[player].push(draw.shift()!);

    const next: GameState = { ...s, order, hands, discard, draw, placed, misses };
    assertLine(next, cards);
    return { state: next, correct, truth };
}

/** Solo keeps drawing, so its terminator is lives spent (or a deck run dry). */
export const soloOver = (s: GameState): boolean =>
    s.misses[0] >= SOLO_LIVES || s.hands[0].length === 0;

/** A multiplayer game ends the moment somebody empties their hand. */
export const winnerSeat = (s: GameState): number =>
    s.hands.findIndex(h => h.length === 0);
