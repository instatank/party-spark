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
// Shared prompt vocabulary
//
// The clients send tone + groupType as IDs ('clean' | 'cheeky' | 'spicy';
// 'family' | 'friends' | 'couple' | 'colleagues' | 'mixed'). These maps
// expand each ID into a richer prompt-side instruction so the model has
// concrete guidance instead of a label.
// =============================================================================

const GROUP_TYPE_GUIDANCE: Record<string, string> = {
    family:     'multi-generational mix. Lean on family roles, generational gaps, and shared history.',
    friends:    'a peer group. Lean on running jokes, dating lives, and group dynamics.',
    couple:     'just two people. Reframe questions as "Which of you is more likely to..." instead of "Who".',
    colleagues: 'work people off-duty. Lean on office personas and what they hide at work.',
    mixed:      'a mixed crowd. Stay broader, lighter on inside-baseball.',
};

const TONE_DEFINITIONS: Record<string, string> = {
    clean:  'PG. Wholesome. No innuendo. Safe for grandparents and kids.',
    cheeky: 'PG-13. Light innuendo, drinking, dating, mild embarrassment OK. No explicit sex, no body parts, no naming exes.',
    spicy:  'R-rated. Sex, exes, body stuff, regrettable nights, and taboo confessions are all fair game. Still no slurs, racism, violence, or punching down on protected traits.',
};

const DEFAULT_TONE = 'cheeky';

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

// System prompt is a single source of truth — both Claude and Gemini get the
// same brief so the fallback doesn't degrade quality. Edit here, both flows
// pick it up.
const MLT_SYSTEM_PROMPT = `You are a party game writer for "Most Likely To" — a game where one person reads a card aloud and the group instantly points at whoever fits.

The best cards land within seconds, get the group laughing or knowingly nodding, and feel like they were written by someone who knows the group. The worst cards are generic ("Who is most likely to be late?"), wordy (over 18 words), or invent details that aren't true.

VOICE
- Tight. 6–18 words per card. Read-aloud cadence.
- Specific over generic. Use concrete hooks the players gave you.
- Warmth and teasing in equal measure. Never cruel, never preachy.

COVERAGE RULES
- Spread references roughly evenly across all named people. Don't fixate on one or two.
- Vary the shape across the deck:
  * ~50% personal callouts (use a name or unmistakable trait)
  * ~30% group-wide observations (anyone could win)
  * ~20% absurd hypotheticals grounded in their context
- Vary topics. Don't write five drinking cards in a row.

HALLUCINATION GUARD
- Only use names, places, and details the players actually gave you. Do NOT invent specifics.
- If the context is thin, lean on the GROUP TYPE for general flavor instead of inventing personal details.

OUTPUT FORMAT
- Every card starts with "Who is most likely to" (or "Which of you" for couples) and ends with "?"
- Return a JSON array of strings. No numbering. No commentary.

EXAMPLE — for calibration only

Given context: "Five college friends from Mumbai reuniting in Goa after 8 years. Rahul has a new boyfriend nobody's met. Priya is teetotal now. Karan still talks about his startup constantly. Anjali got a divorce last year. Meera became a yoga teacher."

Good output:
[
  "Who is most likely to grill Rahul's boyfriend with awkward college questions within ten minutes?",
  "Who is most likely to make Karan's startup the third topic of every conversation?",
  "Who is most likely to suggest 'one more drink' knowing Priya is the only sober one?",
  "Who is most likely to bring up that one Goa trip from 2017 within the first hour?",
  "Who is most likely to attempt Meera's sunrise yoga and quit by minute four?",
  "Who is most likely to cry first at the group photo?"
]

Notice how names spread across the deck, shapes vary, every card stays tight, and nothing was invented beyond what the context gave.`;

const buildCustomMLTUserPrompt = (groupType: string, customContext: string, count: number, tone: string): string => {
    const groupGuidance = GROUP_TYPE_GUIDANCE[groupType] ?? GROUP_TYPE_GUIDANCE.mixed;
    const toneKey = tone || DEFAULT_TONE;
    const toneDefinition = TONE_DEFINITIONS[toneKey] ?? TONE_DEFINITIONS[DEFAULT_TONE];

    return `GROUP TYPE: ${groupType} — ${groupGuidance}

TONE: ${toneKey}
${toneDefinition}

CONTEXT FROM THE PLAYERS:
"""
${customContext}
"""

Generate exactly ${count} "Most Likely To" cards for this group, following the system rules. Return as a JSON array of ${count} strings.`;
};

const generateCustomMLTClaude = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const claude = getClaude();
    if (!claude) return [];

    const user = buildCustomMLTUserPrompt(groupType, customContext, count, tone);

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system: MLT_SYSTEM_PROMPT,
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

    // Gemini has no separate system field — concatenate system + user with a
    // visible separator so the model still treats them as distinct sections.
    const user = buildCustomMLTUserPrompt(groupType, customContext, count, tone);
    const prompt = `${MLT_SYSTEM_PROMPT}\n\n---\n\n${user}`;

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
