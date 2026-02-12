
import React, { useState } from 'react';
import { Card, Button } from '../ui/Layout';
import { Home, ArrowLeft, ArrowRight, Brain } from 'lucide-react';
import WOULD_YOU_RATHER_DATA from '../../data/would_you_rather.json';
import { sessionService } from '../../services/SessionManager';
import { generateWouldYouRatherQuestions } from '../../services/geminiService';
import { GameType } from '../../types';

interface WouldYouRatherGameProps {
    onExit: () => void;
}

export const WouldYouRatherGame: React.FC<WouldYouRatherGameProps> = ({ onExit }) => {
    // State
    const [questions, setQuestions] = useState<typeof WOULD_YOU_RATHER_DATA>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [hasVoted, setHasVoted] = useState(false);
    const [selectedOption, setSelectedOption] = useState<'A' | 'B' | null>(null);
    // Analysis is now part of the data, so we just track if we should show it

    // Initialize game with unique questions
    React.useEffect(() => {
        const initGame = async () => {
            // 1. Filter Local Data
            const availableLocal = sessionService.filterContent(
                GameType.WOULD_YOU_RATHER,
                'general',
                WOULD_YOU_RATHER_DATA,
                (q) => q.id
            );

            let selectedQuestions: any[] = [];

            // 2. Need 10 questions
            if (availableLocal.length >= 10) {
                // Enough local content
                const shuffled = [...availableLocal].sort(() => 0.5 - Math.random());
                selectedQuestions = shuffled.slice(0, 10);
            } else {
                // Not enough local content, use what's left and generate the rest
                selectedQuestions = [...availableLocal];
                const countNeeded = 10 - selectedQuestions.length;

                try {
                    console.log(`Generating ${countNeeded} new WYR questions...`);
                    const newQuestions = await generateWouldYouRatherQuestions(countNeeded);
                    selectedQuestions = [...selectedQuestions, ...newQuestions];
                } catch (error) {
                    console.error("Failed to generate fallback questions", error);
                    // Fallback to allowing repeats if generation fails
                    const shuffled = [...WOULD_YOU_RATHER_DATA].sort(() => 0.5 - Math.random());
                    const filler = shuffled.slice(0, countNeeded);
                    selectedQuestions = [...selectedQuestions, ...filler];
                }
            }

            setQuestions(selectedQuestions);
        };

        initGame();
    }, []);

    // Scroll to top on new question
    const cardRef = React.useRef<HTMLDivElement>(null);
    React.useEffect(() => {
        window.scrollTo(0, 0);
        if (cardRef.current) {
            cardRef.current.scrollTop = 0;
        }
    }, [currentQuestionIndex]);

    const currentQuestion = questions[currentQuestionIndex];

    // Touch handling state
    // Mark as used when voted
    React.useEffect(() => {
        if (hasVoted && currentQuestion) {
            sessionService.markAsUsed(GameType.WOULD_YOU_RATHER, 'general', currentQuestion.id);
        }
    }, [hasVoted, currentQuestion]);

    // If questions haven't loaded yet
    if (!currentQuestion) return <div className="text-white text-center p-10">Loading questions...</div>;

    const handleVote = (option: 'A' | 'B') => {
        if (hasVoted) return;
        setHasVoted(true);
        setSelectedOption(option);
    };

    const nextQuestion = () => {
        if (currentQuestionIndex >= questions.length - 1) {
            // End of round - strictly 10 questions
            onExit();
            return;
        }
        setCurrentQuestionIndex(prev => prev + 1);
        setHasVoted(false);
        setSelectedOption(null);
    };

    const analysis = selectedOption === 'A' ? currentQuestion.analysisA : currentQuestion.analysisB;

    return (
        <Card
            ref={cardRef}
            className="flex flex-col min-h-screen p-6 relative overflow-y-auto pb-32 safe-pb"
        >
            {/* Header */}
            <div className="flex items-center justify-between mb-8 z-10 shrink-0">
                <Button variant="ghost" onClick={onExit} className="!p-2 -ml-2">
                    <ArrowLeft />
                </Button>

                <div className="text-center">
                    <h2 className="text-2xl font-bold font-serif text-party-secondary uppercase tracking-widest">
                        Would You Rather?
                    </h2>
                    <span className="text-xs font-mono text-gray-500">
                        Question {currentQuestionIndex + 1} / {questions.length}
                    </span>
                </div>

                <Button variant="ghost" onClick={onExit} className="!p-2 text-gray-400 hover:text-white">
                    <Home size={20} />
                </Button>
            </div>

            {/* Game Area */}
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
                {/* Analysis Box */}
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
                    Next Question <ArrowRight size={20} />
                </Button>
            </div>

            {/* Background Decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-party-secondary/5 rounded-full blur-3xl -z-0 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-party-accent/5 rounded-full blur-3xl -z-0 pointer-events-none" />

            {/* Stats Disclaimer */}
            <div className="mt-8 text-center shrink-0">
                <p className="text-[10px] text-white/30 font-mono">
                    * Percentages represent global player votes
                </p>
            </div>
        </Card>
    );
};
