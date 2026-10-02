import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { mulberry32, newSeed } from '../src/services/seededRandom';
import type { Room, RoomPlayer } from '../src/services/roomService';
import { rosterOf, logOf, waitingOn, isForced, forcedKey, gameNo, turnOf, type RosterEntry } from '../src/services/liveRoom';
import { dealLiveRound, seatFor, splitFor, tallyVote, tallyHotSeat, LIVE_ROUND_SIZE, type Logs } from '../src/services/wyrLive';
import { cardPool, dealSequence, scoreRanking, type RankCard } from '../src/services/rankMeEngine';
import { tasksFor, teamsOf, liveTurnCount, readsAt, readerBoard, teamBoard, type OrderLogs } from '../src/services/rankMeLive';
import { dealTodDeck, currentTurn, tallyTod, type TodLogs } from '../src/services/todLive';

// =============================================================================
// THE ROOM INVARIANT, for the three answer-log games (Would You Rather, Rank
// Me, Truth or Drink on separate phones) — plus the turn and tally rules every
// phone derives on its own. If two phones ever derived different results from
// the same room, they would show different scores with nothing on screen to
// say why, so each derivation is pinned here rather than trusted to a drive
// that CI does not run.
//
// Content is re-derived through TWO independent generator instances, the way
// two phones would; reusing one stream would pass even if the seed were ignored.
// =============================================================================

const read = (p: string) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const WYR = read('../src/data/would_you_rather.json') as { categories: { id: string; items: { id: string }[] }[] };
const RANK = read('../src/data/rank_me.json') as { cards: RankCard[] };
const TOD = read('../src/data/truth_or_drink.json') as Record<string, string[]>;

const roster = (...names: string[]): RosterEntry[] => names.map(n => ({ id: n.toLowerCase(), name: n }));

function room(players: { id: string; name?: string; g?: number; log?: Record<string, unknown> }[], config: Record<string, unknown> = {}, round = 1): Room {
    return {
        meta: { code: '1234', game: 'X', hostId: players[0]?.id ?? '', createdAt: 0, rev: 1, phase: 'PLAY', seed: 1, round, deadlineAt: null, config },
        players: players.map((p, i): RoomPlayer => ({
            id: p.id, name: p.name ?? p.id, joinedAt: i, lastSeen: 0, rev: 1, stateRound: round,
            state: p.log ? { g: p.g ?? 1, log: p.log } : {},
        })),
    };
}

describe('live deals are identical on every phone', () => {
    it('Would You Rather: same ten cards from one seed, on two instances', () => {
        for (const deck of WYR.categories) {
            for (let i = 0; i < 50; i++) {
                const seed = newSeed();
                const a = dealLiveRound(deck.items, seed).map(q => q.id);
                const b = dealLiveRound(deck.items, seed).map(q => q.id);
                expect(a).toEqual(b);
                expect(a).toHaveLength(LIVE_ROUND_SIZE);
                expect(new Set(a).size).toBe(LIVE_ROUND_SIZE);
            }
        }
        expect(dealLiveRound(WYR.categories[0].items, 1)).not.toEqual(dealLiveRound(WYR.categories[0].items, 2));
    });

    it('Rank Me: same whole-game sequence from one seed, no repeats, only the picked decks', () => {
        const pool = cardPool(RANK.cards, { decks: ['reallife', 'whatif'], adultAllowed: false, keepItSweet: true });
        for (let i = 0; i < 100; i++) {
            const seed = newSeed();
            const a = dealSequence(pool, 16, mulberry32(seed));
            const b = dealSequence(pool, 16, mulberry32(seed));
            expect(a.map(c => c.id)).toEqual(b.map(c => c.id));
            expect(new Set(a.map(c => c.id)).size).toBe(16);
            expect(a.every(c => (c.deck === 'reallife' || c.deck === 'whatif') && !c.spicy && !c.ex)).toBe(true);
        }
    });

    it('Rank Me: varies the theme card to card when the pool allows it', () => {
        const pool = cardPool(RANK.cards, { decks: ['reallife'], adultAllowed: false, keepItSweet: false });
        const seq = dealSequence(pool, 12, mulberry32(7));
        for (let i = 1; i < seq.length; i++) expect(seq[i].theme).not.toBe(seq[i - 1].theme);
    });

    it('Truth or Drink: same ten questions from one seed, for every curated deck', () => {
        for (const deck of ['classic', 'spicy', 'deep', 'exes', 'chaos']) {
            const seed = newSeed();
            expect(TOD[deck].length).toBeGreaterThanOrEqual(10);
            expect(dealTodDeck(TOD[deck], seed)).toEqual(dealTodDeck(TOD[deck], seed));
        }
    });
});

describe('liveRoom', () => {
    it('reads the frozen roster, falling back to join order', () => {
        const frozen = [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }];
        expect(rosterOf(room([{ id: 'a' }, { id: 'b' }], { roster: frozen }))).toEqual(frozen);
        expect(rosterOf(room([{ id: 'a' }, { id: 'b' }])).map(p => p.id)).toEqual(['a', 'b']);
    });

    it('ignores a log written for a previous game', () => {
        const r = room([{ id: 'a', g: 1, log: { 0: 'A' } }, { id: 'b', g: 2, log: { 0: 'B' } }], { g: 2 });
        expect(gameNo(r)).toBe(2);
        expect(logOf(r, 'a')).toEqual({});
        expect(logOf(r, 'b')).toEqual({ 0: 'B' });
    });

    it('waits only on present players who have not answered, and never on a forced turn', () => {
        const r = room([{ id: 'a', log: { 0: 'A' } }, { id: 'b', log: {} }], {}, 1);
        expect(turnOf(r)).toBe(0);
        // 'c' is in the roster but has left the room: never waited on.
        expect(waitingOn(r, 0, ['a', 'b', 'c'])).toEqual(['b']);
        // This phone's own unechoed answer counts as given.
        expect(waitingOn(r, 0, ['a', 'b'], { b: { 0: 'B' } })).toEqual([]);
        const forced = room([{ id: 'a' }, { id: 'b' }], { forced: forcedKey(1, 0) });
        expect(waitingOn(forced, 0, ['a', 'b'])).toEqual([]);
        expect(isForced(room([{ id: 'a' }], { forced: ['1:3', '1:5'] }), 5)).toBe(true);
        expect(isForced(room([{ id: 'a' }], { forced: ['1:3'], g: 2 }), 3)).toBe(false);
    });
});

describe('Would You Rather tallies', () => {
    const R = roster('Ankit', 'Priya', 'Sam');

    it('rotates the hot seat through the roster and carries it across games', () => {
        expect([0, 1, 2, 3].map(t => seatFor(R, 1, t).name)).toEqual(['Ankit', 'Priya', 'Sam', 'Ankit']);
        // Game 2 continues where ten cards left off (10 % 3 = 1 → Priya).
        expect(seatFor(R, 2, 0).name).toBe('Priya');
    });

    it('counts the real split, the majority and the closest pair', () => {
        const logs: Logs = {
            ankit: { 0: 'A', 1: 'B', 2: 'A' },
            priya: { 0: 'A', 1: 'B', 2: 'B' },
            sam: { 0: 'B', 1: 'A' },               // missed card 3
        };
        expect(splitFor(R, logs, 0).A.map(p => p.name)).toEqual(['Ankit', 'Priya']);
        const t = tallyVote(R, logs, 3);
        // Card 3 is a 1–1 tie: nobody gets "with the room" for it.
        expect(t.rows.map(r => [r.name, r.withRoom, r.voted])).toEqual([['Ankit', 2, 3], ['Priya', 2, 3], ['Sam', 0, 2]]);
        expect(t.closest).toMatchObject({ a: 'Ankit', b: 'Priya', agreed: 2, of: 3 });
        expect(t.furthest!.agreed).toBe(0);
    });

    it('scores each guesser on their own read of the seat', () => {
        const logs: Logs = {
            ankit: { 0: 'A', 1: 'B', 2: 'B' },   // seat on card 1
            priya: { 0: 'A', 1: 'A', 2: 'A' },   // seat on card 2
            sam: { 0: 'B', 1: 'A' },             // seat on card 3, never picked
        };
        const h = tallyHotSeat(R, logs, 1, 3);
        expect(Object.fromEntries(h.readers.map(r => [r.name, [r.right, r.of]]))).toEqual({ Ankit: [0, 1], Priya: [1, 1], Sam: [1, 2] });
        expect(Object.fromEntries(h.seats.map(s => [s.name, [s.fooled, s.of]]))).toEqual({ Ankit: [1, 2], Priya: [1, 2] });
    });
});

describe('Rank Me turns and boards', () => {
    it('Read mode: one ranker per card, rotating, everyone else reads', () => {
        const R = roster('A', 'B', 'C');
        expect(liveTurnCount('read', 3, { laps: 2, rounds: 0 })).toBe(6);
        const rankers = Array.from({ length: 6 }, (_, t) => tasksFor('read', R, t)[0].ranker);
        expect(rankers).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
        expect(tasksFor('read', R, 1)[0].readers).toEqual(['a', 'c']);
    });

    it('Couples: every player has exactly one role each round, roles swap', () => {
        const R = roster('A', 'B', 'C', 'D', 'E');   // E is the odd one out
        expect(teamsOf(R)).toHaveLength(2);
        for (let t = 0; t < 4; t++) {
            const tasks = tasksFor('couples', R, t);
            const ids = tasks.flatMap(x => [x.ranker, ...x.readers]).sort();
            expect(ids).toEqual(['a', 'b', 'c', 'd']);
        }
        expect(tasksFor('couples', R, 0).map(x => x.ranker)).toEqual(['a', 'c']);
        expect(tasksFor('couples', R, 1).map(x => x.ranker)).toEqual(['b', 'd']);
    });

    it('scores reads with scoreRanking, and none when the ranker never locked in', () => {
        const R = roster('A', 'B', 'C');
        const items = ['1', '2', '3', '4', '5'];
        const logs: OrderLogs = { a: { 0: items }, b: { 0: items }, c: { 0: [...items].reverse(), 1: items } };
        const reads = readsAt('read', R, logs, 0);
        expect(reads.map(r => [r.reader, r.score.points])).toEqual([['b', 14], ['c', scoreRanking(items, [...items].reverse()).points]]);
        // Card 2's ranker is B, who never ranked: C's guess scores nothing.
        expect(readsAt('read', R, logs, 1)).toEqual([]);
        expect(readerBoard(R, reads)[0]).toMatchObject({ name: 'B', points: 14 });
    });

    it('Couples board adds up per team', () => {
        const R = roster('A', 'B', 'C', 'D');
        const items = ['1', '2', '3', '4', '5'];
        const logs: OrderLogs = { a: { 0: items }, b: { 0: items }, c: { 0: items }, d: { 0: ['2', '1', '3', '4', '5'] } };
        const board = teamBoard(R, readsAt('couples', R, logs, 0));
        expect(board.map(b => [b.k, b.points])).toEqual([[0, 14], [1, scoreRanking(items, ['2', '1', '3', '4', '5']).points]]);
    });
});

describe('Truth or Drink turn order', () => {
    const R = roster('A', 'B', 'C');
    const none = () => false;

    it('the turn in play is the first card its player has not answered', () => {
        expect(currentTurn(R, {}, 10, none)).toBe(0);
        const logs: TodLogs = { a: { 0: 'truth' }, b: { 1: 'drink' } };
        expect(currentTurn(R, logs, 10, none)).toBe(2);
    });

    it('a skipped card is passed over, and the game ends when the cards run out', () => {
        const logs: TodLogs = { a: { 0: 'truth', 3: 'drink' }, b: { 1: 'drink' } };
        expect(currentTurn(R, logs, 10, t => t === 2)).toBe(4);
        const all: TodLogs = { a: { 0: 'truth' }, b: { 1: 'truth' }, c: { 2: 'drink' } };
        expect(currentTurn(R, all, 3, none)).toBe(3);
    });

    it("a leaver's cards are skipped, so the turn never goes BACKWARDS", () => {
        // C answered card 2 and left: the server deleted their log with them.
        const afterLeave: TodLogs = { a: { 0: 'truth', 3: 'drink' }, b: { 1: 'drink', 4: 'truth' } };
        const present = new Set(['a', 'b']);
        const skip = (t: number) => !present.has(R[t % 3].id);
        expect(currentTurn(R, afterLeave, 10, skip)).toBe(6);
        // Without the presence rule it would fall back to C's card 2.
        expect(currentTurn(R, afterLeave, 10, none)).toBe(2);
    });

    it('tallies only answers to a player\'s own cards', () => {
        // B wrote an answer to card 0, which is A's: it must not count.
        const logs: TodLogs = { a: { 0: 'truth', 3: 'truth' }, b: { 0: 'drink', 1: 'drink' }, c: { 2: 'truth' } };
        const t = tallyTod(R, logs, 4);
        expect(t.rows.map(r => [r.name, r.truths, r.drinks])).toEqual([['A', 2, 0], ['B', 0, 1], ['C', 1, 0]]);
        expect(t.winners).toEqual(['A']);
    });
});
