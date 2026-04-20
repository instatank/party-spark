import React, { useState, useEffect } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
import { Timer, ThumbsUp, ThumbsDown } from 'lucide-react';
import { generateCharadesWords } from '../../services/geminiService';
// import { useContent } from '../../contexts/ContentContext'; // Unused for now, maybe later
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

    const startGame = async () => {
        setLoading(true);

        // Prefetch for background to keep buffer full
        prefetchGameContent('CHARADES', category);

        try {
            // 1. Get all local words for this category
            const charadesData = (gamesDataRaw as any).games.charades;
            let allLocalWords: string[] = [];

            if (category === 'mix_movies') {
                // Combine ALL movie categories for the mix
                const hollywood = charadesData.categories.find((c: any) => c.id === 'hollywood_movies')?.items || [];
                const bollywood = charadesData.categories.find((c: any) => c.id === 'bollywood_movies')?.items || [];
                const mixUnique = charadesData.categories.find((c: any) => c.id === 'mix_movies')?.items || [];
                allLocalWords = Array.from(new Set([...hollywood, ...bollywood, ...mixUnique]));
                console.log(`Movie Mix loaded: ${allLocalWords.length} unique titles`);
            } else if (category === 'family_mix') {
                // Combine all family-friendly sub-categories
                const everyday = charadesData.categories.find((c: any) => c.id === 'everyday_actions')?.items || [];
                const house = charadesData.categories.find((c: any) => c.id === 'around_the_house')?.items || [];
                const zoo = charadesData.categories.find((c: any) => c.id === 'the_zoo')?.items || [];
                const familyBase = charadesData.categories.find((c: any) => c.id === 'family_mix')?.items || [];
                allLocalWords = Array.from(new Set([...familyBase, ...everyday, ...house, ...zoo]));
                console.log(`Family Mix loaded: ${allLocalWords.length} unique words`);
            } else {
                // Standard category behavior
                const categoryData = charadesData.categories.find((c: any) => c.id === category);
                allLocalWords = categoryData ? categoryData.items : [];
            }

            // 2. Filter used words
            const availableLocal = sessionService.filterContent(
                GameType.CHARADES,
                category,
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
                console.log(`Local charades exhausted. Generating ${needed} words...`);
                try {
                    const generated = await generateCharadesWords(category, needed);
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
            console.log("Buffer low, fetching more charades...");
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
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Charades Setup" onBack={onExit} onHome={onExit} />

                <div className="space-y-6">
                    <Card>
                        <h3 className="text-lg font-semibold mb-4 text-gray-300">Choose Category</h3>
                        <div className="grid grid-cols-2 gap-3">
                            {categories.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setCategory(c.id)}
                                    className={`p-3 rounded-lg text-sm font-medium transition-all ${category === c.id ? 'bg-party-accent text-white shadow-lg' : 'bg-white/5 text-gray-400'}`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </Card>

                    <Button fullWidth onClick={startGame} disabled={loading}>
                        {loading ? "Generating..." : "Start Game"}
                    </Button>
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
                <Card className="w-full h-80 flex items-center justify-center bg-gradient-to-br from-indigo-900 to-party-surface border-party-primary/30 shadow-2xl shadow-party-primary/20 transform transition-all duration-300">
                    <h2 className="text-4xl md:text-5xl font-black text-center px-4 leading-tight break-words animate-slide-up">
                        {words[currentIndex]}
                    </h2>
                </Card>
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
