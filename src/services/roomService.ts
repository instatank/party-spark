// =============================================================================
// Room client — the browser half of multiplayer.
//
// There is no live pipe between phones. Each device writes its own line to a
// shared noticeboard (api/room.ts) and reads the others' about once a second.
// Two design choices make that read as "live" rather than laggy:
//
//   1. CONTENT IS NEVER SENT. Both phones agree on a seed and generate the same
//      puzzle locally (see seededRandom.ts). Nothing to download, nothing to
//      wait for — the network carries scores, not questions.
//
//   2. TIMERS SYNC ON A DEADLINE, NOT A START GUN. The server stamps
//      deadlineAt; each client counts down to that instant using a measured
//      offset against the server clock. A phone that hears about the round a
//      second late, on a device whose clock is ten minutes wrong, still fires
//      its buzzer at the same moment as everyone else.
//
// TRANSPORT BOUNDARY: everything network-facing is behind `request()` and the
// polling loop. Swapping polling for websockets or a managed realtime vendor
// later means reimplementing this file only — no game component knows how the
// bytes move.
//
// This mode requires a connection. Every other game in the app works fully
// offline and must keep doing so, which is why multiplayer is always an opt-in
// branch off a game's setup screen and never sits on the default path.
// =============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';

export interface RoomMeta {
    code: string;
    game: string;
    hostId: string;
    createdAt: number;
    rev: number;
    phase: string;
    seed: number;
    round: number;
    deadlineAt: number | null;
    config: Record<string, unknown>;
}

export interface RoomPlayer {
    id: string;
    name: string;
    joinedAt: number;
    lastSeen: number;
    rev: number;
    state: Record<string, unknown>;
    stateRound: number;
}

export interface Room {
    meta: RoomMeta;
    players: RoomPlayer[];
}

export interface RoomSession {
    code: string;
    playerId: string;
}

const ENDPOINT = '/api/room';
const SESSION_KEY = 'partyspark_room_session';

// --- clock offset -----------------------------------------------------------
// NTP's trick, minus the ceremony: every response carries the server's clock,
// so each request is also a sample of how wrong ours is. Keep the sample from
// the FASTEST round trip seen — a slow request tells you almost nothing about
// offset because you cannot know how the latency split between the two legs,
// while a fast one bounds the error to half its duration.

let clockOffsetMs = 0;
let bestRoundTripMs = Infinity;

function recordClockSample(sentAt: number, serverNow: number, receivedAt: number): void {
    const roundTrip = receivedAt - sentAt;
    if (roundTrip > bestRoundTripMs) return;
    bestRoundTripMs = roundTrip;
    clockOffsetMs = serverNow + roundTrip / 2 - receivedAt;
}

/** Best estimate of the server's clock right now. Use this, never Date.now(),
 *  for anything two devices must agree on. */
export const serverNow = (): number => Date.now() + clockOffsetMs;

/** Milliseconds until a server-stamped deadline, floored at zero. */
export const msUntil = (deadlineAt: number | null): number =>
    deadlineAt === null ? 0 : Math.max(0, deadlineAt - serverNow());

export const clockOffset = (): number => clockOffsetMs;

// --- transport --------------------------------------------------------------

export class RoomError extends Error {}

interface Envelope<T> { ok: boolean; data?: T; error?: string }
type RoomReply = { room: Room; now: number; persistent: boolean; code?: string; playerId?: string };

async function request(action: string, params: Record<string, unknown>): Promise<RoomReply> {
    const sentAt = Date.now();
    let res: Response;
    try {
        res = await fetch(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action, ...params }),
        });
    } catch {
        throw new RoomError('No connection. Multiplayer needs one — the rest of the app does not.');
    }

    const json = (await res.json().catch(() => null)) as Envelope<RoomReply> | null;
    if (!res.ok || !json?.ok || !json.data) {
        throw new RoomError(json?.error ?? `Room request failed (${res.status}).`);
    }
    recordClockSample(sentAt, json.data.now, Date.now());
    return json.data;
}

// --- session persistence ----------------------------------------------------
// sessionStorage, matching the PIN gate's choice: a room should survive an
// accidental refresh but must not outlive the tab and silently rejoin tomorrow.

export function loadSession(): RoomSession | null {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as RoomSession) : null;
    } catch { return null; }
}

function saveSession(s: RoomSession | null): void {
    try {
        if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
        else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* private mode — the room still works, it just won't survive a refresh */ }
}

// --- operations -------------------------------------------------------------

export async function createRoom(
    game: string, name: string, config: Record<string, unknown> = {},
): Promise<{ session: RoomSession; room: Room; persistent: boolean }> {
    const data = await request('create', { game, name, config });
    const session = { code: data.code!, playerId: data.playerId! };
    saveSession(session);
    return { session, room: data.room, persistent: data.persistent };
}

export async function joinRoom(
    code: string, name: string,
): Promise<{ session: RoomSession; room: Room; persistent: boolean }> {
    const data = await request('join', { code, name });
    const session = { code: data.code!, playerId: data.playerId! };
    saveSession(session);
    return { session, room: data.room, persistent: data.persistent };
}

export const pollRoom = (code: string, playerId?: string): Promise<RoomReply> =>
    request('poll', { code, playerId });

export const patchPlayer = (
    code: string, playerId: string, state: Record<string, unknown>,
): Promise<RoomReply> => request('patch', { code, playerId, state });

/** Host-only. `durationMs` is a duration on purpose — the SERVER turns it into
 *  a deadline, so no device's clock can skew the shared buzzer. */
export const setRoundState = (
    code: string, playerId: string,
    changes: { phase?: string; round?: number; config?: Record<string, unknown>; seed?: number; durationMs?: number | null },
): Promise<RoomReply> => request('host', { code, playerId, ...changes });

export async function leaveRoom(code: string, playerId: string): Promise<void> {
    saveSession(null);
    try { await request('leave', { code, playerId }); } catch { /* leaving is best-effort */ }
}

export const clearSession = (): void => saveSession(null);

// --- the hook ---------------------------------------------------------------

const POLL_PLAY_MS = 1000;   // while a round is live — opponent scores tick
const POLL_IDLE_MS = 2000;   // lobby / results — nothing is racing

export interface UseRoomResult {
    room: Room | null;
    me: RoomPlayer | null;
    others: RoomPlayer[];
    isHost: boolean;
    error: string | null;
    /** True once a poll has failed repeatedly — surface it, don't hide it. */
    offline: boolean;
    /** False when the server is running the in-memory dev fallback, which does
     *  NOT share state across serverless instances. Surfaced in the UI because
     *  the symptom (two phones in "the same" room never seeing each other) is
     *  otherwise inexplicable. */
    persistent: boolean;
    patch: (state: Record<string, unknown>) => Promise<void>;
    host: (changes: Parameters<typeof setRoundState>[2]) => Promise<void>;
    refresh: () => Promise<void>;
}

/**
 * Subscribes to a room and keeps it fresh. Polling pauses when the tab is
 * hidden (a backgrounded phone in someone's pocket should not keep polling)
 * and fires immediately on return so the player never stares at stale state.
 */
export function useRoom(session: RoomSession | null, livePhases: string[] = ['PLAY']): UseRoomResult {
    const [room, setRoom] = useState<Room | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [failures, setFailures] = useState(0);
    const [persistent, setPersistent] = useState(true);

    // The loop reads these through refs so changing phase or session never
    // tears down and rebuilds the interval mid-round.
    const sessionRef = useRef(session);
    const roomRef = useRef<Room | null>(null);
    const livePhasesRef = useRef(livePhases);
    sessionRef.current = session;
    roomRef.current = room;
    livePhasesRef.current = livePhases;

    const refresh = useCallback(async () => {
        const s = sessionRef.current;
        if (!s) return;
        try {
            const data = await pollRoom(s.code, s.playerId);
            setRoom(data.room);
            setPersistent(data.persistent);
            setError(null);
            setFailures(0);
        } catch (e) {
            setFailures(f => f + 1);
            if (e instanceof Error) setError(e.message);
        }
    }, []);

    useEffect(() => {
        if (!session) return;
        let cancelled = false;
        let timer: number | undefined;

        const tick = async () => {
            if (cancelled) return;
            if (typeof document !== 'undefined' && document.hidden) {
                timer = window.setTimeout(tick, POLL_IDLE_MS);
                return;
            }
            await refresh();
            if (cancelled) return;
            const phase = roomRef.current?.meta.phase ?? '';
            const delay = livePhasesRef.current.includes(phase) ? POLL_PLAY_MS : POLL_IDLE_MS;
            timer = window.setTimeout(tick, delay);
        };

        void tick();

        const onVisible = () => { if (!document.hidden) void refresh(); };
        document.addEventListener('visibilitychange', onVisible);

        return () => {
            cancelled = true;
            if (timer) window.clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [session, refresh]);

    const patch = useCallback(async (state: Record<string, unknown>) => {
        const s = sessionRef.current;
        if (!s) return;
        try {
            const data = await patchPlayer(s.code, s.playerId, state);
            setRoom(data.room);
            setError(null);
        } catch (e) {
            if (e instanceof Error) setError(e.message);
        }
    }, []);

    const host = useCallback(async (changes: Parameters<typeof setRoundState>[2]) => {
        const s = sessionRef.current;
        if (!s) return;
        try {
            const data = await setRoundState(s.code, s.playerId, changes);
            setRoom(data.room);
            setError(null);
        } catch (e) {
            if (e instanceof Error) setError(e.message);
        }
    }, []);

    const me = room && session ? room.players.find(p => p.id === session.playerId) ?? null : null;
    const others = room && session ? room.players.filter(p => p.id !== session.playerId) : [];

    return {
        room, me, others,
        isHost: Boolean(room && session && room.meta.hostId === session.playerId),
        error,
        offline: failures >= 3,
        persistent,
        patch, host, refresh,
    };
}

/** Per-round state only counts if it was written for the round now in play —
 *  see the stateRound note in api/_lib/roomStore.ts. */
export const stateForRound = (player: RoomPlayer, round: number): Record<string, unknown> =>
    player.stateRound === round ? player.state : {};
