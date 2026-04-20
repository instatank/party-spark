
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from "@google/genai";
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.VITE_API_KEY;
if (!apiKey) {
    console.error("Error: VITE_API_KEY is not set.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelFlash = 'gemini-2.5-flash';
const DATA_FILE = path.join(__dirname, '../src/data/games_data.json');

const SLEEP_MS = 20000;
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateTabooBatch(difficulty, count, retryCount = 0) {
    console.log(`Generating ${count} '${difficulty}' Taboo cards... (Attempt ${retryCount + 1})`);

    // Customize prompt based on difficulty
    let difficultyDesc = "";
    if (difficulty === 'easy') difficultyDesc = "Simple, common words. Forbidden words should be the most obvious associations.";
    if (difficulty === 'medium') difficultyDesc = "Moderately challenging words or phrases. Forbidden words should be tricky but fair.";

    const prompt = `Generate ${count} UNIQUE Taboo cards.
    Difficulty: ${difficulty.toUpperCase()}.
    ${difficultyDesc}
    
    Return a JSON array where each object has:
    - word (string): The guess word.
    - forbidden (array of 5 strings): Words they cannot say.
    - difficulty (string): "${difficulty}"
    `;

    try {
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
                            forbidden: { type: Type.ARRAY, items: { type: Type.STRING } },
                            difficulty: { type: Type.STRING }
                        },
                        required: ["word", "forbidden", "difficulty"]
                    }
                }
            }
        });

        if (response.text) {
            return JSON.parse(response.text);
        }
        return [];
    } catch (error) {
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
            console.warn(`Rate limit hit. Waiting ${SLEEP_MS / 1000}s...`);
            await sleep(SLEEP_MS);
            if (retryCount < 3) return generateTabooBatch(difficulty, count, retryCount + 1);
        }
        console.error(`Error generating ${difficulty} batch:`, error);
        return [];
    }
}

async function run() {
    // 1. Read existing data
    let gameData = {};
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf-8');
        gameData = JSON.parse(raw);
    } catch (e) {
        console.error("Could not read data file", e);
        process.exit(1);
    }

    // 2. Generate Easy Batch 1
    console.log("Starting Batch 1/2...");
    const newEasy1 = await generateTabooBatch('easy', 25);
    console.log(`Generated ${newEasy1.length} Easy cards (Batch 1).`);

    // Wait a bit to be nice to rate limits
    if (newEasy1.length > 0) await sleep(2000);

    // 3. Generate Easy Batch 2
    console.log("Starting Batch 2/2...");
    const newEasy2 = await generateTabooBatch('easy', 25);
    console.log(`Generated ${newEasy2.length} Easy cards (Batch 2).`);

    const newEasyTotal = [...newEasy1, ...newEasy2];

    // 4. Append to categories
    const categories = gameData.games.taboo.categories;

    // Append Easy
    const easyCat = categories.find(c => c.id === 'easy');
    if (easyCat) {
        const easyWithIds = newEasyTotal.map((item, i) => ({
            id: `easy_exp_2_${Date.now()}_${i}`,
            ...item
        }));
        easyCat.items.push(...easyWithIds);
        console.log(`Appended ${easyWithIds.length} to Easy (Total: ${easyCat.items.length})`);
    } else {
        console.error("Easy category not found!");
    }

    // 5. Save
    fs.writeFileSync(DATA_FILE, JSON.stringify(gameData, null, 2));
    console.log("Success! Data saved.");
}

run();
