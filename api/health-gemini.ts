// Deep Gemini probe — GET /api/health-gemini
//
// We've already confirmed: the key is present, the SDK loads, the client
// instantiates. The failure is at API call time with 429 RESOURCE_EXHAUSTED
// even though Google Cloud Console claims billing is enabled.
//
// This probe checks three angles:
//
// 1. KEY IDENTITY — returns last 4 chars of the env-var key so the user
//    can spot-check it against what AI Studio shows for the active key.
//    NEVER returns the full key. Surface lengths only ("...eK4j").
//
// 2. MODEL-LEVEL QUOTA — tries 4 different Gemini models. If only the
//    flash variants fail but pro succeeds (or vice versa), the issue is
//    a per-model quota, not project-wide.
//
// 3. RAW ERROR — captures the full provider response (not parsed) so we
//    can see the exact quota that's hitting (RPM, daily, monthly, or a
//    specific resource).
//
// Models probed (cheap, max 1 token each):
//   - gemini-2.0-flash-001    (current handlers default)
//   - gemini-1.5-flash         (older but proven)
//   - gemini-1.5-pro           (different quota bucket)
//   - gemini-2.0-flash-lite-001 (the lighter variant)

import type { VercelRequest, VercelResponse } from '@vercel/node';

interface ModelProbe {
    model: string;
    ok: boolean;
    error?: string;
    rawError?: unknown;
}

const MODELS_TO_TRY = [
    'gemini-2.0-flash-001',
    'gemini-1.5-flash',
    'gemini-1.5-pro',
    'gemini-2.0-flash-lite-001',
];

const probeModel = async (
    GoogleGenAI: any,
    apiKey: string,
    model: string
): Promise<ModelProbe> => {
    const out: ModelProbe = { model, ok: false };
    try {
        const client = new GoogleGenAI({ apiKey });
        await client.models.generateContent({
            model,
            contents: 'hi',
            config: { maxOutputTokens: 1 },
        });
        out.ok = true;
    } catch (err) {
        const e = err as Error & { error?: unknown };
        out.error = `${e.name}: ${e.message}`;
        // Anthropic / Gemini SDKs often hang the parsed body off `.error`.
        // Capture whatever's there so we see the raw quota name.
        if (e.error !== undefined) out.rawError = e.error;
    }
    return out;
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
    const key = process.env.GEMINI_API_KEY;
    const keyTail = key ? `...${key.slice(-4)}` : null;
    const keyLength = key?.length ?? 0;

    if (!key) {
        return res.status(200).json({
            ok: true,
            keyPresent: false,
            keyTail,
            keyLength,
            results: [],
        });
    }

    let GoogleGenAI: any;
    try {
        const mod = await import('@google/genai');
        GoogleGenAI = mod.GoogleGenAI;
    } catch (err) {
        return res.status(200).json({
            ok: true,
            keyPresent: true,
            keyTail,
            keyLength,
            sdkLoadError: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
            results: [],
        });
    }

    const results: ModelProbe[] = [];
    // Sequential rather than parallel so we don't trigger per-second
    // rate-limit weirdness while diagnosing rate-limit weirdness.
    for (const model of MODELS_TO_TRY) {
        results.push(await probeModel(GoogleGenAI, key, model));
    }

    return res.status(200).json({
        ok: true,
        keyPresent: true,
        keyTail,
        keyLength,
        node: process.version,
        results,
    });
}
