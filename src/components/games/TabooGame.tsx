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

    // Difficulty palette for the new MLT-style card body. solid colors the
    // header pill text + decorative blob; tint backs the pill bg + blob fill.
    const getTilePalette = (difficulty?: string): { solid: string; tint: string } => {
        switch (difficulty) {
            case 'easy': return { solid: '#22C55E', tint: 'rgba(34, 197, 94, 0.18)' };
            case 'hard': return { solid: '#EF4444', tint: 'rgba(239, 68, 68, 0.18)' };
            default:     return { solid: '#EAB308', tint: 'rgba(234, 179, 8, 0.18)' }; // Medium
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-2 pt-2">
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

            {/* Card body — MLT play-screen styling adapted for Taboo's two-section
                layout (target word + forbidden list). Header pill on top, target
                word in Playfair centered upper-half, forbidden block on lower
                third with a divider. Difficulty drives the blob/pill color.
                Header/buttons margins trimmed so the card eats more vertical
                space without overflow; inner type sized up ~40% for legibility. */}
            <div className="flex-1 flex flex-col perspective-1000">
                {(() => {
                    const palette = getTilePalette(card.difficulty);
                    return (
                        <div
                            className="flex-1 w-full bg-party-surface border border-white/10 rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                            style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                        >
                            <div
                                className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                                style={{ background: palette.tint }}
                            />
                            <div
                                className="self-start text-[11px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                                style={{ background: palette.tint, color: palette.solid }}
                            >
                                Taboo {card.difficulty ? `· ${card.difficulty}` : ''}
                            </div>

                            {/* Target Word — fills upper portion, divider underneath */}
                            <div className="flex-1 flex items-center justify-center relative z-10 border-b border-white/10 py-4">
                                <h2 className="font-serif font-bold text-[56px] leading-[1.02] tracking-[-0.02em] text-white text-center break-words">
                                    {card.word}
                                </h2>
                            </div>

                            {/* Forbidden Words */}
                            <div className="relative z-10 pt-4 flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 text-red-400 font-bold uppercase tracking-[0.14em] text-[12px] mb-1">
                                    <Ban size={14} /> Forbidden
                                </div>
                                {card.forbidden.map((word, i) => (
                                    <div key={i} className="text-[20px] font-medium text-gray-300 uppercase tracking-wide leading-tight">
                                        {word}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3">
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
