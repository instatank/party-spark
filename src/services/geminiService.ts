// Client-side wrappers for AI-backed game content.
//
// NOTE: Despite the filename, none of this code actually talks to Google
// directly anymore. All requests go through our /api/ai server proxy, which
// routes to Gemini or Claude on the server side.
//
// The filename and exported function names are kept for compatibility —
// every component that imports from geminiService.ts keeps working without
// any changes. This was done as a non-breaking refactor so the proxy work
// ships in one PR.
//
// If you're adding a new AI-backed feature, call callAI() from aiClient.ts
// directly with the new request type.

import type { TabooCard } from '../types';
import { callAI } from './aiClient';

// =============================================================================
// Charades
// =============================================================================

const CHARADES_FALLBACK = ['The Godfather', 'Titanic', 'Inception', 'The Lion King', 'Jurassic Park', 'Avatar'];

export const generateCharadesWords = async (category: string, count: number = 20): Promise<string[]> => {
    const data = await callAI<string[]>('charades_words', { category, count });
    return data && data.length > 0 ? data : CHARADES_FALLBACK;
};

// =============================================================================
// Would I Lie To You
// =============================================================================

export const generateWouldILieToYou = async (count: number = 3): Promise<{ statement: string; rule: string }[]> => {
    const data = await callAI<{ statement: string; rule: string }[]>('wilty', { count });
    return data ?? [];
};

// =============================================================================
// Never Have I Ever
// =============================================================================

export const generateNeverHaveIEver = async (category: string, count: number = 5): Promise<string[]> => {
    const data = await callAI<string[]>('nhie', { category, count });
    return data ?? [];
};

// =============================================================================
// Taboo
// =============================================================================

const TABOO_FALLBACK: TabooCard[] = [
    { word: 'Coffee', forbidden: ['Drink', 'Caffeine', 'Starbucks', 'Morning', 'Bean'] },
];

export const generateTabooCards = async (category: string, count: number = 10): Promise<TabooCard[]> => {
    const data = await callAI<TabooCard[]>('taboo_cards', { category, count });
    return data && data.length > 0 ? data : TABOO_FALLBACK;
};

// =============================================================================
// Icebreaker
// =============================================================================

export const generateIcebreaker = async (type: 'fun' | 'deep'): Promise<string> => {
    const data = await callAI<string>('icebreaker', { type });
    return data || (type === 'fun'
        ? 'If you could have any superpower, what would it be?'
        : 'What is your favorite childhood memory?');
};

// =============================================================================
// Mafia narrative
// =============================================================================

const MAFIA_FALLBACKS: Record<'INTRO' | 'NIGHT' | 'DAY', string> = {
    INTRO: 'Welcome to the village of Ravenwood. Shadows lengthen, and trust is scarce...',
    NIGHT: 'Night falls. Everyone close your eyes. Mafia, wake up and choose your target...',
    DAY: 'Morning comes. The sun rises on a village changed forever. Discuss who you suspect.',
};

export const generateMafiaNarrative = async (phase: 'INTRO' | 'NIGHT' | 'DAY'): Promise<string> => {
    const data = await callAI<string>('mafia_narrative', { phase });
    return data || MAFIA_FALLBACKS[phase];
};

// =============================================================================
// Roast or Toast (legacy)
// =============================================================================

export const generateRoastOrToast = async (image: string, type: 'roast' | 'toast'): Promise<string> => {
    const data = await callAI<string>('roast_or_toast', { image, type });
    return data || (type === 'roast' ? "I'm speechless... literally." : 'Cheers to you!');
};

// =============================================================================
// Psycho Analysis (WYR)
// =============================================================================

export const generatePsychoAnalysis = async (
    questionOptionA: string,
    questionOptionB: string,
    userChoice: 'A' | 'B'
): Promise<string> => {
    const data = await callAI<string>('psycho_analysis', { questionOptionA, questionOptionB, userChoice });
    return data || "You're a person of mystery and distinct tastes.";
};

// =============================================================================
// Would You Rather (batch)
// =============================================================================

const WYR_FALLBACK = [
    {
        id: `fallback_${Date.now()}_1`,
        optionA: 'Have fingers as long as legs',
        optionB: 'Have legs as long as fingers',
        category: 'Absurd',
        stats: { a: 50, b: 50 },
        analysisA: "You want reach. You're ambitious but slightly terrifying.",
        analysisB: 'You want a low center of gravity. Practical but slow.',
    },
    {
        id: `fallback_${Date.now()}_2`,
        optionA: 'Be able to fly but only 2mph',
        optionB: 'Be able to run 100mph but only backwards',
        category: 'Superpowers',
        stats: { a: 60, b: 40 },
        analysisA: 'You value the view over efficiency.',
        analysisB: "You value speed but don't care where you're going.",
    },
];

export const generateWouldYouRatherQuestions = async (count: number = 5): Promise<unknown[]> => {
    const data = await callAI<unknown[]>('wyr_batch', { count });
    return data && data.length > 0 ? data : WYR_FALLBACK;
};

// =============================================================================
// Imposter
// =============================================================================

export const generateImposterContent = async (): Promise<{ category: string; word: string } | null> => {
    return callAI<{ category: string; word: string }>('imposter_content');
};

// =============================================================================
// Most Likely To
// =============================================================================

const MLT_FALLBACK = [
    'Who is most likely to break the game?',
    'Who is most likely to blame the AI?',
    'Who is most likely to need a drink right now?',
];

export const generateMostLikelyTo = async (category: string, count: number = 10): Promise<string[]> => {
    const data = await callAI<string[]>('mlt', { category, count });
    return data && data.length > 0 ? data : MLT_FALLBACK;
};

// =============================================================================
// Custom MLT — orchestrator kept as a stable public name. The server handler
// already does Claude-first, Gemini-fallback internally.
// =============================================================================

export const generateCustomMostLikelyTo = async (
    groupType: string,
    customContext: string,
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    const data = await callAI<string[]>('custom_mlt', { groupType, customContext, count, tone });
    return data ?? [];
};

// =============================================================================
// Custom TOD — same pattern
// =============================================================================

export const generateCustomTruthOrDrink = async (
    groupType: string,
    customContext: string,
    playerNames: string[],
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    const data = await callAI<string[]>('custom_tod', { groupType, customContext, playerNames, count, tone });
    return data ?? [];
};

// =============================================================================
// Contextual Lies (Two Truths and a Lie)
// =============================================================================

export const generateContextualLies = async (topic: string, trueStory: string): Promise<[string, string]> => {
    const data = await callAI<[string, string]>('contextual_lies', { topic, trueStory });
    if (data && data.length >= 2) return data;
    return [
        'I once accidentally trained a wild raccoon to bring me shiny objects.',
        'I got locked in a museum overnight and tried on a medieval suit of armor.',
    ];
};

// =============================================================================
// Roast Me — image-based
// =============================================================================

export type RoastTheme = 'animate' | 'tabloid' | 'movie' | 'disco' | 'agra';

export const generateRoast = async (base64Image: string, theme: RoastTheme = 'animate'): Promise<string> => {
    const data = await callAI<string>('generate_roast', { base64Image, theme });
    return data || 'Roast failed (API error).';
};

/**
 * Edit the image based on a theme or explicit prompt.
 * The UI currently passes themes via getCaricaturePrompt() below, but we now
 * prefer passing the theme key directly so the server owns the prompt text.
 */
export const editImage = async (base64Image: string, themeOrPrompt: string): Promise<string | null> => {
    // Backwards-compat: if callers pass a theme key, send it as `theme`; if they
    // pass a full prompt string (legacy call sites), send as `prompt`. Theme keys
    // are the 5 known values.
    const KNOWN_THEMES = ['animate', 'tabloid', 'movie', 'disco', 'agra'];
    const payload = KNOWN_THEMES.includes(themeOrPrompt)
        ? { base64Image, theme: themeOrPrompt }
        : { base64Image, prompt: themeOrPrompt };
    return callAI<string | null>('edit_image', payload);
};

/**
 * Helper still used client-side by some components to produce an image prompt.
 * Keeping it exported so existing call sites don't break; the server also has
 * a copy of this same mapping for when theme keys are passed through editImage.
 */
export const getCaricaturePrompt = (theme: RoastTheme): string => {
    // Minimal stub — the server now owns the real prompts. Components that
    // still call this should migrate to passing the theme key directly to
    // editImage(). Returning the theme key here is harmless because editImage
    // will recognize it as a known theme and use the server-side prompt.
    return theme;
};

/**
 * Base64 cleanup helper — strips the data URL prefix if present.
 * Pure client-side utility, no API call.
 */
export const cleanBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1] || dataUrl;
};
