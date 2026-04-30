// Deep diagnostic — GET /api/health-sdks
//
// Tests each AI SDK independently:
//   1. Can the SDK module load?
//   2. Can a client instantiate with the key?
//   3. Does a minimal real call succeed (cheap, sub-100-token)?
//
// Each step's outcome is reported per provider. The failure is isolated
// to a specific stage so we know exactly what's broken — module-load
// failure (Node version / bundling) vs auth failure (key revoked at
// provider) vs quota / rate limit.
//
// This is dynamic-import per provider so a crash in one SDK doesn't
// cascade — both report independently.

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ProbeResult {
    keyPresent: boolean;
    sdkLoaded: boolean;
    clientCreated: boolean;
    apiCallOk: boolean;
    error?: string;
}

const probeClaude = async (): Promise<ProbeResult> => {
    const out: ProbeResult = { keyPresent: false, sdkLoaded: false, clientCreated: false, apiCallOk: false };
    try {
        const key = process.env.ANTHROPIC_API_KEY;
        out.keyPresent = Boolean(key);
        if (!key) return out;

        const mod = await import('@anthropic-ai/sdk');
        out.sdkLoaded = true;

        const Anthropic = mod.default;
        const client = new Anthropic({ apiKey: key });
        out.clientCreated = true;

        // Smallest possible real call: a 1-token completion.
        await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
        });
        out.apiCallOk = true;
    } catch (err) {
        out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    return out;
};

const probeGemini = async (): Promise<ProbeResult> => {
    const out: ProbeResult = { keyPresent: false, sdkLoaded: false, clientCreated: false, apiCallOk: false };
    try {
        const key = process.env.GEMINI_API_KEY;
        out.keyPresent = Boolean(key);
        if (!key) return out;

        const mod = await import('@google/genai');
        out.sdkLoaded = true;

        const client = new mod.GoogleGenAI({ apiKey: key });
        out.clientCreated = true;

        // Smallest possible real call.
        await client.models.generateContent({
            model: 'gemini-2.0-flash-001',
            contents: 'hi',
            config: { maxOutputTokens: 1 },
        });
        out.apiCallOk = true;
    } catch (err) {
        out.error = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    return out;
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
    const [claude, gemini] = await Promise.all([probeClaude(), probeGemini()]);
    return res.status(200).json({
        ok: true,
        node: process.version,
        claude,
        gemini,
    });
}
