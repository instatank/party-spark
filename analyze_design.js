
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// Load .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, '.env');
const envConfig = dotenv.parse(fs.readFileSync(envPath));
const apiKey = envConfig.VITE_API_KEY;

if (!apiKey) {
    console.error("No API Key found");
    process.exit(1);
}

const client = new GoogleGenAI({ apiKey });

async function analyze() {
    try {
        const imagePath = "/Users/ankitanand/.gemini/antigravity/brain/309bdaa7-d739-477c-80bb-56b9e2fe6469/uploaded_image_1765458747538.png";

        if (!fs.existsSync(imagePath)) {
            console.error("Image file not found at " + imagePath);
            process.exit(1);
        }

        const imageBuffer = fs.readFileSync(imagePath);
        const imageBase64 = imageBuffer.toString('base64');

        const prompt = "Analyze this UI design image. Extract the following details:\n" +
            "1. Primary Background Color (Hex)\n" +
            "2. Card Background Color (Hex)\n" +
            "3. Primary Text Color/Gradient (Hex)\n" +
            "4. Accent Colors (Hex)\n" +
            "5. Font Style (Serif vs Sans-Serif)\n" +
            "6. Layout details (Grid, borders, shadows)\n" +
            "Return a JSON object with keys: background, surface, primary, secondary, accents, font, layout.";

        const response = await client.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    role: "user",
                    parts: [
                        { text: prompt },
                        { inlineData: { mimeType: "image/png", data: imageBase64 } }
                    ]
                }
            ]
        });

        console.log(response.text);
    } catch (error) {
        console.error("Error:", error);
    }
}

analyze();
