// =============================================================================
// Jumble — letter-set generator (DEV BUILD SCRIPT, never shipped to client)
//
// Reads an inflected English word list (ENABLE) and emits a pack of validated
// 7-letter sets + their full answer keys into src/data/jumble_sets.json.
//
// WHY PRECOMPUTE: iterating ~170k words per letter-set on a mid-range phone is
// too slow, and shipping the 1.7MB dictionary bloats the bundle. Instead we run
// the generator ONCE here, on a dev machine, and bake each set's answer key into
// a small static JSON. At play time the client only loads that JSON — no
// dictionary, no iteration, no API. Fully offline, zero cost.
//
// This is still NOT authored content — the words come straight from the
// dictionary via a plain algorithm. Re-run any time to refresh the pack:
//   node scripts/build-jumble-sets.mjs
//
// The dictionary is cached at scripts/.cache/enable1.txt (gitignored). If it's
// missing, fetch it first:
//   curl -sL -o scripts/.cache/enable1.txt \
//     https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICT_PATH = join(__dirname, '.cache', 'enable1.txt');
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'jumble_sets.json');

// --- tunables ---------------------------------------------------------------
const TILE_COUNT = 7;
const MIN_WORD_LEN = 3;
const MIN_WORDS = 20;          // quality gate: a set must yield >= this many words
const EASY_TARGET = 150;       // how many easy sets to emit
const HARD_TARGET = 150;       // how many hard sets to emit
const MAX_ATTEMPTS = 200000;   // safety cap on redraws

// Letter pools, roughly Scrabble-frequency weighted so sets feel natural.
const VOWELS = 'AAAEEEEEIIIOOOUU';                 // weighted, no Y
const CONSONANTS = 'BBCCDDDDFFGGGHHJKLLLLMMNNNNNNPPQRRRRRRSSSSTTTTTTVVWWXYZ';

const A = 'A'.charCodeAt(0);
const isVowel = (c) => 'AEIOU'.includes(c);

// --- load + index dictionary ------------------------------------------------
if (!existsSync(DICT_PATH)) {
    console.error(`Dictionary not found at ${DICT_PATH}\nFetch it with:\n  curl -sL -o scripts/.cache/enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt`);
    process.exit(1);
}

console.log('Loading dictionary…');
const raw = readFileSync(DICT_PATH, 'utf8');
// Keep only A-Z words of length 3..7 (can't use more than TILE_COUNT tiles).
const words = [];
for (const line of raw.split('\n')) {
    const w = line.trim().toUpperCase();
    if (w.length < MIN_WORD_LEN || w.length > TILE_COUNT) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    words.push(w);
}
console.log(`Indexed ${words.length} candidate words (len ${MIN_WORD_LEN}-${TILE_COUNT}).`);

// Precompute a 26-int count vector + a 26-bit "letters used" mask for each word.
const counts = new Array(words.length);
const masks = new Uint32Array(words.length);
for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const c = new Uint8Array(26);
    let mask = 0;
    for (let j = 0; j < w.length; j++) {
        const idx = w.charCodeAt(j) - A;
        c[idx]++;
        mask |= (1 << idx);
    }
    counts[i] = c;
    masks[i] = mask;
}

// --- helpers ----------------------------------------------------------------
const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];

function drawTiles() {
    // 2 or 3 vowels, rest consonants. Returns a sorted 7-char string.
    const nVowels = Math.random() < 0.5 ? 2 : 3;
    const chars = [];
    for (let i = 0; i < nVowels; i++) chars.push(pick(VOWELS));
    for (let i = 0; i < TILE_COUNT - nVowels; i++) chars.push(pick(CONSONANTS));
    return chars.sort().join('');
}

function tileVector(tiles) {
    const c = new Uint8Array(26);
    let mask = 0;
    for (const ch of tiles) { c[ch.charCodeAt(0) - A]++; mask |= (1 << (ch.charCodeAt(0) - A)); }
    return { c, mask };
}

// All formable words (len 3-7) for a tile set. A word is formable if it uses no
// letter more often than the tiles provide.
function formableWords(tiles) {
    const { c: tc, mask: tmask } = tileVector(tiles);
    const out = [];
    for (let i = 0; i < words.length; i++) {
        // fast reject: word uses a letter not in the tile set at all
        if (masks[i] & ~tmask) continue;
        const wc = counts[i];
        let ok = true;
        for (let l = 0; l < 26; l++) {
            if (wc[l] > tc[l]) { ok = false; break; }
        }
        if (ok) out.push(words[i]);
    }
    return out;
}

// Pangram = formable word that uses all 7 tiles (i.e. a permutation of them).
const isPangram = (word, tiles) => word.length === TILE_COUNT &&
    [...word].sort().join('') === tiles;

// Sort for display: longest first, then alphabetical.
const byLenThenAlpha = (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);

// --- generate ---------------------------------------------------------------
const easy = [];
const hard = [];
const seenEasy = new Set();
const seenHard = new Set();
let attempts = 0;

console.log('Generating sets…');
while ((easy.length < EASY_TARGET || hard.length < HARD_TARGET) && attempts < MAX_ATTEMPTS) {
    attempts++;
    const tiles = drawTiles();
    const all = formableWords(tiles);
    if (all.length < MIN_WORDS) continue;
    const pangrams = all.filter(w => isPangram(w, tiles));
    if (pangrams.length === 0) continue;

    // EASY: the whole formable list qualifies.
    if (easy.length < EASY_TARGET && !seenEasy.has(tiles)) {
        seenEasy.add(tiles);
        easy.push({
            letters: tiles,
            words: [...all].sort(byLenThenAlpha),
            pangrams: [...pangrams].sort(byLenThenAlpha),
        });
    }

    // HARD: designate a center letter that still yields >= MIN_WORDS words.
    if (hard.length < HARD_TARGET) {
        const distinct = [...new Set(tiles.split(''))];
        // Try centers in random order so we don't always pick the same letter.
        for (const center of distinct.sort(() => Math.random() - 0.5)) {
            const key = `${tiles}|${center}`;
            if (seenHard.has(key)) continue;
            const filtered = all.filter(w => w.includes(center));
            if (filtered.length < MIN_WORDS) continue;
            // pangram always contains every letter, so it qualifies for any center
            seenHard.add(key);
            hard.push({
                letters: tiles,
                center,
                words: [...filtered].sort(byLenThenAlpha),
                pangrams: [...pangrams].sort(byLenThenAlpha),
            });
            break;
        }
    }
}

// --- report + write ---------------------------------------------------------
const stat = (arr) => {
    const counts = arr.map(s => s.words.length);
    const avg = Math.round(counts.reduce((a, b) => a + b, 0) / (counts.length || 1));
    return `${arr.length} sets · avg ${avg} words · min ${Math.min(...counts)} · max ${Math.max(...counts)}`;
};
console.log(`Attempts: ${attempts}`);
console.log(`Easy: ${stat(easy)}`);
console.log(`Hard: ${stat(hard)}`);

const payload = { generatedAt: new Date().toISOString(), tileCount: TILE_COUNT, minWordLen: MIN_WORD_LEN, easy, hard };
writeFileSync(OUT_PATH, JSON.stringify(payload));
const bytes = readFileSync(OUT_PATH).length;
console.log(`Wrote ${OUT_PATH} (${(bytes / 1024).toFixed(0)} KB)`);
