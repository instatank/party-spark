
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const gamesDataPath = path.join(__dirname, '../src/data/games_data.json');
const wyrDataPath = path.join(__dirname, '../src/data/would_you_rather.json');

const gamesData = JSON.parse(fs.readFileSync(gamesDataPath, 'utf8'));
const wyrData = JSON.parse(fs.readFileSync(wyrDataPath, 'utf8'));

console.log('--- DATA COUNTS ---');
console.log(`Would You Rather: ${wyrData.length}`);

console.log('\nCharades:');
let charadesTotal = 0;
if (gamesData.games && gamesData.games.charades) {
    gamesData.games.charades.categories.forEach(cat => {
        console.log(`  - ${cat.name}: ${cat.items.length}`);
        charadesTotal += cat.items.length;
    });
}
console.log(`  Total: ${charadesTotal}`);

console.log('\nTaboo:');
let tabooTotal = 0;
if (gamesData.games && gamesData.games.taboo) {
    gamesData.games.taboo.categories.forEach(cat => {
        console.log(`  - ${cat.label} (${cat.id}): ${cat.items.length}`);
        tabooTotal += cat.items.length;
    });
}
console.log(`  Total: ${tabooTotal}`);
