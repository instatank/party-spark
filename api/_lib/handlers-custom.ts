// Custom generation handlers — user provides a free-text description of their
// group, and we generate questions tailored to that context.
//
// Orchestration: Claude (Haiku 4.5) is the preferred provider for all three
// games (MLT / TOD / NHIE). Falls back to Gemini if Claude isn't configured
// or returns empty.
//
// =============================================================================
// PROMPT MODES — advanced vs basic, switchable per game via env vars
// =============================================================================
//
// Each game has TWO prompt versions maintained side-by-side so you can A/B
// test or roll back without code changes:
//
//   "advanced"  — long system prompt with voice rules, coverage targets,
//                  hallucination guard, and a worked calibration example.
//                  Group type and tone get expanded server-side via
//                  GROUP_TYPE_GUIDANCE / TONE_DEFINITIONS maps.
//
//   "basic"     — short system message + bulleted user-message rules.
//                  Group type and tone passed through to the prompt verbatim.
//                  Lower token cost and fewer moving parts.
//
// Switching is per-game via env vars set in Vercel:
//   MLT_PROMPT_MODE   = 'advanced' | 'basic'    (default: 'advanced')
//   TOD_PROMPT_MODE   = 'advanced' | 'basic'    (default: 'basic')
//   NHIE_PROMPT_MODE  = 'advanced' | 'basic'    (default: 'basic')
//
// To flip a game, set the env var on Vercel and redeploy. No code changes.
//
// NOTE: avoid static top-level imports of @google/genai or @anthropic-ai/sdk.
// They crash the Vercel function on cold start. clients.ts handles the SDKs
// via lazy dynamic imports; this file only consumes the lazy getters.
import type Anthropic from '@anthropic-ai/sdk';
import { getGemini, getClaude, isClaudeConfigured } from './clients.js';

const CLAUDE_MODEL = 'claude-haiku-4-5';
const GEMINI_MODEL = 'gemini-2.0-flash-001';

// Lenient JSON-array extractor for Claude responses.
// Claude usually returns clean JSON, sometimes wraps in ```json fences,
// occasionally adds a one-line preamble. Three parse attempts in order.
const parseClaudeJson = (message: Anthropic.Message): string[] => {
    const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map(b => b.text).join('');
    if (!text) return [];

    const tryParse = (raw: string): string[] | null => {
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            return parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
        } catch { return null; }
    };

    const direct = tryParse(text.trim());
    if (direct) return direct;

    const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const fromFence = tryParse(fenced.trim());
    if (fromFence) return fromFence;

    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
        const span = text.slice(start, end + 1);
        const fromSpan = tryParse(span);
        if (fromSpan) return fromSpan;
    }
    return [];
};

// =============================================================================
// Mode switching
// =============================================================================

type PromptMode = 'advanced' | 'basic';

// Defaults reflect the current operationally-tested setup. Override at deploy
// time via Vercel env vars (MLT_PROMPT_MODE, TOD_PROMPT_MODE, NHIE_PROMPT_MODE).
const DEFAULT_MODES: Record<'mlt' | 'tod' | 'nhie', PromptMode> = {
    mlt: 'advanced',
    tod: 'basic',
    nhie: 'basic',
};

const getPromptMode = (game: 'mlt' | 'tod' | 'nhie'): PromptMode => {
    const envKey = `${game.toUpperCase()}_PROMPT_MODE`;
    const v = process.env[envKey];
    if (v === 'advanced' || v === 'basic') return v;
    return DEFAULT_MODES[game];
};

// =============================================================================
// Shared prompt vocabulary (advanced mode only)
//
// Maps group/tone IDs to richer prompt-side instructions. If the client sends
// a value that's not in these maps (e.g. a human label like "🍻 Friends, Your
// crew"), we fall back to using the raw string. So both ID-based and label-
// based clients work — the advanced expansion just kicks in when IDs match.
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

// Resolve a group token to its rich guidance line, or fall back to passing
// through whatever the client sent (so label-style clients still work).
const resolveGroupGuidance = (groupType: string): string =>
    GROUP_TYPE_GUIDANCE[groupType] ?? `${groupType}.`;

const resolveToneDefinition = (tone: string): string => {
    const key = tone || DEFAULT_TONE;
    return TONE_DEFINITIONS[key] ?? `${tone}. Calibrate humor and subject matter accordingly.`;
};

// =============================================================================
// MLT — Most Likely To
// =============================================================================

export interface CustomMLTParams {
    groupType: string;
    customContext: string;
    count?: number;
    tone?: string;
}

// ---- ADVANCED ----
const MLT_SYSTEM_PROMPT_ADVANCED = `You are a party game writer for "Most Likely To" — a game where one person reads a card aloud and the group instantly points at whoever fits.

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

const buildMLTUserPromptAdvanced = (groupType: string, customContext: string, count: number, tone: string): string => {
    return `GROUP TYPE: ${groupType} — ${resolveGroupGuidance(groupType)}

TONE: ${tone || DEFAULT_TONE}
${resolveToneDefinition(tone)}

CONTEXT FROM THE PLAYERS:
"""
${customContext}
"""

Generate exactly ${count} "Most Likely To" cards for this group, following the system rules. Return as a JSON array of ${count} strings.`;
};

// ---- BASIC ----
const MLT_SYSTEM_PROMPT_BASIC = `You are a party game writer creating "Most Likely To" questions for a specific group of people.

Each question is read aloud, and the group points at whoever fits the description best.

Your job: generate questions that feel personally written for THIS group — referencing their names, places, running jokes, and shared history. Mix teasing with warmth. Keep things fun rather than cruel.`;

const buildMLTUserPromptBasic = (groupType: string, customContext: string, count: number, tone: string): string => {
    const toneHint = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';
    return `GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

Generate exactly ${count} "Most Likely To" questions specifically tailored to this group.

Rules:
- Each question must start with "Who is most likely to..."
- USE the specifics they gave you — names, places, situations, inside jokes. Weave them in naturally.
- Avoid generic questions like "Who is most likely to be late?" unless the context twists it.
- Mix lighthearted teasing with wholesome observations.
- ${toneHint}

Return a JSON array of exactly ${count} question strings.`;
};

// ---- ORCHESTRATION ----

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
    const claude = await getClaude();
    if (!claude) return [];

    const mode = getPromptMode('mlt');
    const system = mode === 'advanced' ? MLT_SYSTEM_PROMPT_ADVANCED : MLT_SYSTEM_PROMPT_BASIC;
    const user = mode === 'advanced'
        ? buildMLTUserPromptAdvanced(groupType, customContext, count, tone)
        : buildMLTUserPromptBasic(groupType, customContext, count, tone);

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
        });
        return parseClaudeJson(message);
    } catch (err) {
        console.error('[ai/custom_mlt] Claude error:', err);
        return [];
    }
};

const generateCustomMLTGemini = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];

    const mode = getPromptMode('mlt');
    const system = mode === 'advanced' ? MLT_SYSTEM_PROMPT_ADVANCED : MLT_SYSTEM_PROMPT_BASIC;
    const user = mode === 'advanced'
        ? buildMLTUserPromptAdvanced(groupType, customContext, count, tone)
        : buildMLTUserPromptBasic(groupType, customContext, count, tone);
    const prompt = `${system}\n\n---\n\n${user}`;

    try {
        const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/custom_mlt] Gemini error:', err);
        return [];
    }
};

// =============================================================================
// TOD — Truth or Drink
// =============================================================================

export interface CustomTODParams {
    groupType: string;
    customContext: string;
    playerNames?: string[];
    count?: number;
    tone?: string;
}

// ---- ADVANCED ----
const TOD_SYSTEM_PROMPT_ADVANCED = `You are a party game writer for "Truth or Drink" — a game where each player gets a personal question on their turn. They either answer honestly or take a sip.

The best questions probe something interesting about a player. They land fast, feel personal, and reward honesty. The worst are generic ("What's your favorite color?"), too long-winded, or invent details that aren't true.

VOICE
- 6-22 words per question. Read-aloud cadence. Direct.
- Specific over generic. Use the hooks the players gave you.
- Probing without being cruel. Curious without being preachy.

COVERAGE RULES
- If named players are listed, spread questions across all of them — don't fixate on one.
- Vary the angles:
  * ~40% directed at a specific named player (use their name or "you")
  * ~40% works for anyone in the group
  * ~20% probe the group dynamic itself
- Vary topics. Don't write five romance questions in a row.

HALLUCINATION GUARD
- Only use names, places, and details the players gave you. Do NOT invent specifics.
- If context is thin, lean on the GROUP TYPE for flavor instead of inventing personal details.

OUTPUT FORMAT
- Write in second person ("you") so any player can be asked it on their turn.
- For the couple group type, use "Which of you..." framing.
- Every question must end with a "?".
- Each question should be something a sober person might actually hesitate to answer.
- Return a JSON array of strings. No numbering. No commentary.

EXAMPLE — for calibration only

Given context: "Three college friends at Sofia's birthday in Bali. Sofia just got engaged to someone the others haven't met. Marco is between jobs and crashing on couches. Ana is the one with a stable life and a dog."

Good output:
[
  "What did you secretly think the second you saw Sofia's fiancé on Instagram?",
  "If Marco asked to crash on your couch tonight, what's the longest you'd let him stay?",
  "On a scale of 1-10, how seriously did you take Ana's life advice last year?",
  "What's the worst thing you've quietly thought about your own life on this trip?",
  "When did you last lie to this group about being 'totally fine'?",
  "Who in this group would you trust with your phone unlocked for an hour, and why?"
]

Notice how each names a specific player or group dynamic, every question stays under 22 words, and nothing was invented beyond what the context gave.`;

const buildTODUserPromptAdvanced = (groupType: string, customContext: string, playerNames: string[], count: number, tone: string): string => {
    const namesClause = playerNames.length
        ? `\nNAMED PLAYERS: ${playerNames.join(', ')}.`
        : '';
    return `GROUP TYPE: ${groupType} — ${resolveGroupGuidance(groupType)}${namesClause}

TONE: ${tone || DEFAULT_TONE}
${resolveToneDefinition(tone)}

CONTEXT FROM THE PLAYERS:
"""
${customContext}
"""

Generate exactly ${count} Truth or Drink questions for this group, following the system rules. Return as a JSON array of ${count} strings.`;
};

// ---- BASIC ----
const TOD_SYSTEM_PROMPT_BASIC = `You are a party game writer creating "Truth or Drink" prompts for a specific group of people.

In Truth or Drink, each player is handed a personal question on their turn. They either answer honestly or skip the question. Questions should be directed, personal, and probe something interesting about the player.

Your job: generate questions that feel personally written for THIS group — referencing their names, shared history, inside jokes, and situations. Mix playful teasing with curious probing and deeper reveals. Keep things fun rather than cruel.`;

const buildTODUserPromptBasic = (groupType: string, customContext: string, playerNames: string[], count: number, tone: string): string => {
    const toneHint = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';
    const namesClause = playerNames.length
        ? `PLAYER NAMES (reference by first name when the context calls for it): ${playerNames.join(', ')}.`
        : '';
    return `GROUP TYPE: ${groupType}
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
};

// ---- ORCHESTRATION ----

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
    const claude = await getClaude();
    if (!claude) return [];

    const mode = getPromptMode('tod');
    const system = mode === 'advanced' ? TOD_SYSTEM_PROMPT_ADVANCED : TOD_SYSTEM_PROMPT_BASIC;
    const user = mode === 'advanced'
        ? buildTODUserPromptAdvanced(groupType, customContext, playerNames, count, tone)
        : buildTODUserPromptBasic(groupType, customContext, playerNames, count, tone);

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
        });
        return parseClaudeJson(message);
    } catch (err) {
        console.error('[ai/custom_tod] Claude error:', err);
        return [];
    }
};

const generateCustomTODGemini = async (groupType: string, customContext: string, playerNames: string[], count: number, tone: string): Promise<string[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];

    const mode = getPromptMode('tod');
    const system = mode === 'advanced' ? TOD_SYSTEM_PROMPT_ADVANCED : TOD_SYSTEM_PROMPT_BASIC;
    const user = mode === 'advanced'
        ? buildTODUserPromptAdvanced(groupType, customContext, playerNames, count, tone)
        : buildTODUserPromptBasic(groupType, customContext, playerNames, count, tone);
    const prompt = `${system}\n\n---\n\n${user}`;

    try {
        const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/custom_tod] Gemini error:', err);
        return [];
    }
};

// =============================================================================
// NHIE — Never Have I Ever
// =============================================================================

export interface CustomNHIEParams {
    groupType: string;
    customContext: string;
    count?: number;
    tone?: string;
}

// ---- ADVANCED ----
const NHIE_SYSTEM_PROMPT_ADVANCED = `You are a party game writer for "Never Have I Ever" — a game where a statement is read aloud, and anyone in the group who HAS done it stands up (or takes a sip).

The best statements feel real and oddly specific — embarrassing, awkward, or quietly common. They make at least one person in the room look around guiltily. The worst are too generic ("Never have I ever traveled"), too long, or invent details that aren't true.

VOICE
- 6-20 words per statement. Read-aloud cadence.
- Specific over generic. Use the hooks the players gave you.
- Knowing and observational, never preachy.

COVERAGE RULES
- Vary the shape across the deck:
  * ~40% personal reveals (someone in this group has definitely done this)
  * ~40% almost-everyone confessions (the room sips together)
  * ~20% surprising "wait, really?" reveals
- Vary topics. Don't write five drinking statements in a row.

HALLUCINATION GUARD
- Only use names, places, and details the players gave you. Do NOT invent specifics.
- If context is thin, lean on the GROUP TYPE for flavor instead of inventing personal details.

OUTPUT FORMAT
- Every statement starts with "Never have I ever..." in first person.
- Return a JSON array of strings. No numbering. No commentary.

EXAMPLE — for calibration only

Given context: "Five college friends from Mumbai reuniting in Goa after 8 years. Rahul has a new boyfriend nobody's met. Priya is teetotal now. Karan still talks about his startup constantly. Anjali got a divorce last year. Meera became a yoga teacher."

Good output:
[
  "Never have I ever judged a friend's new partner the second I met them",
  "Never have I ever told a friend their startup idea was great when I didn't believe it",
  "Never have I ever pretended to do yoga regularly when asked",
  "Never have I ever stayed sober at a beach party and felt smug about it",
  "Never have I ever rehearsed a divorce announcement before saying it out loud",
  "Never have I ever ghosted a friend after a major life event of theirs"
]

Notice the variety of angles, the specificity tied to the context, and that nothing was invented beyond what the context gave.`;

const buildNHIEUserPromptAdvanced = (groupType: string, customContext: string, count: number, tone: string): string => {
    return `GROUP TYPE: ${groupType} — ${resolveGroupGuidance(groupType)}

TONE: ${tone || DEFAULT_TONE}
${resolveToneDefinition(tone)}

CONTEXT FROM THE PLAYERS:
"""
${customContext}
"""

Generate exactly ${count} "Never Have I Ever" statements for this group, following the system rules. Return as a JSON array of ${count} strings.`;
};

// ---- BASIC ----
const NHIE_SYSTEM_PROMPT_BASIC = `You are a party game writer creating "Never Have I Ever" statements for a specific group of people.

In Never Have I Ever, a statement is read aloud, and anyone in the group who HAS done it stands up (or takes a sip). Statements should feel real, personal, and reveal something interesting about the people in the room.

Your job: generate statements that feel personally written for THIS group — referencing their shared history, inside jokes, places they've been, and dynamics. Mix mundane confessions with juicier reveals. Keep things fun rather than cruel.`;

const buildNHIEUserPromptBasic = (groupType: string, customContext: string, count: number, tone: string): string => {
    const toneHint = tone
        ? `TONE/RATING: ${tone}. Calibrate humor and subject matter accordingly.`
        : 'Keep it PG-13 unless the context clearly implies otherwise.';
    return `GROUP TYPE: ${groupType}
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
};

// ---- ORCHESTRATION ----

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
    const claude = await getClaude();
    if (!claude) return [];

    const mode = getPromptMode('nhie');
    const system = mode === 'advanced' ? NHIE_SYSTEM_PROMPT_ADVANCED : NHIE_SYSTEM_PROMPT_BASIC;
    const user = mode === 'advanced'
        ? buildNHIEUserPromptAdvanced(groupType, customContext, count, tone)
        : buildNHIEUserPromptBasic(groupType, customContext, count, tone);

    try {
        const message = await claude.messages.create({
            model: CLAUDE_MODEL,
            max_tokens: 4096,
            system,
            messages: [{ role: 'user', content: user }],
        });
        return parseClaudeJson(message);
    } catch (err) {
        console.error('[ai/custom_nhie] Claude error:', err);
        return [];
    }
};

const generateCustomNHIEGemini = async (groupType: string, customContext: string, count: number, tone: string): Promise<string[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];

    const mode = getPromptMode('nhie');
    const system = mode === 'advanced' ? NHIE_SYSTEM_PROMPT_ADVANCED : NHIE_SYSTEM_PROMPT_BASIC;
    const user = mode === 'advanced'
        ? buildNHIEUserPromptAdvanced(groupType, customContext, count, tone)
        : buildNHIEUserPromptBasic(groupType, customContext, count, tone);
    const prompt = `${system}\n\n---\n\n${user}`;

    try {
        const response = await gemini.models.generateContent({
            model: GEMINI_MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/custom_nhie] Gemini error:', err);
        return [];
    }
};
