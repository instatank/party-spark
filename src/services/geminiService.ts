import { GoogleGenAI, Type } from "@google/genai";
import type { TriviaQuestion, TabooCard } from "../types";

// Helper to get AI instance safely
const getAI = () => {
    const apiKey = import.meta.env.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '') || '';
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

// Default Free Model for general games
const modelFlash = 'gemini-2.0-flash-001';

// --- GAME CONTENT GENERATION ---

export const generateCharadesWords = async (category: string, count: number = 20): Promise<string[]> => {
    try {
        const ai = getAI();
        if (!ai) return ["The Godfather", "Titanic", "Inception", "The Lion King", "Jurassic Park", "Avatar"]; // Fallback

        const prompt = `Generate a list of ${count} popular and recognizable Movie Titles for a game of Charades. 
    The category is: ${category}. 
    Return ONLY the movie titles separated by commas. No numbering. No years.`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
        });

        const text = response.text || '';
        return text.split(',').map(s => s.trim()).filter(s => s.length > 0);
    } catch (error) {
        console.error("Error generating charades:", error);
        return ["The Godfather", "Titanic", "Inception", "The Lion King", "Jurassic Park", "Avatar"]; // Movie Fallback
    }
};

// --- WOULD I LIE TO YOU LOGIC ---
export const generateWouldILieToYou = async (count: number = 3): Promise<{ statement: string, rule: string }[]> => {
    try {
        const ai = getAI();
        if (!ai) return [];

        const systemPrompt = `Generate ${count} statements for the game "Would I Lie To You". 
        Theme: Incredibly mundane, extremely common personal habits, mild food preferences, or simple everyday mix-ups.
        Style guidelines: 
        1. Keep the statements EXTREMELY short and highly generic.
        2. Use almost zero descriptive adjectives. Do not add highly specific details, names, or unnecessary context.
        3. Make it overwhelmingly boring, realistic, and entirely plausible.
        4. It must sound like a basic, simple truth.
        Format: Each item must contain a 'statement' (starting with "Once I...", "I always...", or "I have a habit of...") and a 'rule' (a very brief, simple reason or context).
        Do NOT wrap in markdown \`\`\`json block. Just raw JSON structure.
        Return EXACTLY this JSON structure:
        [
            {
                "statement": "I have a habit of eating kiwi fruit with the skin still on.",
                "rule": "I just don't like peeling them."
            }
        ]`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: systemPrompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        if (response.text) return JSON.parse(response.text);
        return [];
    } catch (error) {
        console.error("Would I Lie To You Generation Error:", error);
        return [];
    }
};

// --- NEVER HAVE I EVER LOGIC ---
export const generateNeverHaveIEver = async (category: string, count: number = 5): Promise<string[]> => {
    try {
        const ai = getAI();
        if (!ai) return [];

        let systemPrompt = "";
        switch (category) {
            case 'agra':
                systemPrompt = `Generate ${count} "Never Have I Ever" statements for a family trip to Agra (Taj Mahal, ITC Mughal). 
                The group includes: an 11-year-old boy from London ("Rehaan"), his mom (born in Agra), his aunt, and two grandmothers (one from Agra).
                Theme: Mughal history, family travel quirks, returning to hometown roots, navigating Indian heat, and Rehaan's first Agra experiences.
                Tone: Wholesome, funny, educational but not boring, perfect for mixed generations.
                Examples: "Never have I ever pretended to know a random historical fact about the Taj Mahal.", "Never have I ever complained about the Indian summer heat while eating a cold dessert."`;
                break;
            case 'rehaan':
                systemPrompt = `Generate ${count} "Never Have I Ever" statements for an extended family resort vacation (cousins, uncles, aunts, grandparents) featuring an 11-year-old nephew from London named 'Rehaan'.
                Theme: Family bonding, resort quirks, generational gaps, and light-hearted embarrassing family moments.
                Format: Each must start with "Never have I ever..."
                Tone: Wholesome, PG, relatable for a mixed-generation Indian family traveling with a Londoner.
                Examples: "Never have I ever complained about the younger generation's technology habits.", "Never have I ever sneaked out of a boring relative's house."`;
                break;
            case 'guilty_pleasures':
                systemPrompt = `Generate ${count} "Never Have I Ever" statements about guilty pleasures.
                Theme: Slightly embarrassing but universal habits we all secretly do.
                Format: Each must start with "Never have I ever..."
                Tone: Funny, relatable, slightly self-deprecating but safe for casual friends.
                Examples: "Never have I ever eaten food that fell on the floor after the 5-second rule."`;
                break;
            default: // classic
                systemPrompt = `Generate ${count} classic "Never Have I Ever" statements for a party.
                Theme: Standard social slip-ups, minor lies, and funny life failures.
                Format: Each must start with "Never have I ever..."
                Tone: Classic party game vibes. Lightly edgy but not explicitly R-rated.
                Examples: "Never have I ever ghosted someone after a first date."`;
        }

        const fullPrompt = `${systemPrompt}\n\nReturn EXACTLY a JSON array of ${count} strings. Do NOT wrap in markdown \`\`\`json block. Just raw JSON array like: ["Never have I ever...", "Never have I ever..."]`;

        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash-001",
            contents: fullPrompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
        return [];
    } catch (error) {
        console.error("Never Have I Ever Generation Error:", error);
        return [];
    }
};

export const generateTriviaQuestions = async (category: string, count: number = 5): Promise<TriviaQuestion[]> => {
    try {
        const ai = getAI();
        if (!ai) return [];

        let prompt = `Generate ${count} engaging, intermediate difficulty trivia questions about "${category}".
    Ensure the options are distinct and the answer is correct.
    Include a short, interesting fun fact for each.`;

        if (category === 'agra_trip') {
            prompt = `Generate ${count} awe-inspiring, fun, and informative trivia questions about the Taj Mahal, the Mughal Dynasty, and Agra's history. 
            CRITICAL: The false options must be highly plausible, clever historical decoys that could easily be true, making the question challenging. Avoid obvious joke options that give away the answer.
            The tone should be witty, educational, and spark curiosity. 
            Ensure the correct answer is factually accurate. 
            Include a short, surprising or mind-blowing 'fun fact' for each question that delves into the incredible, lesser-known details of Mughal history.`;
        }

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            question: { type: Type.STRING },
                            options: { type: Type.ARRAY, items: { type: Type.STRING } },
                            answer: { type: Type.STRING },
                            funFact: { type: Type.STRING }
                        },
                        required: ["question", "options", "answer"]
                    }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text) as TriviaQuestion[];
        }
        return [];
    } catch (error) {
        console.error("Trivia batch error:", error);
        return [];
    }
};

export const generateTabooCards = async (category: string, count: number = 10): Promise<TabooCard[]> => {
    try {
        const ai = getAI();
        if (!ai) return [
            { word: "Coffee", forbidden: ["Drink", "Caffeine", "Starbucks", "Morning", "Bean"] }
        ];

        const prompt = `Generate ${count} Taboo-style game cards for the category "${category}".
    Each card must have a main 'word' to guess and 5 'forbidden' words that are closely related to the main word and cannot be used.
    Make them fun and challenging.`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            word: { type: Type.STRING },
                            forbidden: { type: Type.ARRAY, items: { type: Type.STRING } }
                        },
                        required: ["word", "forbidden"]
                    }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text) as TabooCard[];
        }
        return [];
    } catch (error) {
        console.error("Taboo generation error:", error);
        return [
            { word: "Coffee", forbidden: ["Drink", "Caffeine", "Starbucks", "Morning", "Bean"] }
        ];
    }
};

export const generateIcebreaker = async (type: 'fun' | 'deep'): Promise<string> => {
    try {
        const ai = getAI();
        if (!ai) return "If you could have any superpower, what would it be?";

        const prompt = type === 'fun'
            ? "Give me one funny, quick, and lighthearted 'Two Truths and a Lie' idea OR a 'Never have I ever' prompt. Keep it short."
            : "Give me one thought-provoking conversation starter question for a group of friends. Keep it short.";

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
        });

        return response.text || "If you could have any superpower, what would it be?";
    } catch (error) {
        return "What is your favorite childhood memory?";
    }
};

export const generateMafiaNarrative = async (phase: 'INTRO' | 'NIGHT' | 'DAY'): Promise<string> => {
    try {
        const ai = getAI();
        if (!ai) {
            if (phase === 'INTRO') return "Welcome to the village of Ravenwood. Shadows lengthen, and trust is scarce...";
            if (phase === 'NIGHT') return "Night falls. Everyone close your eyes. Mafia, wake up and choose your target...";
            return "Morning comes. The sun rises on a village changed forever. Discuss who you suspect.";
        }

        let prompt = "";
        if (phase === 'INTRO') {
            prompt = "You are the narrator for a game of Mafia. Write a short, atmospheric introduction setting the scene for a small village where mafia members are hiding among villagers. Keep it suspenseful but under 100 words.";
        } else if (phase === 'NIGHT') {
            prompt = "You are the narrator for a game of Mafia. Write a short script for the 'Night Phase' where everyone closes their eyes, and the Mafia wakes up to choose a victim, the Doctor saves someone, and the Sheriff investigates. Instructions for players should be clear. Keep it under 100 words.";
        } else {
            prompt = "You are the narrator for a game of Mafia. Write a short script for the 'Day Phase' where everyone wakes up. Announce that something happened last night (don't specify who died yet, just build tension) and tell the villagers they must now discuss and vote on who to eliminate. Keep it under 100 words.";
        }

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
        });

        return response.text || "The village sleeps...";
    } catch (error) {
        console.error("Mafia narrative error:", error);
        if (phase === 'INTRO') return "Welcome to the village of Ravenwood. Shadows lengthen, and trust is scarce...";
        if (phase === 'NIGHT') return "Night falls. Everyone close your eyes. Mafia, wake up and choose your target...";
        return "Morning comes. The sun rises on a village changed forever. Discuss who you suspect.";
    }
};

export const generateRoastOrToast = async (image: string, type: 'roast' | 'toast'): Promise<string> => {
    try {
        const ai = getAI();
        if (!ai) return type === 'roast' ? "I'm speechless... literally." : "Cheers to you!";

        const prompt = type === 'roast'
            ? "You are a savage comedian. Roast this person based on their selfie. Be funny, edgy, but keep it friendly enough for a wide audience. Max 2 sentences."
            : "You are a kind, poetic friend. Give a generous, humorous toast to this person. Max 2 sentences.";

        const imagePart = {
            inlineData: {
                data: image.split(',')[1], // Remove "data:image/jpeg;base64," prefix
                mimeType: "image/jpeg",
            },
        };

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        imagePart
                    ]
                }
            ],
        });

        return response.text || (type === 'roast' ? "I'm speechless... literally." : "Cheers to you!");
    } catch (error) {
        console.error("Roast/Toast error:", error);
        return type === 'roast'
            ? "My vision is blurry, but I bet you look roastable."
            : "Here's to you! (Even if I can't see you clearly right now)";
    }
};


// --- ROAST ME LOGIC (UPDATED WITH USER CODE) ---

export type RoastTheme = 'animate' | 'tabloid' | 'movie' | 'disco' | 'agra';

export const getCaricaturePrompt = (theme: RoastTheme): string => {
    const randomSubTheme = (options: string[]) => ` ${options[Math.floor(Math.random() * options.length)]}`;

    switch (theme) {
        case 'tabloid': {
            const modifiers = [
                "The background features an aggressive paparazzi mob.",
                "The background shows a messy, chaotic courtroom exit.",
                "The lighting should feel like a cheap camera flash in a dark restaurant.",
                "Add subtle, dramatic motion blur to the edges as if they are running away."
            ];
            return `Edit this photo to look like a scandalous, trashy supermarket tabloid magazine cover. Apply a gritty, high-contrast 'paparazzi flash' aesthetic. Add bold, sensationalized magazine text overlays in bright yellow and neon pink. Exaggerate the person's expression to look guilty or shocked. The overall style should scream 'celebrity scandal' with a cheap, printed magazine texture.${randomSubTheme(modifiers)}`;
        }
        case 'movie': {
            const modifiers = [
                "Make it a neon-lit, rainy alleyway in a dystopian megacity.",
                "Make it a dusty, sun-scorched post-apocalyptic wasteland.",
                "Make it a dramatic, fiery explosion in an underground bunker.",
                "Make it a smoky, shadows-heavy underworld boss lair."
            ];
            return `Transform the person in this photo into the star of a gritty, high-stakes action-thriller or cyberpunk movie poster. IT IS CRITICAL TO RETAIN THE EXACT FACIAL IDENTITY of the persons in the original photo—do not change their face. Upgrade their outfit into a rugged, battle-worn survivor or sleek undercover rogue aesthetic. Give them heavily customized, weathered gear or a stylish ruined suit. Add polished, professional movie poster text overlays: invent a bold, gritty Movie Title that suits their look, and include a subtle, hilariously underwhelming or mundane tagline underneath it. Use dramatic chiaroscuro lighting, heavy film grain, and a cinematic color grading.${randomSubTheme(modifiers)}`;
        }
        case 'disco': {
            const modifiers = [
                "They should be posing awkwardly near a giant, glowing jukebox.",
                "They should look like they are caught mid-fall while attempting a risky roller skating trick.",
                "Add a hazy, colorful smoke-machine fog covering the roller rink floor.",
                "They should be striking a dramatically bad dance pose under an intense neon laser light."
            ];
            return `CRITICAL INSTRUCTION: You must perfectly preserve the exact facial identities, bone structure, eyes, and likeness of every person in the uploaded photo. Do not generate new faces. Edit the people into a funky, neon-drenched retro-futuristic 1970s roller disco aesthetic by changing ONLY their hair, clothing, and the environment. For ALL subjects: Keep their faces identical. Style their hair into massive afros, feathered shags, or glittery styling. Dress them in flamboyant, horribly clashing outfits like flared sequined jumpsuits, metallic bell-bottoms, oversized tinted aviator shades, and platform roller skates. The background MUST be a vibrant neon roller rink with geometric light-up floors, arcade cabinets in the distance, and intense lens flares.${randomSubTheme(modifiers)}`;
        }

        case 'agra': {
            const modifiers = [
                "Include a random, extremely judgmental royal peacock staring at them.",
                "Have heavily-armed, annoyed historical palace guards side-eying them in the background.",
                "The lighting should be a dramatic, golden-hour sunset casting long shadows.",
                "Have a lavish but overly massive, confusing feast set up on a rug next to them."
            ];
            return `CRITICAL INSTRUCTION: Perfectly preserve the exact facial identities, bone structure, and likeness of every person in the uploaded photo. Do not generate new faces. Edit the people into an over-the-top, majestic Mughal-era portrait set at the Taj Mahal. Dress them in flamboyant, overly-ornate historical Mughal royalty attire—think heavy jewel-encrusted sherwanis, oversized jeweled turbans, and heavily embroidered lehengas. They should look completely out of place, like modern tourists trying way too hard to look like an emperor or empress. The background MUST be a stunning, grand view of the Taj Mahal with intricate marble arches and reflecting pools.${randomSubTheme(modifiers)}`;
        }
        case 'animate':
        default: {
            const modifiers = [
                "Exaggerate their nose or hair in a silly way.",
                "Make them hold a tiny cup of coffee or a prop.",
                "Give them an overly dramatic or goofy facial expression.",
                "Place them in a bustling, abstract street background."
            ];
            return `Transform this person into a funny cartoon caricature with exaggerated features. Classic street artist caricature style.${randomSubTheme(modifiers)}`;
        }
    }
};

const getRoastSystemPrompt = (theme: RoastTheme): string => {
    const randomVibe = (options: string[]) => ` ${options[Math.floor(Math.random() * options.length)]}`;

    switch (theme) {
        case 'tabloid': {
            const vibes = [
                "Focus on insulting their 'outfit choices' as a tragic mistake.",
                "Focus on implying they were caught sneaking out of a D-list celebrity's house.",
                "Focus on their 'shocking' expression revealing their guilt.",
                "Mock them for looking like they just got fired from a reality TV show."
            ];
            return `You are a ruthless gossip columnist writing a scandalous tabloid headline and short article about the person in this photo. Make up a ridiculous, embarrassing, and highly dramatic celebrity-style rumor based purely on their appearance, expression, or background. Start with a sensational all-caps HEADLINE, followed by the shocking 'exclusive' story. Be funny, dramatic, and petty. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'movie': {
            const vibes = [
                "Focus on how they would definitely be the first character to die in the movie.",
                "Suggest their 'mission' involves something incredibly boring, like doing taxes.",
                "Focus on their lack of intimidating aura despite the gritty movie setting.",
                "Imply that they are just a confused bystander who wandered onto the set."
            ];
            return `You are a gravelly-voiced, overly-serious movie trailer narrator pitching a gritty, dark action-thriller starring the person in this photo. Based purely on their outfit, expression, or background in the image, invent a hilariously mundane "fatal flaw" or anticlimactic mission for them. Write a short, punchy, cinematic teaser trailer script. Start with an epic overarching statement, followed by the absurd reality of their role. Be funny, slightly roasting, and dramatic. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'disco': {
            const vibes = [
                "Complain about how their outfit is physically blinding you.",
                "Roast their total absolute lack of rhythm and rhythm-less facial expression.",
                "Accuse them of ruining your roller rink's pristine carpet.",
                "Tell them they look like a cheap disco-ball ordered off the internet."
            ];
            return `You are a washed-up, extremely flamboyant 1970s roller-disco DJ who thinks they are still cool. Roast the people in this photo as if they are terrible dancers who just stumbled onto your roller rink floor. Use excessive 70s slang (groovy, jive, far out) but in a condescending way. Make fun of their awkward vibe, their expression, or their outfits as if they ruined your groove. Be funny, theatrical, and slightly petty. Keep it under 280 characters.${randomVibe(vibes)}`;
        }

        case 'agra': {
            const vibes = [
                "Insult them as looking like a court jester who stole the Emperor's clothes.",
                "Complain that their mere presence is disrespecting the architecture.",
                "Mock their expression as someone who just lost all their gold at the market.",
                "Say they look like a time-traveler who clearly failed to blend in."
            ];
            return `You are a hilariously strict, easily-offended royal court historian from the Mughal Empire. Roast the people in this photo who are clearly just tourists pretending to be royalty during their trip to Agra. Brutally mock their "cheap modern fabrics," their total lack of royal grace, or their absurd expressions as an insult to the dynasty and the Taj Mahal. Throw in some dramatically petty but historically-flavored insults. Keep it under 280 characters.${randomVibe(vibes)}`;
        }
        case 'animate':
        default: {
            const vibes = [
                "Zone in purely on their hairstyle and roast it.",
                "Mock the aesthetic of whatever room or background they are in.",
                "Focus entirely on their deeply unserious facial expression.",
                "Compare them to a very obscure, funny cartoon character."
            ];
            return `You are a legendary roast master at a comedy club. 
      Look at this image and write a brutal, hilarious, and edgy roast caption. 
      Make fun of the person's expression, clothes, vibe, or background. 
      Be savage and sarcastic, like an x-rated roast. 
      Keep it under 280 characters.${randomVibe(vibes)}`;
        }
    }
};

/**
 * Generates a roast caption. 
 * Defaults to 'gemini-2.0-flash-exp' (Free Tier) as requested.
 */
export const generateRoast = async (base64Image: string, theme: RoastTheme = 'animate'): Promise<string> => {
    const ai = getAI();
    // SAFETY CHECK: If API Key is missing (Safety Mode), return mock data
    if (!ai) {
        await new Promise(resolve => setTimeout(resolve, 1500)); // Fake delay
        return "🔥 ROAST PROTOCOL DISABLED: API Key missing.\n\n(This is 'Safety Mode' to prevent costs. Enable the API to get real roasts!)";
    }

    try {
        const systemPrompt = getRoastSystemPrompt(theme);

        const response = await ai.models.generateContent({
            model: 'gemini-2.0-flash-001', // Reverted to Free Tier as requested (Cloud Console too complex)
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64Image
                        }
                    },
                    {
                        text: systemPrompt
                    }
                ]
            }
        });

        return response.text || "I'm literally speechless. You managed to break the AI.";
    } catch (error) {
        console.error("Roast generation failed:", error);
        // throw error; // User asked to "check" errors, better to throw or handle gracefully
        return "Roast failed (API Error). Check console.";
    }
};

/**
 * Edits the image based on a prompt.
 * Uses 'gemini-3-pro-image-preview' (Banana Pro) as verified available.
 */
export const editImage = async (base64Image: string, prompt: string): Promise<string | null> => {
    try {
        const ai = getAI();
        if (!ai) return null;

        // Explicitly using the model ID we found in list_names.js that works for Banana Pro
        const modelName = 'gemini-3-pro-image-preview';

        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    {
                        inlineData: {
                            mimeType: 'image/jpeg',
                            data: base64Image,
                        },
                    },
                    {
                        text: prompt,
                    },
                ],
            },
        });

        const candidates = response.candidates;
        if (candidates && candidates.length > 0) {
            // User provided fix for accessing parts
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
    } catch (error) {
        console.error("Image editing failed:", error);
        return null;
    }
};

export const cleanBase64 = (dataUrl: string): string => {
    return dataUrl.split(',')[1];
};


export const generatePsychoAnalysis = async (
    questionOptionA: string,
    questionOptionB: string,
    userChoice: 'A' | 'B'
): Promise<string> => {
    try {
        const ai = getAI();
        if (!ai) return "You're a person of mystery and distinct tastes.";

        const chosenOption = userChoice === 'A' ? questionOptionA : questionOptionB;
        const rejectedOption = userChoice === 'A' ? questionOptionB : questionOptionA;

        const prompt = `
            You are a witty, insightful pop-psychologist. 
            The user was asked "Would you rather ${questionOptionA} OR ${questionOptionB}?"
            The user chose: "${chosenOption}" over "${rejectedOption}".
            
            Provide a BRIEF, fun, 1-2 sentence psychoanalysis of what this choice says about their personality. 
            Why did they pick this over the alternative? Be specific to the trade-off.
            Keep it under 25 words.
        `;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
        });

        return response.text || "You're a person of mystery and distinct tastes.";
    } catch (error) {
        console.error("Analysis generation error:", error);
        return "Your choice reveals a decisive nature, unafraid of hypothetical consequences.";
    }
};

export const generateWouldYouRatherQuestions = async (count: number = 5): Promise<any[]> => {
    try {
        const ai = getAI();
        if (!ai) throw new Error("API Key missing");

        const numQuestions = count || 5;
        const prompt = `Generate ${numQuestions} unique, thought-provoking "Would You Rather" questions.
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

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: {
                parts: [{ text: prompt }]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            optionA: { type: Type.STRING },
                            optionB: { type: Type.STRING },
                            category: { type: Type.STRING },
                            stats: {
                                type: Type.OBJECT,
                                properties: {
                                    a: { type: Type.NUMBER },
                                    b: { type: Type.NUMBER }
                                },
                                required: ["a", "b"]
                            },
                            analysisA: { type: Type.STRING },
                            analysisB: { type: Type.STRING }
                        },
                        required: ["optionA", "optionB", "category", "stats", "analysisA", "analysisB"]
                    }
                }
            }
        });

        if (response.text) {
            const raw = JSON.parse(response.text);
            // Map to app format
            return raw.map((q: any, i: number) => ({
                id: `ai_${Date.now()}_${i}`,
                optionA: q.optionA,
                optionB: q.optionB,
                category: q.category,
                stats: q.stats,
                analysisA: q.analysisA || "",
                analysisB: q.analysisB || ""
            }));
        }
        throw new Error("Empty response");
    } catch (error) {
        console.error("WYR Batch Error:", error);
        return [
            {
                id: `fallback_${Date.now()}_1`,
                optionA: "Have fingers as long as legs",
                optionB: "Have legs as long as fingers",
                category: "Absurd",
                stats: { a: 50, b: 50 },
                analysisA: "You want reach. You're ambitious but slightly terrifying.",
                analysisB: "You want a low center of gravity. Practical but slow."
            },
            {
                id: `fallback_${Date.now()}_2`,
                optionA: "Be able to fly but only 2mph",
                optionB: "Be able to run 100mph but only backwards",
                category: "Superpowers",
                stats: { a: 60, b: 40 },
                analysisA: "You value the view over efficiency.",
                analysisB: "You value speed but don't care where you're going."
            }
        ];
    }
};

export const generateImposterContent = async (): Promise<{ category: string, word: string } | null> => {
    try {
        const ai = getAI();
        if (!ai) return null;

        const prompt = `Generate a single unique game round for "Who is the Imposter".
        Return a JSON object with:
        - category (string, e.g. "Kitchen Appliances", "Ancient Empires")
        - word (string, a specific item in that category, e.g. "Blender", "Rome")
        Make it challenging but not impossible.`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        category: { type: Type.STRING },
                        word: { type: Type.STRING }
                    },
                    required: ["category", "word"]
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
        return null;
    } catch (error) {
        console.error("Imposter Generation Error:", error);
        return null;
    }
};

export const generateMostLikelyTo = async (category: string, count: number = 10): Promise<string[]> => {
    try {
        const ai = getAI();
        if (!ai) {
            // Safety Mode: Return empty array. Component handles local data.
            return [];
        }

        let systemPrompt = "";
        switch (category) {
            case 'agra':
                systemPrompt = `Generate ${count} "Most Likely To" questions specifically designed for a family trip to Agra (visiting Taj Mahal, staying at ITC Mughal). 
                The group includes: an 11-year-old boy from London ("Rehaan"), his mom (born in Agra), his aunt, and two grandmothers (one originally from Agra).
                Theme: Exploring Agra, seeing the Taj Mahal, experiencing ITC Mughal luxury, nostalgic stories from the mom/grandma about growing up in Agra, Rehaan's reactions to India, and funny family travel dynamics.
                Tone: Light-hearted, fun, perfectly balanced with a bit of "edutainment" and historical trivia about Mughal culture/Agra.
                Examples: "Who is most likely to act like an official tour guide for the Taj Mahal?", "Who is most likely to tell the most exaggerated story about growing up in Agra?"`;
                break;
            case 'rehaan':
                systemPrompt = `Generate ${count} "Most Likely To" questions specifically designed for "Rehaan," an 11-year-old boy from London visiting his extended Indian family (grandparents, uncles, aunts, cousins) for a vacation.
                Theme: Culture clash (London vs India), generational gaps, tech gaps, overly doting aunties, strict/traditional uncles, and funny observations of the grandparents.
                Tone: Light-hearted, funny, completely PG, and easily understandable for an 11-year-old.
                Examples: "Who is most likely to completely misunderstand Rehaan's London slang?", "Who is most likely to try and feed Rehaan five extra meals?", "Who is most likely to ask Rehaan to fix their iPad?"`;
                break;
            case 'family_friendly':
                systemPrompt = `Generate ${count} "Most Likely To" questions specifically for extended families (cousins, uncles, aunts, grandparents).
                Theme: Shared memories, family roles, funny recurring habits, childhood anecdotes.
                Tone: Wholesome, light-hearted, nostalgic, safe for all ages (PG). NOT offensive.
                Examples: "Who is most likely to fall asleep first after dinner?", "Who is the 'cool' aunt/over-protective uncle?", "Who is most likely to bring up embarrassing childhood stories?"`;
                break;
            case 'scandalous':
                systemPrompt = `Generate ${count} "Most Likely To" questions that are GOSSIPY, DRAMATIC, and PROVOCATIVE. 
                Theme: Secrets, minor betrayals, bad decisions, and social drama. 
                Tone: Spill the tea. Make people argue (fun way). 
                Examples: "Who is checking their ex's story right now?", "Who hates their best friend's partner?"`;
                break;
            case 'adult':
                systemPrompt = `Generate ${count} "Most Likely To" questions that are SPICY, SUGGESTIVE, and RATED R. 
                Theme: Dating, bedroom habits, wild parties, and risky behavior. 
                Tone: Flirty, bold, and shocking. 
                Examples: "Who has the highest body count?", "Who would sleep with a boss for a promotion?"`;
                break;
            case 'chaos':
                systemPrompt = `Generate ${count} "Most Likely To" questions that are ABSURD, UNHINGED, and SURREAL. 
                Theme: Bizarre scenarios, dark humor, specific weirdness. 
                Tone: "What is wrong with you?" funny. 
                Examples: "Who would eat a raw pigeon for $100?", "Who is definitely a government clone?"`;
                break;
            default: // fun
                systemPrompt = `Generate ${count} "Most Likely To" questions that are FUN, WITTY, and LIGHTHEARTED. 
                Theme: Life quirks, funny habits, future predictions. 
                Tone: Friendly banter. PG-13. 
                Examples: "Who would survive 5 minutes in a horror movie?", "Who will accidentally become famous?"`;
                break;
        }

        const prompt = `${systemPrompt}
        
        Return ONLY the questions as a JSON array of strings. No numbering.`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text) as string[];
        }
        return [];
    } catch (error) {
        console.error("Most Likely To Error:", error);
        return [
            "Who is most likely to break the game?",
            "Who is most likely to blame the AI?",
            "Who is most likely to need a drink right now?"
        ];
    }
};

export const generateCustomTruthOrDrink = async (
    groupType: string,
    customContext: string,
    playerNames: string[],
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    try {
        const ai = getAI();
        if (!ai) return [];

        const toneInstruction = tone
            ? `- TONE/RATING: ${tone}. Calibrate the humor, edginess, and subject matter accordingly.`
            : `- Keep it PG-13 unless the context clearly implies otherwise.`;

        const namesClause = playerNames.length
            ? `PLAYER NAMES (these are the people playing — you may reference them by first name): ${playerNames.join(', ')}.`
            : '';

        const prompt = `You are a party game writer creating "Truth or Drink" prompts for a specific group.

In Truth or Drink, each player is handed a personal question on their turn. They either ANSWER honestly or TAKE A DRINK to skip. Questions should be DIRECTED, personal, and probe something interesting about the player.

GROUP TYPE: ${groupType}
${namesClause}
CONTEXT FROM THE PLAYERS: "${customContext}"

INSTRUCTIONS:
- Generate exactly ${count} Truth or Drink questions SPECIFICALLY tailored to this group.
- Write in SECOND person ("you") so any player can be asked — but you may reference named players by first name when the context calls for it (e.g. "What's the first thing you noticed about Priya?").
- USE the specifics they gave you — names, places, shared history, inside jokes, situations. Weave them in naturally.
- Questions should feel personally written for THIS group. Avoid generic questions like "What's your biggest fear?" unless the context twists it.
- Mix playful teasing, curious probing, and deeper reveals. Every question should be something a sober person might actually hesitate to answer.
- Each question must end with a "?".
${toneInstruction}

SAFETY:
- No questions that are defamatory or sexually explicit about specific named real people.
- Spicy/adult tones can include suggestive themes but not graphic descriptions.
- Avoid questions about real trauma, medical conditions, or criminal history.

Return ONLY the questions as a JSON array of strings. No numbering.`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text) as string[];
        }
        return [];
    } catch (error) {
        console.error("Custom Truth or Drink Error:", error);
        return [];
    }
};

export const generateCustomMostLikelyTo = async (
    groupType: string,
    customContext: string,
    count: number = 15,
    tone: string = ''
): Promise<string[]> => {
    try {
        const ai = getAI();
        if (!ai) return [];

        const toneInstruction = tone
            ? `- TONE/RATING: ${tone}. Calibrate the humor, edginess, and subject matter accordingly.`
            : `- Keep it PG-13 unless the context clearly implies otherwise.`;

        const prompt = `You are a party game writer creating "Most Likely To" questions for a specific group of people.

GROUP TYPE: ${groupType}
CONTEXT FROM THE PLAYERS: "${customContext}"

INSTRUCTIONS:
- Generate exactly ${count} "Most Likely To" questions SPECIFICALLY tailored to the context above.
- USE the specific details they gave you — names, places, situations, relationships, inside jokes, locations. Weave them directly into the questions.
- Every single question must feel like it was written BY someone who knows this group personally. If they mentioned a trip to Bali, reference Bali. If they mentioned college friends, reference the college days.
- NEVER generate generic questions like "Who is most likely to be late?" unless there's a contextual twist (e.g. "Who is most likely to be late to the Bali villa checkout because they were at the beach bar?")
- Make them funny, warm, and specific. The goal is for people to laugh and say "that's SO true!"
- Mix lighthearted teasing with wholesome observations.
- Each question must start with "Who is most likely to..."
${toneInstruction}

Return ONLY the questions as a JSON array of strings. No numbering.`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text) as string[];
        }
        return [];
    } catch (error) {
        console.error("Custom Most Likely To Error:", error);
        return [];
    }
};

export const generateContextualLies = async (topic: string, trueStory: string): Promise<[string, string]> => {
    try {
        const ai = getAI();
        if (!ai) {
            // Safety Mode Fallback
            return [
                "I once skydived without a parachute and landed in a haystack.",
                "I fought off a grizzly bear with a stale baguette."
            ];
        }

        const prompt = `You are an expert at the party game "Two Truths and a Lie". 
        The player has provided a TRUE STORY about the topic: "${topic}".
        True Story: "${trueStory}"
        
        CRITICAL INSTRUCTIONS:
        1. BE A DETECTIVE: Identify specific entities in the True Story (e.g., a pet named "Fonzie", a specific location, a friend's name, a unique object).
        2. REUSE ENTITIES: You MUST reuse some of these same specific entities in the fabricated lies. If they mention their dog Buster, your lie should involve their dog Buster doing something completely different but believable.
        3. CREATE CONTEXTUAL DECOYS: Generate exactly TWO plausible, highly contextual LIES. 
        4. The lies must sound like they belong to the same person and situation, matching the tone and absurdity level of the true story.
        5. They must NOT contradict the true story or just be slight variations of it. They must be entirely different events or outcomes involving the same "cast of characters" or settings.
        6. Write in the first person ("I").
        
        Return the result as a JSON array containing exactly two strings. Example: ["My first lie here.", "My second lie here."]`;

        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                }
            }
        });

        if (response.text) {
            const parsed = JSON.parse(response.text) as string[];
            if (parsed.length >= 2) {
                return [parsed[0], parsed[1]];
            }
        }

        throw new Error("Invalid response format");
    } catch (error) {
        console.error("Lie Generation Error:", error);
        return [
            "I once accidentally trained a wild raccoon to bring me shiny objects.",
            "I got locked in a museum overnight and tried on a medieval suit of armor."
        ];
    }
};
