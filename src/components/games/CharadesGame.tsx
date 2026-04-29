import React, { useState, useEffect } from 'react';
import { Button, ScreenHeader } from '../ui/Layout';
import { Timer, ThumbsUp, ThumbsDown, ChevronRight, Shuffle, Users, Film, Star, Sparkles } from 'lucide-react';
import { generateCharadesWords } from '../../services/geminiService';
import { useContent } from '../../contexts/ContentContext';
import { CHARADES_CATEGORIES } from '../../constants';
import gamesDataRaw from '../../data/games_data.json';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
    onExit: () => void;
}

// Per-category tile color. Light values darkened so they read on #EEF4FA.
const TILES_DARK: Record<string, string> = {
    mix_movies:        '#94A3B8',
    family_mix:        '#EFC050',
    bollywood_movies:  '#EC4899',
    hollywood_movies:  '#65B7F0',
};
const TILES_LIGHT: Record<string, string> = {
    mix_movies:        '#475569', // slate-600
    family_mix:        '#B8922F', // Azure gold
    bollywood_movies:  '#C72D7F',
    hollywood_movies:  '#1F77C9',
};

export const CharadesGame: React.FC<Props> = ({ onExit }) => {
    const { theme } = useTheme();
    const TILES_MAP = theme === 'light' ? TILES_LIGHT : TILES_DARK;
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
        // Slim Row pattern. Charades has no AI custom-vibe deck so no
        // ring/glow tile. Tile color resolves through the theme map.
        const TILE_META: Record<string, { Icon: typeof Sparkles; description: string }> = {
            mix_movies:        { Icon: Shuffle, description: 'Hollywood + Bollywood + arthouse. Pure chaos.' },
            family_mix:        { Icon: Users,   description: 'Wholesome titles only. PG vibes.' },
            bollywood_movies:  { Icon: Film,    description: 'All Hindi cinema. Iconic to underrated.' },
            hollywood_movies:  { Icon: Star,    description: 'American studio + indie. Big-budget energy.' },
        };

        // Loading state — full-screen spinner while words are being fetched.
        if (loading) {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="Charades" onBack={onExit} onHome={onExit} />
                    <div className="flex-1 flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
                            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent animate-pulse" size={24} />
                        </div>
                        <p className="text-xl font-bold text-ink">Brewing your words…</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Charades" onBack={onExit} onHome={onExit} />
                <p className="text-muted mb-4 text-sm text-center">
                    Pick a category. 60-second round, act them out silently.
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {categories.map(c => {
                            const meta = TILE_META[c.id] || { Icon: Sparkles, description: '' };
                            const color = TILES_MAP[c.id] || '#94A3B8';
                            const Icon = meta.Icon;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => startGame(c.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span
                                            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]"
                                            style={{ background: color }}
                                        />
                                        <span
                                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                            style={{ background: color }}
                                        />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color }}>
                                                <Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight truncate">{c.label}</h3>
                                                <p className="text-xs text-muted leading-snug truncate">{meta.description}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
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
                        <h2 className="text-4xl font-bold mb-2 text-ink">Time's Up!</h2>
                        <p className="text-muted">You got</p>
                    </div>

                    <div className="text-8xl font-black text-accent">
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
                <div className="flex items-center gap-2 bg-app-tint px-4 py-2 rounded-full">
                    <Timer size={18} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-ink-soft'} />
                    <span className={`font-mono font-bold ${timeLeft < 10 ? 'text-red-500' : 'text-ink'}`}>{timeLeft}s</span>
                </div>
                <div className="font-bold text-xl text-ink">Score: {score}</div>
            </div>

            <div className="flex-1 flex items-center justify-center perspective-1000">
                {/* Card body — MLT play-screen style. Charades brand color is gold,
                    so blob + pill + footer pull from the gold token (var(--c-gold)
                    → #EFC050 dark / #B8922F light). */}
                <div
                    className="w-full aspect-[3/4] max-h-[340px] bg-surface border border-divider rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                >
                    <div
                        className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                        style={{ background: 'var(--c-gold-soft)' }}
                    />
                    <div
                        className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                        style={{ background: 'var(--c-gold-soft)', color: 'var(--c-gold)' }}
                    >
                        Charades
                    </div>
                    <div className="flex-1 flex items-center justify-center relative z-10">
                        <h2 className="font-serif font-bold text-[36px] leading-[1.1] tracking-[-0.015em] text-ink text-center break-words animate-slide-up">
                            {words[currentIndex]}
                        </h2>
                    </div>
                    <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                        <span>Act it out silently.</span>
                        <span className="font-serif italic text-[12px]" style={{ color: 'var(--c-gold)' }}>PartySpark</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8">
                <Button onClick={handleSkip} variant="secondary" className="h-24 flex flex-col items-center justify-center gap-2">
                    <ThumbsDown size={32} className="text-muted" />
                    <span>Skip</span>
                </Button>
                <Button onClick={handleCorrect} className="h-24 bg-green-500 hover:bg-green-600 flex flex-col items-center justify-center gap-2 text-white">
                    <ThumbsUp size={32} />
                    <span>Correct</span>
                </Button>
            </div>
        </div>
    );
};
