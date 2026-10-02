// =============================================================================
// Live-room helpers shared by the "answer log" games — Would You Rather,
// Rank Me and Truth or Drink on separate phones.
//
// All three use the pattern The Line proved out: every player keeps ONE
// cumulative log of their own answers, keyed by turn number, and publishes the
// whole log on every write. Every phone replays every log and derives the
// same reveal, the same scores and the same ending from them — so a phone that
// was asleep for three polls still lands on the right totals, which a
// "current round only" payload could never promise.
//
//   room:{code}:p:{id}.state = { g: <game number>, log: { [turn]: answer } }
//
// `g` is the game number (bumped by the host on Play again). A log written for
// a previous game is ignored rather than cleared, for the same reason
// stateRound exists: the host cannot write keys it does not own.
//
// Pure functions only — no React, no network — so the derivations are tested
// directly in tests/liveGames.test.ts.
// =============================================================================

import type { Room } from './roomService';

export interface RosterEntry { id: string; name: string }

/** The seat order every phone agrees on: frozen into config by the host at
 *  start (RoomPanel's startConfig), so a late joiner or a leaver can never
 *  reshuffle whose turn it is mid-game. Falls back to join order. */
export function rosterOf(room: Room): RosterEntry[] {
    const r = room.meta.config.roster;
    if (Array.isArray(r) && r.length && r.every(x => x && typeof x.id === 'string' && typeof x.name === 'string')) {
        return r as RosterEntry[];
    }
    return freezeRoster(room);
}

/** Join order as it stands right now — what the host freezes at start. */
export const freezeRoster = (room: Room): RosterEntry[] =>
    room.players.map(p => ({ id: p.id, name: p.name }));

/** The game number in play. 1 for the first deal; Play again bumps it. */
export const gameNo = (room: Room): number => Number(room.meta.config.g) || 1;

/** Zero-based turn from the room's round (round 0 is the lobby). */
export const turnOf = (room: Room): number => Math.max(0, room.meta.round - 1);

export const isPresent = (room: Room, id: string): boolean => room.players.some(p => p.id === id);

/** One player's log for the game in play. A log stamped with another game
 *  number is stale and reads as empty. */
export function logOf<T>(room: Room, id: string): Record<string, T> {
    const p = room.players.find(pl => pl.id === id);
    if (!p || Number(p.state.g) !== gameNo(room)) return {};
    const log = p.state.log;
    return log && typeof log === 'object' && !Array.isArray(log) ? (log as Record<string, T>) : {};
}

/** The host's "stop waiting" for one turn of one game. A sleeping phone in
 *  someone's pocket is still IN the room, so presence alone cannot unstick a
 *  reveal that waits on it. */
export const forcedKey = (g: number, t: number): string => `${g}:${t}`;
export const isForced = (room: Room, t: number): boolean =>
    room.meta.config.forced === forcedKey(gameNo(room), t);

/**
 * Who a turn is still waiting on: the players whose answer is needed, minus
 * anyone who has left the room. Empty means the turn can be revealed. A forced
 * turn is never waiting on anyone. Pass `logs` (from useLiveLog) so this
 * phone's own unechoed answer counts as given.
 */
export function waitingOn(
    room: Room, t: number, needed: readonly string[],
    logs: Record<string, Record<string, unknown>> = {},
): string[] {
    if (isForced(room, t)) return [];
    return needed.filter(id => isPresent(room, id) && (logs[id] ?? logOf(room, id))[t] === undefined);
}
