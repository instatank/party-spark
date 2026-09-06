// Request validation for /api/room. Same discipline as _lib/schemas.ts: one
// zod schema per action, keyed by the string the dispatcher routes on.
//
// NOTE the routing key here is `action`, not `type`. /api/ai routes on `type`
// and therefore strips it from the params, which silently broke handlers that
// wanted a param of their own called `type` (see notes/01-api-type-param-
// collision.md). No game payload has ever had a field called `action`, so
// routing on that keeps the whole class of bug out of this endpoint.
//
// zod is safe to import statically in api/ — unlike @google/genai, whose
// CJS/ESM interop crashes the function on cold start (see CLAUDE.md).

import { z } from 'zod';

export const ROOM_CODE = z.string().regex(/^\d{4}$/, 'Room code must be 4 digits');

// Nicknames are shown to other players, so they are length-capped server-side
// as well as in the UI — the client cap is a courtesy, not a control.
const NAME = z.string().trim().min(1, 'Name required').max(20);

// Per-player game payload (score, found words, a bracket). Kept as a loose
// record so a new game can put its own shape in here without touching the API;
// the server never interprets it, it only files it under the right player.
const STATE = z.record(z.string(), z.unknown());

export const ROOM_REQUEST_SCHEMAS = {
    create: z.looseObject({
        game: z.string().min(1),
        name: NAME,
        config: z.record(z.string(), z.unknown()).optional(),
    }),
    join: z.looseObject({
        code: ROOM_CODE,
        name: NAME,
    }),
    poll: z.looseObject({
        code: ROOM_CODE,
        playerId: z.string().optional(),
    }),
    patch: z.looseObject({
        code: ROOM_CODE,
        playerId: z.string().min(1),
        state: STATE,
        name: NAME.optional(),
    }),
    // Host-only room mutation. `durationMs` is deliberately a DURATION, never
    // an absolute time: the server turns it into deadlineAt against its own
    // clock, so every phone counts down to the same instant regardless of how
    // wrong its device clock is. Letting a client post an absolute deadline
    // would reintroduce exactly the skew this design exists to remove.
    host: z.looseObject({
        code: ROOM_CODE,
        playerId: z.string().min(1),
        phase: z.string().optional(),
        round: z.number().int().min(0).optional(),
        config: z.record(z.string(), z.unknown()).optional(),
        seed: z.number().int().optional(),
        durationMs: z.number().int().min(0).max(30 * 60 * 1000).nullable().optional(),
        resetPlayerState: z.boolean().optional(),
    }),
    leave: z.looseObject({
        code: ROOM_CODE,
        playerId: z.string().min(1),
    }),
} satisfies Record<string, z.ZodType>;

export type RoomAction = keyof typeof ROOM_REQUEST_SCHEMAS;
