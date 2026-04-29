
import React, { useState } from 'react';
import { Card, Button } from '../ui/Layout';
import { ScreenHeader } from '../ui/Layout';
import { ArrowRight, Brain, ChevronRight, Sparkles, Compass, Film, Flame } from 'lucide-react';
import WYR_DATA from '../../data/would_you_rather.json';
import { WOULD_YOU_RATHER_CATEGORIES } from '../../constants';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
    classic_chaos: Sparkles,
    deep_revealing: Brain,
    travel_living: Compass,
    pop_culture: Film,
    spicy: Flame,
};

interface WYRQuestion {
    id: string;
    optionA: string;
    optionB: string;
    stats: { a: number; b: number };
    analysisA: string;
    analysisB: string;
}

interface WYRCategory {
    id: string;
    name: string;
    adult: boolean;
    items: WYRQuestion[];
}

interface WouldYouRatherGameProps {
    onExit: () => void;
}

const ROUND_SIZE = 10;

export const WouldYouRatherGame: React.FC<WouldYouRatherGameProps> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'CATEGORY' | 'PLAYING'>('CATEGORY');
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
        const category = (WYR_DATA as { categories: WYRCategory[] }).categories.find(c => c.id === categoryId);
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
            pool = [...available].sort(() => 0.5 - Math.random()).slice(0, ROUND_SIZE);
        } else {
            // Reset session tracking — full deck nearly exhausted, reshuffle from all
            pool = [...category.items].sort(() => 0.5 - Math.random()).slice(0, ROUND_SIZE);
        }

        setActiveCategory(category);
        setQuestions(pool);
        setCurrentQuestionIndex(0);
        setHasVoted(false);
        setSelectedOption(null);
        setGameState('PLAYING');
    };

    const handleVote = (option: 'A' | 'B') => {
        if (hasVoted) return;
        setHasVoted(true);
        setSelectedOption(option);
    };

    React.useEffect(() => {
        if (hasVoted && activeCategory && questions[currentQuestionIndex]) {
            sessionService.markAsUsed(GameType.WOULD_YOU_RATHER, activeCategory.id, questions[currentQuestionIndex].id);
        }
    }, [hasVoted, currentQuestionIndex, activeCategory, questions]);

    const nextQuestion = () => {
        if (currentQuestionIndex >= questions.length - 1) {
            setGameState('CATEGORY');
            setActiveCategory(null);
            return;
        }
        setCurrentQuestionIndex(prev => prev + 1);
        setHasVoted(false);
        setSelectedOption(null);
    };

    // ===== CATEGORY SELECT =====
    if (gameState === 'CATEGORY') {
        // Same design pattern as MLT/TOD: 3px inset left bar + 33% center
        // bottom line. WYR has no AI custom-vibe deck. The single 'spicy'
        // category is adult-gated and gets an 18+ pill.
        const TILES: Record<string, string> = {
            classic_chaos:  '#6366F1', // indigo-500
            deep_revealing: '#A855F7', // purple-500
            travel_living:  '#10B981', // emerald-500
            pop_culture:    '#EC4899', // pink-500
            spicy:          '#F43F5E', // rose-500
        };

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
                    Vote on 10 brutal hypotheticals. Get psychoanalysed.
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {WOULD_YOU_RATHER_CATEGORIES.map(cat => {
                            const Icon = CATEGORY_ICONS[cat.id] ?? Sparkles;
                            const color = TILES[cat.id] || '#94A3B8';
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
                                                    <span className="truncate">{cat.title}</span>
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
    const analysis = selectedOption === 'A' ? currentQuestion.analysisA : currentQuestion.analysisB;
    const goBackToCategory = () => {
        setGameState('CATEGORY');
        setActiveCategory(null);
    };

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader
                title={activeCategory?.name ?? 'Would You Rather?'}
                onBack={goBackToCategory}
                onHome={onExit}
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
                                ? 'bg-green-600/30 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                : 'bg-red-600/30 border-red-500 opacity-60'
                            : 'bg-surface border-divider hover:bg-surface-alt hover:border-gold hover:shadow-lg active:scale-[0.98]'
                            }`}
                    >
                        <div className="relative z-10 flex-1">
                            <div className={`text-sm font-bold mb-2 uppercase tracking-wider ${hasVoted ? (selectedOption === 'A' ? 'text-green-500' : 'text-red-500') : 'text-gold'}`}>Option A</div>
                            <h3 className="text-xl md:text-3xl font-bold text-ink leading-tight">
                                {currentQuestion.optionA}
                            </h3>
                        </div>

                        {hasVoted && (
                            <div className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-lg animate-fade-in ${currentQuestion.stats.a >= 50
                                ? 'bg-green-500 text-white border-green-400'
                                : 'bg-red-500 text-white border-red-400'
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
                                ? 'bg-green-600/30 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                : 'bg-red-600/30 border-red-500 opacity-60'
                            : 'bg-surface border-divider hover:bg-surface-alt hover:border-accent hover:shadow-lg active:scale-[0.98]'
                            }`}
                    >
                        <div className="relative z-10 flex-1">
                            <div className={`text-sm font-bold mb-2 uppercase tracking-wider ${hasVoted ? (selectedOption === 'B' ? 'text-green-500' : 'text-red-500') : 'text-accent'}`}>Option B</div>
                            <h3 className="text-xl md:text-3xl font-bold text-ink leading-tight">
                                {currentQuestion.optionB}
                            </h3>
                        </div>

                        {hasVoted && (
                            <div className={`shrink-0 w-16 h-16 rounded-full flex items-center justify-center border-4 shadow-lg animate-fade-in ${currentQuestion.stats.b >= 50
                                ? 'bg-green-500 text-white border-green-400'
                                : 'bg-red-500 text-white border-red-400'
                                }`}>
                                <span className="text-xl font-black">{currentQuestion.stats.b}%</span>
                            </div>
                        )}
                    </button>
                </div>

                {/* Analysis & Next Button Area */}
                <div className={`mt-auto pb-10 transition-all duration-500 ease-out transform ${hasVoted ? 'translate-y-0 opacity-100' : 'translate-y-10 opacity-0 pointer-events-none'}`}>
                    <div className="bg-app-tint backdrop-blur-md rounded-xl p-4 border border-divider mb-6">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-purple-500/20 rounded-lg shrink-0">
                                <Brain className="w-5 h-5 text-vibe" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-vibe uppercase tracking-wider mb-1">
                                    Psychoanalysis
                                </h4>
                                <p className="text-ink-soft italic leading-relaxed">
                                    {analysis}
                                </p>
                            </div>
                        </div>
                    </div>

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
                        * Percentages represent global player votes
                    </p>
                </div>
            </Card>
        </div>
    );
};
