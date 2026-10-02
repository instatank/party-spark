// Would You Rather on separate phones — the dealing and the tallies, as pure
// functions so tests/liveGames.test.ts can pin them without a screen.
//
// Two live modes, both built on the answer-log pattern in liveRoom.ts:
//
//   VOTE     Everyone picks a side on their own phone, blind. The reveal waits
//            for the whole room and then shows the REAL split, with names.
//            This is the thing one passed-around phone cannot do: there, the
//            split on the card is PartySpark's authored estimate, and anyone
//            after the first voter has watched someone else decide.
//   HOT SEAT One player (rotating) picks in secret; everyone else guesses
//            their pick on their own phone. Each guesser is scored on their
//            own read, where pass-and-play could only score one room call.

import { mulberry32, seededShuffle } from './seededRandom';
import type { RosterEntry } from './liveRoom';

export type Side = 'A' | 'B';
export type LiveWyrMode = 'vote' | 'hotseat';
export const LIVE_ROUND_SIZE = 10;

/** Ten cards from one deck, identical on every phone holding the seed. No
 *  session dedupe: it reads this device's localStorage, so two phones would
 *  filter different cards out of the deck and deal different rounds. */
export const dealLiveRound = <T>(items: readonly T[], seed: number, size = LIVE_ROUND_SIZE): T[] =>
    seededShuffle(items, mulberry32(seed)).slice(0, size);

/** Who is in the hot seat for turn t of game g. Carries on round to round
 *  instead of restarting at the top of the roster. */
export const seatFor = (roster: readonly RosterEntry[], g: number, t: number): RosterEntry =>
    roster[((g - 1) * LIVE_ROUND_SIZE + t) % roster.length];

export type Logs = Record<string, Record<string, Side>>;

/** The room's actual split on one card, by player. */
export function splitFor(roster: readonly RosterEntry[], logs: Logs, t: number): { A: RosterEntry[]; B: RosterEntry[] } {
    const out = { A: [] as RosterEntry[], B: [] as RosterEntry[] };
    for (const r of roster) {
        const side = logs[r.id]?.[t];
        if (side === 'A' || side === 'B') out[side].push(r);
    }
    return out;
}

export interface VoteTally {
    /** Per player: cards voted, and how many of those they sided with the
     *  room's strict majority (a tied card counts for nobody). */
    rows: { id: string; name: string; voted: number; withRoom: number }[];
    /** The two players who agreed most and least, over cards both voted on. */
    closest: { a: string; b: string; agreed: number; of: number } | null;
    furthest: { a: string; b: string; agreed: number; of: number } | null;
}

export function tallyVote(roster: readonly RosterEntry[], logs: Logs, cards: number): VoteTally {
    const rows = roster.map(r => ({ id: r.id, name: r.name, voted: 0, withRoom: 0 }));
    for (let t = 0; t < cards; t++) {
        const { A, B } = splitFor(roster, logs, t);
        const majority: Side | null = A.length > B.length ? 'A' : B.length > A.length ? 'B' : null;
        rows.forEach(row => {
            const side = logs[row.id]?.[t];
            if (!side) return;
            row.voted++;
            if (side === majority) row.withRoom++;
        });
    }

    const pairs: { a: string; b: string; agreed: number; of: number }[] = [];
    for (let i = 0; i < roster.length; i++) {
        for (let j = i + 1; j < roster.length; j++) {
            let agreed = 0, of = 0;
            for (let t = 0; t < cards; t++) {
                const x = logs[roster[i].id]?.[t], y = logs[roster[j].id]?.[t];
                if (!x || !y) continue;
                of++;
                if (x === y) agreed++;
            }
            if (of) pairs.push({ a: roster[i].name, b: roster[j].name, agreed, of });
        }
    }
    const rate = (p: { agreed: number; of: number }) => p.agreed / p.of;
    const sorted = pairs.slice().sort((x, y) => rate(y) - rate(x));
    return {
        rows,
        closest: sorted[0] ?? null,
        // Only worth naming when it is a different pair from the closest.
        furthest: sorted.length > 1 ? sorted[sorted.length - 1] : null,
    };
}

export interface HotSeatTally {
    /** Guessers: how many reads they got right, of how many they made. */
    readers: { id: string; name: string; right: number; of: number }[];
    /** Seats: how many guesses they beat, of how many were made on them. */
    seats: { id: string; name: string; fooled: number; of: number }[];
}

export function tallyHotSeat(roster: readonly RosterEntry[], logs: Logs, g: number, cards: number): HotSeatTally {
    const readers = new Map(roster.map(r => [r.id, { id: r.id, name: r.name, right: 0, of: 0 }]));
    const seats = new Map<string, { id: string; name: string; fooled: number; of: number }>();
    for (let t = 0; t < cards; t++) {
        const seat = seatFor(roster, g, t);
        const truth = logs[seat.id]?.[t];
        if (!truth) continue;   // the seat never picked (left, or forced past)
        const s = seats.get(seat.id) ?? { id: seat.id, name: seat.name, fooled: 0, of: 0 };
        for (const r of roster) {
            if (r.id === seat.id) continue;
            const guess = logs[r.id]?.[t];
            if (!guess) continue;
            const row = readers.get(r.id)!;
            row.of++;
            s.of++;
            if (guess === truth) row.right++; else s.fooled++;
        }
        seats.set(seat.id, s);
    }
    return {
        readers: [...readers.values()].filter(r => r.of > 0),
        seats: [...seats.values()],
    };
}
