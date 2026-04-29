import React, { useState, useEffect } from 'react';
import { Button, ScreenHeader } from '../ui/Layout';
import { Timer, ThumbsUp, ThumbsDown, ChevronRight, Shuffle, Users, Film, Star, Sparkles } from 'lucide-react';
import { generateCharadesWords } from '../../services/geminiService';
import { useContent } from '../../contexts/ContentContext';
import { CHARADES_CATEGORIES } from '../../constants';
import gamesDataRaw from '../../data/games_data.json';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';

interface Props {
    onExit: () => void;
}

export const CharadesGame: React.FC<Props> = ({ onExit }) => {
    const [words, setWords] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [gameState, setGameState] = useState<'SETUP' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [category, setCategory] = useState("mix_movies");
    const { prefetchGameContent } = useContent();

    // const categories = ["Movies", "Animals", "Actions", "Celebrities", "Objects"]; // Replaced by constant
    const categories = CHARADES_CATEGORIES;

    // Optional `selectedCat` lets a tile tap immediately start with the tapped
    // category (avoids a stale-state read since setCategory is async and the
    // function would otherwise see the previous value).
    const startGame = async (selectedCat?: string) => {
        const cat = selectedCat ?? category;
        if (selectedCat) setCategory(selectedCat);
        setLoading(true);

        // Prefetch for background to keep buffer full
        prefetchGameContent('CHARADES', cat);

        try {
            // 1. Get all local words for this category
            const charadesData = (gamesDataRaw as any).games.charades;
            let allLocalWords: string[] = [];

            if (cat === 'mix_movies') {
                // Combine ALL movie categories for the mix
                const hollywood = charadesData.categories.find((c: any) => c.id === 'hollywood_movies')?.items || [];
                const bollywood = charadesData.categories.find((c: any) => c.id === 'bollywood_movies')?.items || [];
                const mixUnique = charadesData.categories.find((c: any) => c.id === 'mix_movies')?.items || [];
                allLocalWords = Array.from(new Set([...hollywood, ...bollywood, ...mixUnique]));
            } else if (cat === 'family_mix') {
                // Combine all family-friendly sub-categories
                const everyday = charadesData.categories.find((c: any) => c.id === 'everyday_actions')?.items || [];
                const house = charadesData.categories.find((c: any) => c.id === 'around_the_house')?.items || [];
                const zoo = charadesData.categories.find((c: any) => c.id === 'the_zoo')?.items || [];
                const familyBase = charadesData.categories.find((c: any) => c.id === 'family_mix')?.items || [];
                allLocalWords = Array.from(new Set([...familyBase, ...everyday, ...house, ...zoo]));
            } else {
                // Standard category behavior
                const categoryData = charadesData.categories.find((c: any) => c.id === cat);
                allLocalWords = categoryData ? categoryData.items : [];
            }

            // 2. Filter used words
            const availableLocal = sessionService.filterContent(
                GameType.CHARADES,
                cat,
                allLocalWords,
                (w) => w
            );

            let selectedWords: string[] = [];
            const INITIAL_BATCH_SIZE = 30;

            if (availableLocal.length >= INITIAL_BATCH_SIZE) {
                // Enough local content
                const shuffled = [...availableLocal].sort(() => 0.5 - Math.random());
                selectedWords = shuffled.slice(0, INITIAL_BATCH_SIZE);
            } else {
                // Not enough local, use what's left + generate
                selectedWords = [...availableLocal];
                const needed = INITIAL_BATCH_SIZE - selectedWords.length;
                try {
                    const generated = await generateCharadesWords(cat, needed);
                    selectedWords = [...selectedWords, ...generated];
                } catch (e) {
                    console.error("Failed to generate charades", e);
                    // Fallback to all local (repeats)
                    const shuffled = [...allLocalWords].sort(() => 0.5 - Math.random());
                    selectedWords = [...selectedWords, ...shuffled.slice(0, needed)];
                }
            }

            if (selectedWords.length > 0) {
                setWords(selectedWords);
            } else {
                setWords(["Error loading words", "Please try again"]);
            }
        } catch (e) {
            console.error(e);
            setWords(["Connection Error", "Check Settings"]);
        }

        setLoading(false);
        setGameState('PLAYING');
        setScore(0);
        setCurrentIndex(0);
        setTimeLeft(60);
    };

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (gameState === 'PLAYING' && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0) {
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

    const nextCard = async () => {
        // Mark current word as used
        if (words[currentIndex]) {
            sessionService.markAsUsed(GameType.CHARADES, category, words[currentIndex]);
        }

        // Check buffer and fetch more if needed
        if (words.length - currentIndex < 5) {
            try {
                const moreWords = await generateCharadesWords(category, 10);
                setWords(prev => [...prev, ...moreWords]);
            } catch (e) {
                console.warn("Background fetch failed", e);
            }
        }

        if (currentIndex < words.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            // Loop or end
            setGameState('SUMMARY');
        }
    };

    if (gameState === 'SETUP') {
        // Same design pattern as MLT/TOD/NHIE/WYR/Forecast: 3px inset left bar
        // + 33% center bottom line. Tap-to-start (no separate Start button).
        // Charades has no AI custom-vibe deck so no ring/glow tile.
        const TILES: Record<string, { Icon: typeof Sparkles; color: string; description: string }> = {
            mix_movies:        { Icon: Shuffle, color: '#94A3B8', description: 'Hollywood + Bollywood + arthouse. Pure chaos.' },
            family_mix:        { Icon: Users,   color: '#EFC050', description: 'Wholesome titles only. PG vibes.' },
            bollywood_movies:  { Icon: Film,    color: '#EC4899', description: 'All Hindi cinema. Iconic to underrated.' },
            hollywood_movies:  { Icon: Star,    color: '#65B7F0', description: 'American studio + indie. Big-budget energy.' },
        };

        // Loading state — full-screen spinner while words are being fetched.
        if (loading) {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="Charades" onBack={onExit} onHome={onExit} />
                    <div className="flex-1 flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-party-accent/30 border-t-party-accent rounded-full animate-spin" />
                            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-party-accent animate-pulse" size={24} />
                        </div>
                        <p className="text-xl font-bold text-white">Brewing your words…</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Charades" onBack={onExit} onHome={onExit} />
                <p className="text-gray-400 mb-4 text-sm text-center">
                    Pick a category. 60-second round, act them out silently.
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {categories.map(c => {
                            const meta = TILES[c.id] || { Icon: Sparkles, color: '#94A3B8', description: '' };
                            const Icon = meta.Icon;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => startGame(c.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/[0.08] hover:border-white/20 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span
                                            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]"
                                            style={{ background: meta.color }}
                                        />
                                        <span
                                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                            style={{ background: meta.color }}
                                        />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color: meta.color }}>
                                                <Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-white leading-tight truncate">{c.label}</h3>
                                                <p className="text-xs text-gray-400 leading-snug truncate">{meta.description}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    if (gameState === 'SUMMARY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Game Over" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    <div className="text-center">
                        <h2 className="text-4xl font-bold mb-2">Time's Up!</h2>
                        <p className="text-gray-400">You got</p>
                    </div>

                    <div className="text-8xl font-black text-party-accent">
                        {score}
                    </div>

                    <div className="flex flex-col gap-3 w-full">
                        <Button onClick={() => setGameState('SETUP')} fullWidth>Play Again</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Exit</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Charades" onBack={() => setGameState('SETUP')} onHome={onExit} />

            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full">
                    <Timer size={18} className={timeLeft < 10 ? 'text-red-400 animate-pulse' : ''} />
                    <span className={`font-mono font-bold ${timeLeft < 10 ? 'text-red-400' : ''}`}>{timeLeft}s</span>
                </div>
                <div className="font-bold text-xl text-party-primary">Score: {score}</div>
            </div>

            <div className="flex-1 flex items-center justify-center perspective-1000">
                {/* Card body — same MLT play-screen style: portrait 3:4, bg-party-surface,
                    border, rounded-22, decorative blob top-right, header pill top-left,
                    Playfair word centered, italic "PartySpark" footer. Charades brand
                    color is gold (#EFC050). */}
                <div
                    className="w-full aspect-[3/4] max-h-[340px] bg-party-surface border border-white/10 rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                    style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                >
                    <div
                        className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                        style={{ background: 'rgba(239, 192, 80, 0.18)' }}
                    />
                    <div
                        className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                        style={{ background: 'rgba(239, 192, 80, 0.18)', color: '#EFC050' }}
                    >
                        Charades
                    </div>
                    <div className="flex-1 flex items-center justify-center relative z-10">
                        <h2 className="font-serif font-bold text-[36px] leading-[1.1] tracking-[-0.015em] text-white text-center break-words animate-slide-up">
                            {words[currentIndex]}
                        </h2>
                    </div>
                    <div className="text-[11px] text-gray-400 flex items-center justify-between relative z-10">
                        <span>Act it out silently.</span>
                        <span className="font-serif italic text-[12px]" style={{ color: '#EFC050' }}>PartySpark</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8">
                <Button onClick={handleSkip} variant="secondary" className="h-24 flex flex-col items-center justify-center gap-2">
                    <ThumbsDown size={32} className="text-gray-400" />
                    <span>Skip</span>
                </Button>
                <Button onClick={handleCorrect} className="h-24 bg-green-500 hover:bg-green-600 flex flex-col items-center justify-center gap-2">
                    <ThumbsUp size={32} />
                    <span>Correct</span>
                </Button>
            </div>
        </div>
    );
};
