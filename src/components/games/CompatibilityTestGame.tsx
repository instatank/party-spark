import React, { useState, useMemo } from 'react';
import { Card, ScreenHeader, Button } from '../ui/Layout';
import { Heart, Users, ArrowRight, ChevronRight, Eye, EyeOff, Target, User, Shuffle, Rabbit } from 'lucide-react';
import questionData from '../../data/compatibility_test.json';

interface Question {
    text: string;
    options: string[];
}

type GameMode = 'friends' | 'couples' | 'bunny';
type Round = 'round1' | 'round2' | 'round3';
type GameState =
    | 'MODE_SELECT'
    | 'SETUP'
    | 'ROUND_INTRO'
    | 'PASS_TO_PREDICTOR'
    | 'PREDICT'
    | 'PASS_TO_ANSWERER'
    | 'ANSWER'
    | 'REVEAL'
    | 'ROUND_SUMMARY'
    | 'FINAL_VERDICT';

const ROUND_THEMES: Record<GameMode, { names: Record<Round, string>; descriptions: Record<Round, string>; emojis: Record<Round, string> }> = {
    friends: {
        names: { round1: 'Surface', round2: 'Belief', round3: 'Depth' },
        descriptions: { round1: 'Habits, preferences, and the everyday stuff.', round2: 'Values, opinions, and how they really think.', round3: 'Fears, emotions, and what lies beneath.' },
        emojis: { round1: '🌊', round2: '🧠', round3: '🔥' },
    },
    couples: {
        names: { round1: 'Surface', round2: 'Belief', round3: 'Depth' },
        descriptions: { round1: 'Habits, preferences, and the everyday stuff.', round2: 'Values, opinions, and how they really think.', round3: 'Fears, emotions, and what lies beneath.' },
        emojis: { round1: '🌊', round2: '🧠', round3: '🔥' },
    },
    bunny: {
        names: { round1: 'Warm Up', round2: 'Heat', round3: 'After Dark' },
        descriptions: { round1: 'Sleeping habits, cuddling, and bed crimes.', round2: 'Turn-ons, vibes, and what gets them going.', round3: 'The stuff they\'ll never say first.' },
        emojis: { round1: '🛏️', round2: '🌶️', round3: '🐇' },
    },
};

const VERDICTS = [
    { min: 12, emoji: '🔥', title: 'Soulmates', subtitle: 'You finish each other\'s sentences.' },
    { min: 9, emoji: '💛', title: 'In Sync', subtitle: 'You\'re clearly paying attention.' },
    { min: 6, emoji: '🤔', title: 'Work In Progress', subtitle: 'Time for a deeper conversation.' },
    { min: 0, emoji: '😬', title: 'Strangers?', subtitle: 'Were you even at the same dinner table?' },
];

// Static class map — Tailwind v4 JIT only detects complete literal class strings,
// so every accent variant must appear as a full static string somewhere in source.
// Don't switch this back to `text-${color}-400` template literals — it won't compile.
const ACCENT_CLASSES: Record<GameMode, {
    text400: string;
    focusBorder500: string;
    hoverBorder500: string;
    groupHoverBg600: string;
}> = {
    couples: {
        text400: 'text-pink-400',
        focusBorder500: 'focus:border-pink-500',
        hoverBorder500: 'hover:border-pink-500',
        groupHoverBg600: 'group-hover:bg-pink-600',
    },
    friends: {
        text400: 'text-violet-400',
        focusBorder500: 'focus:border-violet-500',
        hoverBorder500: 'hover:border-violet-500',
        groupHoverBg600: 'group-hover:bg-violet-600',
    },
    bunny: {
        text400: 'text-rose-400',
        focusBorder500: 'focus:border-rose-500',
        hoverBorder500: 'hover:border-rose-500',
        groupHoverBg600: 'group-hover:bg-rose-600',
    },
};

const QUESTIONS_PER_ROUND = 5;

interface RoundResult {
    question: string;
    predictorName: string;
    answererName: string;
    prediction: string;
    answer: string;
    correct: boolean;
}

export const CompatibilityTestGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    // State
    const [gameState, setGameState] = useState<GameState>('MODE_SELECT');
    const [mode, setMode] = useState<GameMode>('couples');
    const [playerA, setPlayerA] = useState('');
    const [playerB, setPlayerB] = useState('');
    const [currentRound, setCurrentRound] = useState<Round>('round1');
    const [questionIndex, setQuestionIndex] = useState(0);
    const [prediction, setPrediction] = useState<string | null>(null);
    const [answer, setAnswer] = useState<string | null>(null);
    const [scoreA, setScoreA] = useState(0); // Points Player A earned as predictor
    const [scoreB, setScoreB] = useState(0); // Points Player B earned as predictor
    const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
    const [allResults, setAllResults] = useState<RoundResult[]>([]);

    // Determine who predicts on this question (alternates: Q0→A predicts B, Q1→B predicts A, etc.)
    const isAPredictor = questionIndex % 2 === 0;
    const predictorName = isAPredictor ? playerA : playerB;
    const answererName = isAPredictor ? playerB : playerA;

    // Pick 5 random questions for each round (memoized on mode)
    const selectedQuestions = useMemo(() => {
        const modeData = questionData[mode];
        const result: Record<Round, Question[]> = { round1: [], round2: [], round3: [] };
        (['round1', 'round2', 'round3'] as Round[]).forEach(round => {
            const pool = [...modeData[round]];
            // Shuffle
            for (let i = pool.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [pool[i], pool[j]] = [pool[j], pool[i]];
            }
            result[round] = pool.slice(0, QUESTIONS_PER_ROUND);
        });
        return result;
    }, [mode, playerA, playerB]); // Re-roll when starting a new game

    const currentQuestion = selectedQuestions[currentRound]?.[questionIndex];
    const questionText = currentQuestion?.text.replace('{name}', answererName) || '';

    const roundTheme = ROUND_THEMES[mode];
    const accent = ACCENT_CLASSES[mode];

    // Handlers
    const handleModeSelect = (m: GameMode) => {
        setMode(m);
        setGameState('SETUP');
    };

    const handleStartGame = () => {
        if (!playerA.trim() || !playerB.trim()) return;
        setCurrentRound('round1');
        setQuestionIndex(0);
        setScoreA(0);
        setScoreB(0);
        setRoundResults([]);
        setAllResults([]);
        setGameState('ROUND_INTRO');
    };

    const handleStartRound = () => {
        setQuestionIndex(0);
        setRoundResults([]);
        setGameState('PASS_TO_PREDICTOR');
    };

    const handlePrediction = (option: string) => {
        setPrediction(option);
        setGameState('PASS_TO_ANSWERER');
    };

    const handleAnswer = (option: string) => {
        setAnswer(option);
        const correct = option === prediction;
        if (correct) {
            if (isAPredictor) setScoreA(s => s + 1);
            else setScoreB(s => s + 1);
        }
        const result: RoundResult = {
            question: questionText,
            predictorName,
            answererName,
            prediction: prediction!,
            answer: option,
            correct,
        };
        setRoundResults(prev => [...prev, result]);
        setAllResults(prev => [...prev, result]);
        setGameState('REVEAL');
    };

    const handleNext = () => {
        setPrediction(null);
        setAnswer(null);

        if (questionIndex < QUESTIONS_PER_ROUND - 1) {
            setQuestionIndex(i => i + 1);
            setGameState('PASS_TO_PREDICTOR');
        } else {
            // Round over
            setGameState('ROUND_SUMMARY');
        }
    };

    const handleNextRound = () => {
        const rounds: Round[] = ['round1', 'round2', 'round3'];
        const idx = rounds.indexOf(currentRound);
        if (idx < 2) {
            setCurrentRound(rounds[idx + 1]);
            setGameState('ROUND_INTRO');
        } else {
            setGameState('FINAL_VERDICT');
        }
    };

    const totalScore = scoreA + scoreB;
    const verdict = VERDICTS.find(v => totalScore >= v.min)!;

    // ========================================
    // RENDER
    // ========================================

    // MODE SELECT — same design pattern as MLT/TOD. No AI custom mode here,
    // so no ring/glow tile. Bunny mode is adult-gated and gets an 18+ pill.
    if (gameState === 'MODE_SELECT') {
        const MODES: Array<{
            id: GameMode;
            title: string;
            tagline: string;
            Icon: typeof Heart;
            color: string;
            adult?: boolean;
        }> = [
            { id: 'couples', title: 'Couples', tagline: 'For partners, dates, and lovers.',         Icon: Heart,  color: '#EC4899' }, // pink-500
            { id: 'friends', title: 'Friends', tagline: 'For best mates and ride-or-dies.',         Icon: Users,  color: '#8B5CE0' }, // violet
            { id: 'bunny',   title: 'Bunny',   tagline: 'Spicy, intimate, and behind closed doors.',Icon: Rabbit, color: '#F43F5E', adult: true }, // rose-500
        ];

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The Forecast" onBack={onExit} onHome={onExit} />
                <div className="text-center mb-4">
                    <p className="text-5xl mb-2">🔮</p>
                    <h2 className="text-xl font-serif font-bold text-white mb-1">How well do you <em>really</em> know each other?</h2>
                    <p className="text-gray-400 text-sm">Predict their answers. Discover the truth.</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => handleModeSelect(m.id)}
                                className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                            >
                                <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/[0.08] hover:border-white/20 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                    <span
                                        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]"
                                        style={{ background: m.color }}
                                    />
                                    <span
                                        className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                        style={{ background: m.color }}
                                    />
                                    <div className="flex items-center gap-3">
                                        <span className="flex-shrink-0" style={{ color: m.color }}>
                                            <m.Icon size={16} />
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-white leading-tight flex items-center gap-1.5">
                                                <span className="truncate">{m.title}</span>
                                                {m.adult && (
                                                    <span className="text-[9px] font-extrabold tracking-[0.1em] text-red-400 bg-red-500/15 px-1.5 py-[2px] rounded flex-shrink-0">
                                                        18+
                                                    </span>
                                                )}
                                            </h3>
                                            <p className="text-xs text-gray-400 leading-snug truncate">{m.tagline}</p>
                                        </div>
                                        <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // SETUP — Name entry
    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Who's Playing?" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col justify-center px-2 gap-6">
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Player 1</label>
                            <input
                                type="text"
                                value={playerA}
                                onChange={e => setPlayerA(e.target.value)}
                                placeholder="Enter name..."
                                maxLength={15}
                                className={`w-full bg-slate-800 border border-slate-700 ${accent.focusBorder500} rounded-xl p-4 text-white text-lg font-medium placeholder-gray-600 outline-none transition-colors`}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 block">Player 2</label>
                            <input
                                type="text"
                                value={playerB}
                                onChange={e => setPlayerB(e.target.value)}
                                placeholder="Enter name..."
                                maxLength={15}
                                className={`w-full bg-slate-800 border border-slate-700 ${accent.focusBorder500} rounded-xl p-4 text-white text-lg font-medium placeholder-gray-600 outline-none transition-colors`}
                            />
                        </div>
                    </div>

                    <Button
                        onClick={handleStartGame}
                        className={`w-full py-4 text-lg ${!playerA.trim() || !playerB.trim() ? 'opacity-40' : ''}`}
                        disabled={!playerA.trim() || !playerB.trim()}
                    >
                        Start The Forecast <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ROUND INTRO
    if (gameState === 'ROUND_INTRO') {
        const roundNum = currentRound === 'round1' ? 1 : currentRound === 'round2' ? 2 : 3;
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="The Forecast" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-6">
                    <p className="text-7xl">{roundTheme.emojis[currentRound]}</p>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">Round {roundNum} of 3</p>
                        <h2 className="text-4xl font-serif font-bold text-white mb-3">{roundTheme.names[currentRound]}</h2>
                        <p className="text-gray-400">{roundTheme.descriptions[currentRound]}</p>
                    </div>
                    <div className="bg-slate-800/60 p-4 rounded-xl border border-white/5 max-w-sm">
                        <p className="text-sm text-gray-300">
                            <span className="text-white font-bold">{playerA}</span> and <span className="text-white font-bold">{playerB}</span> will take turns predicting each other's answers.
                        </p>
                    </div>
                    <Button onClick={handleStartRound} className="w-full py-4 text-lg">
                        Begin Round <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // PASS TO PREDICTOR
    if (gameState === 'PASS_TO_PREDICTOR') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={`Q${questionIndex + 1} of ${QUESTIONS_PER_ROUND}`} onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-amber-500 to-orange-600 rounded-full flex items-center justify-center shadow-lg shadow-amber-900/30">
                        <Eye size={36} className="text-white" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">Prediction Time</p>
                        <h2 className="text-2xl font-serif font-bold text-white mb-2">
                            Pass the phone to <span className={accent.text400}>{predictorName}</span>
                        </h2>
                        <p className="text-gray-400 text-sm">
                            You'll predict what <span className="text-white font-medium">{answererName}</span> will choose.
                        </p>
                    </div>
                    <Button onClick={() => setGameState('PREDICT')} className="w-full py-4 text-lg">
                        I'm {predictorName} — Show Me
                    </Button>
                </div>
            </div>
        );
    }

    // PREDICT
    if (gameState === 'PREDICT') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={`${predictorName}'s Prediction`} onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <Target size={16} className={accent.text400} />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                            What will {answererName} choose?
                        </span>
                    </div>

                    <Card className="mb-6 p-5 border-white/10">
                        <p className="text-xl font-serif font-bold text-white leading-snug">{questionText}</p>
                    </Card>

                    <div className="space-y-3 flex-1">
                        {currentQuestion?.options.map((option, i) => (
                            <button
                                key={i}
                                onClick={() => handlePrediction(option)}
                                className={`w-full text-left bg-slate-800 border border-slate-700 ${accent.hoverBorder500} rounded-xl p-4 transition-all active:scale-[0.97] group`}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={`w-8 h-8 rounded-full bg-slate-700 ${accent.groupHoverBg600} flex items-center justify-center text-sm font-bold text-gray-400 group-hover:text-white transition-colors`}>
                                        {String.fromCharCode(65 + i)}
                                    </span>
                                    <span className="text-white font-medium">{option}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // PASS TO ANSWERER
    if (gameState === 'PASS_TO_ANSWERER') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Prediction Locked In!" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center shadow-lg shadow-emerald-900/30">
                        <EyeOff size={36} className="text-white" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">Your Turn</p>
                        <h2 className="text-2xl font-serif font-bold text-white mb-2">
                            Now pass the phone to <span className={accent.text400}>{answererName}</span>
                        </h2>
                        <p className="text-gray-400 text-sm">
                            Answer honestly. {predictorName}'s prediction is hidden.
                        </p>
                    </div>
                    <Button onClick={() => setGameState('ANSWER')} className="w-full py-4 text-lg">
                        I'm {answererName} — Let's Go
                    </Button>
                </div>
            </div>
        );
    }

    // ANSWER
    if (gameState === 'ANSWER') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={`${answererName}'s Answer`} onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <User size={16} className="text-emerald-400" />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">
                            Your honest answer, {answererName}
                        </span>
                    </div>

                    <Card className="mb-6 p-5 border-white/10">
                        <p className="text-xl font-serif font-bold text-white leading-snug">{questionText}</p>
                    </Card>

                    <div className="space-y-3 flex-1">
                        {currentQuestion?.options.map((option, i) => (
                            <button
                                key={i}
                                onClick={() => handleAnswer(option)}
                                className="w-full text-left bg-slate-800 border border-slate-700 hover:border-emerald-500 rounded-xl p-4 transition-all active:scale-[0.97] group"
                            >
                                <div className="flex items-center gap-3">
                                    <span className="w-8 h-8 rounded-full bg-slate-700 group-hover:bg-emerald-600 flex items-center justify-center text-sm font-bold text-gray-400 group-hover:text-white transition-colors">
                                        {String.fromCharCode(65 + i)}
                                    </span>
                                    <span className="text-white font-medium">{option}</span>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // REVEAL
    if (gameState === 'REVEAL') {
        const correct = prediction === answer;
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="The Reveal" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
                    {/* Result Icon */}
                    <div className={`w-24 h-24 rounded-full flex items-center justify-center ${correct ? 'bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.4)]' : 'bg-red-500/80 shadow-[0_0_40px_rgba(239,68,68,0.3)]'}`}>
                        <span className="text-4xl">{correct ? '🎯' : '❌'}</span>
                    </div>

                    <h2 className={`text-3xl font-black ${correct ? 'text-emerald-400' : 'text-red-400'}`}>
                        {correct ? 'NAILED IT!' : 'NOT QUITE!'}
                    </h2>

                    {/* Comparison */}
                    <div className="w-full space-y-3">
                        <div className="bg-slate-800/80 p-4 rounded-xl border border-white/5">
                            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest mb-1">{predictorName}'s Prediction</p>
                            <p className="text-white font-medium text-lg">{prediction}</p>
                        </div>
                        <div className="bg-slate-800/80 p-4 rounded-xl border border-white/5">
                            <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">{answererName}'s Answer</p>
                            <p className="text-white font-medium text-lg">{answer}</p>
                        </div>
                    </div>

                    {correct && (
                        <p className="text-sm text-gray-400 text-center">
                            <span className="text-white font-bold">+1</span> point for {predictorName}!
                        </p>
                    )}

                    <Button onClick={handleNext} className="w-full py-4 text-lg">
                        {questionIndex < QUESTIONS_PER_ROUND - 1 ? 'Next Question' : 'See Round Results'} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ROUND SUMMARY
    if (gameState === 'ROUND_SUMMARY') {
        const roundCorrect = roundResults.filter(r => r.correct).length;
        const roundNum = currentRound === 'round1' ? 1 : currentRound === 'round2' ? 2 : 3;
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={`Round ${roundNum} Complete`} onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6">
                    <p className="text-6xl">{roundTheme.emojis[currentRound]}</p>
                    <div className="text-center">
                        <h2 className="text-3xl font-serif font-bold text-white mb-2">{roundTheme.names[currentRound]}</h2>
                        <p className="text-gray-400">
                            {roundCorrect} of {QUESTIONS_PER_ROUND} predictions correct
                        </p>
                    </div>

                    {/* Mini results */}
                    <div className="w-full space-y-2 max-h-[30vh] overflow-y-auto">
                        {roundResults.map((r, i) => (
                            <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${r.correct ? 'bg-emerald-900/20 border border-emerald-500/20' : 'bg-red-900/10 border border-red-500/10'}`}>
                                <span className="text-lg">{r.correct ? '🎯' : '❌'}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs text-gray-400 truncate">{r.predictorName} predicted for {r.answererName}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-xl border border-white/5 w-full text-center">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">Running Total</p>
                        <p className="text-3xl font-black text-white">{totalScore} <span className="text-lg text-gray-500">/ {allResults.length}</span></p>
                    </div>

                    <Button onClick={handleNextRound} className="w-full py-4 text-lg">
                        {roundNum < 3 ? `Start Round ${roundNum + 1}` : 'See Final Verdict'} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // FINAL VERDICT
    if (gameState === 'FINAL_VERDICT') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="The Verdict" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6 text-center">
                    <p className="text-8xl">{verdict.emoji}</p>
                    <div>
                        <h2 className="text-4xl font-serif font-bold text-white mb-2">{verdict.title}</h2>
                        <p className="text-gray-400 text-lg">{verdict.subtitle}</p>
                    </div>

                    <div className="bg-slate-800/60 p-6 rounded-2xl border border-white/5 w-full">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Final Score</p>
                        <p className="text-6xl font-black text-white mb-1">{totalScore} <span className="text-2xl text-gray-500">/ 15</span></p>
                    </div>

                    {/* Per-player breakdown */}
                    <div className="grid grid-cols-2 gap-3 w-full">
                        <div className="bg-slate-800/40 p-4 rounded-xl border border-white/5 text-center">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{playerA}</p>
                            <p className="text-2xl font-black text-white">{scoreA} <span className="text-sm text-gray-500">correct</span></p>
                        </div>
                        <div className="bg-slate-800/40 p-4 rounded-xl border border-white/5 text-center">
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{playerB}</p>
                            <p className="text-2xl font-black text-white">{scoreB} <span className="text-sm text-gray-500">correct</span></p>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 w-full mt-2">
                        <Button onClick={() => {
                            setGameState('MODE_SELECT');
                            setPlayerA('');
                            setPlayerB('');
                        }} className="w-full py-3">
                            <Shuffle className="inline mr-2" size={18} /> Play Again
                        </Button>
                        <Button onClick={onExit} variant="ghost" className="w-full py-3">
                            Back to Home
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
