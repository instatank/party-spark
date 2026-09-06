// Diagnostic endpoint — GET /api/health
//
// SELF-CONTAINED on purpose: it does NOT import clients.ts or either AI
// SDK. The whole point is to be the thing that still works even if the
// SDK imports themselves are crashing. So the env-var checks are
// inlined here instead of going through isClaudeConfigured() etc.
//
// Response shape:
//   { ok: true, claude: true, gemini: false, roomStore: "redis", node: "v20.x" }
//
// roomStore is the ONLY way to confirm multiplayer will actually work on a
// given deployment. Without a Redis store the room API silently falls back to
// an in-process Map, which cannot share state across serverless instances —
// two phones join "the same" room and never see each other. That failure looks
// like a bug in the game rather than missing configuration, so it gets a
// diagnostic you can open in a browser. Env vars are also per-deployment:
// adding the store does nothing until something redeploys, which this reports
// truthfully because it reads the env of the deployment answering the request.
//
// If this endpoint itself 500s on a deployment, the problem is bigger
// than "missing keys" — likely a bundling / runtime / Node version
// issue with the deployment as a whole.

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default function handler(_req: VercelRequest, res: VercelResponse) {
    return res.status(200).json({
        ok: true,
        claude: Boolean(process.env.ANTHROPIC_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        // Kept in sync with isPersistent() in _lib/roomStore.ts — inlined here
        // deliberately, per this file's self-contained rule.
        roomStore: (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL)
            && (process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN)
            ? 'redis' : 'memory',
        node: process.version,
    });
}
