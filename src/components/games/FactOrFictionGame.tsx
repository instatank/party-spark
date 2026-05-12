import React, { useState, useEffect, useRef } from 'react';
import { Card, ScreenHeader, Button } from '../ui/Layout';
import { Check, X, Clock, Trophy, AlertTriangle, ArrowRight, ChevronRight, PawPrint, Atom, Lightbulb, Medal, Landmark, Brain } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import factData from '../../data/fact_or_fiction.json';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';
import TeamRosterRow from '../ui/TeamRosterRow';

interface Question {
    id: string;
    text: string;
    isFact: boolean;
    explanation: string;
    difficultyLevel: number;
}

interface Category {
    id: string;
    name: string;
    questions: Question[];
}

const TIMER_SECONDS = 15;
const MAX_STRIKES = 3;

// Per-topic Slim Row metadata (icon + accent + one-line tagline), keyed by the
// category id in fact_or_fiction.json. Unknown ids fall back to a neutral pill.
const TOPIC_META: Record<string, { tagline: string; color: string; Icon: LucideIcon }> = {
    animal_kingdom:    { tagline: 'Creatures, instincts, oddities.',  color: '#22C55E', Icon: PawPrint },
    science:           { tagline: 'Physics, space, the very small.',  color: '#6366F1', Icon: Atom },
    general_knowledge: { tagline: 'A bit of everything — stay sharp.', color: '#F59E0B', Icon: Lightbulb },
    sports:            { tagline: 'Records, rules, legends.',         color: '#EF4444', Icon: Medal },
    history:           { tagline: 'Empires, firsts, turning points.', color: '#A855F7', Icon: Landmark },
};
const TOPIC_DEFAULT = { color: '#EC4899', Icon: Brain };

export const FactOrFictionGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [difficulty, setDifficulty] = useState(1);
    const [score, setScore] = useState(0);
    const [strikes, setStrikes] = useState(0);
    const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
    const [gameState, setGameState] = useState<'category_select' | 'playing' | 'answer_reveal' | 'team_transition' | 'round_over'>('category_select');

    // Team mode: opt-in via TeamRosterRow on the category-select screen. Each
    // team plays solo until they hit 3 strikes, then passes the phone. Strikes
    // and difficulty reset per team; the question pool is shared (so Team B
    // gets questions Team A didn't see). Solo mode (teams=[]) preserves the
    // original single-player flow.
    const [teams, setTeams] = useState<string[]>(() => sessionService.getTeams());
    const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
    const [teamScores, setTeamScores] = useState<number[]>([]);
    
    // Tracks state of current question
    const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
    const [wrongStreak, setWrongStreak] = useState(0);
    const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    
    // Guard against double-firing on timer expiry
    const answeredRef = useRef(false);

    const categories = factData.categories as Category[];

    const handleCategorySelect = (category: Category) => {
        // Drop questions already played this session for the chosen category;
        // fall back to the full pool if the player has exhausted it.
        const filtered = sessionService.filterContent(
            GameType.FACT_OR_FICTION,
            category.id,
            category.questions,
            (q) => q.id,
        );
        const startingPool = filtered.length > 0 ? filtered : category.questions;
        setSelectedCategory(category);
        setAvailableQuestions([...startingPool]);
        setDifficulty(1);
        setScore(0);
        setStrikes(0);
        setWrongStreak(0);
        answeredRef.current = false;
        // Team mode setup: zero out match-level state on first entry.
        setCurrentTeamIndex(0);
        setTeamScores([]);
        if (teams.length >= 2) {
            // Don't auto-start — let the first team see who's up via the
            // team_transition screen.
            setGameState('team_transition');
            setTimeLeft(TIMER_SECONDS);
            return;
        }
        loadNextQuestion(startingPool, 1, category.id);
        setGameState('playing');
        setTimeLeft(TIMER_SECONDS);
    };

    // Pull the next question and put the new team on the clock. Used both
    // on initial entry into team mode and on every team-handoff after that.
    const startCurrentTeamRound = () => {
        setScore(0);
        setStrikes(0);
        setWrongStreak(0);
        setDifficulty(1);
        setTimeLeft(TIMER_SECONDS);
        answeredRef.current = false;
        loadNextQuestion(availableQuestions, 1);
        setGameState('playing');
    };

    // categoryIdOverride is only needed on the very first load — at that point
    // the selectedCategory state hasn't propagated through the closure yet.
    // Subsequent calls fall back to reading state, which is up-to-date.
    const loadNextQuestion = (questionsPool: Question[], currentDiff: number, categoryIdOverride?: string) => {
        const categoryId = categoryIdOverride ?? selectedCategory?.id;
        // Try to find a question matching exact difficulty
        const exactMatches = questionsPool.filter(q => q.difficultyLevel === currentDiff);
        
        let poolToDrawFrom = exactMatches;
        
        // If we ran out of exact difficulty questions, just take any remaining closest difficulty
        if (poolToDrawFrom.length === 0) {
            poolToDrawFrom = questionsPool.filter(q => q.difficultyLevel <= currentDiff);
        }
        
        // Failsafe: if completely empty pool or filters failed, just take ANY remaining question
        if (poolToDrawFrom.length === 0 && questionsPool.length > 0) {
            poolToDrawFrom = questionsPool;
        }

        if (poolToDrawFrom.length > 0) {
            // Pick random from valid pool
            const q = poolToDrawFrom[Math.floor(Math.random() * poolToDrawFrom.length)];
            setCurrentQuestion(q);

            // Remove it from this round's available pool, and record it on the
            // session so it won't reappear if the user replays the category later.
            setAvailableQuestions(prev => prev.filter(item => item.id !== q.id));
            if (categoryId) {
                sessionService.markAsUsed(GameType.FACT_OR_FICTION, categoryId, q.id);
            }
        } else {
            // Out of questions
            setGameState('round_over');
        }
    };

    // Timer Effect — uses a ref flag to prevent double-fire
    useEffect(() => {
        if (gameState !== 'playing') return;
        answeredRef.current = false;

        const timer = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timer);
                    // Trigger timeout as incorrect answer
                    setTimeout(() => {
                        if (!answeredRef.current) {
                            answeredRef.current = true;
                            handleTimedOut();
                        }
                    }, 0);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [gameState, currentQuestion]);

    // Separate handler for time-out so it doesn't conflict with the answeredRef guard
    const handleTimedOut = () => {
        if (!currentQuestion) return;
        // Count as incorrect (null guess = no answer = wrong)
        setLastAnswerCorrect(false);
        const newStreak = wrongStreak + 1;
        setWrongStreak(newStreak);
        setStrikes(prev => prev + 1);
        if (newStreak >= 2) {
            setDifficulty(prev => Math.max(1, prev - 1));
            setWrongStreak(0);
        }
        setGameState('answer_reveal');
    };

    // Handler for manual FACT/FICTION button clicks
    const handleAnswer = (guessedFact: boolean) => {
        if (!currentQuestion) return;
        if (answeredRef.current) return; // Prevent double-fire if timer also fires
        answeredRef.current = true;

        const isCorrect = guessedFact === currentQuestion.isFact;
        setLastAnswerCorrect(isCorrect);

        if (isCorrect) {
            setScore(prev => prev + 1);
            setWrongStreak(0);
            setDifficulty(prev => Math.min(10, prev + 1));
        } else {
            const newStreak = wrongStreak + 1;
            setWrongStreak(newStreak);
            setStrikes(prev => prev + 1);
            if (newStreak >= 2) {
                setDifficulty(prev => Math.max(1, prev - 1));
                setWrongStreak(0);
            }
        }
        setGameState('answer_reveal');
    };


    const nextRound = () => {
        if (strikes >= MAX_STRIKES) {
            // This team is out. In team mode with more teams to go, hand off
            // via the team_transition screen; otherwise wrap up the match.
            if (teams.length >= 2) {
                const tallied = [...teamScores, score];
                setTeamScores(tallied);
                if (currentTeamIndex < teams.length - 1) {
                    setCurrentTeamIndex(i => i + 1);
                    setGameState('team_transition');
                    return;
                }
            }
            setGameState('round_over');
        } else {
            loadNextQuestion(availableQuestions, difficulty);
            setGameState('playing');
            setTimeLeft(TIMER_SECONDS);
        }
    };

    // ------------------------------------------
    // RENDER SCREENS
    // ------------------------------------------

    if (gameState === 'category_select') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Fact or Fiction" onBack={onExit} onHome={onExit} />
                {/* Game-home hero — same compact pattern as Forecast / TOD / MLT.
                    -mt-3 closes the dead gap below ScreenHeader. */}
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🤔</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">Can you tell what's <em>actually</em> true?</h2>
                    <p className="text-muted text-sm">Race the clock. 3 strikes — you're out.</p>
                </div>
                <div className="px-2 pb-6 flex-1 flex flex-col">
                    <TeamRosterRow teams={teams} onTeamsChange={setTeams} />
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {categories.map(cat => {
                            const meta = TOPIC_META[cat.id];
                            const color = meta?.color ?? TOPIC_DEFAULT.color;
                            const Icon = meta?.Icon ?? TOPIC_DEFAULT.Icon;
                            const tagline = meta?.tagline ?? `${cat.questions.length} questions`;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(cat)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: color }} />
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: color }} />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color }}><Icon size={16} /></span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight">{cat.name}</h3>
                                                <p className="text-xs text-muted leading-snug truncate">{tagline}</p>
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

    if (gameState === 'team_transition') {
        const upName = teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`;
        const isFirst = currentTeamIndex === 0;
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader
                    title={`Team ${currentTeamIndex + 1} of ${teams.length}`}
                    onBack={() => setGameState('category_select')}
                    onHome={onExit}
                />
                <Card className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted mb-3">Up next</p>
                    <h2 className="text-5xl font-black text-ink mb-6">{upName}</h2>
                    {!isFirst && teamScores.length > 0 && (
                        <div className="bg-surface-alt border border-divider rounded-xl px-4 py-3 max-w-[280px] w-full mb-6">
                            <p className="text-xs uppercase tracking-wider text-muted mb-1.5 text-center">Standings so far</p>
                            <div className="space-y-1">
                                {teamScores.map((s, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                        <span className="text-ink-soft truncate">{teams[i] || `Team ${i + 1}`}</span>
                                        <span className="font-bold text-ink ml-3">{s}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-muted mb-8 max-w-[280px]">
                        Pass the phone. {MAX_STRIKES} strikes and your turn ends.
                    </p>
                    <Button onClick={startCurrentTeamRound} className="w-full">
                        Start {upName}'s Turn
                    </Button>
                </Card>
            </div>
        );
    }

    if (gameState === 'round_over') {
        const inTeamMode = teamScores.length > 0;
        const ranked = inTeamMode
            ? teamScores
                .map((s, i) => ({ name: teams[i] || `Team ${i + 1}`, score: s }))
                .sort((a, b) => b.score - a.score)
            : [];
        const winner = ranked[0];
        const tiedTop = inTeamMode && ranked.filter(r => r.score === winner.score).length > 1;
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Round Summary" onBack={() => setGameState('category_select')} onHome={onExit} />
                <Card className="flex-1 flex flex-col items-center justify-center p-8 text-center border-rose-500/30">
                    <Trophy size={64} className="text-rose-500 mb-6" />
                    {inTeamMode ? (
                        <>
                            <h2 className="text-3xl font-serif font-bold text-ink mb-1">Match Over</h2>
                            {tiedTop ? (
                                <p className="text-muted mb-6">It's a tie at the top.</p>
                            ) : (
                                <p className="text-muted mb-6">
                                    <span className="font-bold text-ink">{winner.name}</span> takes the round.
                                </p>
                            )}
                            <div className="w-full max-w-[320px] space-y-2 mb-8">
                                {ranked.map((r, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                                            i === 0
                                                ? 'bg-rose-500/15 border-rose-500/50 text-ink'
                                                : 'bg-surface-alt border-divider text-ink-soft'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {i === 0 && <Trophy size={16} className="text-rose-500 flex-shrink-0" />}
                                            <span className="font-bold truncate">{r.name}</span>
                                        </div>
                                        <span className="text-2xl font-black ml-3">{r.score}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <h2 className="text-3xl font-serif font-bold text-ink mb-2">Game Over!</h2>
                            <p className="text-muted mb-6">
                                You survived {score} rapid-fire questions in {selectedCategory?.name}!
                            </p>
                            <div className="bg-surface-alt w-full p-6 rounded-2xl border border-divider-soft mb-8">
                                <p className="text-sm uppercase tracking-widest text-muted font-bold mb-2">Survived</p>
                                <p className="text-6xl font-black text-rose-500">{score}<span className="text-3xl text-muted"> Facts</span></p>
                            </div>
                        </>
                    )}

                    <Button onClick={() => setGameState('category_select')} className="w-full mb-3" variant="primary">
                        Play Another Category
                    </Button>
                    <Button onClick={onExit} variant="ghost" className="w-full">
                        Back to Home
                    </Button>
                </Card>
            </div>
        );
    }

    if (gameState === 'answer_reveal' && currentQuestion) {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Result" onBack={() => setGameState('playing')} onHome={onExit} />
                <Card className={`flex-1 flex flex-col items-center justify-center p-8 text-center transition-colors duration-500 ${lastAnswerCorrect ? 'bg-green-900/20 border-green-500/30' : 'bg-red-900/20 border-red-500/30'}`}>
                    
                    {lastAnswerCorrect ? (
                        <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(34,197,94,0.4)]">
                            <Check size={48} className="text-white" />
                        </div>
                    ) : (
                        <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(239,68,68,0.4)] animate-shake">
                            <X size={48} className="text-white" />
                        </div>
                    )}

                    <h2 className={`text-4xl font-black mb-2 ${lastAnswerCorrect ? 'text-green-500' : 'text-red-500'}`}>
                        {lastAnswerCorrect ? 'CORRECT!' : (timeLeft === 0 ? "⏱ TIME'S UP!" : 'INCORRECT!')}
                    </h2>
                    
                    <div className="bg-surface-alt p-6 rounded-2xl border border-divider my-6 w-full relative overflow-hidden">
                        <div className={`absolute top-0 left-0 w-full h-1 ${currentQuestion.isFact ? 'bg-green-500' : 'bg-red-500'}`} />
                        <p className="text-sm tracking-widest text-muted font-bold mb-2 uppercase">
                            The truth is: {currentQuestion.isFact ? 'FACT' : 'FICTION'}
                        </p>
                        <p className="text-lg text-ink font-medium italic">
                            "{currentQuestion.explanation}"
                        </p>
                    </div>

                    <Button onClick={nextRound} className="w-full py-4 text-lg">
                        {strikes >= MAX_STRIKES && teams.length >= 2 && currentTeamIndex < teams.length - 1
                            ? <>Pass to {teams[currentTeamIndex + 1] || `Team ${currentTeamIndex + 2}`} <ArrowRight className="inline ml-2" size={20} /></>
                            : <>Next Question <ArrowRight className="inline ml-2" size={20} /></>
                        }
                    </Button>
                </Card>
            </div>
        );
    }

    // PLAYING STATE
    return (
        <div className="flex flex-col h-full animate-fade-in relative z-10">
            <ScreenHeader title={selectedCategory?.name || "Fact or Fiction"} onBack={() => setGameState('category_select')} onHome={onExit} />
            
            {/* Top Bar Details */}
            <div className="flex justify-between items-center px-2 mb-4">
                <div className="flex items-center gap-2">
                    <span className="text-rose-500 font-black text-xl">{score}</span>
                    {teams.length >= 2 ? (
                        <span className="text-xs text-muted font-bold tracking-wider uppercase truncate max-w-[100px]">
                            {teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`}
                        </span>
                    ) : (
                        <span className="text-xs text-muted font-bold tracking-widest uppercase">Score</span>
                    )}
                </div>
                <div className="flex items-center gap-2 bg-surface-alt px-3 py-1.5 rounded-full border border-divider">
                    <AlertTriangle size={14} className="text-amber-500" />
                    <span className="text-xs font-bold text-ink-soft uppercase">Lv {difficulty}</span>
                </div>
                <div className="flex gap-1 items-center">
                    <span className="text-[10px] text-muted font-bold uppercase tracking-widest mr-1">Strikes</span>
                    {[...Array(MAX_STRIKES)].map((_, i) => (
                        <X key={i} size={18} className={i < strikes ? 'text-red-500 stroke-[3px]' : 'text-divider stroke-[3px]'} />
                    ))}
                </div>
            </div>

            <Card className="flex-1 flex flex-col p-6">
                
                {/* Timer Bar */}
                <div className="mb-8">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm text-muted font-bold uppercase tracking-wider flex items-center gap-2">
                            <Clock size={16} /> Time
                        </span>
                        <span className={`text-xl font-black ${timeLeft <= 3 ? 'text-red-500 animate-pulse' : 'text-ink'}`}>
                            00:{timeLeft.toString().padStart(2, '0')}
                        </span>
                    </div>
                    <div className="w-full bg-surface-alt h-3 rounded-full overflow-hidden">
                        <div 
                            className={`h-full transition-all duration-1000 ease-linear ${timeLeft <= 3 ? 'bg-red-500' : 'bg-rose-500'}`}
                            style={{ width: `${(timeLeft / TIMER_SECONDS) * 100}%` }}
                        />
                    </div>
                </div>

                {/* Question Area */}
                <div className="flex-1 flex flex-col justify-center items-center text-center px-2 mb-8">
                    <p className="text-3xl sm:text-4xl font-serif font-bold text-ink leading-tight">
                        "{currentQuestion?.text}"
                    </p>
                </div>

                {/* Controls — push to bottom with extra top padding */}
                <div className="grid grid-cols-2 gap-4 mt-auto pt-10">
                    <button
                        onClick={() => handleAnswer(true)}
                        className="bg-green-600 hover:bg-green-500 active:bg-green-700 text-white font-black text-2xl py-8 rounded-2xl shadow-[0_4px_0_rgb(22,163,74)] active:shadow-[0_0px_0_rgb(22,163,74)] active:translate-y-1 transition-all"
                    >
                        FACT
                    </button>
                    <button
                        onClick={() => handleAnswer(false)}
                        className="bg-rose-800 hover:bg-rose-700 active:bg-rose-900 text-white font-black text-2xl py-8 rounded-2xl shadow-[0_4px_0_rgb(136,19,55)] active:shadow-[0_0px_0_rgb(136,19,55)] active:translate-y-1 transition-all"
                    >
                        FICTION
                    </button>
                </div>
                
            </Card>
        </div>
    );
};
