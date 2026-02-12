
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

async function generateCharadesExpansion() {
    console.log("Reading existing data...");
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(rawData);

    const TARGET_CATEGORIES = [
        { id: 'hollywood_movies', label: "Hollywood Movies", count: 25 },
        { id: 'bollywood_movies', label: "Bollywood Movies", count: 25 }
    ];

    for (const target of TARGET_CATEGORIES) {
        // Find Category
        const catIndex = data.games.charades.categories.findIndex(c => c.id === target.id);
        if (catIndex === -1) {
            console.error(`Could not find '${target.id}' category.`);
            continue;
        }

        const existingItems = data.games.charades.categories[catIndex].items;

        console.log(`\n--- Expanding ${target.label} ---`);
        console.log(`Current items: ${existingItems.length}`);
        console.log(`Generating ${target.count} NEW items...`);

        const prompt = `
            Generate a list of ${target.count} unique, popular, and recognizable ${target.label} titles for a game of Charades.
            Do NOT include any of these movies: ${JSON.stringify(existingItems.slice(-50))}.
            Return ONLY the movie titles.
            
            Return a JSON array of strings.
        `;

        try {
            const result = await ai.models.generateContent({
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

            if (!result.text) throw new Error("No text returned");

            const newItems = JSON.parse(result.text);

            // Append
            const initialCount = data.games.charades.categories[catIndex].items.length;
            const uniqueNew = newItems.filter(item => !data.games.charades.categories[catIndex].items.includes(item));

            data.games.charades.categories[catIndex].items.push(...uniqueNew);

            console.log(`Successfully added ${uniqueNew.length} new items to ${target.label}!`);
            console.log(`Total items: ${data.games.charades.categories[catIndex].items.length}`);

            // Save after each category
            fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

            // Sleep to be nice to API
            await sleep(2000);

        } catch (error) {
            console.error(`Generation failed for ${target.label}:`, error);
        }
    }
}

generateCharadesExpansion();
