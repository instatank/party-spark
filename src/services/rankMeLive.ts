// Rank Me on separate phones — who ranks and who reads on each turn, and the
// boards built from everyone's answer logs. Pure, so tests/liveGames.test.ts
// pins it directly. Scoring itself is NOT here: it is scoreRanking in
// rankMeEngine.ts, the one definition shared with pass-and-play.
//
// Two live modes:
//
//   READ     One ranker per card, rotating through the room; EVERY other
//            player predicts their order on their own phone and is scored on
//            their own read. Pass-and-play's Hot Seat could only score one
//            agreed room guess; with two players this is exactly Know Me.
//   COUPLES  Partners pair up in join order. Every team plays the same card at
//            once: inside each team one ranks while the other reads, roles
//            swapping every round. One phone has to do this a team at a time.

import { scoreRanking, toPercent, type CardScore } from './rankMeEngine';
import type { RosterEntry } from './liveRoom';

export type LiveRankMode = 'read' | 'couples';

/** A ranker and who reads them, by player id. Couples has one per team. */
export interface LiveTask { ranker: string; readers: string[]; team: number | null }

export const teamsOf = (roster: readonly RosterEntry[]): RosterEntry[][] => {
    const teams: RosterEntry[][] = [];
    for (let i = 0; i + 1 < roster.length; i += 2) teams.push([roster[i], roster[i + 1]]);
    return teams;
};

/** Read mode laps the room so everyone ranks equally often. */
export const liveTurnCount = (mode: LiveRankMode, players: number, opts: { laps: number; rounds: number }): number =>
    mode === 'couples' ? opts.rounds : Math.max(1, opts.laps) * Math.max(1, players);

export function tasksFor(mode: LiveRankMode, roster: readonly RosterEntry[], t: number): LiveTask[] {
    if (!roster.length) return [];
    if (mode === 'read') {
        const ranker = roster[t % roster.length].id;
        return [{ ranker, readers: roster.filter(p => p.id !== ranker).map(p => p.id), team: null }];
    }
    return teamsOf(roster).map((team, k) => {
        const ranker = team[t % 2].id;
        return { ranker, readers: team.filter(p => p.id !== ranker).map(p => p.id), team: k };
    });
}

export type OrderLogs = Record<string, Record<string, string[]>>;

export interface LiveRead {
    t: number; ranker: string; reader: string; team: number | null;
    order: string[]; guess: string[]; score: CardScore;
}

/** Every scored read on turn t: a reader's guess against their ranker's
 *  order. A task whose ranker never locked in scores nothing. */
export function readsAt(mode: LiveRankMode, roster: readonly RosterEntry[], logs: OrderLogs, t: number): LiveRead[] {
    const out: LiveRead[] = [];
    for (const task of tasksFor(mode, roster, t)) {
        const order = logs[task.ranker]?.[t];
        if (!order) continue;
        for (const reader of task.readers) {
            const guess = logs[reader]?.[t];
            if (!guess) continue;
            out.push({ t, ranker: task.ranker, reader, team: task.team, order, guess, score: scoreRanking(order, guess) });
        }
    }
    return out;
}

export const readsThrough = (mode: LiveRankMode, roster: readonly RosterEntry[], logs: OrderLogs, turns: number): LiveRead[] =>
    Array.from({ length: turns }, (_, t) => readsAt(mode, roster, logs, t)).flat();

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

/** Read mode: how well each player reads people, and how readable each is. */
export function readerBoard(roster: readonly RosterEntry[], reads: readonly LiveRead[]) {
    return roster
        .map(p => {
            const mine = reads.filter(r => r.reader === p.id);
            return { id: p.id, name: p.name, points: mine.reduce((s, r) => s + r.score.points, 0), cards: mine.length, pct: avg(mine.map(r => r.score.percent)) };
        })
        .filter(r => r.cards > 0)
        .sort((a, b) => b.pct - a.pct || b.points - a.points);
}

export function rankerBoard(roster: readonly RosterEntry[], reads: readonly LiveRead[]) {
    return roster
        .map(p => {
            const onMe = reads.filter(r => r.ranker === p.id);
            return { id: p.id, name: p.name, reads: onMe.length, pct: avg(onMe.map(r => r.score.percent)) };
        })
        .filter(r => r.reads > 0)
        .sort((a, b) => a.pct - b.pct);
}

/** Couples: points per team across every round played. */
export function teamBoard(roster: readonly RosterEntry[], reads: readonly LiveRead[]) {
    return teamsOf(roster)
        .map((team, k) => {
            const mine = reads.filter(r => r.team === k);
            const points = mine.reduce((s, r) => s + r.score.points, 0);
            return { k, team, points, cards: mine.length, pct: toPercent(points, mine.length) };
        })
        .sort((a, b) => b.points - a.points);
}
