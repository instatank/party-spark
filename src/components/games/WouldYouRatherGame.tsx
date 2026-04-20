
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
                <div className="text-center mb-6">
                    <p className="text-5xl mb-2">🤔</p>
                    <h2 className="text-xl font-serif font-bold text-white mb-1">Pick your <em>vibe</em>.</h2>
                    <p className="text-gray-400 text-sm">Vote on 10 brutal hypotheticals. Get psychoanalysed.</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3">
                        {WOULD_YOU_RATHER_CATEGORIES.map(cat => {
                            const Icon = CATEGORY_ICONS[cat.id] ?? Sparkles;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => startCategory(cat.id)}
                                    className="group relative w-full text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                                >
                                    <div className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${cat.gradient} opacity-0 group-hover:opacity-10 transition-opacity blur-xl`} />
                                    <div className="bg-white/5 border border-white/10 hover:bg-white/[0.07] hover:border-white/20 backdrop-blur-sm p-5 rounded-2xl shadow-xl transition-colors relative overflow-hidden">
                                        <div className="relative z-10 flex items-center justify-between p-1">
                                            <div className="flex-1 pr-3">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <Icon className={cat.accentText} size={20} />
                                                    <h3 className="text-xl font-bold text-white">
                                                        {cat.title}
                                                        {cat.adult && <span className="ml-2 text-[10px] bg-white/10 px-1.5 py-0.5 rounded uppercase tracking-wider text-gray-300">Adults Only</span>}
                                                    </h3>
                                                </div>
                                                <p className="text-sm text-gray-300">{cat.tagline}</p>
                                            </div>
                                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${cat.gradient} flex items-center justify-center shadow-lg ${cat.shadow} group-hover:shadow-xl transition-shadow flex-shrink-0`}>
                                                <ChevronRight className="text-white" size={20} />
                                            </div>
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
        return <div className="text-white text-center p-10">Loading…</div>;
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
                    <span className="text-xs font-mono text-gray-500">
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
                            : 'bg-party-dark border-white/10 hover:bg-party-dark/80 hover:border-party-secondary hover:shadow-lg active:scale-[0.98]'
                            }`}
                    >
                        <div className="relative z-10 flex-1">
                            <div className={`text-sm font-bold mb-2 uppercase tracking-wider ${hasVoted ? (selectedOption === 'A' ? 'text-green-300' : 'text-red-300') : 'text-party-secondary'}`}>Option A</div>
                            <h3 className="text-xl md:text-3xl font-bold text-white leading-tight">
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
                    <div className="flex items-center gap-4 text-gray-500 font-serif italic justify-center my-2">
                        <div className="h-px bg-gray-700 flex-1" />
                        <span>OR</span>
                        <div className="h-px bg-gray-700 flex-1" />
                    </div>

                    {/* Option B */}
                    <button
                        onClick={() => handleVote('B')}
                        disabled={hasVoted}
                        className={`relative w-full p-6 md:p-8 rounded-2xl border-2 transition-all duration-300 text-left group flex items-center justify-between gap-4 ${hasVoted
                            ? selectedOption === 'B'
                                ? 'bg-green-600/30 border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.3)]'
                                : 'bg-red-600/30 border-red-500 opacity-60'
                            : 'bg-party-dark border-white/10 hover:bg-party-dark/80 hover:border-party-accent hover:shadow-lg active:scale-[0.98]'
                            }`}
                    >
                        <div className="relative z-10 flex-1">
                            <div className={`text-sm font-bold mb-2 uppercase tracking-wider ${hasVoted ? (selectedOption === 'B' ? 'text-green-300' : 'text-red-300') : 'text-party-accent'}`}>Option B</div>
                            <h3 className="text-xl md:text-3xl font-bold text-white leading-tight">
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
                    <div className="bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 mb-6">
                        <div className="flex items-start gap-3">
                            <div className="p-2 bg-purple-500/20 rounded-lg shrink-0">
                                <Brain className="w-5 h-5 text-purple-300" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-purple-200 uppercase tracking-wider mb-1">
                                    Psychoanalysis
                                </h4>
                                <p className="text-gray-100 italic leading-relaxed">
                                    {analysis}
                                </p>
                            </div>
                        </div>
                    </div>

                    <Button
                        onClick={nextQuestion}
                        className="w-full py-4 text-lg bg-white text-party-dark hover:bg-gray-200 font-bold flex items-center justify-center gap-2 shadow-lg shadow-white/10 mb-8"
                    >
                        {currentQuestionIndex >= questions.length - 1 ? 'Finish Round' : 'Next Question'} <ArrowRight size={20} />
                    </Button>
                </div>

                <div className="absolute top-0 right-0 w-64 h-64 bg-party-secondary/5 rounded-full blur-3xl -z-0 pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-party-accent/5 rounded-full blur-3xl -z-0 pointer-events-none" />

                <div className="mt-8 text-center shrink-0">
                    <p className="text-[10px] text-white/30 font-mono">
                        * Percentages represent global player votes
                    </p>
                </div>
            </Card>
        </div>
    );
};
