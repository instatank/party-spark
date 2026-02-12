import { GoogleGenAI, Type } from "@google/genai";
import type { TriviaQuestion, TabooCard } from "../types";

// Initialize Gemini Client
// IMPORTANT: In a real production app, ensure API_KEY is set.
const apiKey = import.meta.env.VITE_API_KEY || '';
const ai = new GoogleGenAI({ apiKey });

const modelFlash = 'gemini-2.5-flash';

export const generateCharadesWords = async (category: string, count: number = 20): Promise<string[]> => {
    try {
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

export const generateTriviaQuestions = async (category: string, count: number = 5): Promise<TriviaQuestion[]> => {
    try {
        const prompt = `Generate ${count} engaging, intermediate difficulty trivia questions about "${category}".
    Ensure the options are distinct and the answer is correct.
    Include a short, interesting fun fact for each.`;

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
        // Fallback based on category
        const fallbacks: Record<string, TriviaQuestion[]> = {
            "Hollywood": [
                { question: "Which movie won the first Academy Award for Best Picture?", options: ["Sunrise", "Wings", "Metropolis", "The Jazz Singer"], answer: "Wings", funFact: "Wings (1927) is the only silent film to win Best Picture." },
                { question: "Who played the character of Jack Dawson in Titanic?", options: ["Brad Pitt", "Johnny Depp", "Leonardo DiCaprio", "Tom Cruise"], answer: "Leonardo DiCaprio", funFact: "Matthew McConaughey was also considered for the role." }
            ],
            "Bollywood": [
                { question: "Which film is often called the 'Sholay' of Indian cinema?", options: ["Mother India", "Sholay", "Mughal-e-Azam", "Lagaan"], answer: "Sholay", funFact: "Sholay ran for 5 years at Minerva theatre in Mumbai." },
                { question: "Who is known as the 'King of Romance' in Bollywood?", options: ["Salman Khan", "Aamir Khan", "Shah Rukh Khan", "Akshay Kumar"], answer: "Shah Rukh Khan", funFact: "SRK has won 14 Filmfare Awards." }
            ],
            "Travel": [
                { question: "What is the capital city of Australia?", options: ["Sydney", "Melbourne", "Canberra", "Perth"], answer: "Canberra", funFact: "Canberra was chosen as a compromise between rivals Sydney and Melbourne." },
                { question: "Which country has the most islands?", options: ["Philippines", "Indonesia", "Sweden", "Canada"], answer: "Sweden", funFact: "Sweden has over 267,000 islands." }
            ]
        };
        return fallbacks[category] || fallbacks["Travel"];
    }
};

export const generateTabooCards = async (category: string, count: number = 10): Promise<TabooCard[]> => {
    try {
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
            { word: "Coffee", forbidden: ["Drink", "Caffeine", "Starbucks", "Morning", "Bean"] },
            { word: "Superman", forbidden: ["Hero", "Cape", "Clark Kent", "Kryptonite", "Fly"] },
            { word: "Instagram", forbidden: ["App", "Photo", "Facebook", "Like", "Filter"] },
            { word: "Wedding", forbidden: ["Bride", "Groom", "Marriage", "Ring", "Cake"] }
        ];
    }
};

export const generateIcebreaker = async (type: 'fun' | 'deep'): Promise<string> => {
    try {
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
export type RoastIntensity = 'subtle' | 'medium' | 'extreme';

export const getCaricaturePrompt = (intensity: RoastIntensity): string => {
    switch (intensity) {
        case 'subtle':
            return "Transform this person into a slightly stylized cartoon portrait. Keep features recognizable but add a touch of animation style. Mild caricature.";
        case 'extreme':
            return "Transform this person into a wild, grotesque, highly exaggerated, hilarious cartoon caricature. Distort the features for maximum comedic effect. Extreme style.";
        case 'medium':
        default:
            return "Transform this person into a funny cartoon caricature with exaggerated features. Classic street artist caricature style.";
    }
};

const getRoastSystemPrompt = (intensity: RoastIntensity): string => {
    switch (intensity) {
        case 'subtle':
            return `You are a witty, observational comedian doing crowd work. 
      Look at this image and write a playful, lighthearted roast caption. 
      Tease the person about their vibe, expression, or background, but keep it good-natured and fun. 
      Think "friendly banter" rather than "destruction". 
      Keep it under 280 characters.`;

        case 'extreme':
            return `You are a savage, no-holds-barred internet troll with zero filter. 
      Look at this image and completely destroy this person's ego. 
      Write the meanest, dirtiest, most offensive roast possible. 
      Attack their fashion, their face, their life choices. Be ruthless and shocking.
      The user explicitly asked for an x-rated, offensive, and dirty roast. Do not hold back.
      Keep it under 280 characters.`;

        case 'medium':
        default:
            return `You are a legendary roast master at a comedy club. 
      Look at this image and write a brutal, hilarious, and edgy roast caption. 
      Make fun of the person's expression, clothes, vibe, or background. 
      Be savage and sarcastic, like an x-rated roast. 
      Keep it under 280 characters.`;
    }
};

/**
 * Generates a roast caption. 
 * Upgraded to gemini-3-pro-preview for superior wit and reasoning.
 */
export const generateRoast = async (base64Image: string, intensity: RoastIntensity = 'medium'): Promise<string> => {
    try {
        // Initialize inside the function to ensure process.env is ready in all environments
        const apiKey = import.meta.env.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '') || '';
        const ai = new GoogleGenAI({ apiKey });
        const systemPrompt = getRoastSystemPrompt(intensity);

        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
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
        // Returning fallback instead of throwing error to prevent crash
        return "I'm speechless. (Error generating roast - check API key/Model access)";
    }
};

/**
 * Edits the image based on a prompt.
 * Uses 'gemini-2.5-flash-image' for speed and reliability.
 */
export const editImage = async (base64Image: string, prompt: string): Promise<string | null> => {
    try {
        const apiKey = import.meta.env.VITE_API_KEY || (typeof process !== 'undefined' ? process.env.API_KEY : '') || '';
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-image',
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
        if (candidates && candidates.length > 0 && candidates[0].content?.parts) {
            const parts = candidates[0].content.parts;
            for (const part of parts) {
                if (part.inlineData && part.inlineData.data) {
                    return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
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
        // Fallback: Return a few static questions so the game doesn't hang
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
