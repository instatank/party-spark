import React, { useState, useMemo } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Flame, ArrowRight, ChevronRight, Plus, X, Shuffle, GlassWater, MessageCircleHeart, DoorClosed, HeartCrack, Waves, Zap, Wand2 } from 'lucide-react';
import questionData from '../../data/truth_or_drink.json';
import { generateCustomTruthOrDrink } from '../../services/geminiService';

type Category = 'classic' | 'spicy' | 'deep' | 'exes' | 'chaos' | 'custom';
type GameState =
    | 'CATEGORY_SELECT'
    | 'SETUP'
    | 'CUSTOM_SETUP'
    | 'LOADING'
    | 'PROMPT'
    | 'END';

const GROUP_TYPES = [
    { id: 'friends', label: '🍻 Friends', description: 'Your crew' },
    { id: 'couple', label: '💕 Couple', description: 'Just the two of you' },
    { id: 'family', label: '👨‍👩‍👧‍👦 Family', description: 'Relatives, generations' },
    { id: 'colleagues', label: '💼 Colleagues', description: 'Work people, off-duty' },
    { id: 'mixed', label: '🎉 Mixed', description: 'All sorts' },
];

const TONE_OPTIONS = [
    { id: 'clean', label: '😇 Keep it Clean', hint: 'PG — safe for all ages' },
    { id: 'cheeky', label: '😏 Cheeky', hint: 'PG-13 — light teasing, innuendo OK' },
    { id: 'spicy', label: '🔥 Spicy', hint: 'R-rated — bold, flirty, no filter' },
];

const WORD_LIMIT = 150;

const PLACEHOLDER_EXAMPLES = [
    `e.g. "3 college friends reuniting in Lisbon after 5 years. Ana just got engaged, Miguel is between jobs, Sofia has been ghosting everyone since Christmas."`,
    `e.g. "A couple's 2-year anniversary weekend. She still doesn't know about the surprise trip. He's terrified of her reaction to the in-laws."`,
    `e.g. "4 work colleagues stuck on a delayed flight. Two of them secretly hate each other. One just got promoted over the rest."`,
    `e.g. "Siblings who haven't lived together in 8 years. Big brother thinks he's the favorite. Little sister has receipts."`,
];

const CUSTOM_DECK_SIZE = 15;

// Per-deck palette — solid (hex) colors the category-screen accents AND the
// new prompt-card decorative blob + header pill. tint (rgba 18%) backs the
// blob and pill bg. Single source of truth shared across the two screens.
const DECK_PALETTE: Record<Category, { solid: string; tint: string }> = {
    custom:  { solid: '#C026D3', tint: 'rgba(192, 38, 211, 0.18)' }, // fuchsia-600
    classic: { solid: '#8B5CE0', tint: 'rgba(139, 92, 224, 0.18)' }, // violet
    spicy:   { solid: '#F43F5E', tint: 'rgba(244, 63, 94, 0.18)' },  // rose-500
    deep:    { solid: '#10B981', tint: 'rgba(16, 185, 129, 0.18)' }, // emerald-500
    exes:    { solid: '#EC4899', tint: 'rgba(236, 72, 153, 0.18)' }, // pink-500
    chaos:   { solid: '#A855F7', tint: 'rgba(168, 85, 247, 0.18)' }, // purple-500
};

type Choice = 'truth' | 'drink';
type PlayMode = 'named' | 'just_play';

interface CategoryMeta {
    id: Category;
    title: string;
    tagline: string;
    emoji: string;
    gradient: string;
    shadow: string;
    accentText: string;
    accentBorderFocus: string;
    accentBorderLeft: string;
    accentBorderBottom: string;
    Icon: LucideIcon;
}

const CATEGORIES: CategoryMeta[] = [
    {
        id: 'custom',
        title: 'Create Your Vibe',
        tagline: 'AI-tailored questions for YOUR group.',
        emoji: '✨',
        gradient: 'from-violet-600 to-fuchsia-500',
        shadow: 'shadow-violet-900/30',
        accentText: 'text-fuchsia-400',
        accentBorderFocus: 'focus:border-fuchsia-500',
        accentBorderLeft: 'border-l-fuchsia-500',
        accentBorderBottom: 'border-b-fuchsia-500',
        Icon: Wand2,
    },
    {
        id: 'classic',
        title: 'Classic',
        tagline: 'Petty confessions & party chaos.',
        emoji: '🍷',
        gradient: 'from-violet-600 to-indigo-500',
        shadow: 'shadow-violet-900/30',
        accentText: 'text-violet-400',
        accentBorderFocus: 'focus:border-violet-500',
        accentBorderLeft: 'border-l-violet-500',
        accentBorderBottom: 'border-b-violet-500',
        Icon: Sparkles,
    },
    {
        id: 'spicy',
        title: 'Spicy',
        tagline: 'Flirty, scandalous, unhinged.',
        emoji: '🌶️',
        gradient: 'from-rose-600 to-orange-500',
        shadow: 'shadow-rose-900/30',
        accentText: 'text-rose-400',
        accentBorderFocus: 'focus:border-rose-500',
        accentBorderLeft: 'border-l-rose-500',
        accentBorderBottom: 'border-b-rose-500',
        Icon: Flame,
    },
    {
        id: 'deep',
        title: 'Deep Cuts',
        tagline: 'Vulnerable & heartfelt.',
        emoji: '🌊',
        gradient: 'from-emerald-600 to-teal-500',
        shadow: 'shadow-emerald-900/30',
        accentText: 'text-emerald-400',
        accentBorderFocus: 'focus:border-emerald-500',
        accentBorderLeft: 'border-l-emerald-500',
        accentBorderBottom: 'border-b-emerald-500',
        Icon: Waves,
    },
    {
        id: 'exes',
        title: 'Ex Files',
        tagline: 'Receipts, red flags, relapses.',
        emoji: '💔',
        gradient: 'from-pink-600 to-red-500',
        shadow: 'shadow-pink-900/30',
        accentText: 'text-pink-400',
        accentBorderFocus: 'focus:border-pink-500',
        accentBorderLeft: 'border-l-pink-500',
        accentBorderBottom: 'border-b-pink-500',
        Icon: HeartCrack,
    },
    {
        id: 'chaos',
        title: 'Chaos',
        tagline: 'Absurd, surreal, cursed.',
        emoji: '🌀',
        gradient: 'from-fuchsia-600 to-purple-500',
        shadow: 'shadow-fuchsia-900/30',
        accentText: 'text-fuchsia-400',
        accentBorderFocus: 'focus:border-fuchsia-500',
        accentBorderLeft: 'border-l-fuchsia-500',
        accentBorderBottom: 'border-b-fuchsia-500',
        Icon: Zap,
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
    // Cosmetic + scoring split — both modes share the same flow (choice
    // advances directly to the next prompt). 'named' shows player turns in
    // the header and tallies truths/drinks per player; 'just_play' shows
    // the category instead and skips player setup + scoring.
    const [playMode, setPlayMode] = useState<PlayMode>('named');
    const [scores, setScores] = useState<Record<string, { truths: number; drinks: number }>>({});

    // Custom-deck state
    const [customGroupType, setCustomGroupType] = useState('friends');
    const [customTone, setCustomTone] = useState<string | null>(null);
    const [customContext, setCustomContext] = useState('');
    const [customError, setCustomError] = useState('');
    const [placeholderIdx] = useState(Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));
    const [customDeck, setCustomDeck] = useState<string[] | null>(null);

    const categoryMeta = CATEGORIES.find(c => c.id === category)!;

    // Shuffle the deck on entry. For 'custom', use the AI-generated cards instead of the static pool.
    const deck = useMemo(() => {
        if (category === 'custom') {
            return customDeck ? customDeck.slice(0, TOTAL_ROUNDS) : [];
        }
        const pool = (questionData as Record<string, string[]>)[category] || [];
        return shuffle(pool).slice(0, TOTAL_ROUNDS);
    }, [category, customDeck, players.length, gameState === 'CATEGORY_SELECT']);

    const wordCount = customContext.trim().split(/\s+/).filter(Boolean).length;

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
        // Always reset to named mode at category select — Just Play is opt-in
        // from the SETUP screen, not the default.
        setPlayMode('named');
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
        setScores({});

        // Custom deck: collect context before generating.
        if (category === 'custom' && !customDeck) {
            setGameState('CUSTOM_SETUP');
            return;
        }

        setGameState('PROMPT');
    };

    const handleGenerateCustom = async () => {
        if (customContext.trim().length < 10) {
            setCustomError('Give us a bit more detail — at least a sentence or two.');
            return;
        }
        if (wordCount > WORD_LIMIT) {
            setCustomError(`Keep it under ${WORD_LIMIT} words — shorter context = sharper cards.`);
            return;
        }
        setCustomError('');
        setGameState('LOADING');

        try {
            const groupLabel = GROUP_TYPES.find(g => g.id === customGroupType)?.label || 'Friends';
            const toneHint = customTone ? TONE_OPTIONS.find(t => t.id === customTone)?.hint || '' : '';
            const cards = await generateCustomTruthOrDrink(
                groupLabel,
                customContext.trim(),
                trimmedPlayers,
                CUSTOM_DECK_SIZE,
                toneHint
            );

            if (cards.length === 0) {
                setCustomError('AI generation returned no cards. Try tweaking the description or toning down spicy language. Check the browser console for details.');
                setGameState('CUSTOM_SETUP');
                return;
            }
            setCustomDeck(cards);
            setGameState('PROMPT');
        } catch (e) {
            console.error('Custom TOD generation failed', e);
            setCustomError('Something went wrong. Please try again.');
            setGameState('CUSTOM_SETUP');
        }
    };

    // Just-Play kickoff — bypass player setup. Lands directly on PROMPT.
    const handleJustPlay = () => {
        setPlayMode('just_play');
        setTurnIndex(0);
        setRoundIndex(0);
        setLastChoice(null);
        setScores({});
        setGameState('PROMPT');
    };

    // Tally truth/drink per player in named mode, then either wrap up
    // (last round) or advance to the next prompt. In just_play we skip
    // tallying — choice stays purely cosmetic.
    const handleChoice = (choice: Choice) => {
        setLastChoice(choice);
        if (playMode === 'named' && currentPlayer) {
            setScores(prev => {
                const cur = prev[currentPlayer] || { truths: 0, drinks: 0 };
                return {
                    ...prev,
                    [currentPlayer]: {
                        truths: cur.truths + (choice === 'truth' ? 1 : 0),
                        drinks: cur.drinks + (choice === 'drink' ? 1 : 0),
                    },
                };
            });
        }
        if (isLastRound) {
            setGameState('END');
            return;
        }
        setRoundIndex(i => i + 1);
        setTurnIndex(i => i + 1);
        setLastChoice(null);
    };

    const handleEndEarly = () => setGameState('END');

    const handlePlayAgain = () => {
        setGameState('CATEGORY_SELECT');
        setPlayers(['', '']);
        setTurnIndex(0);
        setRoundIndex(0);
        setLastChoice(null);
        setCustomDeck(null);
        setCustomContext('');
        setCustomTone(null);
        setCustomError('');
        setPlayMode('named');
        setScores({});
    };

    // ========================
    // RENDER
    // ========================

    // CATEGORY SELECT — same design pattern as MLT category screen.
    // Custom Vibe gets a 2px ring + glow; the other decks get a 3px inset
    // left bar + a 33% center-aligned bottom line in the deck color.
    if (gameState === 'CATEGORY_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Truth or Drink" onBack={onExit} onHome={onExit} />
                <p className="text-gray-400 mb-4 text-sm text-center">
                    Pick a deck. Answer honestly — or take a sip.
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {CATEGORIES.map(cat => {
                            const color = DECK_PALETTE[cat.id]?.solid || '#94A3B8';
                            const isCustom = cat.id === 'custom';
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(cat.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div
                                        className="relative bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/[0.08] hover:border-white/20 rounded-xl py-3 px-4 transition-colors overflow-hidden"
                                        style={isCustom ? {
                                            borderColor: color,
                                            borderWidth: 2,
                                            boxShadow: `0 0 18px ${color}55, inset 0 0 0 1px ${color}33`,
                                        } : undefined}
                                    >
                                        {!isCustom && (
                                            <>
                                                <span
                                                    className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]"
                                                    style={{ background: color }}
                                                />
                                                <span
                                                    className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                                    style={{ background: color }}
                                                />
                                            </>
                                        )}
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color }}>
                                                <cat.Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-white leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{cat.title}</span>
                                                    <span className="text-sm flex-shrink-0">{cat.emoji}</span>
                                                </h3>
                                                <p className="text-xs text-gray-400 leading-snug truncate">{cat.tagline}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
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

                    {/* Just-Play escape hatch — bumped up to a green outlined
                        CTA so it doesn't feel like a tertiary footer link. */}
                    <button
                        onClick={handleJustPlay}
                        className="w-full mt-3 py-4 rounded-xl font-bold text-base text-emerald-300 bg-emerald-500/10 border-2 border-emerald-500/60 hover:bg-emerald-500/20 hover:border-emerald-400 hover:text-emerald-200 transition-colors flex items-center justify-center gap-2"
                    >
                        <Zap size={18} />
                        Just Play — Skip the Setup
                    </button>
                </div>
            </div>
        );
    }

    // CUSTOM_SETUP — Describe your group for AI generation
    if (gameState === 'CUSTOM_SETUP') {
        const canGenerate = customContext.trim().length >= 10 && wordCount <= WORD_LIMIT;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Create Your Vibe" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-1">
                    <div className="text-center mb-6">
                        <div className="inline-flex bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 border border-violet-500/30 rounded-2xl p-4 mb-3">
                            <Wand2 size={28} className="text-violet-400" />
                        </div>
                        <h2 className="text-lg font-bold text-white mb-1">AI-Tailored Questions</h2>
                        <p className="text-gray-400 text-sm max-w-sm mx-auto">
                            Tell us about this group and the AI will write Truth-or-Drink questions that feel personal.
                        </p>
                    </div>

                    {/* Step 1: Group Type */}
                    <div className="mb-5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                            1. Who's playing?
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {GROUP_TYPES.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => setCustomGroupType(g.id)}
                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border
                                        ${customGroupType === g.id
                                            ? 'bg-violet-600/30 border-violet-500 text-violet-300 shadow-lg shadow-violet-500/20'
                                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                                        }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Tone */}
                    <div className="mb-5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                            2. Set the tone <span className="text-gray-600 normal-case tracking-normal font-medium">(optional)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {TONE_OPTIONS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setCustomTone(customTone === t.id ? null : t.id)}
                                    className={`px-3 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 border
                                        ${customTone === t.id
                                            ? 'bg-violet-600/30 border-violet-500 text-violet-300 shadow-lg shadow-violet-500/20'
                                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        {customTone && (
                            <p className="text-xs text-gray-500 mt-2 pl-1">
                                {TONE_OPTIONS.find(t => t.id === customTone)?.hint}
                            </p>
                        )}
                    </div>

                    {/* Step 3: Context */}
                    <div className="mb-5">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 block">
                            3. Tell us about this group
                        </label>
                        <div className="bg-white/5 border border-white/10 rounded-2xl p-1 focus-within:border-violet-500/50 transition-colors">
                            <textarea
                                value={customContext}
                                onChange={(e) => {
                                    setCustomContext(e.target.value);
                                    setCustomError('');
                                }}
                                placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                                rows={5}
                                className="w-full bg-transparent p-3 text-white placeholder-gray-600 text-sm leading-relaxed resize-none focus:outline-none"
                            />
                            <div className="flex justify-between items-center px-3 py-2 border-t border-white/5">
                                <span className={`text-xs font-bold ${wordCount > WORD_LIMIT ? 'text-red-400' : wordCount > WORD_LIMIT * 0.8 ? 'text-amber-400' : 'text-gray-500'}`}>
                                    {wordCount}/{WORD_LIMIT} words
                                </span>
                                {trimmedPlayers.length > 0 && (
                                    <span className="text-[10px] text-violet-400/80">
                                        Players: {trimmedPlayers.slice(0, 3).join(', ')}{trimmedPlayers.length > 3 ? '…' : ''}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Pro Tips */}
                    <div className="bg-violet-900/20 border border-violet-500/20 rounded-xl p-3 mb-5">
                        <p className="text-[10px] text-violet-300 font-bold uppercase tracking-widest mb-2">💡 Write sharper questions</p>
                        <ul className="text-xs text-gray-400 space-y-1">
                            <li>• <strong className="text-gray-300">Name names</strong> — "Aisha hates confrontation" → gold</li>
                            <li>• <strong className="text-gray-300">Be specific</strong> — "Goa trip where Priya lost her passport"</li>
                            <li>• <strong className="text-gray-300">Mention dynamics</strong> — exes, rivalries, running jokes</li>
                        </ul>
                    </div>

                    {customError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
                            <p className="text-red-400 text-sm font-medium">{customError}</p>
                        </div>
                    )}

                    <button
                        onClick={handleGenerateCustom}
                        disabled={!canGenerate}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                            ${canGenerate
                                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-lg shadow-violet-600/30 active:scale-[0.98]'
                                : 'bg-white/5 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        <Sparkles size={20} />
                        Generate My Deck
                    </button>
                </div>
            </div>
        );
    }

    // LOADING — AI generation in flight
    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Brewing…" onBack={() => setGameState('CUSTOM_SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
                    <div className="relative">
                        <div className="w-20 h-20 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                        <Wand2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-violet-400 animate-pulse" size={28} />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-white mb-1">
                            Crafting your custom deck…
                        </p>
                        <p className="text-gray-500 text-sm">
                            Weaving in names, places, and inside jokes.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // PROMPT — Truth or Drink. Single screen for both modes — choice
    // advances directly to the next prompt (no PASS, no RESULT).
    if (gameState === 'PROMPT') {
        const palette = DECK_PALETTE[category] || { solid: '#94A3B8', tint: 'rgba(148, 163, 184, 0.18)' };
        const isJustPlay = playMode === 'just_play';
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader
                    title={isJustPlay ? `${categoryMeta.title} ${categoryMeta.emoji}` : `${currentPlayer}'s Turn`}
                    onBack={() => setGameState('CATEGORY_SELECT')}
                    onHome={onExit}
                />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    {/* Card body — same MLT play-screen styling as MLT/Charades/
                        Taboo/NHIE. Portrait 3:4, surface bg, decorative blob,
                        deck-color header pill, Playfair prompt centered, footer
                        with round counter + italic PartySpark. */}
                    <div className="flex-1 flex items-center justify-center pt-2 pb-4">
                        <div
                            className="w-full aspect-[3/4] max-h-[460px] bg-party-surface border border-white/10 rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                            style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                        >
                            <div
                                className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                                style={{ background: palette.tint }}
                            />
                            <div
                                className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                                style={{ background: palette.tint, color: palette.solid }}
                            >
                                Truth or Drink · {categoryMeta.title}
                            </div>
                            <div className="flex-1 flex items-center justify-center relative z-10 px-1">
                                <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-white text-center">
                                    {currentQuestion}
                                </p>
                            </div>
                            <div className="text-[11px] text-gray-400 flex items-center justify-between relative z-10">
                                <span>Round {roundIndex + 1} of {deck.length}</span>
                                <span className="font-serif italic text-[12px]" style={{ color: palette.solid }}>PartySpark</span>
                            </div>
                        </div>
                    </div>

                    {/* Truth / Drink — color-coded outlined CTAs in the same
                        formatting as the Just Play tab. Emerald for truths and
                        amber for drinks, matching the wrap-screen leaderboard. */}
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleChoice('truth')}
                            className="flex-1 py-4 rounded-xl font-bold text-base text-emerald-300 bg-emerald-500/10 border-2 border-emerald-500/60 hover:bg-emerald-500/20 hover:border-emerald-400 hover:text-emerald-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <MessageCircleHeart size={18} />
                            Tell the Truth
                        </button>
                        <button
                            onClick={() => handleChoice('drink')}
                            className="flex-1 py-4 rounded-xl font-bold text-base text-amber-300 bg-amber-500/10 border-2 border-amber-500/60 hover:bg-amber-500/20 hover:border-amber-400 hover:text-amber-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <GlassWater size={18} />
                            Take a Drink
                        </button>
                    </div>

                    <button
                        onClick={handleEndEarly}
                        className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors"
                    >
                        <DoorClosed size={12} /> End game early
                    </button>
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

                    <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/5 w-full">
                        <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">Session Recap</p>
                        {playMode === 'named' ? (
                            <div className="flex flex-col">
                                <div className="flex items-center justify-between text-[10px] font-bold text-gray-500 uppercase tracking-widest pb-2 border-b border-white/5">
                                    <span>Player</span>
                                    <div className="flex items-center gap-4">
                                        <span className="w-12 text-right">🗣️ Truths</span>
                                        <span className="w-12 text-right">🥃 Drinks</span>
                                    </div>
                                </div>
                                {trimmedPlayers.map(name => {
                                    const s = scores[name] || { truths: 0, drinks: 0 };
                                    return (
                                        <div key={name} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                                            <span className="text-sm font-semibold text-white truncate pr-2">{name}</span>
                                            <div className="flex items-center gap-4 font-mono font-bold text-base">
                                                <span className="w-12 text-right text-emerald-400">{s.truths}</span>
                                                <span className="w-12 text-right text-amber-400">{s.drinks}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-1">
                                <p className="text-3xl font-black text-white">{roundIndex + (lastChoice ? 1 : 0)}</p>
                                <p className="text-xs text-gray-500 uppercase tracking-wider mt-1">Rounds Played</p>
                            </div>
                        )}
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
