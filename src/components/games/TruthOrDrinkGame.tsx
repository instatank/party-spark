import React, { useState, useMemo } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Flame, ArrowRight, ChevronRight, Plus, X, Shuffle, GlassWater, MessageCircleHeart, DoorClosed, HeartCrack, Waves, Zap, Wand2 } from 'lucide-react';
import questionData from '../../data/truth_or_drink.json';
import { generateCustomTruthOrDrink } from '../../services/geminiService';
import { useTheme } from '../../contexts/ThemeContext';

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

// Per-deck palette — solid + tint for the category-screen accents + the
// prompt card's decorative blob and header pill. Two variants so the
// colors actually read against either bg (dark slate vs Azure Sky).
type DeckEntry = { solid: string; tintAlpha: number };
const DECK_PALETTE_DARK: Record<Category, DeckEntry> = {
    custom:  { solid: '#C026D3', tintAlpha: 0.18 }, // fuchsia-600
    classic: { solid: '#8B5CE0', tintAlpha: 0.18 }, // violet
    spicy:   { solid: '#F43F5E', tintAlpha: 0.18 }, // rose-500
    deep:    { solid: '#10B981', tintAlpha: 0.18 }, // emerald-500
    exes:    { solid: '#EC4899', tintAlpha: 0.18 }, // pink-500
    chaos:   { solid: '#A855F7', tintAlpha: 0.18 }, // purple-500
};
const DECK_PALETTE_LIGHT: Record<Category, DeckEntry> = {
    // Darkened ~20% from dark mode + tint alpha bumped so the blob still
    // reads against #FFFFFF surfaces.
    custom:  { solid: '#A30FB6', tintAlpha: 0.28 },
    classic: { solid: '#6B3DB8', tintAlpha: 0.26 },
    spicy:   { solid: '#D02644', tintAlpha: 0.26 },
    deep:    { solid: '#0E8C66', tintAlpha: 0.26 },
    exes:    { solid: '#C72D7F', tintAlpha: 0.26 },
    chaos:   { solid: '#8635D6', tintAlpha: 0.26 },
};
const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
        accentText: 'text-fuchsia-500',
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
        accentText: 'text-vibe',
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
        accentText: 'text-rose-500',
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
        accentText: 'text-emerald-500',
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
        accentText: 'text-pink-500',
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
        accentText: 'text-fuchsia-500',
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
    const { theme } = useTheme();
    const DECK_MAP = theme === 'light' ? DECK_PALETTE_LIGHT : DECK_PALETTE_DARK;
    const deckPalette = (id: Category): { solid: string; tint: string } => {
        const e = DECK_MAP[id] || { solid: '#94A3B8', tintAlpha: 0.18 };
        return { solid: e.solid, tint: hexToRgba(e.solid, e.tintAlpha) };
    };
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
                <p className="text-muted mb-4 text-sm text-center">
                    Pick a deck. Answer honestly — or take a sip.
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {CATEGORIES.map(cat => {
                            const color = deckPalette(cat.id).solid;
                            const isCustom = cat.id === 'custom';
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => handleCategorySelect(cat.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div
                                        className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden"
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
                                                <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{cat.title}</span>
                                                    <span className="text-sm flex-shrink-0">{cat.emoji}</span>
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
                        <span className="text-muted">•</span>
                        <span className="text-xs font-medium text-muted">
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
                                    className={`flex-1 bg-surface-alt border border-divider ${categoryMeta.accentBorderFocus} rounded-xl p-3 text-ink font-medium placeholder:text-muted outline-none transition-colors`}
                                />
                                {players.length > MIN_PLAYERS && (
                                    <button
                                        onClick={() => handleRemovePlayer(i)}
                                        className="p-2 rounded-lg bg-surface-alt hover:bg-red-500/20 text-muted hover:text-red-500 transition-colors"
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
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-divider hover:border-ink-soft text-muted hover:text-ink transition-colors"
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
                        CTA so it doesn't feel like a tertiary footer link.
                        Hidden for the custom deck since AI generation needs
                        names + context. */}
                    {category !== 'custom' && (
                        <button
                            onClick={handleJustPlay}
                            className="w-full mt-3 py-4 rounded-xl font-bold text-base text-emerald-300 bg-emerald-500/10 border-2 border-emerald-500/60 hover:bg-emerald-500/20 hover:border-emerald-400 hover:text-emerald-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <Zap size={18} />
                            Just Play — Skip the Setup
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // CUSTOM_SETUP — Describe your group for AI generation. Mirrors MLT's
    // Create-Your-Vibe input page (chip sizing, label scale, section
    // spacing, pro-tips treatment) so the two custom flows feel identical.
    if (gameState === 'CUSTOM_SETUP') {
        const canGenerate = customContext.trim().length >= 10 && wordCount <= WORD_LIMIT;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Create Your Vibe" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-1">
                    {/* Intro */}
                    <div className="text-center mb-6">
                        <div className="inline-flex bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 border border-violet-500/30 rounded-2xl p-4 mb-3">
                            <Wand2 size={32} className="text-vibe" />
                        </div>
                        <h2 className="text-xl font-bold text-ink mb-1">Personalised Questions</h2>
                        <p className="text-muted text-sm max-w-sm mx-auto">
                            Tell us about your group and AI will write Truth-or-Drink questions that feel like they were written just for you.
                        </p>
                    </div>

                    {/* Step 1: Group Type Chips */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-muted uppercase tracking-widest mb-3 block">
                            1. Who's playing?
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {GROUP_TYPES.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => setCustomGroupType(g.id)}
                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 border
                                        ${customGroupType === g.id
                                            ? 'bg-violet-600/30 border-violet-500 text-vibe shadow-lg shadow-violet-500/20'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft/40'
                                        }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Tone Chips (optional) */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-muted uppercase tracking-widest mb-3 block">
                            2. Set the tone <span className="text-muted normal-case tracking-normal font-medium">(optional)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {TONE_OPTIONS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setCustomTone(customTone === t.id ? null : t.id)}
                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 border
                                        ${customTone === t.id
                                            ? 'bg-violet-600/30 border-violet-500 text-vibe shadow-lg shadow-violet-500/20'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft/40'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        {customTone && (
                            <p className="text-xs text-muted mt-2 pl-1">
                                {TONE_OPTIONS.find(t => t.id === customTone)?.hint}
                            </p>
                        )}
                    </div>

                    {/* Step 3: Context Text Box */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-muted uppercase tracking-widest mb-3 block">
                            3. The secret sauce — describe your group
                        </label>
                        <div className="bg-surface-alt border border-divider rounded-2xl p-1 focus-within:border-violet-500/50 transition-colors">
                            <textarea
                                value={customContext}
                                onChange={(e) => {
                                    setCustomContext(e.target.value);
                                    setCustomError('');
                                }}
                                placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                                rows={5}
                                className="w-full bg-transparent p-4 text-ink placeholder:text-muted text-sm leading-relaxed resize-none focus:outline-none"
                            />
                            <div className="flex justify-between items-center px-4 py-2 border-t border-divider-soft">
                                <span className={`text-xs font-bold ${wordCount > WORD_LIMIT ? 'text-red-500' : wordCount > WORD_LIMIT * 0.8 ? 'text-amber-500' : 'text-muted'}`}>
                                    {wordCount}/{WORD_LIMIT} words
                                </span>
                                {wordCount > 0 && wordCount <= 15 && (
                                    <span className="text-xs text-amber-500 font-medium">A bit more detail will help!</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Pro Tips */}
                    <div className="bg-violet-900/20 border border-violet-500/20 rounded-xl p-4 mb-6">
                        <p className="text-xs text-vibe font-bold uppercase tracking-widest mb-2">💡 Pro Tips for Better Cards</p>
                        <ul className="text-xs text-muted space-y-1.5">
                            <li>• <strong className="text-ink-soft">Name names:</strong> "Aisha hates confrontation" → gold</li>
                            <li>• <strong className="text-ink-soft">Be specific:</strong> "Goa trip where Priya lost her passport"</li>
                            <li>• <strong className="text-ink-soft">Add dynamics:</strong> exes, rivalries, running jokes</li>
                        </ul>
                    </div>

                    {/* Error */}
                    {customError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
                            <p className="text-red-500 text-sm font-medium">{customError}</p>
                        </div>
                    )}

                    {/* Generate Button */}
                    <button
                        onClick={handleGenerateCustom}
                        disabled={!canGenerate}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                            ${canGenerate
                                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-lg shadow-violet-600/30 active:scale-[0.98]'
                                : 'bg-surface-alt text-muted cursor-not-allowed'
                            }`}
                    >
                        <Sparkles size={20} />
                        Generate Your Cards
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
                        <Wand2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-vibe animate-pulse" size={28} />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-ink mb-1">
                            Crafting your custom deck…
                        </p>
                        <p className="text-muted text-sm">
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
        const palette = deckPalette(category);
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
                            className="w-full aspect-[3/4] max-h-[460px] bg-surface border border-divider rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                            style={{ boxShadow: 'var(--shadow-card)' }}
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
                                <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-ink text-center">
                                    {currentQuestion}
                                </p>
                            </div>
                            <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
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
                        className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 text-xs text-muted hover:text-ink-soft transition-colors"
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
                        <h2 className="text-4xl font-serif font-bold text-ink mb-2">Cheers to chaos.</h2>
                        <p className="text-muted text-base max-w-xs mx-auto">
                            Secrets spilled. Drinks taken. Friendships mildly damaged.
                        </p>
                    </div>

                    <div className="bg-surface-alt p-5 rounded-2xl border border-divider-soft w-full">
                        <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Session Recap</p>
                        {playMode === 'named' ? (
                            <div className="flex flex-col">
                                <div className="flex items-center justify-between text-[10px] font-bold text-muted uppercase tracking-widest pb-2 border-b border-divider-soft">
                                    <span>Player</span>
                                    <div className="flex items-center gap-4">
                                        <span className="w-12 text-right">🗣️ Truths</span>
                                        <span className="w-12 text-right">🥃 Drinks</span>
                                    </div>
                                </div>
                                {trimmedPlayers.map(name => {
                                    const s = scores[name] || { truths: 0, drinks: 0 };
                                    return (
                                        <div key={name} className="flex items-center justify-between py-2 border-b border-divider-soft last:border-0">
                                            <span className="text-sm font-semibold text-ink truncate pr-2">{name}</span>
                                            <div className="flex items-center gap-4 font-mono font-bold text-base">
                                                <span className="w-12 text-right text-emerald-500">{s.truths}</span>
                                                <span className="w-12 text-right text-amber-500">{s.drinks}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="text-center py-1">
                                <p className="text-3xl font-black text-ink">{roundIndex + (lastChoice ? 1 : 0)}</p>
                                <p className="text-xs text-muted uppercase tracking-wider mt-1">Rounds Played</p>
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
