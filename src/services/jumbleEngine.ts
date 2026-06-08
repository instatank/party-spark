// =============================================================================
// Jumble engine — runtime logic for the anagram word-finding game.
//
// IMPORTANT: there is NO dictionary shipped to the client and NO API. Each
// letter set ships with its full answer key (precomputed offline by
// scripts/build-jumble-sets.mjs from the ENABLE word list). At play time:
//   - validity  = "is this word in the set's answer key?"  (O(1) Set lookup)
//   - reject reason = a cheap local formability / center check (no dictionary)
// The sets JSON (~170 KB) is loaded lazily via dynamic import the first time
// the player enters Jumble, so it stays out of the initial app bundle.
// =============================================================================

export type JumbleDifficulty = 'easy' | 'hard';

export interface JumbleSet {
    letters: string;        // 7 uppercase tiles (a multiset; may repeat)
    center?: string;        // hard mode only — the required letter
    words: string[];        // full answer key (uppercase, sorted long→short) — accepts any real word
    commonWords?: string[]; // Easy only — the common subset shown/targeted (end screen + max-score)
    pangrams: string[];     // 7-letter answers that use every tile (Easy: common ones)
}

interface JumblePack {
    generatedAt: string;
    tileCount: number;
    minWordLen: number;
    easy: JumbleSet[];
    hard: JumbleSet[];
}

export const MIN_WORD_LEN = 4;     // 3-letter words are not allowed — 4+ only
export const TILE_COUNT = 7;

// Length-weighted scoring. Longer words are worth disproportionately more so
// players hunt for length instead of spamming short words. A 7-letter word is
// necessarily a pangram (uses all 7 tiles) → top score + celebration in UI.
const SCORE_BY_LEN: Record<number, number> = { 4: 2, 5: 4, 6: 6, 7: 10 };

export const scoreForWord = (word: string): number => SCORE_BY_LEN[word.length] ?? 0;

// --- lazy data load ---------------------------------------------------------
let packPromise: Promise<JumblePack> | null = null;

export const loadJumblePack = (): Promise<JumblePack> => {
    if (!packPromise) {
        packPromise = import('../data/jumble_sets.json').then(m => (m.default ?? m) as unknown as JumblePack);
    }
    return packPromise;
};

// Pick a random set for the difficulty, optionally avoiding ones already seen
// this session (keyed by letters, or letters|center for hard).
export const setKey = (set: JumbleSet): string => set.center ? `${set.letters}|${set.center}` : set.letters;

export const pickSet = (pack: JumblePack, difficulty: JumbleDifficulty, exclude?: Set<string>): JumbleSet => {
    const pool = pack[difficulty];
    const fresh = exclude && exclude.size < pool.length
        ? pool.filter(s => !exclude.has(setKey(s)))
        : pool;
    const source = fresh.length > 0 ? fresh : pool;
    return source[Math.floor(Math.random() * source.length)];
};

// --- validation -------------------------------------------------------------
export type ValidationStatus =
    | 'valid'
    | 'too_short'
    | 'not_formable'     // uses letters not in the set, or too many of one
    | 'missing_center'   // hard mode — omits the required center letter
    | 'already_found'
    | 'not_a_word';

export interface ValidationResult {
    status: ValidationStatus;
    word: string;        // normalized (uppercase)
    points: number;      // > 0 only when status === 'valid'
    isPangram: boolean;
}

const A = 'A'.charCodeAt(0);

// Can `word` be built from `tiles` (no letter used more than it appears)?
const isFormable = (word: string, tiles: string): boolean => {
    const avail = new Int8Array(26);
    for (const ch of tiles) avail[ch.charCodeAt(0) - A]++;
    for (const ch of word) {
        const idx = ch.charCodeAt(0) - A;
        if (idx < 0 || idx > 25) return false;
        if (--avail[idx] < 0) return false;
    }
    return true;
};

// Build the O(1) answer-key lookup for the active set. Call once per round.
export const buildAnswerIndex = (set: JumbleSet): Set<string> => new Set(set.words);

export const isPangramWord = (word: string, set: JumbleSet): boolean =>
    word.length === TILE_COUNT && [...word].sort().join('') === [...set.letters].sort().join('');

// Validate a submitted word against the active set + the words already found.
export const validateWord = (
    raw: string,
    set: JumbleSet,
    answerIndex: Set<string>,
    found: Set<string>,
): ValidationResult => {
    const word = raw.trim().toUpperCase();
    const base: Omit<ValidationResult, 'status'> = { word, points: 0, isPangram: false };

    if (!/^[A-Z]*$/.test(word) || word.length < MIN_WORD_LEN) {
        return { ...base, status: 'too_short' };
    }
    if (found.has(word)) {
        return { ...base, status: 'already_found' };
    }
    if (!isFormable(word, set.letters)) {
        return { ...base, status: 'not_formable' };
    }
    if (set.center && !word.includes(set.center)) {
        return { ...base, status: 'missing_center' };
    }
    if (answerIndex.has(word)) {
        return { ...base, status: 'valid', points: scoreForWord(word), isPangram: isPangramWord(word, set) };
    }
    return { ...base, status: 'not_a_word' };
};

// --- end-screen helpers ------------------------------------------------------
export interface MissedSummary {
    missed: string[];          // valid words the player didn't find (long→short)
    topMisses: string[];       // the high-value ones worth surfacing (5+ letters)
    foundPangram: boolean;
    totalPossible: number;
    maxPossibleScore: number;
}

export const summarizeMisses = (set: JumbleSet, found: Set<string>): MissedSummary => {
    // On Easy we measure against the COMMON subset — the realistic target — so
    // the "missed words" list and the % of max aren't dominated by obscure
    // Scrabble words the player was never expected to find. Hard uses the
    // full list. A true pangram is any 7-letter word the player found.
    const universe = set.commonWords ?? set.words;
    const missed = universe.filter(w => !found.has(w));
    const foundPangram = [...found].some(w => w.length === TILE_COUNT);
    const maxPossibleScore = universe.reduce((sum, w) => sum + scoreForWord(w), 0);
    return {
        missed,
        topMisses: missed.filter(w => w.length >= 5),
        foundPangram,
        totalPossible: universe.length,
        maxPossibleScore,
    };
};
