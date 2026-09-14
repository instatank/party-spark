// Image-related handlers — Roast Me caption generation (vision in, text out),
// single-theme caricature editing (image in, image out), and the 2x2 composite
// used by the Roast Lab.
//
// The theme prompts themselves live in ./roast-themes.js. This file is now only
// plumbing: resolve a theme, call the model, dig the image out of the response.
//
// NOTE ON VERCEL LIMITS:
//   - Hobby tier: 10s max duration, 4.5MB request body cap
//   - Pro tier: 60s max duration
// Image generation takes 15-30s, and the 4K composite is slower still. On Hobby
// these can time out; that is a plan limit, not a bug in this file.

import { getGemini } from './clients.js';
import {
    getThemeDef,
    randomPick,
    buildCompositePrompt,
} from './roast-themes.js';

const TEXT_MODEL = 'gemini-2.5-flash';
const IMAGE_MODEL = 'gemini-3-pro-image';

// Output resolution. The SDK accepts '1K' | '2K' | '4K' and defaults to '1K'.
//
// We default single images to 2K because 2K and 1K COST EXACTLY THE SAME —
// both bill 1120 output tokens — while 2K carries four times the pixels. The
// old code sent no imageConfig at all and therefore silently shipped 1K, which
// was leaving free resolution on the table on every single roast.
//
// 4K is a real price step (2000 tokens), so it is opt-in and used only for
// composites, where each pane is a quarter of the frame.
const DEFAULT_IMAGE_SIZE = '2K';
const COMPOSITE_IMAGE_SIZE = '4K';
const VALID_IMAGE_SIZES = ['1K', '2K', '4K'];

const normaliseImageSize = (requested: string | undefined, fallback: string): string =>
    requested && VALID_IMAGE_SIZES.includes(requested) ? requested : fallback;

/** Pull the first inline image out of a generateContent response, if any. */
const extractImage = (response: {
    candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>;
}): string | null => {
    const parts = response.candidates?.[0]?.content?.parts;
    if (!parts) return null;
    for (const part of parts) {
        if (part.inlineData?.data) {
            return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
    }
    return null;
};

// =============================================================================
// Roast caption from image
// =============================================================================

export const handleGenerateRoast = async (params: {
    base64Image: string;
    theme?: string;
    team?: string;
    variant?: string;
}): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return '🔥 ROAST PROTOCOL DISABLED: API Key missing on server.';
    const { base64Image, theme, team, variant } = params;

    try {
        // getThemeDef falls back to the default theme rather than throwing, so a
        // PWA-cached client sending a retired key still gets a real roast.
        const systemPrompt = getThemeDef(theme).roast({ team, variant, pick: randomPick });
        const response = await gemini.models.generateContent({
            model: TEXT_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: systemPrompt },
                ],
            },
        });
        return response.text || "I'm literally speechless. You managed to break the AI.";
    } catch (err) {
        console.error('[ai/roast] error:', err);
        return 'Roast failed (API Error).';
    }
};

// =============================================================================
// Caricature image edit (image in → image out)
// =============================================================================

export const handleEditImage = async (params: {
    base64Image: string;
    theme?: string;
    team?: string;
    variant?: string;
    prompt?: string;
    imageSize?: string;
}): Promise<string | null> => {
    const gemini = await getGemini();
    if (!gemini) return null;
    const { base64Image, theme, team, variant, prompt, imageSize } = params;

    // A theme key wins over a raw prompt (themes drive the real UI flow); a raw
    // prompt is the escape hatch for the lab and any hand-rolled call.
    const effectivePrompt = theme
        ? getThemeDef(theme).caricature({ team, variant, pick: randomPick })
        : prompt || getThemeDef(undefined).caricature({ team, variant, pick: randomPick });

    try {
        const response = await gemini.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: effectivePrompt },
                ],
            },
            config: {
                imageConfig: { imageSize: normaliseImageSize(imageSize, DEFAULT_IMAGE_SIZE) },
            },
        });
        return extractImage(response);
    } catch (err) {
        console.error('[ai/edit_image] error:', err);
        return null;
    }
};

// =============================================================================
// 2x2 composite (one request, four themes)
// =============================================================================

/**
 * Generate up to four themes as a single gridded image.
 *
 * Why this exists: output images bill per image, not per pane, so four themes
 * in one 4K composite costs $0.24 against $0.536 for four separate 2K images.
 * Whether the resulting faces hold up is an open question that no amount of
 * reasoning settles — hence the Roast Lab, which runs both paths on the same
 * photo and puts them side by side.
 *
 * aspectRatio is pinned to 1:1 so each quadrant is also 1:1 (halving both
 * dimensions preserves the ratio), which makes the panes directly comparable to
 * single generations.
 */
export const handleRoastComposite = async (params: {
    base64Image: string;
    themes?: string[];
    imageSize?: string;
}): Promise<string | null> => {
    const gemini = await getGemini();
    if (!gemini) return null;
    const { base64Image, themes, imageSize } = params;

    const themeKeys = Array.isArray(themes) && themes.length > 0 ? themes.slice(0, 4) : ['animate'];

    try {
        const response = await gemini.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: buildCompositePrompt(themeKeys) },
                ],
            },
            config: {
                imageConfig: {
                    imageSize: normaliseImageSize(imageSize, COMPOSITE_IMAGE_SIZE),
                    aspectRatio: '1:1',
                },
            },
        });
        return extractImage(response);
    } catch (err) {
        console.error('[ai/roast_composite] error:', err);
        return null;
    }
};

// =============================================================================
// Roast or Toast (legacy text-based variant)
// =============================================================================

export const handleRoastOrToast = async (params: { image: string; type: 'roast' | 'toast' }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return params.type === 'roast' ? "I'm speechless... literally." : 'Cheers to you!';
    const { image, type } = params;

    const prompt = type === 'roast'
        ? 'You are a savage comedian. Roast this person based on their selfie. Be funny, edgy, but keep it friendly enough for a wide audience. Max 2 sentences.'
        : 'You are a kind, poetic friend. Give a generous, humorous toast to this person. Max 2 sentences.';

    try {
        const response = await gemini.models.generateContent({
            model: TEXT_MODEL,
            contents: [
                {
                    role: 'user',
                    parts: [
                        { text: prompt },
                        { inlineData: { data: image.split(',')[1] || image, mimeType: 'image/jpeg' } },
                    ],
                },
            ],
        });
        return response.text || (type === 'roast' ? "I'm speechless... literally." : 'Cheers to you!');
    } catch (err) {
        console.error('[ai/roast_or_toast] error:', err);
        return type === 'roast' ? "Couldn't roast — API error." : "Couldn't toast — API error.";
    }
};
