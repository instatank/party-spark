import React, { useState, useEffect } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
// generateTabooCards removed — full local deck is loaded each round
import { useContent } from '../../contexts/ContentContext';
import type { TabooCard } from '../../types';
import { Timer, ThumbsUp, X, Ban } from 'lucide-react';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';
import gamesDataRaw from '../../data/games_data.json';
import { TABOO_CATEGORIES } from '../../constants';

interface Props {
    onExit: () => void;
}

export const TabooGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'CATEGORY' | 'LOADING' | 'READY' | 'PLAYING' | 'SUMMARY'>('CATEGORY');
    const [cards, setCards] = useState<TabooCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [currentCategory, setCurrentCategory] = useState("");
    const { prefetchGameContent } = useContent();

    const startGame = async (category: string) => {
        setCurrentCategory(category);
        setGameState('LOADING');

        // Trigger background prefetch (100 items)
        prefetchGameContent('TABOO', category);

        // 1. Get all local cards
        let allLocalCards: any[] = [];
        try {
            if (category === 'mix_taboo') {
                allLocalCards = (gamesDataRaw as any).games.taboo.categories
                    .filter((c: any) => c.id !== 'mix_taboo')
                    .flatMap((c: any) => c.items);
            } else {
                const catData = (gamesDataRaw as any).games.taboo.categories.find((c: any) => c.id === category);
                if (catData && catData.items) {
                    allLocalCards = catData.items;
                }
            }
        } catch (e) {
            console.warn("Failed to read local taboo data", e);
        }

        // 2. Filter used cards from this session
        const availableLocal = sessionService.filterContent(
            GameType.TABOO,
            category,
            allLocalCards,
            (c) => c.word
        );

        let selectedCards: TabooCard[];

        if (availableLocal.length >= 5) {
            // Shuffle ALL available cards and load the full deck — no repeats until exhausted
            selectedCards = [...availableLocal].sort(() => 0.5 - Math.random());
        } else {
            // Pool nearly exhausted — reset session tracking for this category and reshuffle from full set
            console.log("Taboo deck nearly exhausted, reshuffling full pool...");
            // Reshuffle from ALL local cards since the filtered pool is nearly empty
            selectedCards = [...allLocalCards].sort(() => 0.5 - Math.random());
        }

        setCards(selectedCards);
        setScore(0);
        setCurrentIndex(0);
        setTimeLeft(60);
        setGameState('READY');
    };

    const startRound = () => {
        setGameState('PLAYING');
    };

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (gameState === 'PLAYING' && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0 && gameState === 'PLAYING') {
            setGameState('SUMMARY');
        }
        return () => clearInterval(interval);
    }, [gameState, timeLeft]);

    const handleCorrect = () => {
        setScore(s => s + 1);
        nextCard();
    };

    const handleSkip = () => {
        nextCard();
    };

    const nextCard = () => {
        // Mark current as used
        if (cards[currentIndex]) {
            sessionService.markAsUsed(GameType.TABOO, currentCategory, cards[currentIndex].word);
        }

        if (currentIndex < cards.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            // Entire deck exhausted during this round — end round
            setGameState('SUMMARY');
        }
    };

    if (gameState === 'CATEGORY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Taboo Categories" onBack={onExit} onHome={onExit} />
                <p className="text-gray-400 mb-4 text-sm">Pick a topic. Describe the word without using forbidden words!</p>
                <div className="grid grid-cols-2 gap-3 overflow-y-auto pb-4">
                    {TABOO_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => startGame(cat.id)}
                            className={`p-4 rounded-xl flex flex-col items-center gap-3 transition-all active:scale-95 bg-party-surface hover:bg-slate-800 border-2 ${(cat as any).borderColor || 'border-white/5'}`}
                        >
                            <div className={`p-2 rounded-full bg-white/5 ${cat.color}`}>
                                {cat.icon}
                            </div>
                            <span className="font-bold text-sm text-center text-white">{cat.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Preparing Deck..." onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="w-16 h-16 border-4 border-party-secondary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xl font-medium animate-pulse text-center">
                        Generating forbidden words for<br /><span className="text-party-secondary font-bold">{currentCategory}</span>...
                    </p>
                </div>
            </div>
        );
    }

    if (gameState === 'READY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Ready?" onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                    <Card className="w-full text-center py-12 bg-party-surface border border-white/5 shadow-xl">
                        <h2 className="text-2xl font-bold mb-4 font-serif text-white">Pass the phone to the<br />Clue Giver!</h2>
                        <div className="text-6xl mb-4">🤫</div>
                        <p className="text-gray-400 text-sm px-6">
                            When you're ready, hit start. You have 60 seconds to describe as many words as possible.
                        </p>
                    </Card>
                    <Button fullWidth onClick={startRound} className="h-16 text-xl">START TIMER</Button>
                </div>
            </div>
        );
    }

    if (gameState === 'SUMMARY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Time's Up!" onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    <div className="text-center">
                        <h2 className="text-4xl font-bold mb-2">Round Over</h2>
                        <p className="text-gray-400">Team Score</p>
                    </div>

                    <div className="text-9xl font-black text-party-secondary drop-shadow-lg">
                        {score}
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <Button onClick={() => setGameState('CATEGORY')} fullWidth>Next Category</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Exit</Button>
                    </div>
                </div>
            </div>
        );
    }

    const card = cards[currentIndex];

    const getCardColor = (difficulty?: string) => {
        switch (difficulty) {
            case 'easy': return 'border-green-500 shadow-green-500/20';
            case 'hard': return 'border-red-500 shadow-red-500/20';
            default: return 'border-yellow-500 shadow-yellow-500/20'; // Medium default
        }
    };

    const getAccentColor = (difficulty?: string) => {
        switch (difficulty) {
            case 'easy': return 'bg-green-500';
            case 'hard': return 'bg-red-500';
            default: return 'bg-yellow-500';
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-4 pt-2">
                <Button variant="ghost" onClick={() => setGameState('CATEGORY')} className="!p-2">
                    <span className="text-gray-400">Quit</span>
                </Button>
                <div className="flex items-center gap-2 bg-party-surface border border-white/10 px-4 py-2 rounded-full shadow-lg">
                    <Timer size={18} className={timeLeft < 10 ? 'text-red-400 animate-pulse' : 'text-party-accent'} />
                    <span className={`font-mono font-bold text-xl ${timeLeft < 10 ? 'text-red-400' : 'text-white'}`}>{timeLeft}</span>
                </div>
                <div className="font-bold text-xl text-party-primary w-[50px] text-right">
                    {score}
                </div>
            </div>

            <div className="flex-1 flex flex-col gap-4 perspective-1000">
                <Card className={`flex-1 flex flex-col items-center bg-party-surface text-white overflow-hidden relative border-2 shadow-xl transition-colors duration-300 ${getCardColor(card.difficulty || currentCategory)}`}>
                    <div className={`absolute top-0 inset-x-0 h-2 ${getAccentColor(card.difficulty || currentCategory)}`}></div>

                    {/* Target Word */}
                    <div className="flex-1 flex items-center justify-center w-full border-b border-white/10 py-6">
                        <h2 className="text-4xl md:text-5xl font-bold text-center leading-tight uppercase tracking-tight text-white font-serif">
                            {card.word}
                        </h2>
                    </div>

                    {/* Forbidden Words */}
                    <div className="w-full bg-slate-900/50 p-6 flex flex-col items-center justify-center gap-3 border-t border-white/5">
                        <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-widest text-xs mb-2">
                            <Ban size={14} /> Forbidden
                        </div>
                        {card.forbidden.map((word, i) => (
                            <div key={i} className="text-lg font-medium text-gray-300 uppercase tracking-wide">
                                {word}
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
                <Button onClick={handleSkip} variant="secondary" className="h-20 flex flex-col items-center justify-center gap-1">
                    <X size={28} className="text-gray-400" />
                    <span className="text-sm uppercase font-bold tracking-wider text-gray-400">Skip</span>
                </Button>
                <Button onClick={handleCorrect} className="h-20 bg-party-secondary text-slate-900 hover:bg-yellow-500 flex flex-col items-center justify-center gap-1 border-0">
                    <ThumbsUp size={28} className="text-slate-900" />
                    <span className="text-sm uppercase font-bold tracking-wider text-slate-900">Correct</span>
                </Button>
            </div>
        </div>
    );
};
