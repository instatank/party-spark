// Server-side SDK client singletons. Instantiated once per Vercel serverless
// function cold start, reused across warm invocations.
//
// IMPORTANT: imports below are DYNAMIC, not static. Static top-level
// `import { GoogleGenAI } from '@google/genai'` crashes the Vercel
// function at cold start on Node 24. Loading the SDK inside an async
// function works fine. The Anthropic SDK is fine either way, but we
// keep both lazy for symmetry and to defer cold-start work.
//
// Env vars used here are server-only:
//   GEMINI_API_KEY      (no VITE_ prefix → never exposed to client bundle)
//   ANTHROPIC_API_KEY   (no VITE_ prefix → never exposed to client bundle)

// Loose `any` types for the SDK clients — pinning concrete types would
// require static type imports, which is exactly what we're avoiding here
// to dodge the cold-start crash. Trade some IDE typing for deploy
// reliability.
let _gemini: any = null;
let _claude: any = null;

export const getGemini = async (): Promise<any | null> => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    if (!_gemini) {
        const mod = await import('@google/genai');
        _gemini = new mod.GoogleGenAI({ apiKey: key });
    }
    return _gemini;
};

export const getClaude = async (): Promise<any | null> => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    if (!_claude) {
        const mod = await import('@anthropic-ai/sdk');
        _claude = new mod.default({ apiKey: key });
    }
    return _claude;
};

export const isClaudeConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);
export const isGeminiConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY);
