import React, { useState } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
import { generateTriviaQuestions } from '../../services/geminiService';
import type { TriviaQuestion } from '../../types';
import { Brain } from 'lucide-react';

interface Props {
    onExit: () => void;
}

import { TRIVIA_CATEGORIES } from '../../constants';

export const TriviaGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'CATEGORY' | 'LOADING' | 'PLAYING' | 'SUMMARY'>('CATEGORY');
    const [questions, setQuestions] = useState<TriviaQuestion[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [selectedOption, setSelectedOption] = useState<string | null>(null);
    const [revealed, setRevealed] = useState(false);
    const [currentCategory, setCurrentCategory] = useState("");

    const startGame = async (category: string) => {
        setCurrentCategory(category);
        setGameState('LOADING');
        const qs = await generateTriviaQuestions(category, 5);
        setQuestions(qs);
        setScore(0);
        setCurrentIndex(0);
        setGameState('PLAYING');
    };

    const handleSelect = (opt: string) => {
        if (revealed) return;
        setSelectedOption(opt);
        setRevealed(true);

        if (opt === questions[currentIndex].answer) {
            setScore(s => s + 1);
        }
    };

    const handleNext = () => {
        setSelectedOption(null);
        setRevealed(false);
        if (currentIndex < questions.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            setGameState('SUMMARY');
        }
    };

    const handleBack = () => {
        if (gameState === 'CATEGORY') onExit();
        else if (gameState === 'SUMMARY') setGameState('CATEGORY');
        else setGameState('CATEGORY'); // Abort game
    };

    if (gameState === 'CATEGORY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Trivia Categories" onBack={onExit} onHome={onExit} />
                <div className="grid grid-cols-1 gap-4 mt-4">
                    {TRIVIA_CATEGORIES.map(cat => (
                        <Card
                            key={cat.id}
                            onClick={() => startGame(cat.id)}
                            className={`hover:scale-[1.02] transition-transform active:scale-95 cursor-pointer flex items-center gap-4 bg-party-surface border border-white/5`}
                        >
                            <div className={`p-3 rounded-full bg-white/5 ${cat.color} shadow-lg`}>
                                {cat.icon}
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-white">{cat.label}</h3>
                                <p className="text-sm opacity-70 text-gray-400">5 Question Blitz</p>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        );
    }

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Preparing Round..." onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-party-accent border-t-transparent rounded-full animate-spin"></div>
                        <Brain className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-party-accent animate-pulse" size={24} />
                    </div>
                    <p className="text-xl font-medium animate-pulse text-center">
                        Curating {currentCategory} questions...
                    </p>
                </div>
            </div>
        );
    }

    if (gameState === 'SUMMARY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Round Complete" onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold mb-2 text-gray-200">You Scored</h2>
                    </div>

                    <div className="relative">
                        <div className="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-br from-party-accent to-blue-500">
                            {score}/{questions.length}
                        </div>
                        {score === questions.length && (
                            <div className="absolute -top-6 -right-6 text-4xl animate-bounce">🏆</div>
                        )}
                    </div>

                    <p className="text-gray-400 text-lg">
                        {score === questions.length ? "Perfect Score! You're a genius!" :
                            score > questions.length / 2 ? "Great job!" : "Better luck next time!"}
                    </p>

                    <div className="flex flex-col gap-3 w-full mt-8">
                        <Button onClick={() => setGameState('CATEGORY')} fullWidth>Play Another Round</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Exit to Home</Button>
                    </div>
                </div>
            </div>
        );
    }

    const currentQ = questions[currentIndex];

    return (
        <div className="h-full flex flex-col max-w-md mx-auto">
            <div className="flex items-center justify-between mb-6 pt-4">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" className="!p-2" onClick={handleBack}><span className="text-2xl">←</span></Button>
                    <div>
                        <h1 className="text-sm text-gray-400 font-bold uppercase tracking-wider">{currentCategory}</h1>
                        <div className="text-xs text-party-accent">Question {currentIndex + 1} of {questions.length}</div>
                    </div>
                </div>
                <div className="bg-party-surface px-4 py-1 rounded-full border border-white/10 font-mono font-bold">
                    Score: {score}
                </div>
            </div>

            <Card className="mb-6 bg-party-surface border-white/5 min-h-[140px] flex items-center justify-center shadow-lg">
                <h2 className="text-xl md:text-2xl font-bold leading-relaxed w-full text-center px-4">
                    {currentQ.question}
                </h2>
            </Card>

            <div className="space-y-3 flex-1 overflow-y-auto">
                {currentQ.options.map((opt, i) => {
                    let btnVariant: 'secondary' | 'primary' | 'danger' = 'secondary';
                    let btnClass = "text-left transition-all duration-300 py-4 ";

                    if (revealed) {
                        if (opt === currentQ.answer) {
                            btnClass += "bg-green-500/20 border-green-500 text-green-100 ring-2 ring-green-500/50";
                        } else if (opt === selectedOption) {
                            btnClass += "bg-red-500/20 border-red-500 text-red-100";
                        } else {
                            btnClass += "opacity-40";
                        }
                    } else {
                        btnClass += "bg-party-surface hover:bg-slate-600 border-white/5 text-white";
                    }

                    return (
                        <Button
                            key={i}
                            fullWidth
                            variant={btnVariant}
                            className={btnClass}
                            onClick={() => handleSelect(opt)}
                            disabled={revealed}
                        >
                            <span className="font-bold mr-3 opacity-50 w-6 inline-block">{String.fromCharCode(65 + i)}.</span>
                            {opt}
                        </Button>
                    );
                })}
            </div>

            {revealed && (
                <div className="mt-6 animate-slide-up pb-4">
                    {currentQ.funFact && (
                        <div className="bg-indigo-900/30 border border-indigo-500/30 p-4 rounded-xl mb-4 text-sm text-indigo-100">
                            <span className="font-bold text-indigo-400 block mb-1 text-xs uppercase tracking-wider">Fun Fact</span>
                            {currentQ.funFact}
                        </div>
                    )}
                    <Button fullWidth onClick={handleNext} variant="primary" className="py-4 text-lg shadow-xl shadow-indigo-500/20">
                        {currentIndex < questions.length - 1 ? "Next Question" : "Finish Round"}
                    </Button>
                </div>
            )}
        </div>
    );
};
