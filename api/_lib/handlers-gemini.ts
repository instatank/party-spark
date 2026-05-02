// Gemini-backed generation handlers for everything except the custom
// MLT / TOD flows (those live in handlers-custom.ts because they orchestrate
// Claude-first with Gemini fallback).

// Avoid static @google/genai import (crashes Vercel cold start). Use
// string literals 'ARRAY' / 'OBJECT' / 'STRING' / 'NUMBER' instead of
// the Type enum — they're equivalent at the schema level.
import { getGemini } from './clients.js';

const MODEL = 'gemini-2.0-flash-001';

// =============================================================================
// Charades
// =============================================================================

export const handleCharadesWords = async (params: { category: string; count?: number }): Promise<string[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { category, count = 20 } = params;

    try {
        const prompt = `Generate a list of ${count} popular and recognizable Movie Titles for a game of Charades.
The category is: ${category}.
Return ONLY the movie titles separated by commas. No numbering. No years.`;

        const response = await gemini.models.generateContent({ model: MODEL, contents: prompt });
        const text: string = response.text || '';
        return text.split(',').map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    } catch (err) {
        console.error('[ai/charades] error:', err);
        return [];
    }
};

// =============================================================================
// Would I Lie To You
// =============================================================================

export const handleWouldILieToYou = async (params: { count?: number }): Promise<Array<{ statement: string; rule: string }>> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { count = 3 } = params;

    try {
        const prompt = `Generate ${count} statements for the game "Would I Lie To You".
Theme: Incredibly mundane, extremely common personal habits, mild food preferences, or simple everyday mix-ups.
Style guidelines:
1. Keep the statements EXTREMELY short and highly generic.
2. Use almost zero descriptive adjectives. Do not add highly specific details, names, or unnecessary context.
3. Make it overwhelmingly boring, realistic, and entirely plausible.
4. It must sound like a basic, simple truth.
Format: Each item must contain a 'statement' (starting with "Once I...", "I always...", or "I have a habit of...") and a 'rule' (a very brief, simple reason or context).
Do NOT wrap in markdown \`\`\`json block. Just raw JSON structure.`;

        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
        });
        return response.text ? JSON.parse(response.text) : [];
    } catch (err) {
        console.error('[ai/wilty] error:', err);
        return [];
    }
};

// =============================================================================
// Never Have I Ever
// =============================================================================

export const handleNeverHaveIEver = async (params: { category: string; count?: number }): Promise<string[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { category, count = 5 } = params;

    let systemPrompt = '';
    switch (category) {
        case 'agra':
            systemPrompt = `Generate ${count} "Never Have I Ever" statements for a family trip to Agra (Taj Mahal, ITC Mughal).
The group includes: an 11-year-old boy from London ("Rehaan"), his mom (born in Agra), his aunt, and two grandmothers (one from Agra).
Theme: Mughal history, family travel quirks, returning to hometown roots, navigating Indian heat, and Rehaan's first Agra experiences.
Tone: Wholesome, funny, educational but not boring, perfect for mixed generations.`;
            break;
        case 'rehaan':
            systemPrompt = `Generate ${count} "Never Have I Ever" statements for an extended family resort vacation featuring an 11-year-old nephew from London named 'Rehaan'.
Theme: Family bonding, resort quirks, generational gaps, light-hearted embarrassing family moments.
Format: Each must start with "Never have I ever..."
Tone: Wholesome, PG, relatable for a mixed-generation Indian family.`;
            break;
        case 'guilty_pleasures':
            systemPrompt = `Generate ${count} "Never Have I Ever" statements about guilty pleasures.
Theme: Slightly embarrassing but universal habits we all secretly do.
Format: Each must start with "Never have I ever..."
Tone: Funny, relatable, slightly self-deprecating but safe for casual friends.`;
            break;
        default:
            systemPrompt = `Generate ${count} classic "Never Have I Ever" statements for a party.
Theme: Standard social slip-ups, minor lies, and funny life failures.
Format: Each must start with "Never have I ever..."
Tone: Classic party game vibes. Lightly edgy but not explicitly R-rated.`;
    }

    const prompt = `${systemPrompt}

Return EXACTLY a JSON array of ${count} strings. Do NOT wrap in markdown. Just raw JSON array.`;

    try {
        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: { responseMimeType: 'application/json' },
        });
        return response.text ? JSON.parse(response.text) : [];
    } catch (err) {
        console.error('[ai/nhie] error:', err);
        return [];
    }
};

// =============================================================================
// Taboo Cards
// =============================================================================

export const handleTabooCards = async (params: { category: string; count?: number }): Promise<Array<{ word: string; forbidden: string[] }>> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { category, count = 10 } = params;

    try {
        const prompt = `Generate ${count} Taboo-style game cards for the category "${category}".
Each card must have a main 'word' to guess and 5 'forbidden' words that are closely related to the main word and cannot be used.
Make them fun and challenging.`;

        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            word: { type: 'STRING' },
                            forbidden: { type: 'ARRAY', items: { type: 'STRING' } },
                        },
                        required: ['word', 'forbidden'],
                    },
                },
            },
        });
        return response.text ? JSON.parse(response.text) : [];
    } catch (err) {
        console.error('[ai/taboo] error:', err);
        return [];
    }
};

// =============================================================================
// Icebreaker
// =============================================================================

export const handleIcebreaker = async (params: { type: 'fun' | 'deep' }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return '';
    const { type } = params;

    const prompt = type === 'fun'
        ? "Give me one funny, quick, and lighthearted 'Two Truths and a Lie' idea OR a 'Never have I ever' prompt. Keep it short."
        : 'Give me one thought-provoking conversation starter question for a group of friends. Keep it short.';

    try {
        const response = await gemini.models.generateContent({ model: MODEL, contents: prompt });
        return response.text || '';
    } catch (err) {
        console.error('[ai/icebreaker] error:', err);
        return '';
    }
};

// =============================================================================
// Mafia narrative
// =============================================================================

export const handleMafiaNarrative = async (params: { phase: 'INTRO' | 'NIGHT' | 'DAY' }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return '';
    const { phase } = params;

    let prompt = '';
    if (phase === 'INTRO') {
        prompt = 'You are the narrator for a game of Mafia. Write a short, atmospheric introduction setting the scene for a small village where mafia members are hiding among villagers. Keep it suspenseful but under 100 words.';
    } else if (phase === 'NIGHT') {
        prompt = "You are the narrator for a game of Mafia. Write a short script for the 'Night Phase' where everyone closes their eyes, and the Mafia wakes up to choose a victim, the Doctor saves someone, and the Sheriff investigates. Instructions for players should be clear. Keep it under 100 words.";
    } else {
        prompt = "You are the narrator for a game of Mafia. Write a short script for the 'Day Phase' where everyone wakes up. Announce that something happened last night (don't specify who died yet, just build tension) and tell the villagers they must now discuss and vote on who to eliminate. Keep it under 100 words.";
    }

    try {
        const response = await gemini.models.generateContent({ model: MODEL, contents: prompt });
        return response.text || '';
    } catch (err) {
        console.error('[ai/mafia] error:', err);
        return '';
    }
};

// =============================================================================
// Would You Rather (batch with psycho-analysis)
// =============================================================================

export const handleWouldYouRather = async (params: { count?: number }): Promise<unknown[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { count = 5 } = params;

    try {
        const prompt = `Generate ${count} unique, thought-provoking "Would You Rather" questions.
Categories: Life, Love, Superpowers, Absurd, moral dilemmas.

CRITICAL: Include a "Psycho-Roast" analysis for each option.
- "analysisA" and "analysisB" must be SHORT, SHARP, and HILARIOUS.
- MAX 15 words. Direct hits only.
- Be savage and quick-witted. No flowery language.

Return a JSON array where each object has:
- optionA (string)
- optionB (string)
- category (string)
- stats (object with 'a' and 'b' as percentages, summing to 100)
- analysisA (string)
- analysisB (string)`;

        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: { parts: [{ text: prompt }] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'ARRAY',
                    items: {
                        type: 'OBJECT',
                        properties: {
                            optionA: { type: 'STRING' },
                            optionB: { type: 'STRING' },
                            category: { type: 'STRING' },
                            stats: {
                                type: 'OBJECT',
                                properties: { a: { type: 'NUMBER' }, b: { type: 'NUMBER' } },
                                required: ['a', 'b'],
                            },
                            analysisA: { type: 'STRING' },
                            analysisB: { type: 'STRING' },
                        },
                        required: ['optionA', 'optionB', 'category', 'stats', 'analysisA', 'analysisB'],
                    },
                },
            },
        });

        if (!response.text) return [];
        const raw = JSON.parse(response.text);
        return raw.map((q: {
            optionA: string; optionB: string; category: string;
            stats: { a: number; b: number };
            analysisA?: string; analysisB?: string;
        }, i: number) => ({
            id: `ai_${Date.now()}_${i}`,
            optionA: q.optionA,
            optionB: q.optionB,
            category: q.category,
            stats: q.stats,
            analysisA: q.analysisA || '',
            analysisB: q.analysisB || '',
        }));
    } catch (err) {
        console.error('[ai/wyr] error:', err);
        return [];
    }
};

// =============================================================================
// WYR single psycho analysis
// =============================================================================

export const handlePsychoAnalysis = async (params: { questionOptionA: string; questionOptionB: string; userChoice: 'A' | 'B' }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return '';
    const { questionOptionA, questionOptionB, userChoice } = params;

    const chosen = userChoice === 'A' ? questionOptionA : questionOptionB;
    const rejected = userChoice === 'A' ? questionOptionB : questionOptionA;

    const prompt = `You are a witty, insightful pop-psychologist.
The user was asked "Would you rather ${questionOptionA} OR ${questionOptionB}?"
The user chose: "${chosen}" over "${rejected}".

Provide a BRIEF, fun, 1-2 sentence psychoanalysis of what this choice says about their personality.
Why did they pick this over the alternative? Be specific to the trade-off.
Keep it under 25 words.`;

    try {
        const response = await gemini.models.generateContent({ model: MODEL, contents: prompt });
        return response.text || '';
    } catch (err) {
        console.error('[ai/psycho] error:', err);
        return '';
    }
};

// =============================================================================
// Imposter
// =============================================================================

export const handleImposterContent = async (): Promise<{ category: string; word: string } | null> => {
    const gemini = await getGemini();
    if (!gemini) return null;

    try {
        const prompt = `Generate a single unique game round for "Who is the Imposter".
Return a JSON object with:
- category (string, e.g. "Kitchen Appliances", "Ancient Empires")
- word (string, a specific item in that category, e.g. "Blender", "Rome")
Make it challenging but not impossible.`;

        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: 'OBJECT',
                    properties: { category: { type: 'STRING' }, word: { type: 'STRING' } },
                    required: ['category', 'word'],
                },
            },
        });
        return response.text ? JSON.parse(response.text) : null;
    } catch (err) {
        console.error('[ai/imposter] error:', err);
        return null;
    }
};

// =============================================================================
// Most Likely To (non-custom)
// =============================================================================

export const handleMostLikelyTo = async (params: { category: string; count?: number }): Promise<string[]> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { category, count = 10 } = params;

    let systemPrompt = '';
    switch (category) {
        case 'agra':
            systemPrompt = `Generate ${count} "Most Likely To" questions specifically designed for a family trip to Agra (visiting Taj Mahal, staying at ITC Mughal).
The group includes: an 11-year-old boy from London ("Rehaan"), his mom (born in Agra), his aunt, and two grandmothers.
Theme: Exploring Agra, seeing the Taj Mahal, experiencing ITC Mughal luxury, family travel dynamics.
Tone: Light-hearted, fun, balanced with "edutainment" about Mughal culture.`;
            break;
        case 'rehaan':
            systemPrompt = `Generate ${count} "Most Likely To" questions for "Rehaan," an 11-year-old boy from London visiting his extended Indian family.
Theme: Culture clash (London vs India), generational gaps, tech gaps, doting aunties, funny observations.
Tone: Light-hearted, funny, completely PG, understandable for an 11-year-old.`;
            break;
        case 'family_friendly':
            systemPrompt = `Generate ${count} "Most Likely To" questions specifically for extended families (cousins, uncles, aunts, grandparents).
Theme: Shared memories, family roles, funny recurring habits, childhood anecdotes.
Tone: Wholesome, light-hearted, nostalgic, safe for all ages (PG).`;
            break;
        case 'scandalous':
            systemPrompt = `Generate ${count} "Most Likely To" questions that are GOSSIPY, DRAMATIC, and PROVOCATIVE.
Theme: Secrets, minor betrayals, bad decisions, and social drama.
Tone: Spill the tea.`;
            break;
        case 'adult':
            systemPrompt = `Generate ${count} "Most Likely To" questions that are SPICY, SUGGESTIVE, and RATED R.
Theme: Dating, bedroom habits, wild parties, risky behavior.
Tone: Flirty, bold, and shocking.`;
            break;
        case 'chaos':
            systemPrompt = `Generate ${count} "Most Likely To" questions that are ABSURD, UNHINGED, and SURREAL.
Theme: Bizarre scenarios, dark humor, specific weirdness.
Tone: "What is wrong with you?" funny.`;
            break;
        default:
            systemPrompt = `Generate ${count} "Most Likely To" questions that are FUN, WITTY, and LIGHTHEARTED.
Theme: Life quirks, funny habits, future predictions.
Tone: Friendly banter. PG-13.`;
    }

    const prompt = `${systemPrompt}

Return ONLY the questions as a JSON array of strings. No numbering.`;

    try {
        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            },
        });
        return response.text ? (JSON.parse(response.text) as string[]) : [];
    } catch (err) {
        console.error('[ai/mlt] error:', err);
        return [];
    }
};

// =============================================================================
// Contextual Lies (Two Truths and a Lie helper)
// =============================================================================

export const handleContextualLies = async (params: { topic: string; trueStory: string }): Promise<[string, string] | []> => {
    const gemini = await getGemini();
    if (!gemini) return [];
    const { topic, trueStory } = params;

    try {
        const prompt = `You are an expert at the party game "Two Truths and a Lie".
The player has provided a TRUE STORY about the topic: "${topic}".
True Story: "${trueStory}"

CRITICAL INSTRUCTIONS:
1. BE A DETECTIVE: Identify specific entities in the True Story (e.g., a pet named "Fonzie", a specific location, a friend's name, a unique object).
2. REUSE ENTITIES: You MUST reuse some of these same specific entities in the fabricated lies.
3. CREATE CONTEXTUAL DECOYS: Generate exactly TWO plausible, highly contextual LIES.
4. The lies must sound like they belong to the same person and situation.
5. They must NOT contradict the true story or just be slight variations of it.
6. Write in the first person ("I").

Return the result as a JSON array containing exactly two strings.`;

        const response = await gemini.models.generateContent({
            model: MODEL,
            contents: prompt,
            config: {
                responseMimeType: 'application/json',
                responseSchema: { type: 'ARRAY', items: { type: 'STRING' } },
            },
        });

        if (!response.text) return [];
        const parsed = JSON.parse(response.text) as string[];
        return parsed.length >= 2 ? [parsed[0], parsed[1]] : [];
    } catch (err) {
        console.error('[ai/lies] error:', err);
        return [];
    }
};
