// The second Charades deck — a better-written version of the word list, kept
// in its own file so it can be picked (and tested) separately from the
// original one in games_data.json.
//
// It plays through the EXACT SAME loop as the original deck: the card shows a
// clue, Correct or Skip moves to the next one, the round ends when the clock
// does. No extra screens. The only thing that differs is the writing — clues
// with something to act rather than a noun to pose.
//
// Lazy-imported, like every other dataset here, so it stays its own chunk and
// never lands in the initial bundle. It is deliberately NOT part of
// games_data.json — that file is the chunk Taboo shares, and Taboo has no use
// for this.

/** Announced to the room before the actor starts. Standard charades practice. */
export type ClueKind = 'SITUATION' | 'MOVIE' | 'TV' | 'PHRASE' | 'PERSON' | 'JOB' | 'ANIMAL';

export interface Clue {
    /** The clue itself. */
    t: string;
    /** What to announce. */
    k: ClueKind;
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

/**
 * The decks the picker offers. Only three are stored; `mixed` is the two movie
 * packs combined at deal time, so no film is written down twice (the original
 * deck used to store its mix that way, and shipped every title twice for it).
 */
export const MIXED_PACK = 'mixed';
export const MOVIE_PACKS = ['hollywood', 'bollywood'] as const;

export const packClues = (data: CharadesClueData, packId: string): Clue[] =>
    packId === MIXED_PACK
        ? data.packs.filter(p => (MOVIE_PACKS as readonly string[]).includes(p.id)).flatMap(p => p.clues)
        : (data.packs.find(p => p.id === packId)?.clues ?? []);

/** Every deck the SETUP screen lists, in order. Mixed leads, as it does on the
 *  original deck's picker. */
export const packMenu = (data: CharadesClueData): { id: string; name: string; description: string }[] => [
    { id: MIXED_PACK, name: 'Movie Mix', description: 'Hollywood and Bollywood together.' },
    ...data.packs.map(({ id, name, description }) => ({ id, name, description })),
];

/** Deal a batch for one round: shuffled, no repeats, no ordering games. */
export const dealClues = (pool: readonly Clue[], count: number): Clue[] => {
    const a = [...pool];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a.slice(0, count);
};
