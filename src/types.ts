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
    TRIVIA = 'TRIVIA',
    ICEBREAKERS = 'ICEBREAKERS',
    SIMPLE_SELFIE = 'SIMPLE_SELFIE',
    ROAST = 'ROAST',
    IMPOSTER = 'IMPOSTER',
    WOULD_YOU_RATHER = 'WOULD_YOU_RATHER'
}

export interface GameMeta {
    id: GameType;
    title: string;
    description: string;
    icon: string;
    color: string;
    minPlayers: number;
}

export interface TriviaQuestion {
    question: string;
    options: string[];
    answer: string; // The correct answer text
    funFact?: string;
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
