// One Clue charades — the deck built for a single 30/60s clue per turn.
//
// The rapid-fire deck (games_data.json) and this one are deliberately NOT the
// same content. Rapid fire wants "Titanic" — three seconds to read, three
// seconds to pose, next card. A one-clue round wants something that can hold a
// person's whole minute: a scene with a turn in it, a saying that breaks into
// mimeable pieces, a film with something to actually DO. Mixing the two pools
// is what made the old dataset feel wrong for the way this game gets played.
//
// Lazy-imported, like every other dataset here, so it stays its own chunk and
// never lands in the initial bundle. It is also NOT part of games_data.json on
// purpose — that file is the chunk Taboo shares, and Taboo has no use for this.

/** Kinds are announced to the room before the clock starts. Standard charades
 *  practice, and the thing that makes a single 60-second clue fair. */
export type ClueKind = 'SITUATION' | 'MOVIE' | 'TV' | 'PHRASE' | 'PERSON' | 'JOB' | 'ANIMAL';

export interface Clue {
    /** The clue itself. */
    t: string;
    /** What to announce to the room. */
    k: ClueKind;
    /** 1 warm-up · 2 standard · 3 brutal. */
    d: 1 | 2 | 3;
}

export interface CluePack {
    id: string;
    name: string;
    description: string;
    clues: Clue[];
}

export interface CharadesClueData {
    version: number;
    kinds: Record<ClueKind, string>;
    packs: CluePack[];
}

const cluesPromise: Promise<CharadesClueData> = import('../data/charades_clues.json')
    .then(m => m.default as unknown as CharadesClueData);

export const loadCharadesClues = () => cluesPromise;

/** The pseudo-pack id that means "every pack at once". */
export const MIX_PACK = 'mix';

export const packClues = (data: CharadesClueData, packId: string): Clue[] =>
    packId === MIX_PACK
        ? data.packs.flatMap(p => p.clues)
        : (data.packs.find(p => p.id === packId)?.clues ?? []);

const shuffled = <T,>(xs: readonly T[]): T[] => {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
};

/**
 * Deal `count` clues with a deliberate difficulty CURVE rather than a uniform
 * draw. A uniform draw off a pack that is 60% tier-2 hands you six tier-2
 * clues and every round feels the same; the curve opens easy and ends hard, so
 * a match has a shape. Falls back to whatever is left if a tier runs dry.
 */
export const dealClues = (pool: readonly Clue[], count: number): Clue[] => {
    const byTier: Record<number, Clue[]> = { 1: [], 2: [], 3: [] };
    for (const c of shuffled(pool)) byTier[c.d]?.push(c);

    // The shape: first fifth warm-up, last third brutal, the rest standard.
    const wanted: (1 | 2 | 3)[] = [];
    for (let i = 0; i < count; i++) {
        const p = count === 1 ? 0.5 : i / (count - 1);
        wanted.push(p < 0.25 ? 1 : p < 0.7 ? 2 : 3);
    }

    const out: Clue[] = [];
    const spares = () => shuffled([...byTier[1], ...byTier[2], ...byTier[3]]);
    for (const tier of wanted) {
        const next = byTier[tier].pop() ?? spares().pop();
        if (!next) break;
        // pop() off a spare list does not remove it from its own tier bucket
        for (const t of [1, 2, 3]) {
            const idx = byTier[t].indexOf(next);
            if (idx >= 0) byTier[t].splice(idx, 1);
        }
        out.push(next);
    }
    return out;
};
