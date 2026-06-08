// =============================================================================
// Jumble — letter-set generator (DEV BUILD SCRIPT, never shipped to client)
//
// Emits validated 7-letter sets + answer keys into src/data/jumble_sets.json.
// The 1.7MB dictionary is used ONLY here; at play time the client loads only
// the baked JSON (no dictionary, no API, fully offline).
//
// DIFFICULTY MODEL
//   Easy  = approachable. The set is SEEDED from a COMMON 7-letter word, so the
//           pangram is always a normal, everyday word (never Scrabble-obscure).
//           We tag a `commonWords` subset (the realistic target / what the end
//           screen surfaces), but the full answer key still accepts any real
//           word the player happens to know (generous).
//   Hard  = expert. Random letters from the full ENABLE list + a required
//           CENTER letter. Obscure words are fair game here.
//
// Re-run any time: node scripts/build-jumble-sets.mjs
// Needs two cached lists under scripts/.cache/ (gitignored):
//   enable1.txt        — ENABLE word list (validity)
//     curl -sL -o scripts/.cache/enable1.txt https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt
//   freq_en_50k.txt    — OpenSubtitles top-50k frequency (commonness)
//     curl -sL -o scripts/.cache/freq_en_50k.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt
// =============================================================================

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICT_PATH = join(__dirname, '.cache', 'enable1.txt');
const FREQ_PATH = join(__dirname, '.cache', 'freq_en_50k.txt');
const OUT_PATH = join(__dirname, '..', 'src', 'data', 'jumble_sets.json');

// --- tunables ---------------------------------------------------------------
const TILE_COUNT = 7;
const MIN_WORD_LEN = 4;          // 3-letter words excluded — 4+ only
const PANGRAM_RANK = 15000;      // Easy pangram seed must be within the N most-common words
const COMMON_RANK = 28000;       // a word counts as "common" (Easy display pool) within this rank
const MIN_COMMON_EASY = 12;      // Easy gate: at least this many common findable words
const MIN_WORDS_HARD = 20;       // Hard gate: at least this many words (containing the center)
const EASY_TARGET = 150;
const HARD_TARGET = 150;
const MAX_ATTEMPTS = 400000;

const VOWELS = 'AAAEEEEEIIIOOOUU';
const CONSONANTS = 'BBCCDDDDFFGGGHHJKLLLLMMNNNNNNPPQRRRRRRSSSSTTTTTTVVWWXYZ';
const A = 'A'.charCodeAt(0);

// --- load dictionary + frequency -------------------------------------------
for (const [p, hint] of [[DICT_PATH, 'enable1.txt'], [FREQ_PATH, 'freq_en_50k.txt']]) {
    if (!existsSync(p)) { console.error(`Missing ${hint} at ${p} — see header for the fetch command.`); process.exit(1); }
}

console.log('Loading dictionary + frequency…');
const words = [];
for (const line of readFileSync(DICT_PATH, 'utf8').split('\n')) {
    const w = line.trim().toUpperCase();
    if (w.length < MIN_WORD_LEN || w.length > TILE_COUNT) continue;
    if (!/^[A-Z]+$/.test(w)) continue;
    words.push(w);
}

// rank map: word → 0-based frequency rank (lower = more common)
const freqRank = new Map();
{
    let i = 0;
    for (const line of readFileSync(FREQ_PATH, 'utf8').split('\n')) {
        const w = (line.split(' ')[0] || '').trim().toUpperCase();
        if (!w || !/^[A-Z]+$/.test(w)) continue;
        if (!freqRank.has(w)) freqRank.set(w, i++);
    }
}
const isCommon = (w, rank) => { const r = freqRank.get(w); return r !== undefined && r < rank; };
console.log(`Indexed ${words.length} candidate words (len ${MIN_WORD_LEN}-${TILE_COUNT}); ${freqRank.size} frequency-ranked.`);

// Precompute count vector + letter mask per word for fast formability checks.
const counts = words.map(w => { const c = new Uint8Array(26); for (const ch of w) c[ch.charCodeAt(0) - A]++; return c; });
const masks = new Uint32Array(words.length);
for (let i = 0; i < words.length; i++) { let m = 0; for (const ch of words[i]) m |= (1 << (ch.charCodeAt(0) - A)); masks[i] = m; }

// --- helpers ----------------------------------------------------------------
const pick = (pool) => pool[Math.floor(Math.random() * pool.length)];
const sig = (s) => [...s].sort().join('');
const byLenThenAlpha = (a, b) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

function tileVector(tiles) { const c = new Uint8Array(26); let m = 0; for (const ch of tiles) { c[ch.charCodeAt(0) - A]++; m |= (1 << (ch.charCodeAt(0) - A)); } return { c, m }; }

function formableWords(tiles) {
    const { c: tc, m: tmask } = tileVector(tiles);
    const out = [];
    for (let i = 0; i < words.length; i++) {
        if (masks[i] & ~tmask) continue;
        const wc = counts[i]; let ok = true;
        for (let l = 0; l < 26; l++) if (wc[l] > tc[l]) { ok = false; break; }
        if (ok) out.push(words[i]);
    }
    return out;
}
const isPangram = (word, tiles) => word.length === TILE_COUNT && sig(word) === sig(tiles);

// --- EASY: seed from common 7-letter words ----------------------------------
console.log('Generating EASY sets (seeded from common 7-letter words)…');
const easy = [];
const seenEasy = new Set();
const seeds = shuffle(words.filter(w => w.length === TILE_COUNT && isCommon(w, PANGRAM_RANK)));
for (const seed of seeds) {
    if (easy.length >= EASY_TARGET) break;
    const tiles = sig(seed);              // canonical letter order
    if (seenEasy.has(tiles)) continue;
    const all = formableWords(tiles);
    const commonWords = all.filter(w => isCommon(w, COMMON_RANK));
    if (commonWords.length < MIN_COMMON_EASY) continue;
    const commonPangrams = all.filter(w => isPangram(w, tiles) && isCommon(w, PANGRAM_RANK));
    if (commonPangrams.length === 0) continue;   // should never happen (seed qualifies)
    seenEasy.add(tiles);
    easy.push({
        letters: tiles,
        words: [...all].sort(byLenThenAlpha),                 // accept-any answer key
        commonWords: [...commonWords].sort(byLenThenAlpha),   // realistic target / shown
        pangrams: [...commonPangrams].sort(byLenThenAlpha),
    });
}

// --- HARD: random draw + center letter, full ENABLE -------------------------
console.log('Generating HARD sets (random + center letter, expert)…');
const hard = [];
const seenHard = new Set();
let attempts = 0;
const drawTiles = () => {
    const nV = Math.random() < 0.5 ? 2 : 3;
    const chars = [];
    for (let i = 0; i < nV; i++) chars.push(pick(VOWELS));
    for (let i = 0; i < TILE_COUNT - nV; i++) chars.push(pick(CONSONANTS));
    return chars.sort().join('');
};
while (hard.length < HARD_TARGET && attempts < MAX_ATTEMPTS) {
    attempts++;
    const tiles = drawTiles();
    const all = formableWords(tiles);
    if (all.length < MIN_WORDS_HARD) continue;
    const pangrams = all.filter(w => isPangram(w, tiles));
    if (pangrams.length === 0) continue;
    for (const center of shuffle([...new Set(tiles.split(''))])) {
        const key = `${tiles}|${center}`;
        if (seenHard.has(key)) continue;
        const filtered = all.filter(w => w.includes(center));
        if (filtered.length < MIN_WORDS_HARD) continue;
        seenHard.add(key);
        hard.push({ letters: tiles, center, words: [...filtered].sort(byLenThenAlpha), pangrams: [...pangrams].sort(byLenThenAlpha) });
        break;
    }
}

// --- report + write ---------------------------------------------------------
const stat = (arr, key = 'words') => {
    const c = arr.map(s => s[key].length);
    return `${arr.length} sets · avg ${Math.round(c.reduce((a, b) => a + b, 0) / (c.length || 1))} · min ${Math.min(...c)} · max ${Math.max(...c)}`;
};
console.log(`Easy: ${stat(easy)} | common: ${stat(easy, 'commonWords')}`);
console.log(`Hard: ${stat(hard)} (attempts ${attempts})`);

const payload = { generatedAt: new Date().toISOString(), tileCount: TILE_COUNT, minWordLen: MIN_WORD_LEN, easy, hard };
writeFileSync(OUT_PATH, JSON.stringify(payload));
console.log(`Wrote ${OUT_PATH} (${(readFileSync(OUT_PATH).length / 1024).toFixed(0)} KB)`);
