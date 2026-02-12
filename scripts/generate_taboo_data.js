
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// NOTE: You must set VITE_API_KEY in your .env for this to work
const apiKey = process.env.VITE_API_KEY;

if (!apiKey) {
    console.error("Error: VITE_API_KEY not found in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelFlash = 'gemini-2.5-flash';

const DIFFICULTIES = [
    {
        id: "easy",
        topic: "Easy Mode (Simple words, obvious clues)",
        color: "bg-green-500",
        promptAdded: "Words should be simple, everyday objects or concepts. Forbidden words should be the most obvious ones."
    },
    {
        id: "medium",
        topic: "Medium Mode (Standard difficulty)",
        color: "bg-yellow-500",
        promptAdded: "Words should be moderately challenging. Mix of pop culture, actions, and objects."
    },
    {
        id: "hard",
        topic: "Hard Mode (Abstract concepts, obscure words)",
        color: "bg-red-500",
        promptAdded: "Words should be abstract concepts, specific historical figures, or nuanced terms. Forbidden words should be very restrictive, blocking common synonyms."
    }
];

const ITEMS_PER_CATEGORY = 50;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateCategoryItems(difficulty, retryCount = 0) {
    console.log(`Generating ${ITEMS_PER_CATEGORY} items for ${difficulty.topic}...`);

    const prompt = `
    Generate ${ITEMS_PER_CATEGORY} UNIQUE Taboo cards for difficulty level: "${difficulty.id.toUpperCase()}".
    ${difficulty.promptAdded}
    
    Each card must have:
    - "word": The target word to guess (string)
    - "forbidden": An array of exactly 5 forbidden words related to the target word (strings)
    - "difficulty": "${difficulty.id}"
    
    Return pure JSON format:
    [
        { "word": "Target", "forbidden": ["Word1", "Word2", "Word3", "Word4", "Word5"], "difficulty": "${difficulty.id}" },
        ...
    ]
    Do not include markdown or explanations.
    `;

    try {
        const result = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: 'application/json'
            }
        });

        // Check if we have a valid response
        if (!result) {
            console.error("API returned null/undefined result");
            throw new Error("No result from API");
        }

        let text = '';

        // Handle standard response
        if (result.response && typeof result.response.text === 'function') {
            try {
                text = result.response.text();
            } catch (e) {
                console.warn("result.response.text() failed, trying candidates fallback");
            }
        }

        // Fallback to candidates if text is still empty
        if (!text && result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts && result.candidates[0].content.parts[0].text) {
            text = result.candidates[0].content.parts[0].text;
        }

        if (!text) {
            console.error("API Result Dump:", JSON.stringify(result, null, 2));
            throw new Error("Empty text in response or unknown structure");
        }

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        const items = JSON.parse(text);
        if (Array.isArray(items)) {
            return items.slice(0, ITEMS_PER_CATEGORY);
        }
        return [];
    } catch (e) {
        if (e.status === 429 || (e.message && e.message.includes('429'))) {
            // Rate limit hit
            const waitTime = (retryCount + 1) * 30000; // Wait 30s, 60s, etc.
            console.warn(`Rate limit hit for ${difficulty.id}. Waiting ${waitTime / 1000}s before retry ${retryCount + 1}...`);
            await sleep(waitTime);
            if (retryCount < 3) {
                return generateCategoryItems(difficulty, retryCount + 1);
            }
        }
        console.error(`Failed to generate for ${difficulty.id}:`, e);
        return [];
    }
}

async function main() {
    const dataPath = path.resolve(__dirname, '../src/data/games_data.json');
    let existingData = {};

    // Read existing
    try {
        const raw = fs.readFileSync(dataPath, 'utf-8');
        existingData = JSON.parse(raw);
    } catch (e) {
        console.warn("Could not read existing data, creating new structure.");
        existingData = { games: { taboo: { categories: [] } } };
    }

    // Ensure structure
    if (!existingData.games) existingData.games = {};

    // RESET Taboo categories to difficulties
    console.log("Resetting Taboo categories to Easy/Medium/Hard...");
    existingData.games.taboo = { categories: [] };

    // Process categories
    for (const diff of DIFFICULTIES) {
        // Add random jitter to simple backoff
        await sleep(2000);

        const newItems = await generateCategoryItems(diff);
        console.log(`Generated ${newItems.length} items for ${diff.id}`);

        if (newItems.length > 0) {
            existingData.games.taboo.categories.push({
                id: diff.id,
                label: diff.id.charAt(0).toUpperCase() + diff.id.slice(1), // Capitalize
                color: diff.color,
                icon: "Sparkles",
                items: newItems
            });
            console.log(`Added ${diff.id} category.`);
        }
    }

    // Write back
    fs.writeFileSync(dataPath, JSON.stringify(existingData, null, 2));
    console.log(`Successfully updated ${dataPath}`);
}

main();
