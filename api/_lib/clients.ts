// Server-side SDK client singletons. Instantiated once per Vercel serverless
// function cold start, reused across warm invocations.
//
// These are NOT importable from the browser bundle — only from other files
// inside api/ (Vercel treats api/_lib/ as private, non-routed helpers).
//
// Env vars used here are server-only:
//   GEMINI_API_KEY      (no VITE_ prefix → never exposed to client bundle)
//   ANTHROPIC_API_KEY   (no VITE_ prefix → never exposed to client bundle)

import { GoogleGenAI } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';

let _gemini: GoogleGenAI | null = null;
let _claude: Anthropic | null = null;

export const getGemini = (): GoogleGenAI | null => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return null;
    if (!_gemini) _gemini = new GoogleGenAI({ apiKey: key });
    return _gemini;
};

export const getClaude = (): Anthropic | null => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return null;
    if (!_claude) _claude = new Anthropic({ apiKey: key });
    return _claude;
};

export const isClaudeConfigured = (): boolean => Boolean(process.env.ANTHROPIC_API_KEY);
export const isGeminiConfigured = (): boolean => Boolean(process.env.GEMINI_API_KEY);
