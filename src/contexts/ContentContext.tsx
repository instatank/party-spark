import React, { createContext, useContext, useState, type ReactNode } from 'react';
import { generateCharadesWords, generateTabooCards, generateTriviaQuestions, generateIcebreaker } from '../services/geminiService';
import type { TabooCard, TriviaQuestion } from '../types';

interface ContentContextType {
    charadesBuffer: string[];
    tabooBuffer: TabooCard[];
    triviaBuffer: TriviaQuestion[];
    icebreakerBuffer: string[];
    isPrefetching: Record<string, boolean>;
    prefetchGameContent: (gameType: string, category: string) => Promise<void>;
    consumeItem: (gameType: string) => any | null;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [charadesBuffer, setCharadesBuffer] = useState<string[]>([]);
    const [tabooBuffer, setTabooBuffer] = useState<TabooCard[]>([]);
    const [triviaBuffer, setTriviaBuffer] = useState<TriviaQuestion[]>([]);
    const [icebreakerBuffer, setIcebreakerBuffer] = useState<string[]>([]);

    // Track loading state per key "gameType:category"
    const [isPrefetching, setIsPrefetching] = useState<Record<string, boolean>>({});

    const prefetchGameContent = async (gameType: string, category: string) => {
        const key = `${gameType}:${category}`;
        if (isPrefetching[key]) return;

        setIsPrefetching(prev => ({ ...prev, [key]: true }));

        try {
            // Batch Configuration
            const BATCH_SIZE = 20;
            const BATCH_COUNT = 5; // 5 * 20 = 100 items

            // We perform one initial fetch immediately, then background the rest
            const fetchBatch = async () => {
                switch (gameType) {
                    case 'CHARADES':
                        return await generateCharadesWords(category); // Assume service updated to return more
                    case 'TABOO':
                        return await generateTabooCards(category, BATCH_SIZE);
                    case 'TRIVIA':
                        return await generateTriviaQuestions(category, BATCH_SIZE);
                    case 'ICEBREAKERS':
                        // Icebreakers are usually single fetch, we'll need to update service or just loop
                        const p1 = await generateIcebreaker('fun');
                        const p2 = await generateIcebreaker('deep');
                        return [p1, p2];
                    default:
                        return [];
                }
            };

            // Fetch 1 batch first to be responsive
            const initialBatch = await fetchBatch();
            addContentToBuffer(gameType, initialBatch);

            // Fetch remaining batches in parallel-ish
            for (let i = 0; i < BATCH_COUNT - 1; i++) {
                fetchBatch().then(data => addContentToBuffer(gameType, data));
            }

        } catch (error) {
            console.error("Prefetch error:", error);
        } finally {
            setIsPrefetching(prev => ({ ...prev, [key]: false }));
        }
    };

    const addContentToBuffer = (gameType: string, data: any[]) => {
        switch (gameType) {
            case 'CHARADES':
                setCharadesBuffer(prev => [...prev, ...data]);
                break;
            case 'TABOO':
                setTabooBuffer(prev => [...prev, ...data]);
                break;
            case 'TRIVIA':
                setTriviaBuffer(prev => [...prev, ...data]);
                break;
            case 'ICEBREAKERS':
                setIcebreakerBuffer(prev => [...prev, ...data]);
                break;
        }
    };

    const consumeItem = (gameType: string) => {
        let item = null;
        switch (gameType) {
            case 'CHARADES':
                if (charadesBuffer.length > 0) {
                    item = charadesBuffer[0];
                    setCharadesBuffer(prev => prev.slice(1));
                }
                break;
            case 'TABOO':
                if (tabooBuffer.length > 0) {
                    item = tabooBuffer[0];
                    setTabooBuffer(prev => prev.slice(1));
                }
                break;
            case 'TRIVIA':
                if (triviaBuffer.length > 0) {
                    item = triviaBuffer[0];
                    setTriviaBuffer(prev => prev.slice(1));
                }
                break;
            case 'ICEBREAKERS':
                if (icebreakerBuffer.length > 0) {
                    item = icebreakerBuffer[0];
                    setIcebreakerBuffer(prev => prev.slice(1));
                }
                break;
        }
        return item;
    };

    return (
        <ContentContext.Provider value={{
            charadesBuffer,
            tabooBuffer,
            triviaBuffer,
            icebreakerBuffer,
            isPrefetching,
            prefetchGameContent,
            consumeItem
        }}>
            {children}
        </ContentContext.Provider>
    );
};

export const useContent = () => {
    const context = useContext(ContentContext);
    if (!context) throw new Error("useContent must be used within ContentProvider");
    return context;
};
