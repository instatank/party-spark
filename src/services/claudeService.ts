import Anthropic from '@anthropic-ai/sdk';

// Browser-side Claude client. `dangerouslyAllowBrowser` is required because this
// runs in the Vite SPA — same pattern as the existing @google/genai integration.
// An API proxy is the right long-term move for production; for now the key lives
// in VITE_ANTHROPIC_API_KEY just like VITE_API_KEY does for Gemini.
const getClaude = (): Anthropic | null => {
    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY || '';
    if (!apiKey) return null;
    return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
};

export const isClaudeConfigured = (): boolean => {
    return Boolean(import.meta.env.VITE_ANTHROPIC_API_KEY);
};

// Haiku 4.5 — cheap and fast for single-shot JSON generation with structured output.
const MODEL = 'claude-haiku-4-5';
const MAX_TOKENS = 4096;

// JSON Schema shared by both functions: plain array of strings.
const STRING_ARRAY_SCHEMA = {
    type: 'array',
    items: { type: 'string' },
    additionalProperties: false,
} as const;

interface ParseOptions {
    label: string;
}

const parseJsonArrayResponse = (text: string, { label }: ParseOptions): string[] => {
    try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
            console.warn(`[${label}] Response is not an array:`, text);
            return [];
        }
        return parsed.filter(q => typeof q === 'string' && q.trim().length > 0);
    } catch (err) {
        console.error(`[${label}] JSON parse failed. Raw text:`, text, 'Error:', err);
        return [];
    }
};

const extractText = (message: Anthropic.Message): string => {
    return message.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');
};

// ===========================================================================
// Custom Most Likely To (Claude)
// ===========================================================================

export const generateCustomMostLikelyToClaude = async (
    groupType: string,
    customContext: string,
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    const client = getClaude();
    if (!client) {
        console.warn('[ClaudeMLT] No ANTHROPIC_API_KEY configured.');
        return [];
    }

    const toneInstruction = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';

    const systemPrompt = `You are a party game writer creating "Most Likely To" questions for a specific group of people.

Each question is read aloud, and the group points at whoever fits the description best.

Your job: generate questions that feel personally written for THIS group — referencing their names, places, running jokes, and shared history. Mix teasing with warmth. Keep things fun rather than cruel.`;

    const userPrompt = `GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

Generate exactly ${count} "Most Likely To" questions specifically tailored to this group.

Rules:
- Each question must start with "Who is most likely to..."
- USE the specifics they gave you — names, places, situations, inside jokes. Weave them in naturally.
- Avoid generic questions like "Who is most likely to be late?" unless the context twists it (e.g. "Who is most likely to be late to the Bali villa checkout because they were at the beach bar?").
- Mix lighthearted teasing with wholesome observations.
- ${toneInstruction}

Return a JSON array of exactly ${count} question strings.`;

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            output_config: {
                format: {
                    type: 'json_schema',
                    schema: STRING_ARRAY_SCHEMA,
                },
            },
        });

        const text = extractText(message);
        if (!text) {
            console.warn('[ClaudeMLT] Empty text in response:', message);
            return [];
        }
        return parseJsonArrayResponse(text, { label: 'ClaudeMLT' });
    } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
            console.warn('[ClaudeMLT] Rate limited:', err.message);
        } else if (err instanceof Anthropic.AuthenticationError) {
            console.error('[ClaudeMLT] Auth failed — check VITE_ANTHROPIC_API_KEY:', err.message);
        } else if (err instanceof Anthropic.APIError) {
            console.error(`[ClaudeMLT] API error ${err.status}:`, err.message);
        } else {
            console.error('[ClaudeMLT] Unexpected error:', err);
        }
        return [];
    }
};

// ===========================================================================
// Custom Truth or Drink (Claude)
// ===========================================================================

export const generateCustomTruthOrDrinkClaude = async (
    groupType: string,
    customContext: string,
    playerNames: string[],
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    const client = getClaude();
    if (!client) {
        console.warn('[ClaudeTOD] No ANTHROPIC_API_KEY configured.');
        return [];
    }

    const toneInstruction = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';

    const namesClause = playerNames.length
        ? `PLAYER NAMES (reference by first name when the context calls for it): ${playerNames.join(', ')}.`
        : '';

    const systemPrompt = `You are a party game writer creating "Truth or Drink" prompts for a specific group of people.

In Truth or Drink, each player is handed a personal question on their turn. They either answer honestly or skip the question. Questions should be directed, personal, and probe something interesting about the player.

Your job: generate questions that feel personally written for THIS group — referencing their names, shared history, inside jokes, and situations. Mix playful teasing with curious probing and deeper reveals. Keep things fun rather than cruel.`;

    const userPrompt = `GROUP TYPE: ${groupType}
${namesClause}
CONTEXT FROM THE PLAYERS: "${customContext}"

Generate exactly ${count} Truth or Drink questions specifically tailored to this group.

Rules:
- Write in SECOND person ("you") so any player can be asked.
- You may reference named players by first name when the context calls for it (e.g. "What's the first thing you noticed about Priya?").
- USE the specifics they gave you — names, places, shared history, inside jokes, situations. Weave them in naturally.
- Avoid generic questions like "What's your biggest fear?" unless the context twists it.
- Every question should be something a sober person might actually hesitate to answer.
- Each question must end with a "?".
- ${toneInstruction}

Return a JSON array of exactly ${count} question strings.`;

    try {
        const message = await client.messages.create({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }],
            output_config: {
                format: {
                    type: 'json_schema',
                    schema: STRING_ARRAY_SCHEMA,
                },
            },
        });

        const text = extractText(message);
        if (!text) {
            console.warn('[ClaudeTOD] Empty text in response:', message);
            return [];
        }
        return parseJsonArrayResponse(text, { label: 'ClaudeTOD' });
    } catch (err) {
        if (err instanceof Anthropic.RateLimitError) {
            console.warn('[ClaudeTOD] Rate limited:', err.message);
        } else if (err instanceof Anthropic.AuthenticationError) {
            console.error('[ClaudeTOD] Auth failed — check VITE_ANTHROPIC_API_KEY:', err.message);
        } else if (err instanceof Anthropic.APIError) {
            console.error(`[ClaudeTOD] API error ${err.status}:`, err.message);
        } else {
            console.error('[ClaudeTOD] Unexpected error:', err);
        }
        return [];
    }
};
