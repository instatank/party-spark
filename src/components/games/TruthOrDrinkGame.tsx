import React, { useState, useMemo } from 'react';
import { Card, ScreenHeader, Button } from '../ui/Layout';
import { Wine, Sparkles, Flame, ArrowRight, Plus, X, Shuffle, GlassWater, MessageCircleHeart, DoorClosed } from 'lucide-react';
import questionData from '../../data/truth_or_drink.json';

type Category = 'classic' | 'spicy';
type GameState =
    | 'CATEGORY_SELECT'
    | 'SETUP'
    | 'PASS'
    | 'PROMPT'
    | 'RESULT'
    | 'END';

type Choice = 'truth' | 'drink';

interface CategoryMeta {
    id: Category;
    title: string;
    tagline: string;
    emoji: string;
    gradient: string;
    shadow: string;
    accentText: string;
    accentBorderFocus: string;
    icon: React.ReactNode;
}

// NOTE: Tailwind v4's JIT only detects class names that appear as complete static
// strings in source. Keep these literal — do not build them via template strings.
const CATEGORIES: CategoryMeta[] = [
    {
        id: 'classic',
        title: 'Classic',
        tagline: 'Party staples. Petty confessions. Certified chaos.',
        emoji: '🍷',
        gradient: 'from-violet-600 to-indigo-500',
        shadow: 'shadow-violet-900/30',
        accentText: 'text-violet-400',
        accentBorderFocus: 'focus:border-violet-500',
        icon: <Sparkles size={28} className="text-white shrink-0" />,
    },
    {
        id: 'spicy',
        title: 'Spicy',
        tagline: 'Flirty, scandalous, and a little unhinged.',
        emoji: '🌶️',
        gradient: 'from-rose-600 to-orange-500',
        shadow: 'shadow-rose-900/30',
        accentText: 'text-rose-400',
        accentBorderFocus: 'focus:border-rose-500',
        icon: <Flame size={28} className="text-white shrink-0" />,
    },
];

const TOTAL_ROUNDS = 10;
const MAX_PLAYERS = 10;
const MIN_PLAYERS = 2;

const shuffle = <T,>(arr: T[]): T[] => {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
};

export const TruthOrDrinkGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('CATEGORY_SELECT');
    const [category, setCategory] = useState<Category>('classic');
    const [players, setPlayers] = useState<string[]>(['', '']);
    const [turnIndex, setTurnIndex] = useState(0);
    const [roundIndex, setRoundIndex] = useState(0);
    const [lastChoice, setLastChoice] = useState<Choice | null>(null);

    const categoryMeta = CATEGORIES.find(c => c.id === category)!;

    // Shuffle the deck when entering SETUP (keyed by category + player count so replays re-roll)
    const deck = useMemo(() => {
        const pool = questionData[category] || [];
        return shuffle(pool).slice(0, TOTAL_ROUNDS);
    }, [category, players.length, gameState === 'CATEGORY_SELECT']);

    const trimmedPlayers = players.map(p => p.trim()).filter(Boolean);
    const canStart = trimmedPlayers.length >= MIN_PLAYERS;
    const currentPlayer = trimmedPlayers[turnIndex % trimmedPlayers.length] || '';
    const currentQuestion = deck[roundIndex] || '';
    const isLastRound = roundIndex >= deck.length - 1;

    // ========================
    // Handlers
    // ========================
    const handleCategorySelect = (c: Category) => {
        setCategory(c);
        setGameState('SETUP');
    };

    const handleAddPlayer = () => {
        if (players.length >= MAX_PLAYERS) return;
        setPlayers([...players, '']);
    };

    const handleRemovePlayer = (i: number) => {
        if (players.length <= MIN_PLAYERS) return;
        setPlayers(players.filter((_, idx) => idx !== i));
    };

    const handlePlayerNameChange = (i: number, value: string) => {
        const next = [...players];
        next[i] = value;
        setPlayers(next);
    };

    const handleStartGame = () => {
        if (!canStart) return;
        setTurnIndex(0);
        setRoundIndex(0);
        setLastChoice(null);
        setGameState('PASS');
    };

    const handleReady = () => setGameState('PROMPT');

    const handleChoice = (choice: Choice) => {
        setLastChoice(choice);
        setGameState('RESULT');
    };

    const handleNext = () => {
        if (isLastRound) {
            setGameState('END');
            return;
        }
        setRoundIndex(i => i + 1);
        setTurnIndex(i => i + 1);
        setLastChoice(null);
        setGameState('PASS');
    };

    const handleEndEarly = () => setGameState('END');

    const handlePlayAgain = () => {
        setGameState('CATEGORY_SELECT');
        setPlayers(['', '']);
        setTurnIndex(0);
        setRoundIndex(0);
        setLastChoice(null);
    };

    // ========================
    // RENDER
    // ========================

    // CATEGORY SELECT
    if (gameState === 'CATEGORY_SELECT') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Truth or Drink" onBack={onExit} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-2 gap-6">
                    <div className="text-center mb-2">
                        <p className="text-6xl mb-4">🥃</p>
                        <h2 className="text-2xl font-serif font-bold text-white mb-2">Confess or take a sip.</h2>
                        <p className="text-gray-400 text-sm px-6">Pick a deck. Answer honestly — or drink the question away.</p>
                    </div>

                    {CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => handleCategorySelect(cat.id)}
                            className={`w-full bg-gradient-to-r ${cat.gradient} text-white p-5 rounded-2xl flex items-center gap-4 active:scale-95 transition-all shadow-lg ${cat.shadow} group relative overflow-hidden`}
                        >
                            <div className="absolute top-0 right-0 w-32 h-32 opacity-30 rounded-full blur-3xl -mr-10 -mt-10 bg-white" />
                            {cat.icon}
                            <div className="text-left relative z-10 flex-1">
                                <h3 className="font-bold text-lg flex items-center gap-2">
                                    {cat.title} <span className="text-base">{cat.emoji}</span>
                                </h3>
                                <p className="text-sm text-white/80">{cat.tagline}</p>
                            </div>
                            <ArrowRight size={22} className="text-white/80 shrink-0 group-active:translate-x-1 transition-transform" />
                        </button>
                    ))}

                    <p className="text-xs text-gray-500 text-center px-8 mt-2">
                        More decks dropping soon — Deep Cuts, Ex Files & Chaos Mode.
                    </p>
                </div>
            </div>
        );
    }

    // SETUP — Player list
    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Who's Playing?" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <span className={`text-xs font-bold ${categoryMeta.accentText} uppercase tracking-widest`}>
                            {categoryMeta.title} Deck
                        </span>
                        <span className="text-gray-600">•</span>
                        <span className="text-xs font-medium text-gray-500">
                            {TOTAL_ROUNDS} rounds
                        </span>
                    </div>

                    <div className="space-y-3 flex-1">
                        {players.map((name, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${categoryMeta.gradient} flex items-center justify-center text-white font-bold text-sm shrink-0 shadow-lg ${categoryMeta.shadow}`}>
                                    {i + 1}
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => handlePlayerNameChange(i, e.target.value)}
                                    placeholder={`Player ${i + 1}`}
                                    maxLength={15}
                                    className={`flex-1 bg-slate-800 border border-slate-700 ${categoryMeta.accentBorderFocus} rounded-xl p-3 text-white font-medium placeholder-gray-600 outline-none transition-colors`}
                                />
                                {players.length > MIN_PLAYERS && (
                                    <button
                                        onClick={() => handleRemovePlayer(i)}
                                        className="p-2 rounded-lg bg-white/5 hover:bg-red-500/20 text-gray-400 hover:text-red-400 transition-colors"
                                        aria-label={`Remove player ${i + 1}`}
                                    >
                                        <X size={18} />
                                    </button>
                                )}
                            </div>
                        ))}

                        {players.length < MAX_PLAYERS && (
                            <button
                                onClick={handleAddPlayer}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-white/10 hover:border-white/30 text-gray-400 hover:text-white transition-colors"
                            >
                                <Plus size={18} /> Add Player
                            </button>
                        )}
                    </div>

                    <Button
                        onClick={handleStartGame}
                        className={`w-full py-4 text-lg mt-6 ${!canStart ? 'opacity-40' : ''}`}
                        disabled={!canStart}
                    >
                        Start Drinking <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // PASS TO PLAYER
    if (gameState === 'PASS') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={`Round ${roundIndex + 1} of ${deck.length}`} onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-8">
                    <div className={`w-24 h-24 bg-gradient-to-br ${categoryMeta.gradient} rounded-full flex items-center justify-center shadow-lg ${categoryMeta.shadow}`}>
                        <Wine size={40} className="text-white" />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">You're up</p>
                        <h2 className="text-3xl font-serif font-bold text-white mb-2">
                            Pass to <span className={categoryMeta.accentText}>{currentPlayer}</span>
                        </h2>
                        <p className="text-gray-400 text-sm">
                            Take the phone. Brace yourself.
                        </p>
                    </div>
                    <div className="w-full space-y-3">
                        <Button onClick={handleReady} className="w-full py-4 text-lg">
                            I'm {currentPlayer} — Show Me
                        </Button>
                        <button
                            onClick={handleEndEarly}
                            className="w-full flex items-center justify-center gap-2 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
                        >
                            <DoorClosed size={14} /> End game early
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // PROMPT — Truth or Drink
    if (gameState === 'PROMPT') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={`${currentPlayer}'s Turn`} onBack={() => setGameState('PASS')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <span className={`text-xs font-bold ${categoryMeta.accentText} uppercase tracking-widest`}>
                            {categoryMeta.title} • Round {roundIndex + 1}/{deck.length}
                        </span>
                        <span className="text-xs font-medium text-gray-500">
                            {categoryMeta.emoji}
                        </span>
                    </div>

                    <Card className="mb-6 p-6 border-white/10 relative overflow-hidden">
                        <div className={`absolute top-0 right-0 w-40 h-40 opacity-10 rounded-full blur-3xl -mr-10 -mt-10 bg-gradient-to-br ${categoryMeta.gradient}`} />
                        <div className="relative z-10">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">The Question</p>
                            <p className="text-xl font-serif font-bold text-white leading-snug">{currentQuestion}</p>
                        </div>
                    </Card>

                    <div className="space-y-3 flex-1 flex flex-col justify-end">
                        <button
                            onClick={() => handleChoice('truth')}
                            className="w-full bg-gradient-to-r from-emerald-600 to-teal-500 text-white p-5 rounded-2xl flex items-center gap-4 active:scale-95 transition-all shadow-lg shadow-emerald-900/30 group"
                        >
                            <MessageCircleHeart size={28} className="text-white shrink-0" />
                            <div className="text-left flex-1">
                                <h3 className="font-bold text-lg">Tell the Truth</h3>
                                <p className="text-sm text-emerald-100/80">Spill it. No take-backs.</p>
                            </div>
                            <ArrowRight size={22} className="text-white/80 shrink-0 group-active:translate-x-1 transition-transform" />
                        </button>

                        <button
                            onClick={() => handleChoice('drink')}
                            className="w-full bg-gradient-to-r from-amber-600 to-red-500 text-white p-5 rounded-2xl flex items-center gap-4 active:scale-95 transition-all shadow-lg shadow-red-900/30 group"
                        >
                            <GlassWater size={28} className="text-white shrink-0" />
                            <div className="text-left flex-1">
                                <h3 className="font-bold text-lg">Take a Drink 🥃</h3>
                                <p className="text-sm text-amber-100/80">Secrets stay secret. Bottoms up.</p>
                            </div>
                            <ArrowRight size={22} className="text-white/80 shrink-0 group-active:translate-x-1 transition-transform" />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // RESULT — brief confirmation
    if (gameState === 'RESULT') {
        const truthTold = lastChoice === 'truth';
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Locked In" onBack={() => setGameState('PROMPT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6 text-center">
                    <div className={`w-28 h-28 rounded-full flex items-center justify-center ${truthTold ? 'bg-emerald-500 shadow-[0_0_50px_rgba(16,185,129,0.4)]' : 'bg-gradient-to-br from-amber-500 to-red-500 shadow-[0_0_50px_rgba(239,68,68,0.4)]'}`}>
                        <span className="text-5xl">{truthTold ? '🗣️' : '🥃'}</span>
                    </div>

                    <div>
                        <h2 className={`text-4xl font-serif font-black mb-2 ${truthTold ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {truthTold ? 'Truth Told!' : 'Bottoms Up!'}
                        </h2>
                        <p className="text-gray-400 text-base max-w-xs">
                            {truthTold
                                ? `${currentPlayer} came clean. The group is watching.`
                                : `${currentPlayer} takes the L and the sip.`}
                        </p>
                    </div>

                    <div className="bg-slate-800/60 p-4 rounded-xl border border-white/5 w-full">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">The Question</p>
                        <p className="text-white/90 text-sm italic leading-snug">"{currentQuestion}"</p>
                    </div>

                    <Button onClick={handleNext} className="w-full py-4 text-lg">
                        {isLastRound ? 'See the Wrap-Up' : 'Next Round'} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // END — Wrap-up
    if (gameState === 'END') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="That's a Wrap" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 gap-6 text-center">
                    <p className="text-8xl">🥂</p>
                    <div>
                        <h2 className="text-4xl font-serif font-bold text-white mb-2">Cheers to chaos.</h2>
                        <p className="text-gray-400 text-base max-w-xs mx-auto">
                            Secrets spilled. Drinks taken. Friendships mildly damaged.
                        </p>
                    </div>

                    <div className="bg-slate-800/60 p-6 rounded-2xl border border-white/5 w-full">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Session Recap</p>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <div>
                                <p className="text-3xl font-black text-white">{roundIndex + (lastChoice ? 1 : 0)}</p>
                                <p className="text-xs text-gray-500 uppercase tracking-wider">Rounds Played</p>
                            </div>
                            <div>
                                <p className="text-3xl font-black text-white">{trimmedPlayers.length}</p>
                                <p className="text-xs text-gray-500 uppercase tracking-wider">Players</p>
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-3 w-full mt-2">
                        <Button onClick={handlePlayAgain} className="w-full py-3">
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
