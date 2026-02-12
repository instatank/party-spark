import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env simply
const envPath = path.resolve(__dirname, '../.env');
const envContent = fs.readFileSync(envPath, 'utf-8');
const apiKey = envContent.split('\n').find(line => line.startsWith('VITE_API_KEY='))?.split('=')[1]?.trim();

if (!apiKey) {
    console.error("API Key not found in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelFlash = 'gemini-2.5-flash';

const DATA_FILE = path.resolve(__dirname, '../src/data/games_data.json');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function generateBatch(category, existingItems) {
    // Requesting 100 items to minimize API calls
    const prompt = `Generate a list of 100 unique, popular, and recognizable Movie Titles for the category: "${category}".
    Do NOT include any of these movies: ${JSON.stringify(existingItems.slice(-50))}.
    Return ONLY the titles separated by pipes (|). No numbering, no years.`;

    try {
        const response = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
        });

        const text = response.text || '';
        return text.split('|').map(s => s.trim()).filter(s => s.length > 0);
    } catch (e) {
        if (e.status === 429 || e.message.includes('429')) {
            console.log("Rate limit hit. Waiting 60 seconds...");
            await sleep(60000);
            return generateBatch(category, existingItems); // Retry once
        }
        console.error("Error fetching batch:", e.message);
        return [];
    }
}

async function expandCategory(categoryObj) {
    console.log(`Expanding ${categoryObj.name}... Current: ${categoryObj.items.length}`);
    let items = new Set(categoryObj.items);
    let attempts = 0;

    // Attempt to reach 50 items
    while (items.size < 50 && attempts < 10) {
        process.stdout.write(`Batch ${attempts + 1}: Fetching... `);

        // Add a small delay before every request to be nice to the API
        if (attempts > 0) await sleep(5000);

        const newItems = await generateBatch(categoryObj.name, Array.from(items));

        // If we got nothing (even after retry), maybe abort for this category
        if (newItems.length === 0) {
            console.log("Failed to get batch. Stopping expansion for this category.");
            break;
        }

        let added = 0;
        newItems.forEach(item => {
            if (!items.has(item)) {
                items.add(item);
                added++;
            }
        });
        console.log(`Added ${added} new items. Total: ${items.size}`);

        attempts++;
    }

    categoryObj.items = Array.from(items);
    return categoryObj;
}

async function run() {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));

    for (let cat of data.games.charades.categories) {
        await expandCategory(cat);
        // Save intermediate progress
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    }

    console.log("Done! Data saved.");
}

run();
