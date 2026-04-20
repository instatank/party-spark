
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Simple .env parser since we might not have dotenv
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
    } catch (e) {
        console.error("Could not read .env file");
        return {};
    }
};

const runTest = async () => {
    const env = loadEnv();
    const apiKey = env.VITE_API_KEY;
    const customModel = env.VITE_IMAGE_MODEL;

    console.log("--- API Connectivity Test ---");
    console.log(`API Key present: ${apiKey ? 'YES' + ' (ends with ...' + apiKey.slice(-4) + ')' : 'NO'}`);

    if (!apiKey) {
        console.error("CRITICAL: No API Key found in .env!");
        return;
    }

    const ai = new GoogleGenAI({ apiKey });

    // Test 0: List Models
    console.log("\nListing Available Models...");
    try {
        const listResp = await ai.models.list();
        // Check if it has a models property or is an array
        const modelList = listResp.models || listResp;
        if (Array.isArray(modelList)) {
            console.log("Found models:", modelList.map(m => m.name));
        } else {
            console.log("Raw List Response:", JSON.stringify(listResp, null, 2));
        }
    } catch (error) {
        console.error("❌ List Models Failed:", error.message);
    }

    // Test 1: Standard Model (Gemini 1.5 Flash)
    console.log("\nTesting Baseline (gemini-1.5-flash)...");
    try {
        const response1 = await ai.models.generateContent({
            model: 'gemini-1.5-flash',
            contents: { parts: [{ text: "Hello" }] }
        });
        console.log("✅ Baseline Success! API Key is VALID.");
    } catch (error) {
        console.error("❌ Baseline Failed:", error.message);
        console.log("--> This means the API Key itself is likely invalid or has no quota.");
    }

    // Test 2: Custom Model
    if (customModel && customModel !== 'gemini-1.5-flash') {
        console.log(`\nTesting Custom Model (${customModel})...`);
        try {
            const response2 = await ai.models.generateContent({
                model: customModel,
                contents: { parts: [{ text: "Hello" }] }
            });
            console.log(`✅ Custom Model Success! You have access to ${customModel}.`);
        } catch (error) {
            console.error(`❌ Custom Model Failed:`, error.message);
            console.log("--> The API Key works, but it does NOT have access to this specific model.");
        }
    }
};

runTest();
