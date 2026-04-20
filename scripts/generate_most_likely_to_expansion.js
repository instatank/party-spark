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
const DATA_FILE = path.join(__dirname, '../src/data/most_likely_to.json');

async function generateMostLikelyToExpansion() {
    console.log("Reading existing most_likely_to data...");
    const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(rawData);

    const categories = ['scandalous', 'adult', 'chaos', 'fun'];

    for (const category of categories) {
        if (!data[category]) data[category] = [];
        const existingItems = data[category];
        console.log(`Current '${category}' items: ${existingItems.length}`);
        console.log(`Generating 25 NEW cards for '${category}'...`);

        let systemPrompt = "";
        switch (category) {
            case 'scandalous':
                systemPrompt = `Generate 25 "Most Likely To" questions that are GOSSIPY, DRAMATIC, and PROVOCATIVE. 
                Theme: Secrets, minor betrayals, bad decisions, and social drama. 
                Tone: Spill the tea. Make people argue (fun way).`;
                break;
            case 'adult':
                systemPrompt = `Generate 25 "Most Likely To" questions that are SPICY, SUGGESTIVE, and RATED R. 
                Theme: Dating, bedroom habits, wild parties, and risky behavior. 
                Tone: Flirty, bold, and shocking.`;
                break;
            case 'chaos':
                systemPrompt = `Generate 25 "Most Likely To" questions that are ABSURD, UNHINGED, and SURREAL. 
                Theme: Bizarre scenarios, dark humor, specific weirdness. 
                Tone: "What is wrong with you?" funny.`;
                break;
            default: // fun
                systemPrompt = `Generate 25 "Most Likely To" questions that are FUN, WITTY, and LIGHTHEARTED. 
                Theme: Life quirks, funny habits, future predictions. 
                Tone: Friendly banter. PG-13.`;
                break;
        }

        const prompt = `${systemPrompt}
        
        Constraints:
        1. Exclude these existing questions: ${JSON.stringify(existingItems)}
        2. Return ONLY the questions as a JSON array of strings. No numbering. Ensure they are entirely New and Unique.
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

            const newCards = JSON.parse(result.text);

            // Append unique ones only
            for (const card of newCards) {
                if (!data[category].includes(card)) {
                    data[category].push(card);
                }
            }

            console.log(`Successfully added ${newCards.length} new ${category} cards!`);
            console.log(`Total ${category} items: ${data[category].length}\n`);

            // tiny delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (error) {
            console.error(`Generation failed for ${category}:`, error);
        }
    }

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
    console.log('Saved most_likely_to.json');
}

generateMostLikelyToExpansion();
