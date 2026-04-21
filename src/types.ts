export enum AppState {
    IDLE = 'IDLE',
    PROCESSING = 'PROCESSING',
    COMPLETE = 'COMPLETE',
    ERROR = 'ERROR'
}

export enum GameType {
    HOME = 'HOME',
    CHARADES = 'CHARADES',
    TABOO = 'TABOO',
    ICEBREAKERS = 'ICEBREAKERS',
    ROAST = 'ROAST',
    IMPOSTER = 'IMPOSTER',
    WOULD_YOU_RATHER = 'WOULD_YOU_RATHER',
    MOST_LIKELY_TO = 'MOST_LIKELY_TO',
    WOULD_I_LIE_TO_YOU = 'WOULD_I_LIE_TO_YOU',
    NEVER_HAVE_I_EVER = 'NEVER_HAVE_I_EVER',
    MINI_MAFIA = 'MINI_MAFIA',
    FACT_OR_FICTION = 'FACT_OR_FICTION',
    TRUTH_OR_DRINK = 'TRUTH_OR_DRINK',
    COMPATIBILITY_TEST = 'COMPATIBILITY_TEST'
}

export type MafiaRole = 'MAFIA' | 'DOCTOR' | 'DETECTIVE' | 'VILLAGER';

export interface MafiaPlayer {
    id: string;
    name: string;
    role: MafiaRole;
    isAlive: boolean;
}

export interface GameMeta {
    id: GameType;
    title: string;
    description: string;
    icon: string;
    color: string;
    minPlayers: number;
}

export interface TabooCard {
    word: string;
    forbidden: string[];
    difficulty?: 'easy' | 'medium' | 'hard';
}

export interface IcebreakerPrompt {
    text: string;
    category: 'FUN' | 'DEEP' | 'ACTION';
}
