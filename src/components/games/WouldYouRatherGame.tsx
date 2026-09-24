
import React, { useState, use } from 'react';
import { Card, Button } from '../ui/Layout';
import { ScreenHeader } from '../ui/Layout';
import { ArrowRight, ChevronRight, Sparkles, RotateCcw, Users, Heart, Flame } from 'lucide-react';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';

// The dilemma bank is lazy-loaded so it code-splits out of this game's chunk.
// The fetch starts as soon as the chunk loads; use() below suspends into the
// App-level Suspense boundary on first render.
const wyrDataPromise = import('../../data/would_you_rather.json').then(m => m.default);

interface WYRQuestion {
    id: string;
    optionA: string;
    optionB: string;
    // Authored ESTIMATES of how a room splits — not recorded votes. The
    // footnote on the card says so; never label these "player votes".
    stats: { a: number; b: number };
}

// Deck icons are named in the JSON (`icon`) and resolved through this static
// map; an unknown name falls back to Sparkles rather than rendering nothing.
const DECK_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
    users: Users,
    heart: Heart,
    flame: Flame,
};

// Decks are data: name, tagline and accent live in the JSON, so adding a
// deck is a JSON edit. With a single deck the picker is skipped entirely.
interface WYRCategory {
    id: string;
    name: string;
    tagline: string;
    icon?: string;
    color: string;
    adult: boolean;
    items: WYRQuestion[];
}

interface WouldYouRatherGameProps {
    onExit: () => void;
}

const ROUND_SIZE = 10;

export const WouldYouRatherGame: React.FC<WouldYouRatherGameProps> = ({ onExit }) => {
    const WYR_DATA = use(wyrDataPromise) as { categories: WYRCategory[] };
    const singleDeck = WYR_DATA.categories.length === 1;
    const [gameState, setGameState] = useState<'CATEGORY' | 'PLAYING' | 'ROUND_END'>('CATEGORY');
    const [majorityCount, setMajorityCount] = useState(0);
    const [activeCategory, setActiveCategory] = useState<WYRCategory | null>(null);
    const [questions, setQuestions] = useState<WYRQuestion[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [selectedOption, setSelectedOption] = useState<'A' | 'B' | null>(null);

    // PIN gate state for adult category
    const [showPinGate, setShowPinGate] = useState(false);
    const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);

    const cardRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        window.scrollTo(0, 0);
        if (cardRef.current) cardRef.current.scrollTop = 0;
    }, [currentQuestionIndex]);

    const startCategory = (categoryId: string) => {
        const category = WYR_DATA.categories.find(c => c.id === categoryId);
        if (!category) return;

        if (category.adult && !isAdultUnlocked()) {
            setPendingCategoryId(categoryId);
            setShowPinGate(true);
            return;
        }

        // Filter out already-used questions for this category in this session
        const available = sessionService.filterContent(
            GameType.WOULD_YOU_RATHER,
            category.id,
            category.items,
            (q: WYRQuestion) => q.id
        );

        let pool: WYRQuestion[];
        if (available.length >= ROUND_SIZE) {
            pool = shuffle(available).slice(0, ROUND_SIZE);
        } else {
            // Pool nearly exhausted — reshuffle from all so the round can finish.
            pool = shuffle(category.items).slice(0, ROUND_SIZE);
        }

        setActiveCategory(category);
        setQuestions(pool);
        setCurrentQuestionIndex(0);
        setHasVoted(false);
        setSelectedOption(null);
        setMajorityCount(0);
        setGameState('PLAYING');
    };

    // One deck → no picker: deal straight into play on first render.
    React.useEffect(() => {
        if (singleDeck && gameState === 'CATEGORY') startCategory(WYR_DATA.categories[0].id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [singleDeck]);

    const handleVote = (option: 'A' | 'B') => {
        if (hasVoted) return;
        setHasVoted(true);
        setSelectedOption(option);
        const q = questions[currentQuestionIndex];
        if (q && (option === 'A' ? q.stats.a : q.stats.b) > 50) setMajorityCount(n => n + 1);
    };

    React.useEffect(() => {
        if (hasVoted && activeCategory && questions[currentQuestionIndex]) {
            sessionService.markAsUsed(GameType.WOULD_YOU_RATHER, activeCategory.id, questions[currentQuestionIndex].id);
        }
    }, [hasVoted, currentQuestionIndex, activeCategory, questions]);

    const nextQuestion = () => {
        if (currentQuestionIndex >= questions.length - 1) {
            setGameState('ROUND_END');
            return;
        }
        setCurrentQuestionIndex(prev => prev + 1);
        setHasVoted(false);
        setSelectedOption(null);
    };

    // ===== CATEGORY SELECT =====
    if (gameState === 'CATEGORY') {
        // Same design pattern as MLT/TOD: 3px inset left bar + 33% center
        // bottom line. Only reached when the JSON holds 2+ decks; an adult
        // deck gets an 18+ pill and the 0438 gate.
        if (singleDeck) return null;

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Would You Rather?" onBack={onExit} onHome={onExit} />
                {showPinGate && (
                    <PinGateModal
                        onSuccess={() => {
                            setShowPinGate(false);
                            if (pendingCategoryId) startCategory(pendingCategoryId);
                            setPendingCategoryId(null);
                        }}
                        onCancel={() => {
                            setShowPinGate(false);
                            setPendingCategoryId(null);
                        }}
                    />
                )}
                <p className="text-muted mb-4 text-sm text-center">
                    Ten dilemmas a round. Both options hurt.
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {WYR_DATA.categories.map(cat => {
                            const color = cat.color || '#94A3B8';
                            const Icon = (cat.icon && DECK_ICONS[cat.icon]) || Sparkles;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => startCategory(cat.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-divider rounded-xl py-3 px-4 transition-colors overflow-hidden">
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
                                                <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{cat.name}</span>
                                                    {cat.adult && (
                                                        <span className="text-[9px] font-extrabold tracking-[0.1em] text-red-500 bg-red-500/15 px-1.5 py-[2px] rounded flex-shrink-0">
                                                            18+
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-xs text-muted leading-snug truncate">{cat.tagline}</p>
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

    // ===== PLAYING =====
    const currentQuestion = questions[currentQuestionIndex];
    if (!currentQuestion) {
        return <div className="text-ink text-center p-10">Loading…</div>;
    }
    // With one deck there is no picker to go back to, so Back leaves the game.
    const goBackToCategory = () => {
        if (singleDeck) { onExit(); return; }
        setGameState('CATEGORY');
        setActiveCategory(null);
    };

    // ===== ROUND END =====
    if (gameState === 'ROUND_END') {
        const replay = () => activeCategory && startCategory(activeCategory.id);
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Would You Rather?" onBack={goBackToCategory} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-6">
                    <div className="text-5xl">⚖️</div>
                    <div>
                        <h2 className="text-2xl font-black text-ink mb-2">That's {questions.length}.</h2>
                        <p className="text-muted">
                            You went with the crowd on <span className="text-ink font-bold">{majorityCount} of {questions.length}</span>.
                        </p>
                        <p className="text-xs text-muted mt-1">
                            {majorityCount >= Math.ceil(questions.length * 0.7)
                                ? 'Reliably mainstream.'
                                : majorityCount <= Math.floor(questions.length * 0.3)
                                    ? 'A proper contrarian.'
                                    : 'Unpredictable. Nobody can call you.'}
                        </p>
                    </div>
                    <div className="w-full max-w-[340px] grid gap-3">
                        <Button onClick={replay} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2">
                            <RotateCcw size={18} /> Ten more
                        </Button>
                        <button onClick={goBackToCategory} className="text-sm text-muted hover:text-ink py-2">
                            {singleDeck ? 'Done' : 'Change deck'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader
                title={activeCategory?.name ?? 'Would You Rather?'}
                onBack={goBackToCategory}
                onHome={onExit}
                confirmOnExit
            />

            <Card
                ref={cardRef}
                className="flex flex-col flex-1 p-6 relative overflow-y-auto pb-32 safe-pb"
            >
                <div className="text-center mb-4 z-10 shrink-0">
                    <span className="text-xs font-mono text-muted">
                        Question {currentQuestionIndex + 1} / {questions.length}
                    </span>
                </div>

                <div className="flex-1 flex flex-col justify-center gap-6 z-10 pb-8">
                    {/* Option A */}
                    <button
                        onClick={() => handleVote('A')}
                        disabled={hasVoted}
                        className={`relative w-full p-6 md:p-8 rounded-2xl border-2 transition-all duration-300 text-left group flex items-center justify-between gap-4 ${hasVoted
                            ? selectedOption === 'A'
                                ? 'bg-gold/15 border-gold shadow-[0_0_15px_rgba(234,179,8,0.25)]'
                                : 'bg-surface border-divider opacity-60'
                            : 'bg-surface border-divider hover:bg-surface-alt hover:border-gold hover:shadow-lg active:scale-[0.98]'
                            }`}
                    >
                        <div className="relative z-10 flex-1">
                            <div className={`text-sm font-bold mb-2 uppercase tracking-wider ${hasVoted ? (selectedOption === 'A' ? 'text-gold' : 'text-muted') : 'text-gold'}`}>Option A</div>
                            <h3 className="text-xl md:text-3xl font-bold text-ink leading-tight">
                                {currentQuestion.optionA}
                            </h3>
                        </div>

                        {hasVoted && (
                            <div className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-lg animate-fade-in ${selectedOption === 'A'
                                ? 'bg-gold text-slate-900 border-gold/60'
                                : 'bg-surface-alt text-ink border-divider'
                                }`}>
                                <span className="text-xl font-black">{currentQuestion.stats.a}%</span>
                            </div>
                        )}
                    </button>

                    {/* OR Divider */}
                    <div className="flex items-center gap-4 text-muted font-serif italic justify-center my-2">
                        <div className="h-px bg-divider flex-1" />
                        <span>OR</span>
                        <div className="h-px bg-divider flex-1" />
                    </div>

                    {/* Option B */}
                    <button
                        onClick={() => handleVote('B')}
                        disabled={hasVoted}
                        className={`relative w-full p-6 md:p-8 rounded-2xl border-2 transition-all duration-300 text-left group flex items-center justify-between gap-4 ${hasVoted
                            ? selectedOption === 'B'
                                ? 'bg-gold/15 border-gold shadow-[0_0_15px_rgba(234,179,8,0.25)]'
                                : 'bg-surface border-divider opacity-60'
                            : 'bg-surface border-divider hover:bg-surface-alt hover:border-accent hover:shadow-lg active:scale-[0.98]'
                            }`}
                    >
                        <div className="relative z-10 flex-1">
                            <div className={`text-sm font-bold mb-2 uppercase tracking-wider ${hasVoted ? (selectedOption === 'B' ? 'text-gold' : 'text-muted') : 'text-accent'}`}>Option B</div>
                            <h3 className="text-xl md:text-3xl font-bold text-ink leading-tight">
                                {currentQuestion.optionB}
                            </h3>
                        </div>

                        {hasVoted && (
                            <div className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-lg animate-fade-in ${selectedOption === 'B'
                                ? 'bg-gold text-slate-900 border-gold/60'
                                : 'bg-surface-alt text-ink border-divider'
                                }`}>
                                <span className="text-xl font-black">{currentQuestion.stats.b}%</span>
                            </div>
                        )}
                    </button>
                </div>

                {/* Analysis & Next Button Area */}
                <div className={`mt-auto pb-10 transition-all duration-500 ease-out transform ${hasVoted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
                    {selectedOption && (() => {
                        const mine = selectedOption === 'A' ? currentQuestion.stats.a : currentQuestion.stats.b;
                        return (
                            <p className="text-center text-sm text-ink-soft mb-5">
                                {mine > 50
                                    ? <>You're with the <span className="font-bold text-ink">{mine}%</span>.</>
                                    : mine === 50
                                        ? <>Dead even. The room splits <span className="font-bold text-ink">50/50</span>.</>
                                        : <>Bold. Only <span className="font-bold text-ink">{mine}%</span> pick that.</>}
                            </p>
                        );
                    })()}

                    <Button
                        onClick={nextQuestion}
                        className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2 mb-8"
                    >
                        {currentQuestionIndex >= questions.length - 1 ? 'Finish Round' : 'Next Question'} <ArrowRight size={20} />
                    </Button>
                </div>

                <div className="absolute top-0 right-0 w-64 h-64 bg-party-secondary/5 rounded-full blur-3xl -z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-party-accent/5 rounded-full blur-3xl -z-0 pointer-events-none" />

                <div className="mt-8 text-center shrink-0">
                    <p className="text-[10px] text-muted font-mono">
                        * Splits are PartySpark's estimates, not live votes
                    </p>
                </div>
            </Card>
        </div>
    );
};
