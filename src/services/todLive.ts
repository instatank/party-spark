// Truth or Drink on separate phones — deal, turn order and tallies. Pure, so
// tests/liveGames.test.ts pins it without a screen.
//
// Unlike the simultaneous games, this one is TURN-BASED: card t belongs to
// roster[t % n], and only that player's phone can answer it. So it follows
// The Line's replay rule — the turn in play is DERIVED from the answer logs,
// never announced: it is the first card nobody has answered (or the host has
// skipped). No device broadcasts whose turn it is, so no two can disagree,
// and the game ends on every phone at once because "no cards left" is a
// property of the logs, not a message.

import { mulberry32, seededShuffle } from './seededRandom';
import type { RosterEntry } from './liveRoom';

export type TodChoice = 'truth' | 'drink';
export const LIVE_TOD_ROUNDS = 10;

/** Ten questions from a curated deck, identical on every phone holding the
 *  seed. The custom AI deck cannot be seeded — it is shipped in the room's
 *  config instead — so it never comes through here. */
export const dealTodDeck = (pool: readonly string[], seed: number, size = LIVE_TOD_ROUNDS): string[] =>
    seededShuffle(pool, mulberry32(seed)).slice(0, size);

export const playerFor = (roster: readonly RosterEntry[], t: number): RosterEntry | undefined =>
    roster.length ? roster[t % roster.length] : undefined;

export type TodLogs = Record<string, Record<string, TodChoice>>;

/** The card in play: the first one neither answered by its player nor
 *  skipped by the host. Equals `cards` once the game is over. */
export function currentTurn(roster: readonly RosterEntry[], logs: TodLogs, cards: number, skipped: (t: number) => boolean): number {
    for (let t = 0; t < cards; t++) {
        const p = playerFor(roster, t);
        if (!p) return cards;
        if (skipped(t)) continue;
        if (logs[p.id]?.[t] === undefined) return t;
    }
    return cards;
}

/** Truths and drinks per player, from the cards they actually answered. A
 *  value written for a card that was not theirs is ignored. */
export function tallyTod(roster: readonly RosterEntry[], logs: TodLogs, cards: number) {
    const rows = roster.map(p => ({ id: p.id, name: p.name, truths: 0, drinks: 0 }));
    for (let t = 0; t < cards; t++) {
        const p = playerFor(roster, t);
        const c = p ? logs[p.id]?.[t] : undefined;
        const row = rows.find(r => r.id === p?.id);
        if (!row || !c) continue;
        if (c === 'truth') row.truths++; else row.drinks++;
    }
    const top = rows.length ? Math.max(...rows.map(r => r.truths)) : 0;
    return { rows, winners: rows.filter(r => r.truths === top && top > 0).map(r => r.name) };
}
