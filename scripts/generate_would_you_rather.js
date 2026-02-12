
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

// Fix __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiKey = process.env.VITE_API_KEY;
if (!apiKey) {
    console.error("Error: VITE_API_KEY is not set in .env file.");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });
const modelFlash = 'gemini-2.5-flash';

const OUTPUT_FILE = path.join(__dirname, '../src/data/would_you_rather.json');
const BATCH_SIZE = 25;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateQuestions(retryCount = 0) {
    let existingData = [];
    try {
        if (fs.existsSync(OUTPUT_FILE)) {
            const raw = fs.readFileSync(OUTPUT_FILE, 'utf-8');
            existingData = JSON.parse(raw);
        }
    } catch (e) {
        console.warn("Could not read existing file, starting fresh.", e);
    }

    console.log(`Current WYR count: ${existingData.length}`);
    console.log(`Generating a batch of ${BATCH_SIZE} new questions with PSYCHO-ROASTS... (Attempt ${retryCount + 1})`);

    const prompt = `
        Generate ${BATCH_SIZE} UNIQUE, engaging "Would You Rather" questions.
        
        CRITICAL INSTRUCTION - THE ANALYSIS:
        The "analysisA" and "analysisB" fields must be "Psycho-Roasts" but keep them SHORT, SHARP, and HILARIOUS.
        - MAX 15-20 words each.
        - Be savage, quick-witted, and punchy.
        - No long explanations. Just a direct hit to the ego.
        - Example: "You're not 'principled', you're just pretentious and boring at parties."
        
        Output must be a valid JSON array of objects.
        
        Each object must have:
        - "optionA": The first option text.
        - "optionB": The second option text.
        - "category": A short category (e.g., "Social", "Lifestyle").
        - "stats": An object with 'a' and 'b' (numbers summing to 100).
        - "analysisA": Short, sharp, hilarious roast of picking Option A.
        - "analysisB": Short, sharp, hilarious roast of picking Option B.

        Return ONLY the JSON array. Do not include markdown formatting.
    `;

    try {
        const result = await ai.models.generateContent({
            model: modelFlash,
            contents: prompt,
            config: {
                responseMimeType: "application/json"
            }
        });

        if (!result) throw new Error("No result");

        let text = '';
        if (result.response && typeof result.response.text === 'function') {
            try { text = result.response.text(); } catch (e) { }
        }
        if (!text && result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
            text = result.candidates[0].content.parts[0].text;
        }

        if (!text) throw new Error("Empty text from API");

        let newData;
        try {
            text = text.replace(/```json/g, '').replace(/```/g, '').trim();
            newData = JSON.parse(text);
        } catch (e) {
            console.error("Failed to parse JSON:", text);
            throw e;
        }

        // Add unique IDs based on timestamp and index to avoid collisions
        const timestamp = Date.now();
        const dataWithIds = newData.map((item, index) => ({
            id: `${timestamp}_${index}`,
            ...item
        }));

        const finalData = [...existingData, ...dataWithIds];

        fs.writeFileSync(OUTPUT_FILE, JSON.stringify(finalData, null, 2));
        console.log(`Successfully added ${dataWithIds.length} new questions.`);
        console.log(`Total questions now: ${finalData.length}`);

    } catch (error) {
        if (error.status === 429 || (error.message && error.message.includes('429'))) {
            const waitTime = (retryCount + 1) * 30000; // 30s, 60s, etc.
            console.warn(`Rate limit hit. Waiting ${waitTime / 1000}s...`);
            await sleep(waitTime);
            if (retryCount < 5) return generateQuestions(retryCount + 1);
        }
        console.error("Error generating data:", error);
    }
}

generateQuestions();
