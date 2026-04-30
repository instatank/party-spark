// Diagnostic endpoint — GET /api/health
//
// SELF-CONTAINED on purpose: it does NOT import clients.ts or either AI
// SDK. The whole point is to be the thing that still works even if the
// SDK imports themselves are crashing. So the env-var checks are
// inlined here instead of going through isClaudeConfigured() etc.
//
// Response shape:
//   { ok: true, claude: true, gemini: false, node: "v20.x" }
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
        node: process.version,
    });
}
