
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

const listNames = async () => {
    const env = loadEnv();
    const apiKey = env.VITE_API_KEY;
    const ai = new GoogleGenAI({ apiKey });

    try {
        const listResp = await ai.models.list();
        const models = listResp.models || listResp;

        if (Array.isArray(models)) {
            console.log("Available Models:");
            models.forEach(m => {
                // Strip 'models/' prefix for cleaner reading, but keep it if needed
                console.log(m.name.replace('models/', ''));
            });
        } else {
            console.log("Could not find model array.");
        }
    } catch (error) {
        console.error("Error:", error.message);
    }
};

listNames();
