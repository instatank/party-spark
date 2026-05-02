// Probes the rewritten clients.ts in isolation.
//
// If THIS endpoint 500s on cold start, the dynamic-import refactor in
// clients.ts didn't actually fix the import-time crash and we need to
// look elsewhere. If it returns JSON, the refactor works and the
// problem must be in something downstream.
//
// We import + call both lazy getters here so any module-load failure
// shows up in the response body, not as a function crash.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGemini, getClaude, isClaudeConfigured, isGeminiConfigured } from './_lib/clients.js';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
    const out: Record<string, unknown> = {
        ok: true,
        node: process.version,
        keys: { claude: isClaudeConfigured(), gemini: isGeminiConfigured() },
    };

    try {
        const c = await getClaude();
        out.claude_loaded = c !== null;
    } catch (err) {
        const e = err as Error;
        out.claude_loaded = false;
        out.claude_error = `${e.name}: ${e.message}`;
    }

    try {
        const g = await getGemini();
        out.gemini_loaded = g !== null;
    } catch (err) {
        const e = err as Error;
        out.gemini_loaded = false;
        out.gemini_error = `${e.name}: ${e.message}`;
    }

    return res.status(200).json(out);
}
