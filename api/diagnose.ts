// FAIL-SAFE diagnostic — even module-load errors get reported in the response.
//
// All previous diagnostics import clients.ts. If THAT import throws at load
// time on Vercel, the function dies before the handler runs and we get the
// generic FUNCTION_INVOCATION_FAILED 500 with no useful info.
//
// This endpoint imports clients.ts inside a try block IN THE HANDLER, not
// at module top-level. Any error — module load, function execution,
// anything — gets serialised back to the client as JSON.
//
// Hit: GET /api/diagnose

import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(_req: VercelRequest, res: VercelResponse) {
    const stages: Record<string, unknown> = {
        node: process.version,
        env: {
            claude: Boolean(process.env.ANTHROPIC_API_KEY),
            gemini: Boolean(process.env.GEMINI_API_KEY),
        },
    };

    // Stage 1: dynamically import clients.ts. If THIS throws, we'll see the
    // exact error instead of Vercel's opaque crash.
    let clients: any = null;
    try {
        clients = await import('./_lib/clients.js');
        stages.clients_module_loaded = true;
        stages.clients_exports = Object.keys(clients);
    } catch (err) {
        const e = err as Error;
        stages.clients_module_loaded = false;
        stages.clients_load_error = `${e.name}: ${e.message}`;
        stages.clients_load_stack = e.stack?.split('\n').slice(0, 6).join('\n');
        return res.status(200).json({ ok: false, where: 'clients-import', stages });
    }

    // Stage 2: call getClaude.
    try {
        const c = await clients.getClaude();
        stages.claude_loaded = c !== null;
        stages.claude_constructor = c?.constructor?.name ?? null;
    } catch (err) {
        const e = err as Error;
        stages.claude_loaded = false;
        stages.claude_error = `${e.name}: ${e.message}`;
        stages.claude_stack = e.stack?.split('\n').slice(0, 6).join('\n');
    }

    // Stage 3: call getGemini.
    try {
        const g = await clients.getGemini();
        stages.gemini_loaded = g !== null;
        stages.gemini_constructor = g?.constructor?.name ?? null;
    } catch (err) {
        const e = err as Error;
        stages.gemini_loaded = false;
        stages.gemini_error = `${e.name}: ${e.message}`;
        stages.gemini_stack = e.stack?.split('\n').slice(0, 6).join('\n');
    }

    // Stage 4: try a real Claude API call (1 token, basically free).
    if (stages.claude_loaded === true) {
        try {
            const c = await clients.getClaude();
            const msg = await c.messages.create({
                model: 'claude-haiku-4-5',
                max_tokens: 1,
                messages: [{ role: 'user', content: 'hi' }],
            });
            stages.claude_api_ok = true;
            stages.claude_api_stop_reason = msg.stop_reason;
        } catch (err) {
            const e = err as Error & { status?: number; error?: unknown };
            stages.claude_api_ok = false;
            stages.claude_api_error = `${e.name}: ${e.message}`;
            stages.claude_api_status = e.status;
            stages.claude_api_body = e.error;
        }
    }

    return res.status(200).json({ ok: true, stages });
}
