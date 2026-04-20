
import { GoogleGenAI } from "@google/genai";
import fs from 'fs';
import path from 'path';

const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env');
        const envFile = fs.readFileSync(envPath, 'utf8');
        const env = {};
        envFile.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) env[key.trim()] = value.trim();
        });
        return env;
    } catch (e) { return {}; }
};

const listModels = async () => {
    const env = loadEnv();
    const apiKey = env.VITE_API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    console.log("Fetching models...");
    try {
        const listResp = await ai.models.list();
        const allModels = listResp.models || listResp; // Handle variations in response structure

        if (Array.isArray(allModels)) {
            const usable = allModels.filter(m =>
                m.supportedActions && m.supportedActions.includes('generateContent')
            );

            console.log("\n--- Models satisfying 'generateContent' ---");
            usable.forEach(m => console.log(`- ${m.name} (${m.displayName})`));

            if (usable.length === 0) {
                console.log("No models found with 'generateContent'. Listing ALL names:");
                allModels.forEach(m => console.log(`- ${m.name}`));
            }
        } else {
            console.log("Unexpected response format:", listResp);
        }
    } catch (error) {
        console.error("Error listing models:", error.message);
    }
};

listModels();
