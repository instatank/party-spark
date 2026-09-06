// =============================================================================
// Room storage — the "shared noticeboard" behind multiplayer.
//
// This is the first server-side STATE PartySpark has ever had; everything under
// api/ before this was a stateless AI proxy. Two rules follow from that and are
// deliberately baked in below:
//   1. Nothing identifying is stored. A room holds a nickname and a score. No
//      accounts, ever (see CLAUDE.md) — and no way to add them by accident.
//   2. Everything expires. Every write refreshes a 3-hour TTL, so the store
//      empties itself and there is no cleanup job to forget to run.
//
// KEY LAYOUT — the important design decision here.
//
// Room state is NOT one document. It is split so that every writer owns its own
// key and no two writers ever touch the same one:
//
//   room:{code}:meta         written ONLY by the host  (phase, round, seed, deadline)
//   room:{code}:members      a Redis SET of player ids (SADD/SREM are atomic)
//   room:{code}:p:{playerId} written ONLY by that player (their name + score)
//
// A single-document room would need read-modify-write, and two phones posting a
// score in the same tick would silently clobber one another — the classic lost
// update. Partitioning by writer makes that race unrepresentable instead of
// merely unlikely, with no locks, no WATCH/MULTI, and no Lua.
//
// BACKENDS: Upstash Redis over its REST API when the env vars are present,
// otherwise an in-process Map. The Map is for `vercel dev` only — serverless
// instances do not share memory, so in production it would put two players in
// two different rooms that happen to share a code. isPersistent() reports which
// backend is live and /api/room surfaces it, so that failure mode is visible
// rather than mysterious.
// =============================================================================

const TTL_SECONDS = 3 * 60 * 60; // 3 hours — comfortably longer than a party

// The Vercel Marketplace Upstash integration injects UPSTASH_*; older Vercel KV
// stores injected KV_*. Accept either so provisioning either way just works.
const REST_URL = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? '';
const REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? '';

export const isPersistent = (): boolean => Boolean(REST_URL && REST_TOKEN);

// --- Upstash REST -----------------------------------------------------------
// One POST carries an array-of-arrays pipeline, so a full room read is a single
// round trip rather than one per key.

type Command = (string | number)[];

async function pipeline(commands: Command[]): Promise<unknown[]> {
    const res = await fetch(`${REST_URL.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${REST_TOKEN}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(commands.map(c => c.map(String))),
    });
    if (!res.ok) {
        throw new Error(`Room store ${res.status}: ${await res.text().catch(() => res.statusText)}`);
    }
    const json = (await res.json()) as ({ result?: unknown; error?: string })[];
    const failed = json.find(r => r?.error);
    if (failed) throw new Error(`Room store command failed: ${failed.error}`);
    return json.map(r => r?.result ?? null);
}

// --- in-memory dev fallback -------------------------------------------------
// Values mirror the Redis shape: strings for GET/SET keys, Sets for members.

const mem = new Map<string, { value: string | Set<string>; expiresAt: number }>();

function memGet(key: string): string | Set<string> | null {
    const hit = mem.get(key);
    if (!hit) return null;
    if (hit.expiresAt < Date.now()) { mem.delete(key); return null; }
    return hit.value;
}

function memSet(key: string, value: string | Set<string>): void {
    mem.set(key, { value, expiresAt: Date.now() + TTL_SECONDS * 1000 });
}

// --- key helpers ------------------------------------------------------------

const metaKey = (code: string) => `room:${code}:meta`;
const membersKey = (code: string) => `room:${code}:members`;
const playerKey = (code: string, playerId: string) => `room:${code}:p:${playerId}`;

// --- public shapes ----------------------------------------------------------

export interface RoomMeta {
    code: string;
    game: string;            // GameType string, e.g. 'JUMBLE'
    hostId: string;
    createdAt: number;
    rev: number;             // bumped on every host write
    phase: string;           // game-defined: LOBBY | PLAY | REVEAL | END
    seed: number;            // shared RNG seed — both phones deal from this
    round: number;
    deadlineAt: number | null; // server-authored epoch ms; never a "start now"
    config: Record<string, unknown>;
}

export interface RoomPlayer {
    id: string;
    name: string;
    joinedAt: number;
    lastSeen: number;
    rev: number;
    state: Record<string, unknown>; // game-defined per-player payload
    // The round `state` was written for. A new round does NOT clear anyone's
    // state — the host would have to write keys it does not own, reintroducing
    // the very race the key layout removes. Instead the stamp goes stale on its
    // own and readers ignore state whose stateRound !== meta.round. Zero writes,
    // zero races, and a late arrival from the previous round cannot be mistaken
    // for an answer to the current one.
    stateRound: number;
}

export interface Room {
    meta: RoomMeta;
    players: RoomPlayer[];
}

const parse = <T>(raw: unknown): T | null => {
    if (raw == null) return null;
    if (typeof raw === 'object') return raw as T; // Upstash may pre-parse JSON
    try { return JSON.parse(String(raw)) as T; } catch { return null; }
};

// --- operations -------------------------------------------------------------

export async function readRoom(code: string): Promise<Room | null> {
    if (isPersistent()) {
        const [rawMeta, rawMembers] = await pipeline([
            ['GET', metaKey(code)],
            ['SMEMBERS', membersKey(code)],
        ]);
        const meta = parse<RoomMeta>(rawMeta);
        if (!meta) return null;

        const ids = Array.isArray(rawMembers) ? rawMembers.map(String) : [];
        if (ids.length === 0) return { meta, players: [] };

        const rawPlayers = await pipeline(ids.map(id => ['GET', playerKey(code, id)]));
        const players = rawPlayers
            .map(r => parse<RoomPlayer>(r))
            .filter((p): p is RoomPlayer => p !== null)
            .sort((a, b) => a.joinedAt - b.joinedAt);
        return { meta, players };
    }

    const meta = parse<RoomMeta>(memGet(metaKey(code)));
    if (!meta) return null;
    const members = memGet(membersKey(code));
    const ids = members instanceof Set ? [...members] : [];
    const players = ids
        .map(id => parse<RoomPlayer>(memGet(playerKey(code, id))))
        .filter((p): p is RoomPlayer => p !== null)
        .sort((a, b) => a.joinedAt - b.joinedAt);
    return { meta, players };
}

export async function roomExists(code: string): Promise<boolean> {
    if (isPersistent()) {
        const [n] = await pipeline([['EXISTS', metaKey(code)]]);
        return Number(n) > 0;
    }
    return memGet(metaKey(code)) !== null;
}

export async function writeMeta(meta: RoomMeta): Promise<void> {
    const payload = JSON.stringify(meta);
    if (isPersistent()) {
        await pipeline([['SET', metaKey(meta.code), payload, 'EX', TTL_SECONDS]]);
        return;
    }
    memSet(metaKey(meta.code), payload);
}

// Writing a player also re-arms the TTL on the room's meta and member set, so
// an active party never expires mid-game just because the host stopped writing.
export async function writePlayer(code: string, player: RoomPlayer): Promise<void> {
    const payload = JSON.stringify(player);
    if (isPersistent()) {
        await pipeline([
            ['SET', playerKey(code, player.id), payload, 'EX', TTL_SECONDS],
            ['SADD', membersKey(code), player.id],
            ['EXPIRE', membersKey(code), TTL_SECONDS],
            ['EXPIRE', metaKey(code), TTL_SECONDS],
        ]);
        return;
    }
    memSet(playerKey(code, player.id), payload);
    const existing = memGet(membersKey(code));
    const set = existing instanceof Set ? existing : new Set<string>();
    set.add(player.id);
    memSet(membersKey(code), set);
    const meta = memGet(metaKey(code));
    if (typeof meta === 'string') memSet(metaKey(code), meta);
}

// --- self test ---------------------------------------------------------------
// Round-trips the ACTUAL configured backend and reports what happened.
//
// This exists because of a real gap: the two-browser drives all run against
// `serve-with-api.mjs`, which has no Upstash credentials and therefore
// exercises the in-process Map every time. Every multiplayer guarantee was
// verified on a backend that production never uses. The Redis path — the REST
// pipeline, SADD/SMEMBERS, EXPIRE, the TTL refresh — could be wrong in ways
// nothing local would catch, and the symptom would be "the game is broken"
// rather than "the store is misconfigured".
//
// Deliberately uses its own key namespace, NOT a room code: a self test must
// never be able to collide with, or clobber, somebody's live game.
export interface SelfTestResult {
    backend: 'redis' | 'memory';
    ok: boolean;
    steps: { step: string; ok: boolean; detail?: string }[];
    ms: number;
}

export async function selfTest(): Promise<SelfTestResult> {
    const started = Date.now();
    const backend: 'redis' | 'memory' = isPersistent() ? 'redis' : 'memory';
    const steps: SelfTestResult['steps'] = [];
    const key = `selftest:${Math.random().toString(36).slice(2, 10)}`;
    const setKey = `${key}:members`;
    const payload = JSON.stringify({ hello: 'world', at: started });

    const record = (step: string, ok: boolean, detail?: string) => {
        steps.push(detail === undefined ? { step, ok } : { step, ok, detail });
        return ok;
    };

    try {
        if (backend === 'redis') {
            // A string with a TTL, read back verbatim. This is the shape every
            // meta and player document uses.
            await pipeline([['SET', key, payload, 'EX', 60]]);
            const [got] = await pipeline([['GET', key]]);
            const back = typeof got === 'object' && got !== null ? JSON.stringify(got) : String(got ?? '');
            record('write + read a document', back === payload, back === payload ? undefined : `got ${back.slice(0, 80)}`);

            // The TTL must actually be set — without it the store fills up
            // forever, which is the failure that takes a month to notice.
            const [ttl] = await pipeline([['TTL', key]]);
            record('expiry is armed', Number(ttl) > 0 && Number(ttl) <= 60, `ttl=${ttl}`);

            // The member set: SADD/SMEMBERS is how a room learns who is in it.
            await pipeline([['SADD', setKey, 'p1'], ['SADD', setKey, 'p2'], ['EXPIRE', setKey, 60]]);
            const [members] = await pipeline([['SMEMBERS', setKey]]);
            const list = Array.isArray(members) ? members.map(String).sort() : [];
            record('member set add + read', list.join(',') === 'p1,p2', `members=[${list.join(', ')}]`);

            await pipeline([['DEL', key], ['DEL', setKey]]);
            const [gone] = await pipeline([['EXISTS', key]]);
            record('cleanup', Number(gone) === 0);
        } else {
            record('backend is the in-process Map', false,
                'No Redis configured. This works for one serverless instance only, so two phones will NOT find each other in production.');
        }
    } catch (err) {
        record('store reachable', false, err instanceof Error ? err.message : String(err));
    }

    return { backend, ok: steps.every(s => s.ok), steps, ms: Date.now() - started };
}

export async function removePlayer(code: string, playerId: string): Promise<void> {
    if (isPersistent()) {
        await pipeline([
            ['DEL', playerKey(code, playerId)],
            ['SREM', membersKey(code), playerId],
        ]);
        return;
    }
    mem.delete(playerKey(code, playerId));
    const existing = memGet(membersKey(code));
    if (existing instanceof Set) { existing.delete(playerId); memSet(membersKey(code), existing); }
}
