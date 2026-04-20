
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env vars
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const apiKey = process.env.VITE_API_KEY;

if (!apiKey) {
    console.error("No API KEY found in .env");
    process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

async function testRoastText() {
    // UPDATED: Using the BEST available model
    const modelName = 'gemini-3-pro-preview';
    console.log(`Testing text generation with model: ${modelName}`);

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [
                    { text: "Roast this person who is taking a selfie in a mirror." }
                ]
            }
        });

        console.log("Success!");
        console.log("Response:", response.text);
    } catch (error) {
        console.error("FAILED:");
        console.error(error);
    }
}

testRoastText();
