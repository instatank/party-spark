// PartySpark AI proxy — single Vercel Serverless Function endpoint.
//
// All AI provider calls (Gemini + Claude) go through here instead of running
// in the browser, so the API keys never ship in the client bundle.
//
// Request shape:  POST /api/ai   { type: string, ...params }
// Response shape: 200 OK         { ok: true, data: <typed payload> }
//                 4xx/5xx        { ok: false, error: string }
//
// Unknown types 400. Params are validated against the zod schemas in
// _lib/schemas.ts before dispatch; invalid params also 400 with a message
// naming the failing field.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AI_REQUEST_SCHEMAS, type AIRequestType } from './_lib/schemas.js';
import { handleCustomMostLikelyTo, handleCustomTruthOrDrink, handleCustomNeverHaveIEver, handleRoastTextBatch } from './_lib/handlers-custom.js';
import {
    handleCharadesWords,
    handleWouldILieToYou,
    handleNeverHaveIEver,
    handleTabooCards,
    handleIcebreaker,
    handleMafiaNarrative,
    handleWouldYouRather,
    handlePsychoAnalysis,
    handleImposterContent,
    handleMostLikelyTo,
    handleContextualLies,
} from './_lib/handlers-gemini.js';
import {
    handleGenerateRoast,
    handleEditImage,
    handleRoastObserve,
} from './_lib/handlers-image.js';

// AIRequestType (the union of accepted request types) is derived from the
// schema map in _lib/schemas.ts. If you add a handler, add its schema there
// and its dispatch entry below.

// Dispatch table: type → handler. Each handler accepts the rest of the body
// (everything except `type`) and returns a serializable payload.
const DISPATCH: Record<AIRequestType, (params: Record<string, unknown>) => Promise<unknown>> = {
    custom_mlt: (p) => handleCustomMostLikelyTo(p as unknown as Parameters<typeof handleCustomMostLikelyTo>[0]),
    custom_tod: (p) => handleCustomTruthOrDrink(p as unknown as Parameters<typeof handleCustomTruthOrDrink>[0]),
    custom_nhie: (p) => handleCustomNeverHaveIEver(p as unknown as Parameters<typeof handleCustomNeverHaveIEver>[0]),
    charades_words: (p) => handleCharadesWords(p as unknown as Parameters<typeof handleCharadesWords>[0]),
    wilty: (p) => handleWouldILieToYou(p as unknown as Parameters<typeof handleWouldILieToYou>[0]),
    nhie: (p) => handleNeverHaveIEver(p as unknown as Parameters<typeof handleNeverHaveIEver>[0]),
    taboo_cards: (p) => handleTabooCards(p as unknown as Parameters<typeof handleTabooCards>[0]),
    icebreaker: (p) => handleIcebreaker(p as unknown as Parameters<typeof handleIcebreaker>[0]),
    mafia_narrative: (p) => handleMafiaNarrative(p as unknown as Parameters<typeof handleMafiaNarrative>[0]),
    wyr_batch: (p) => handleWouldYouRather(p as unknown as Parameters<typeof handleWouldYouRather>[0]),
    psycho_analysis: (p) => handlePsychoAnalysis(p as unknown as Parameters<typeof handlePsychoAnalysis>[0]),
    imposter_content: () => handleImposterContent(),
    mlt: (p) => handleMostLikelyTo(p as unknown as Parameters<typeof handleMostLikelyTo>[0]),
    contextual_lies: (p) => handleContextualLies(p as unknown as Parameters<typeof handleContextualLies>[0]),
    generate_roast: (p) => handleGenerateRoast(p as unknown as Parameters<typeof handleGenerateRoast>[0]),
    edit_image: (p) => handleEditImage(p as unknown as Parameters<typeof handleEditImage>[0]),
    roast_observe: (p) => handleRoastObserve(p as unknown as Parameters<typeof handleRoastObserve>[0]),
    roast_text_batch: (p) => handleRoastTextBatch(p as unknown as Parameters<typeof handleRoastTextBatch>[0]),
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed. Use POST.' });
    }

    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) || {};
    const { type, ...params } = body as { type?: string } & Record<string, unknown>;

    if (!type || typeof type !== 'string') {
        return res.status(400).json({ ok: false, error: 'Request body must include a "type" string.' });
    }

    const dispatcher = DISPATCH[type as AIRequestType];
    if (!dispatcher) {
        return res.status(400).json({ ok: false, error: `Unknown type: ${type}` });
    }

    // Validate params against this type's schema before dispatching. Schemas
    // are loose objects — unknown extra keys pass through to the handler.
    const parsed = AI_REQUEST_SCHEMAS[type as AIRequestType].safeParse(params);
    if (!parsed.success) {
        const detail = parsed.error.issues
            .map((issue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ` : '') + issue.message)
            .join('; ');
        return res.status(400).json({ ok: false, error: `Invalid params for type "${type}": ${detail}` });
    }

    try {
        const data = await dispatcher(parsed.data);
        return res.status(200).json({ ok: true, data });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ai] Handler threw for type=${type}:`, err);
        return res.status(500).json({ ok: false, error: msg });
    }
}
