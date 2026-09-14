// PartySpark multiplayer rooms — the only stateful endpoint in the app.
//
// Request shape:  POST /api/room  { action: string, ...params }
//                 GET  /api/room?action=poll&code=4471[&playerId=...]
// Response shape: 200 OK          { ok: true, data: { room, now, ... } }
//                 4xx/5xx         { ok: false, error: string }
//
// EVERY response carries `now` — the server's epoch ms at the moment it
// answered. Clients use it to measure their own clock offset, which is what
// makes a once-a-second poll feel simultaneous: rounds end at a shared
// deadlineAt rather than starting on a "go" message, so two phones fire their
// buzzer at the same instant even when one learns about the round a second late
// and its device clock is minutes off.
//
// Trust model: scoring is client-authoritative. Any player can post any score.
// That is a deliberate non-goal — these are friends in a room, and anti-cheat
// would cost more than it protects. Nothing here is a security boundary; the
// only server-enforced rules are "one writer per key" and "the host owns meta".

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ROOM_REQUEST_SCHEMAS, type RoomAction } from './_lib/roomSchemas.js';
import {
    readRoom, roomExists, writeMeta, writePlayer, removePlayer, isPersistent, selfTest,
    type Room, type RoomMeta, type RoomPlayer,
} from './_lib/roomStore.js';

const MAX_PLAYERS = 8;
const CODE_ATTEMPTS = 12;

const newId = (): string => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const newCode = (): string => String(Math.floor(Math.random() * 10000)).padStart(4, '0');
const newSeed = (): number => Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;

// Codes are short enough to say out loud, which means they collide. Retry
// against the store rather than trusting 1-in-10,000: a collision would drop a
// joiner into a stranger's game, which is a far worse failure than a retry.
async function allocateCode(): Promise<string> {
    for (let i = 0; i < CODE_ATTEMPTS; i++) {
        const code = newCode();
        if (!(await roomExists(code))) return code;
    }
    throw new Error('Could not allocate a free room code. Try again in a moment.');
}

const shape = (room: Room, extra: Record<string, unknown> = {}) => ({
    room,
    now: Date.now(),
    persistent: isPersistent(),
    ...extra,
});

async function loadRoom(code: string): Promise<Room> {
    const room = await readRoom(code);
    if (!room) throw new HttpError(404, `No room with code ${code}. It may have expired.`);
    return room;
}

class HttpError extends Error {
    constructor(public status: number, message: string) { super(message); }
}

const HANDLERS: Record<RoomAction, (p: Record<string, unknown>) => Promise<unknown>> = {
    async create(p) {
        const { game, name, config } = p as { game: string; name: string; config?: Record<string, unknown> };
        const code = await allocateCode();
        const hostId = newId();
        const now = Date.now();

        const meta: RoomMeta = {
            code, game, hostId, createdAt: now, rev: 1,
            phase: 'LOBBY', seed: newSeed(), round: 0,
            deadlineAt: null, config: config ?? {},
        };
        const host: RoomPlayer = {
            id: hostId, name, joinedAt: now, lastSeen: now, rev: 1, state: {}, stateRound: 0,
        };
        await writeMeta(meta);
        await writePlayer(code, host);
        return shape({ meta, players: [host] }, { code, playerId: hostId });
    },

    async join(p) {
        const { code, name } = p as { code: string; name: string };
        const room = await loadRoom(code);
        if (room.players.length >= MAX_PLAYERS) {
            throw new HttpError(409, `That room is full (${MAX_PLAYERS} players).`);
        }
        // Joining mid-game is allowed — a dropped player reconnecting is the
        // common case, and refusing it would strand them. They arrive with an
        // empty state whose stateRound is stale, so the current round simply
        // treats them as not having answered yet.
        const now = Date.now();
        const player: RoomPlayer = {
            id: newId(), name, joinedAt: now, lastSeen: now, rev: 1, state: {}, stateRound: room.meta.round,
        };
        await writePlayer(code, player);
        return shape(
            { meta: room.meta, players: [...room.players, player] },
            { code, playerId: player.id },
        );
    },

    async poll(p) {
        const { code, playerId } = p as { code: string; playerId?: string };
        const room = await loadRoom(code);
        // A poll doubles as a heartbeat, but only writes when the stamp is
        // genuinely stale — otherwise every player would issue a write every
        // second purely to say "still here", turning a read-mostly workload
        // into a write-mostly one for no benefit.
        if (playerId) {
            const me = room.players.find(pl => pl.id === playerId);
            if (me && Date.now() - me.lastSeen > 10_000) {
                me.lastSeen = Date.now();
                await writePlayer(code, me);
            }
        }
        return shape(room);
    },

    async patch(p) {
        const { code, playerId, state, name } = p as
            { code: string; playerId: string; state: Record<string, unknown>; name?: string };
        const room = await loadRoom(code);
        const me = room.players.find(pl => pl.id === playerId);
        if (!me) throw new HttpError(404, 'You are not in this room. Rejoin with the code.');

        // A player writes only their own key, so this read-modify-write cannot
        // race another player's. It can only race THIS player's other tab,
        // which is not a case worth defending against.
        const updated: RoomPlayer = {
            ...me,
            name: name ?? me.name,
            lastSeen: Date.now(),
            rev: me.rev + 1,
            state: { ...me.state, ...state },
            stateRound: room.meta.round,
        };
        await writePlayer(code, updated);
        return shape({
            meta: room.meta,
            players: room.players.map(pl => (pl.id === playerId ? updated : pl)),
        });
    },

    async host(p) {
        const { code, playerId, phase, round, config, seed, durationMs } = p as {
            code: string; playerId: string; phase?: string; round?: number;
            config?: Record<string, unknown>; seed?: number; durationMs?: number | null;
        };
        const room = await loadRoom(code);
        if (room.meta.hostId !== playerId) {
            throw new HttpError(403, 'Only the host can change the round.');
        }

        const meta: RoomMeta = {
            ...room.meta,
            rev: room.meta.rev + 1,
            phase: phase ?? room.meta.phase,
            round: round ?? room.meta.round,
            config: config ? { ...room.meta.config, ...config } : room.meta.config,
            seed: seed ?? room.meta.seed,
            // The whole point: the client asks for "90 seconds", the SERVER
            // decides when that lands. deadlineAt is never accepted from a
            // client, so no device's clock can skew the shared buzzer.
            deadlineAt: durationMs === undefined
                ? room.meta.deadlineAt
                : durationMs === null ? null : Date.now() + durationMs,
        };
        await writeMeta(meta);
        return shape({ meta, players: room.players });
    },

    // Diagnostic: round-trip the real store and report. Writes only to its own
    // key namespace, so it can never touch a live room.
    async selftest() {
        return selfTest();
    },

    async leave(p) {
        const { code, playerId } = p as { code: string; playerId: string };
        await removePlayer(code, playerId);
        const room = await readRoom(code);
        return shape(room ?? { meta: null as unknown as RoomMeta, players: [] });
    },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Rooms are live state — a cached poll response would show a stale score.
    res.setHeader('Cache-Control', 'no-store');

    const source: Record<string, unknown> = req.method === 'GET'
        ? (req.query as Record<string, unknown>)
        : ((typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {});

    const { action, ...params } = source as { action?: string } & Record<string, unknown>;

    if (!action || typeof action !== 'string') {
        return res.status(400).json({ ok: false, error: 'Request must include an "action" string.' });
    }
    const dispatcher = HANDLERS[action as RoomAction];
    if (!dispatcher) {
        return res.status(400).json({ ok: false, error: `Unknown action: ${action}` });
    }
    if (req.method === 'GET' && action !== 'poll' && action !== 'selftest') {
        return res.status(405).json({ ok: false, error: 'Only poll and selftest may be sent as GET.' });
    }

    const parsed = ROOM_REQUEST_SCHEMAS[action as RoomAction].safeParse(params);
    if (!parsed.success) {
        const detail = parsed.error.issues
            .map(issue => (issue.path.length ? `${issue.path.map(String).join('.')}: ` : '') + issue.message)
            .join('; ');
        return res.status(400).json({ ok: false, error: `Invalid params for "${action}": ${detail}` });
    }

    try {
        const data = await dispatcher(parsed.data as Record<string, unknown>);
        return res.status(200).json({ ok: true, data });
    } catch (err) {
        const status = err instanceof HttpError ? err.status : 500;
        const msg = err instanceof Error ? err.message : String(err);
        if (status >= 500) console.error(`[room] ${action} threw:`, err);
        return res.status(status).json({ ok: false, error: msg });
    }
}
