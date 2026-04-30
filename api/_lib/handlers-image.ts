// Image-related handlers — Roast Me image analysis (vision-in, text-out)
// and caricature image editing (image-in, image-out).
//
// NOTE ON VERCEL LIMITS:
//   - Hobby tier: 10s max duration, 4.5MB request body cap
//   - Pro tier: 60s max duration
// Image generation (editImage) can take 15-30s. On Hobby it may time out.
// If that happens in practice, this handler can be moved to an Edge Function
// or the user can upgrade the Vercel plan.

import { getGemini } from './clients';

const TEXT_MODEL = 'gemini-2.0-flash-001';
const IMAGE_MODEL = 'gemini-3-pro-image-preview';

// Caricature theme → image generation prompt
const getCaricaturePrompt = (theme: string): string => {
    const randomSubTheme = (options: string[]) => ` ${options[Math.floor(Math.random() * options.length)]}`;

    switch (theme) {
        case 'tabloid': {
            const modifiers = [
                'The background features an aggressive paparazzi mob.',
                'The background shows a messy, chaotic courtroom exit.',
                'The lighting should feel like a cheap camera flash in a dark restaurant.',
                'Add subtle, dramatic motion blur to the edges as if they are running away.',
            ];
            return `Edit this photo to look like a scandalous, trashy supermarket tabloid magazine cover. Apply a gritty, high-contrast 'paparazzi flash' aesthetic. Add bold, sensationalized magazine text overlays in bright yellow and neon pink. Exaggerate the person's expression to look guilty or shocked. The overall style should scream 'celebrity scandal' with a cheap, printed magazine texture.${randomSubTheme(modifiers)}`;
        }
        case 'movie': {
            const modifiers = [
                'Make it a neon-lit, rainy alleyway in a dystopian megacity.',
                'Make it a dusty, sun-scorched post-apocalyptic wasteland.',
                'Make it a dramatic, fiery explosion in an underground bunker.',
                'Make it a smoky, shadows-heavy underworld boss lair.',
            ];
            return `Transform the person in this photo into the star of a gritty, high-stakes action-thriller or cyberpunk movie poster. IT IS CRITICAL TO RETAIN THE EXACT FACIAL IDENTITY of the persons in the original photo—do not change their face. Upgrade their outfit into a rugged, battle-worn survivor or sleek undercover rogue aesthetic. Add polished, professional movie poster text overlays: invent a bold, gritty Movie Title that suits their look, and include a subtle, hilariously underwhelming or mundane tagline underneath it. Use dramatic chiaroscuro lighting, heavy film grain, and a cinematic color grading.${randomSubTheme(modifiers)}`;
        }
        case 'disco': {
            const modifiers = [
                'They should be posing awkwardly near a giant, glowing jukebox.',
                'They should look like they are caught mid-fall while attempting a risky roller skating trick.',
                'Add a hazy, colorful smoke-machine fog covering the roller rink floor.',
                'They should be striking a dramatically bad dance pose under an intense neon laser light.',
            ];
            return `CRITICAL INSTRUCTION: You must perfectly preserve the exact facial identities, bone structure, eyes, and likeness of every person in the uploaded photo. Do not generate new faces. Edit the people into a funky, neon-drenched retro-futuristic 1970s roller disco aesthetic by changing ONLY their hair, clothing, and the environment. For ALL subjects: Keep their faces identical. Style their hair into massive afros, feathered shags, or glittery styling. Dress them in flamboyant, horribly clashing outfits like flared sequined jumpsuits, metallic bell-bottoms, oversized tinted aviator shades, and platform roller skates. The background MUST be a vibrant neon roller rink with geometric light-up floors, arcade cabinets in the distance, and intense lens flares.${randomSubTheme(modifiers)}`;
        }
        case 'agra': {
            const modifiers = [
                'Include a random, extremely judgmental royal peacock staring at them.',
                'Have heavily-armed, annoyed historical palace guards side-eying them in the background.',
                'The lighting should be a dramatic, golden-hour sunset casting long shadows.',
                'Have a lavish but overly massive, confusing feast set up on a rug next to them.',
            ];
            return `CRITICAL INSTRUCTION: Perfectly preserve the exact facial identities, bone structure, and likeness of every person in the uploaded photo. Do not generate new faces. Edit the people into an over-the-top, majestic Mughal-era portrait set at the Taj Mahal. Dress them in flamboyant, overly-ornate historical Mughal royalty attire—think heavy jewel-encrusted sherwanis, oversized jeweled turbans, and heavily embroidered lehengas. They should look completely out of place, like modern tourists trying way too hard to look like an emperor or empress. The background MUST be a stunning, grand view of the Taj Mahal with intricate marble arches and reflecting pools.${randomSubTheme(modifiers)}`;
        }
        case 'animate':
        default: {
            const modifiers = [
                'Exaggerate their nose or hair in a silly way.',
                'Make them hold a tiny cup of coffee or a prop.',
                'Give them an overly dramatic or goofy facial expression.',
                'Place them in a bustling, abstract street background.',
            ];
            return `Transform this person into a funny cartoon caricature with exaggerated features. Classic street artist caricature style.${randomSubTheme(modifiers)}`;
        }
    }
};

// Roast caption system prompt per theme
const getRoastSystemPrompt = (theme: string): string => {
    const randomVibe = (options: string[]) => ` ${options[Math.floor(Math.random() * options.length)]}`;

    switch (theme) {
        case 'tabloid': {
            const vibes = [
                "Focus on insulting their 'outfit choices' as a tragic mistake.",
                "Focus on implying they were caught sneaking out of a D-list celebrity's house.",
                "Focus on their 'shocking' expression revealing their guilt.",
                'Mock them for looking like they just got fired from a reality TV show.',
            ];
            return `You are a ruthless gossip columnist writing a scandalous tabloid headline and short article about the person in this photo. Make up a ridiculous, embarrassing, and highly dramatic celebrity-style rumor based purely on their appearance, expression, or background. Start with a sensational all-caps HEADLINE, followed by the shocking 'exclusive' story. Be funny, dramatic, and petty. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'movie': {
            const vibes = [
                'Focus on how they would definitely be the first character to die in the movie.',
                "Suggest their 'mission' involves something incredibly boring, like doing taxes.",
                'Focus on their lack of intimidating aura despite the gritty movie setting.',
                'Imply that they are just a confused bystander who wandered onto the set.',
            ];
            return `You are a gravelly-voiced, overly-serious movie trailer narrator pitching a gritty, dark action-thriller starring the person in this photo. Based purely on their outfit, expression, or background in the image, invent a hilariously mundane "fatal flaw" or anticlimactic mission for them. Write a short, punchy, cinematic teaser trailer script. Start with an epic overarching statement, followed by the absurd reality of their role. Be funny, slightly roasting, and dramatic. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'disco': {
            const vibes = [
                'Complain about how their outfit is physically blinding you.',
                'Roast their total absolute lack of rhythm and rhythm-less facial expression.',
                "Accuse them of ruining your roller rink's pristine carpet.",
                'Tell them they look like a cheap disco-ball ordered off the internet.',
            ];
            return `You are a washed-up, extremely flamboyant 1970s roller-disco DJ who thinks they are still cool. Roast the people in this photo as if they are terrible dancers who just stumbled onto your roller rink floor. Use excessive 70s slang (groovy, jive, far out) but in a condescending way. Make fun of their awkward vibe, their expression, or their outfits as if they ruined your groove. Be funny, theatrical, and slightly petty. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'agra': {
            const vibes = [
                "Insult them as looking like a court jester who stole the Emperor's clothes.",
                'Complain that their mere presence is disrespecting the architecture.',
                'Mock their expression as someone who just lost all their gold at the market.',
                'Say they look like a time-traveler who clearly failed to blend in.',
            ];
            return `You are a hilariously strict, easily-offended royal court historian from the Mughal Empire. Roast the people in this photo who are clearly just tourists pretending to be royalty during their trip to Agra. Brutally mock their "cheap modern fabrics," their total lack of royal grace, or their absurd expressions as an insult to the dynasty and the Taj Mahal. Throw in some dramatically petty but historically-flavored insults. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'animate':
        default: {
            const vibes = [
                'Zone in purely on their hairstyle and roast it.',
                'Mock the aesthetic of whatever room or background they are in.',
                'Focus entirely on their deeply unserious facial expression.',
                'Compare them to a very obscure, funny cartoon character.',
            ];
            return `You are a legendary roast master at a comedy club.
Look at this image and write a brutal, hilarious, and edgy roast caption.
Make fun of the person's expression, clothes, vibe, or background.
Be savage and sarcastic, like an x-rated roast.
Keep it under 280 characters.${randomVibe(vibes)}`;
        }
    }
};

// =============================================================================
// Roast caption from image
// =============================================================================

export const handleGenerateRoast = async (params: { base64Image: string; theme?: string }): Promise<string> => {
    const gemini = await getGemini();
    if (!gemini) return "🔥 ROAST PROTOCOL DISABLED: API Key missing on server.";
    const { base64Image, theme = 'animate' } = params;

    try {
        const systemPrompt = getRoastSystemPrompt(theme);
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

export const handleEditImage = async (params: { base64Image: string; theme?: string; prompt?: string }): Promise<string | null> => {
    const gemini = await getGemini();
    if (!gemini) return null;
    const { base64Image, theme, prompt } = params;

    // Allow either an explicit prompt or a theme key. Theme takes precedence if
    // both are given (themes drive the existing UI flow).
    const effectivePrompt = theme ? getCaricaturePrompt(theme) : (prompt || getCaricaturePrompt('animate'));

    try {
        const response = await gemini.models.generateContent({
            model: IMAGE_MODEL,
            contents: {
                parts: [
                    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
                    { text: effectivePrompt },
                ],
            },
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
            const parts = candidates[0].content?.parts;
            if (parts) {
                for (const part of parts) {
                    if (part.inlineData && part.inlineData.data) {
                        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
                    }
                }
            }
        }
        return null;
    } catch (err) {
        console.error('[ai/edit_image] error:', err);
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
