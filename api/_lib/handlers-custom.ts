// Custom generation handlers — user provides a free-text description of their
// group, and we generate questions tailored to that context.
//
// Orchestration: Claude (Haiku 4.5 w/ structured output) is the preferred
// provider. Falls back to Gemini if Claude isn't configured or returns empty.
//
// These handlers are called by api/ai.ts via the dispatcher.

import { Type } from '@google/genai';
import Anthropic from '@anthropic-ai/sdk';
import { getGemini, getClaude, isClaudeConfigured } from './clients';

const CLAUDE_MODEL = 'claude-haiku-4-5';
const GEMINI_MODEL = 'gemini-2.0-flash-001';

const STRING_ARRAY_SCHEMA = { type: 'array', items: { type: 'string' }, additionalProperties: false } as const;

const parseClaudeJson = (message: Anthropic.Message): string[] => {
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    if (!text) return [];
    try {
        const parsed = JSON.parse(text);
        return Array.isArray(parsed) ? parsed.filter(q => typeof q === 'string' && q.trim().length > 0) : [];
    } catch {
        return [];
    }
};

// =============================================================================
// Most Likely To — Custom
// =============================================================================

export interface CustomMLTParams {
    groupType: string;
    customContext: string;
    count?: number;
    tone?: string;
}

export const handleCustomMostLikelyTo = async (params: CustomMLTParams): Promise<string[]> => {
    const { groupType, customContext, count = 15, tone = '' } = params;

    if (isClaudeConfigured()) {
        const viaClaude = await generateCustomMLTClaude(groupType, customContext, count, tone);
        if (viaClaude.length > 0) return viaClaude;
        console.warn('[ai/custom_mlt] Claude returned empty — falling through to Gemini.');
    }
    return generateCustomMLTGemini(groupType, customContext, count, tone);
};

const generateCustomMLTClaude = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const claude = getClaude();
    if (!claude) return [];

    const toneHint = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';

    const system = `You are a party game writer creating "Most Likely To" questions for a specific group of people.

Each question is read aloud, and the group points at whoever fits the description best.

Your job: generate questions that feel personally written for THIS group — referencing their names, places, running jokes, and shared history. Mix teasing with warmth. Keep things fun rather than cruel.`;

    const user = `GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

Generate exactly ${count} "Most Likely To" questions specifically tailored to this group.

Rules:
- Each question must start with "Who is most likely to..."
- USE the specifics they gave you — names, places, situations, inside jokes. Weave them in naturally.
- Avoid generic questions like "Who is most likely to be late?" unless the context twists it.
- Mix lighthearted teasing with wholesome observations.
- ${toneHint}

Return a JSON array of exactly ${count} question strings.`;

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: { format: { type: 'json_schema', schema: STRING_ARRAY_SCHEMA } },
        });
        return parseClaudeJson(message);
    } catch (err) {
        console.error('[ai/custom_mlt] Claude error:', err);
        return [];
    }
};

const generateCustomMLTGemini = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const gemini = getGemini();
    if (!gemini) return [];

    const toneInstruction = tone
        ? `- TONE/RATING: ${tone}. Calibrate the humor, edginess, and subject matter accordingly.`
        : `- Keep it PG-13 unless the context clearly implies otherwise.`;

    const prompt = `You are a party game writer creating "Most Likely To" questions for a specific group of people.

GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

INSTRUCTIONS:
- Generate exactly ${count} "Most Likely To" questions SPECIFICALLY tailored to the context above.
- USE the specific details they gave you — names, places, situations, relationships, inside jokes, locations. Weave them directly into the questions.
- Every single question must feel like it was written BY someone who knows this group personally.
- Each question must start with "Who is most likely to..."
${toneInstruction}

Return ONLY the questions as a JSON array of strings. No numbering.`;

    try {
        const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/custom_mlt] Gemini error:', err);
        return [];
    }
};

// =============================================================================
// Truth or Drink — Custom
// =============================================================================

export interface CustomTODParams {
    groupType: string;
    customContext: string;
    playerNames?: string[];
    count?: number;
    tone?: string;
}

export const handleCustomTruthOrDrink = async (params: CustomTODParams): Promise<string[]> => {
    const { groupType, customContext, playerNames = [], count = 15, tone = '' } = params;

    if (isClaudeConfigured()) {
        const viaClaude = await generateCustomTODClaude(groupType, customContext, playerNames, count, tone);
        if (viaClaude.length > 0) return viaClaude;
        console.warn('[ai/custom_tod] Claude returned empty — falling through to Gemini.');
    }
    return generateCustomTODGemini(groupType, customContext, playerNames, count, tone);
};

const generateCustomTODClaude = async (groupType: string, customContext: string, playerNames: string[], count: number, tone: string): Promise<string[]> => {
    const claude = getClaude();
    if (!claude) return [];

    const toneHint = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';
    const namesClause = playerNames.length
        ? `PLAYER NAMES (reference by first name when the context calls for it): ${playerNames.join(', ')}.`
        : '';

    const system = `You are a party game writer creating "Truth or Drink" prompts for a specific group of people.

In Truth or Drink, each player is handed a personal question on their turn. They either answer honestly or skip the question. Questions should be directed, personal, and probe something interesting about the player.

Your job: generate questions that feel personally written for THIS group — referencing their names, shared history, inside jokes, and situations. Mix playful teasing with curious probing and deeper reveals. Keep things fun rather than cruel.`;

    const user = `GROUP TYPE: ${groupType}
${namesClause}
CONTEXT FROM THE PLAYERS: "${customContext}"

Generate exactly ${count} Truth or Drink questions specifically tailored to this group.

Rules:
- Write in SECOND person ("you") so any player can be asked.
- You may reference named players by first name when the context calls for it.
- USE the specifics they gave you — names, places, shared history, inside jokes, situations.
- Avoid generic questions unless the context twists them.
- Every question should be something a sober person might actually hesitate to answer.
- Each question must end with a "?".
- ${toneHint}

Return a JSON array of exactly ${count} question strings.`;

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: { format: { type: 'json_schema', schema: STRING_ARRAY_SCHEMA } },
        });
        return parseClaudeJson(message);
    } catch (err) {
        console.error('[ai/custom_tod] Claude error:', err);
        return [];
    }
};

const generateCustomTODGemini = async (groupType: string, customContext: string, playerNames: string[], count: number, tone: string): Promise<string[]> => {
    const gemini = getGemini();
    if (!gemini) return [];

    const toneInstruction = tone
        ? `- TONE/RATING: ${tone}. Calibrate humor, edginess, and subject matter accordingly.`
        : `- Keep it PG-13 unless the context clearly implies otherwise.`;
    const namesClause = playerNames.length
        ? `PLAYER NAMES (these are the people playing — you may reference them by first name): ${playerNames.join(', ')}.`
        : '';

    const prompt = `You are a party game writer creating "Truth or Drink" prompts for a specific group.

In Truth or Drink, each player is handed a personal question on their turn. They either answer honestly or skip. Questions should be directed, personal, and probe something interesting.

GROUP TYPE: ${groupType}
${namesClause}
CONTEXT FROM THE PLAYERS: "${customContext}"

INSTRUCTIONS:
- Generate exactly ${count} Truth or Drink questions SPECIFICALLY tailored to this group.
- Write in SECOND person ("you"); reference named players by first name when the context calls for it.
- USE the specifics they gave you — names, places, shared history, inside jokes.
- Mix playful teasing, curious probing, and deeper reveals. Keep things fun rather than cruel.
- Each question must end with a "?".
${toneInstruction}

Return ONLY the questions as a JSON array of strings. No numbering.`;

    try {
        const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/custom_tod] Gemini error:', err);
        return [];
    }
};

// =============================================================================
// Never Have I Ever — Custom
// =============================================================================

export interface CustomNHIEParams {
    groupType: string;
    customContext: string;
    count?: number;
    tone?: string;
}

export const handleCustomNeverHaveIEver = async (params: CustomNHIEParams): Promise<string[]> => {
    const { groupType, customContext, count = 15, tone = '' } = params;

    if (isClaudeConfigured()) {
        const viaClaude = await generateCustomNHIEClaude(groupType, customContext, count, tone);
        if (viaClaude.length > 0) return viaClaude;
        console.warn('[ai/custom_nhie] Claude returned empty — falling through to Gemini.');
    }
    return generateCustomNHIEGemini(groupType, customContext, count, tone);
};

const generateCustomNHIEClaude = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const claude = getClaude();
    if (!claude) return [];

    const toneHint = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';

    const system = `You are a party game writer creating "Never Have I Ever" statements for a specific group of people.

In Never Have I Ever, a statement is read aloud, and anyone in the group who HAS done it stands up (or takes a sip). Statements should feel real, personal, and reveal something interesting about the people in the room.

Your job: generate statements that feel personally written for THIS group — referencing their shared history, inside jokes, places they've been, and dynamics. Mix mundane confessions with juicier reveals. Keep things fun rather than cruel.`;

    const user = `GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

Generate exactly ${count} "Never Have I Ever" statements specifically tailored to this group.

Rules:
- Each statement must start with "Never have I ever..."
- Write in FIRST person.
- USE the specifics they gave you — names, places, shared history, inside jokes, situations.
- Avoid generic statements unless the context twists them.
- Mix lighthearted confessions with juicier reveals.
- ${toneHint}

Return a JSON array of exactly ${count} statement strings.`;

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
            output_config: { format: { type: 'json_schema', schema: STRING_ARRAY_SCHEMA } },
        });
        return parseClaudeJson(message);
    } catch (err) {
        console.error('[ai/custom_nhie] Claude error:', err);
        return [];
    }
};

const generateCustomNHIEGemini = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const gemini = getGemini();
    if (!gemini) return [];

    const toneInstruction = tone
        ? `- TONE/RATING: ${tone}. Calibrate humor, edginess, and subject matter accordingly.`
        : `- Keep it PG-13 unless the context clearly implies otherwise.`;

    const prompt = `You are a party game writer creating "Never Have I Ever" statements for a specific group.

GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

INSTRUCTIONS:
- Generate exactly ${count} "Never Have I Ever" statements SPECIFICALLY tailored to this group.
- Each statement must start with "Never have I ever..." and be in FIRST person.
- USE the specifics they gave you — names, places, shared history, inside jokes.
- Mix lighthearted confessions with juicier reveals. Keep things fun rather than cruel.
${toneInstruction}

Return ONLY the statements as a JSON array of strings. No numbering.`;

    try {
        const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/custom_nhie] Gemini error:', err);
        return [];
    }
};
