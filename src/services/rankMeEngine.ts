// Rank Me runtime: scoring and dealing. Pure functions (plus one small
// localStorage store at the bottom) so both are testable without a screen.
//
// SCORING is ends-weighted and identical in every mode. Each item the reader
// placed is compared with where the ranker placed it: exact spot 2, one spot
// off 1, further 0 — and the items the RANKER put at #1 or #5 count double.
// That makes a perfect read 14 (5 items x 2, plus 2 x 2 bonus for the ends).
// Points always go to whoever is reading the ranker, never to the ranker for
// being unpredictable: a "fooled them" reward would pay people to rank dishonestly.

export interface RankCard {
    id: string;
    deck: string;
    theme: string;
    prompt: string;
    top: string;
    bottom: string;
    items: string[];
    desi: boolean;
    spicy: boolean;
    ex: boolean;
}

export interface RankDeck {
    id: string;
    name: string;
    emoji: string;
    spicy: boolean;
    description: string;
    count: number;
}

export const ITEMS_PER_CARD = 5;
export const MAX_CARD_POINTS = 14;

export type ItemVerdict = 'exact' | 'near' | 'miss';

export interface ItemResult {
    item: string;
    rankerPos: number;     // 0-based: 0 is the card's `top`, 4 its `bottom`
    predictedPos: number;
    verdict: ItemVerdict;
    weight: 1 | 2;         // 2 for the ranker's #1 and #5
    points: number;
}

export interface CardScore {
    points: number;        // 0..14 (13 is unreachable: any mistake moves two items)
    percent: number;       // points / 14, rounded
    exact: number;         // items placed in exactly the right spot
    items: ItemResult[];   // in the RANKER's order, #1 first
}

const isPermutation = (a: readonly string[], b: readonly string[]) =>
    a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length && b.every(x => a.includes(x));

export function scoreRanking(ranker: readonly string[], prediction: readonly string[]): CardScore {
    if (!isPermutation(ranker, prediction)) {
        throw new Error('scoreRanking: prediction must be a reordering of the ranker\'s items');
    }
    const last = ranker.length - 1;
    const items: ItemResult[] = ranker.map((item, rankerPos) => {
        const predictedPos = prediction.indexOf(item);
        const off = Math.abs(rankerPos - predictedPos);
        const base = off === 0 ? 2 : off === 1 ? 1 : 0;
        const weight: 1 | 2 = rankerPos === 0 || rankerPos === last ? 2 : 1;
        return {
            item, rankerPos, predictedPos, weight,
            verdict: off === 0 ? 'exact' : off === 1 ? 'near' : 'miss',
            points: base * weight,
        };
    });
    const points = items.reduce((s, r) => s + r.points, 0);
    return {
        points,
        percent: toPercent(points),
        exact: items.filter(r => r.verdict === 'exact').length,
        items,
    };
}

export const toPercent = (points: number, cards = 1): number =>
    cards > 0 ? Math.round((points / (MAX_CARD_POINTS * cards)) * 100) : 0;

export interface Tier { label: string; emoji: string }

export function tierFor(points: number): Tier {
    if (points >= 14) return { label: 'Mind reader', emoji: '🔮' };
    if (points >= 10) return { label: 'Close', emoji: '🎯' };
    if (points >= 7) return { label: 'Getting there', emoji: '🤔' };
    return { label: 'Guesswork', emoji: '🎲' };
}

// ---------------------------------------------------------------- dealing

export interface DealFilter {
    decks: readonly string[];
    adultAllowed: boolean;   // the spicy deck needs the 0438 unlock
    keepItSweet: boolean;    // drop cards that mention an ex
}

// Everything the players asked for, and nothing they did not. The adult check
// lives here, not only in the picker, so a stale deck selection can never
// leak a spicy card into an unlocked-looking session.
export function cardPool(cards: readonly RankCard[], f: DealFilter): RankCard[] {
    return cards.filter(c =>
        f.decks.includes(c.deck) &&
        (f.adultAllowed || !c.spicy) &&
        !(f.keepItSweet && c.ex),
    );
}

export interface DealState {
    sessionUsed: ReadonlySet<string>;  // dealt this session — never repeat
    seen: ReadonlySet<string>;         // dealt on this device, ever — prefer not
    lastTheme: string | null;
}

export interface Deal {
    card: RankCard;
    // True when every card in the pool had been seen on this device, so the
    // seen-history for this pool should be forgotten (a quiet reset).
    resetSeen: boolean;
}

// Preference order: unseen on this device > seen before but not this session
// > (only once the whole pool is spent) anything. Within whichever tier wins,
// a card whose theme differs from the last one is preferred; if none does,
// the theme rule gives way rather than stalling the game.
export function pickCard(pool: readonly RankCard[], s: DealState, rnd: () => number = Math.random): Deal | null {
    if (pool.length === 0) return null;
    const fresh = pool.filter(c => !s.sessionUsed.has(c.id));
    const unseen = fresh.filter(c => !s.seen.has(c.id));
    const resetSeen = unseen.length === 0;
    const tier = unseen.length ? unseen : fresh.length ? fresh : pool;
    const varied = s.lastTheme ? tier.filter(c => c.theme !== s.lastTheme) : tier;
    const from = varied.length ? varied : tier;
    return { card: from[Math.floor(rnd() * from.length)], resetSeen };
}

// Fisher-Yates with an injectable rnd. Used for the starting order of every
// ranking screen: each screen shuffles independently, because two people
// starting from the same order anchor on it and the score stops meaning much.
export function shuffleItems<T>(items: readonly T[], rnd: () => number = Math.random): T[] {
    const a = items.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// The predictor's starting order must not already be the answer: a reader who
// locks in without touching anything would score a perfect 14 by accident.
export function startingOrder(items: readonly string[], avoid: readonly string[] | null, rnd: () => number = Math.random): string[] {
    for (let tries = 0; tries < 20; tries++) {
        const order = shuffleItems(items, rnd);
        if (!avoid || order.some((x, i) => x !== avoid[i])) return order;
    }
    const order = items.slice();
    [order[0], order[1]] = [order[1], order[0]];
    return order;
}

// ---------------------------------------------------------------- device memory

// Cards dealt on this device, across sessions. Couples who replay together
// remember each other's old answers, so an unseen card is worth preferring.
// localStorage can be absent or throw (private windows): every access is
// guarded, and a failure just means the preference quietly stops applying.
const SEEN_KEY = 'rank_me_seen';

export const seenStore = {
    load(): Set<string> {
        try {
            const raw = localStorage.getItem(SEEN_KEY);
            const ids = raw ? JSON.parse(raw) : [];
            return new Set(Array.isArray(ids) ? ids.filter((x: unknown) => typeof x === 'string') : []);
        } catch {
            return new Set();
        }
    },
    save(seen: ReadonlySet<string>): void {
        try {
            localStorage.setItem(SEEN_KEY, JSON.stringify([...seen]));
        } catch { /* storage unavailable — the preference just lapses */ }
    },
};

// Records a deal against the device history, forgetting the pool's history
// first when the pool had run out of unseen cards.
export function recordDeal(seen: ReadonlySet<string>, deal: Deal, pool: readonly RankCard[]): Set<string> {
    const next = new Set(seen);
    if (deal.resetSeen) for (const c of pool) next.delete(c.id);
    next.add(deal.card.id);
    return next;
}
