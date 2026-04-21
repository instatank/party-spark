// Client-side wrappers for Claude-backed custom generation.
//
// These no longer call the Anthropic SDK directly — they hit our own
// /api/ai endpoint, which runs server-side and holds the real API key.
// The API key is NEVER shipped to the browser anymore.
//
// The functions are kept here (and named the same as before) purely so the
// orchestration in geminiService.ts that imports them doesn't need to change.

import { callAI } from './aiClient';

export const generateCustomMostLikelyToClaude = async (
    groupType: string,
    customContext: string,
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    // Note: the server-side custom_mlt handler already does Claude-first,
    // Gemini-fallback internally. This function is effectively a direct
    // passthrough now — the fallback logic lives on the server.
    const data = await callAI<string[]>('custom_mlt', {
        groupType, customContext, count, tone,
    });
    return data ?? [];
};

export const generateCustomTruthOrDrinkClaude = async (
    groupType: string,
    customContext: string,
    playerNames: string[],
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    const data = await callAI<string[]>('custom_tod', {
        groupType, customContext, playerNames, count, tone,
    });
    return data ?? [];
};

// Previously checked the client env var. Now it's a server-side concern —
// the server either has the Anthropic key configured or it doesn't, and the
// custom handlers fall through to Gemini automatically when absent.
// Kept for backwards compatibility with imports; always returns true so the
// orchestrator in geminiService.ts always routes through the proxy.
export const isClaudeConfigured = (): boolean => true;
