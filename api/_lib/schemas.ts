// Request-body validation schemas for the /api/ai dispatcher.
//
// One zod schema per request type, keyed by the same `type` string the
// dispatcher routes on. Each schema validates the *params* object — the
// request body AFTER `type` has been destructured off in api/ai.ts —
// against what the corresponding handler actually consumes.
//
// Design notes:
//   - `z.looseObject` everywhere: unknown extra keys pass through to the
//     handler untouched. Validation enforces only what handlers genuinely
//     require — it is never stricter than the handlers themselves.
//   - Fields the handlers default (e.g. `count = 15`) are optional here.
//   - `icebreaker` and `roast_or_toast`: their handlers declare a param named
//     `type` ('fun'|'deep' / 'roast'|'toast'), but the dispatcher strips `type`
//     (the routing key) off the body before the handler sees the params, so
//     that param can never actually arrive through /api/ai. Both handlers
//     tolerate its absence (they fall through to a default branch), so it is
//     optional here — requiring it would 400 every real request.
//
// zod is safe to import statically in api/ (unlike @google/genai — see the
// cold-start landmine notes in CLAUDE.md).

import { z } from 'zod';

// Shared shape for the four "category + optional count" Gemini handlers.
const categoryWithCount = z.looseObject({
    category: z.string(),
    count: z.number().optional(),
});

export const AI_REQUEST_SCHEMAS = {
    // ---- handlers-custom.ts (Claude-first, Gemini fallback) ----
    custom_mlt: z.looseObject({
        groupType: z.string(),
        customContext: z.string(),
        count: z.number().optional(), // handler defaults to 15
        tone: z.string().optional(),  // handler defaults to ''
    }),
    custom_tod: z.looseObject({
        groupType: z.string(),
        customContext: z.string(),
        playerNames: z.array(z.string()).optional(), // handler defaults to []
        count: z.number().optional(),                // handler defaults to 15
        tone: z.string().optional(),                 // handler defaults to ''
    }),
    custom_nhie: z.looseObject({
        groupType: z.string(),
        customContext: z.string(),
        count: z.number().optional(), // handler defaults to 15
        tone: z.string().optional(),  // handler defaults to ''
    }),

    // ---- handlers-gemini.ts ----
    charades_words: categoryWithCount, // count defaults to 20
    wilty: z.looseObject({
        count: z.number().optional(),  // handler defaults to 3
    }),
    nhie: categoryWithCount,           // count defaults to 5
    taboo_cards: categoryWithCount,    // count defaults to 10
    icebreaker: z.looseObject({
        type: z.enum(['fun', 'deep']).optional(), // see header note — stripped by the dispatcher
    }),
    mafia_narrative: z.looseObject({
        phase: z.enum(['INTRO', 'NIGHT', 'DAY']),
    }),
    wyr_batch: z.looseObject({
        count: z.number().optional(),  // handler defaults to 5
    }),
    psycho_analysis: z.looseObject({
        questionOptionA: z.string(),
        questionOptionB: z.string(),
        userChoice: z.enum(['A', 'B']),
    }),
    imposter_content: z.looseObject({}), // handler takes no params
    mlt: categoryWithCount,              // count defaults to 10
    contextual_lies: z.looseObject({
        topic: z.string(),
        trueStory: z.string(),
    }),

    // ---- handlers-image.ts ----
    generate_roast: z.looseObject({
        base64Image: z.string(),
        theme: z.string().optional(),   // handler defaults to 'animate'
        team: z.string().optional(),    // only matters for the worldcup theme
        variant: z.string().optional(), // only matters for the rock theme
    }),
    edit_image: z.looseObject({
        base64Image: z.string(),
        theme: z.string().optional(),   // theme takes precedence over prompt
        team: z.string().optional(),
        variant: z.string().optional(),
        prompt: z.string().optional(),  // fallback when no theme is given
    }),
    roast_or_toast: z.looseObject({
        image: z.string(),
        type: z.enum(['roast', 'toast']).optional(), // see header note — stripped by the dispatcher
    }),
} satisfies Record<string, z.ZodType>;

// Union of all accepted request types, derived from the schema map so the
// DISPATCH table in api/ai.ts and the schemas here can never drift apart.
export type AIRequestType = keyof typeof AI_REQUEST_SCHEMAS;
