
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';

// Load Env
const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim();
            }
        });
        return env;
    } catch (e) { return {}; }
};

const runDebug = async () => {
    const env = loadEnv();
    const apiKey = env.VITE_API_KEY;

    console.log("Testing with API Key ending in:", apiKey?.slice(-4));

    // Initialize specifically like the app does
    const ai = new GoogleGenAI({ apiKey });

    const modelName = 'gemini-1.5-flash';
    console.log(`Attempting generateContent with model: '${modelName}'`);

    try {
        const response = await ai.models.generateContent({
            model: modelName,
            contents: {
                parts: [{ text: "Explain why you are the best model for roasting people." }]
            }
        });
        console.log("✅ Success! Response:", response.text);
    } catch (error) {
        console.error("❌ Failed:", error);
        console.log("\nTrying 'models/' prefix...");
        try {
            const response2 = await ai.models.generateContent({
                model: `models/${modelName}`,
                contents: { parts: [{ text: "Hello" }] }
            });
            console.log("✅ Success with prefix!");
        } catch (err2) {
            console.error("❌ Failed with prefix too:", err2.message);
        }
    }
};

runDebug();
