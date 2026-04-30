// Diagnostic endpoint — GET /api/health
//
// Returns whether each provider's API key is present in the server's env at
// the moment of this invocation. NEVER returns the keys themselves, only
// booleans. Useful for confirming a Vercel deployment has the env vars
// scoped correctly without burning provider quota.
//
// Example response:
//   { ok: true, claude: true, gemini: false }
//
// If gemini comes back false in production, GEMINI_API_KEY is either missing
// from the Production env scope or hasn't been redeployed since being added.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isClaudeConfigured, isGeminiConfigured } from './_lib/clients';

export default function handler(_req: VercelRequest, res: VercelResponse) {
    return res.status(200).json({
        ok: true,
        claude: isClaudeConfigured(),
        gemini: isGeminiConfigured(),
    });
}
