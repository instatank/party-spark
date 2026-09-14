// =============================================================================
// Seeded randomness — the thing that lets two phones deal the SAME content
// without sending any content over the wire.
//
// Every game engine in the app already accepts an injectable `rnd: () => number`
// (lineEngine.dealGame, targetEngine.dealPuzzle, shortlistEngine.buildCase) and
// jumbleEngine exposes an index-addressable setAtIndex(). Those were built for
// testability and for the date-seeded Daily Scramble. They are also, for free,
// exactly what multiplayer needs: agree on ONE integer and both devices
// generate byte-identical puzzles offline.
//
// So the network never carries a question, a letter set or a deck — only a
// seed. That is why the room payload stays in the low hundreds of bytes and
// why a once-a-second poll is fast enough to feel live.
// =============================================================================

// mulberry32 — a 32-bit PRNG. Chosen over xorshift/LCG because it passes
// gjrand's basic suite at this size, needs one word of state, and is ~10 lines.
// It is NOT cryptographic and must never be used for anything security-facing;
// it exists to make randomness reproducible, not unguessable.
export function mulberry32(seed: number): () => number {
    // Coerce to a uint32 so callers can pass any integer (incl. Date.now()).
    let a = seed >>> 0;
    return function next(): number {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Fisher-Yates against an injected rnd. Mirrors `shuffle` in SessionManager
// (same algorithm, same non-mutating contract) but deterministic for a given
// generator. Kept separate rather than adding an optional param to `shuffle`
// so the two call sites read differently: one is "surprise me", one is
// "give every player in the room the same order".
export function seededShuffle<T>(items: readonly T[], rnd: () => number): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// A fresh room seed. Room codes are only 4 digits and therefore recycle, so the
// seed is deliberately independent of the code — two different parties on 4471
// an hour apart must not get the same puzzles.
export const newSeed = (): number => Math.floor(Math.random() * 0xFFFFFFFF) >>> 0;

// Derive a stable sub-seed for round N of a room. Rounds must differ from each
// other but stay identical across devices, so this is a pure function of
// (seed, round) rather than anything drawn at runtime.
export const roundSeed = (seed: number, round: number): number =>
    (Math.imul(seed ^ 0x9E3779B9, 0x85EBCA6B) + Math.imul(round + 1, 0xC2B2AE35)) >>> 0;
