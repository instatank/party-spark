
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const xlsx = require('xlsx');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const GAMES_DATA_PATH = path.join(__dirname, '../src/data/games_data.json');
const WYR_DATA_PATH = path.join(__dirname, '../src/data/would_you_rather.json');
const CONSTANTS_PATH = path.join(__dirname, '../src/constants.tsx');
const OUTPUT_FILE = path.join(__dirname, '../party_spark_game_data.xlsx');

async function exportData() {
    console.log("Starting data export...");
    const workbook = xlsx.utils.book_new();

    // 1. Charades Data
    if (fs.existsSync(GAMES_DATA_PATH)) {
        console.log("Processing Charades data...");
        const rawData = fs.readFileSync(GAMES_DATA_PATH, 'utf-8');
        const gamesData = JSON.parse(rawData);

        if (gamesData.games && gamesData.games.charades && gamesData.games.charades.categories) {
            const charadesRows = [];
            gamesData.games.charades.categories.forEach(cat => {
                if (cat.items) {
                    cat.items.forEach(item => {
                        charadesRows.push({
                            Category: cat.name,
                            Description: cat.description,
                            Item: item
                        });
                    });
                }
            });
            const wsCharades = xlsx.utils.json_to_sheet(charadesRows);
            xlsx.utils.book_append_sheet(workbook, wsCharades, "Charades");
        }
    } else {
        console.warn("games_data.json not found.");
    }

    // 2. Would You Rather Data
    if (fs.existsSync(WYR_DATA_PATH)) {
        console.log("Processing Would You Rather data...");
        const rawWyr = fs.readFileSync(WYR_DATA_PATH, 'utf-8');
        const wyrData = JSON.parse(rawWyr);

        // Flatten structure for better readability in Excel
        const wyrRows = wyrData.map(q => ({
            ID: q.id,
            Category: q.category,
            Option_A: q.optionA,
            Option_B: q.optionB,
            Ratio_A: q.stats ? q.stats.a : 'N/A',
            Ratio_B: q.stats ? q.stats.b : 'N/A',
            Analysis_A: q.analysisA,
            Analysis_B: q.analysisB
        }));

        const wsWyr = xlsx.utils.json_to_sheet(wyrRows);
        xlsx.utils.book_append_sheet(workbook, wsWyr, "Would You Rather");
    } else {
        console.warn("would_you_rather.json not found.");
    }

    // 3. Imposter Data (from constants.tsx)
    if (fs.existsSync(CONSTANTS_PATH)) {
        console.log("Processing Imposter data...");
        const rawConstants = fs.readFileSync(CONSTANTS_PATH, 'utf-8');

        // Extract IMPOSTER_CATEGORIES array using regex
        // Looking for: export const IMPOSTER_CATEGORIES = [ ... ];
        const regex = /export const IMPOSTER_CATEGORIES = (\[[\s\S]*?\]);/;
        const match = rawConstants.match(regex);

        if (match && match[1]) {
            try {
                // Determine strictly safe evaluation context
                // Since the file content is TS, simple JSON.parse might fail due to single quotes or unquoted keys
                // We'll use a safer eval alternative: new Function
                // But first, let's make it more JSON-like if possible, or just eval it since it's a trusted local file

                // Using new Function to evaluate the array literal
                const imposterCategories = new Function(`return ${match[1]}`)();

                const imposterRows = [];
                imposterCategories.forEach(cat => {
                    if (cat.words) {
                        cat.words.forEach(word => {
                            imposterRows.push({
                                Category_ID: cat.id,
                                Label: cat.label,
                                Color: cat.color,
                                Word: word
                            });
                        });
                    }
                });

                const wsImposter = xlsx.utils.json_to_sheet(imposterRows);
                xlsx.utils.book_append_sheet(workbook, wsImposter, "Imposter");

            } catch (e) {
                console.error("Error parsing Imposter data from constants.tsx:", e);
            }
        } else {
            console.warn("Could not find IMPOSTER_CATEGORIES in constants.tsx");
        }
    } else {
        console.warn("constants.tsx not found.");
    }

    // Write file
    xlsx.writeFile(workbook, OUTPUT_FILE);
    console.log(`Successfully exported data to ${OUTPUT_FILE}`);
}

exportData().catch(console.error);
