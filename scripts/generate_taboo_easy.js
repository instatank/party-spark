
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.VITE_API_KEY;
if (!apiKey) {
    console.error("Error: VITE_API_KEY is not set in .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelFlash = 'gemini-2.5-flash';
const DATA_FILE = path.join(__dirname, '../src/data/games_data.json');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateTabooEasy() {
    console.log("Reading existing data...");
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(rawData);

    // Find Easy category
    const easyCategoryIndex = data.games.taboo.categories.findIndex(c => c.id === 'easy');
    if (easyCategoryIndex === -1) {
        console.error("Could not find 'easy' category in Taboo data.");
        return;
    }

    const existingItems = data.games.taboo.categories[easyCategoryIndex].items;
    const existingWords = existingItems.map(i => i.word);

    console.log(`Current 'Easy' items: ${existingItems.length}`);
    console.log("Generating 50 NEW identifiers...");

    const prompt = `
        Generate 50 NEW, UNIQUE "Taboo" game cards for the "Easy" difficulty.
        
        Constraints:
        1. "word": The main word to guess (Simple, common nouns/verbs).
        2. "forbidden": Array of 5 words that are strictly related to the main word and cannot be used as clues.
        3. Exclude these existing words: ${JSON.stringify(existingWords.slice(-50))}
        4. "difficulty": must be "easy".
        
        Return a JSON array of objects.
    `;

    try {
        const result = await ai.models.generateContent({
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
                            forbidden: { type: Type.ARRAY, items: { type: Type.STRING } },
                            difficulty: { type: Type.STRING, enum: ["easy"] }
                        },
                        required: ["word", "forbidden", "difficulty"]
                    }
                }
            }
        });

        if (!result.text) throw new Error("No text returned");

        const newCards = JSON.parse(result.text);

        // Append
        data.games.taboo.categories[easyCategoryIndex].items.push(...newCards);

        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
        console.log(`Successfully added ${newCards.length} new Easy Taboo cards!`);
        console.log(`Total Easy items: ${data.games.taboo.categories[easyCategoryIndex].items.length}`);

    } catch (error) {
        console.error("Generation failed:", error);
    }
}

generateTabooEasy();
