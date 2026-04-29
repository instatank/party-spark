import React, { useState, useEffect } from 'react';
import { ScreenHeader } from '../ui/Layout';
import { generateMostLikelyTo, generateCustomMostLikelyTo } from '../../services/geminiService';
import { MOST_LIKELY_TO_CATEGORIES } from '../../constants';
import { Users, ChevronRight, AlertTriangle, Sparkles, Flame, Zap, Wand2, ArrowLeft, Home, Hand } from 'lucide-react';
import MOST_LIKELY_TO_DATA from '../../data/most_likely_to.json';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';

interface Props {
    onExit: () => void;
}

const GROUP_TYPES = [
    { id: 'family', label: '👨‍👩‍👧‍👦 Family', description: 'Relatives, generations' },
    { id: 'friends', label: '🍻 Friends', description: 'Your crew, your squad' },
    { id: 'couple', label: '💕 Couple', description: 'Just the two of you' },
    { id: 'colleagues', label: '💼 Colleagues', description: 'Work people, off-duty' },
    { id: 'mixed', label: '🎉 Mixed Group', description: 'All sorts of people' },
];

const TONE_OPTIONS = [
    { id: 'clean', label: '😇 Keep it Clean', hint: 'PG — safe for all ages' },
    { id: 'cheeky', label: '😏 Cheeky', hint: 'PG-13 — light teasing, innuendo OK' },
    { id: 'spicy', label: '🔥 Spicy', hint: 'R-rated — bold, flirty, no filter' },
];

const WORD_LIMIT = 150;

const PLACEHOLDER_EXAMPLES = [
    `e.g. "5 college friends from Mumbai reuniting in Goa after 8 years. Rahul just got divorced, Priya runs a startup, and Sid still acts like he's 20."`,
    `e.g. "A couple celebrating their anniversary in Bali. She's obsessed with yoga, he just wants to eat. They have two kids at home with grandma."`,
    `e.g. "Extended family trip to Jaipur — 3 generations. Grandma thinks she's the boss, the cousins are competing for attention, one uncle won't stop giving speeches."`,
    `e.g. "4 work friends at a weekend offsite in Rishikesh. The manager is trying to be cool. Two interns are terrified. One person brought a guitar nobody asked for."`,
];

export const MostLikelyToGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'CATEGORY' | 'CUSTOM_SETUP' | 'LOADING' | 'PLAYING'>('CATEGORY');
    const [category, setCategory] = useState<any>(null);
    const [cards, setCards] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [countingDown, setCountingDown] = useState(false);
    const [count, setCount] = useState(3);

    // Custom vibe state
    const [selectedGroupType, setSelectedGroupType] = useState('friends');
    const [selectedTone, setSelectedTone] = useState<string | null>(null);
    const [customContext, setCustomContext] = useState('');
    const [placeholderIdx] = useState(Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));
    const [customError, setCustomError] = useState('');
    const [showPinGate, setShowPinGate] = useState(false);
    const [pendingAdultCat, setPendingAdultCat] = useState<any>(null);

    const ADULT_CATEGORY_IDS = ['adult', 'scandalous'];

    const wordCount = customContext.trim().split(/\s+/).filter(Boolean).length;

    const startGame = async (cat: any) => {
        // Gate adult categories
        if (ADULT_CATEGORY_IDS.includes(cat.id) && !isAdultUnlocked()) {
            setPendingAdultCat(cat);
            setShowPinGate(true);
            return;
        }
        if (cat.isCustom) {
            setGameState('CUSTOM_SETUP');
            return;
        }

        setCategory(cat);
        setGameState('LOADING');

        // 1. Get Local Data for Category
        const localItems = (MOST_LIKELY_TO_DATA as any)[cat.id] || [];

        // 2. Filter Used
        const availableLocal = sessionService.filterContent(
            GameType.MOST_LIKELY_TO,
            cat.id,
            localItems,
            (item: string) => item
        );

        let selectedCards: string[] = [];
        const BATCH_SIZE = 25;

        if (availableLocal.length >= BATCH_SIZE) {
            const shuffled = [...availableLocal].sort(() => 0.5 - Math.random());
            selectedCards = shuffled.slice(0, BATCH_SIZE);
        } else {
            selectedCards = [...availableLocal];
            const needed = BATCH_SIZE - selectedCards.length;

            try {
                const apiCards = await generateMostLikelyTo(cat.id, needed);
                selectedCards = [...selectedCards, ...apiCards];
            } catch (e) {
                console.warn("API fallback failed, using just local", e);
            }
        }

        if (selectedCards.length === 0) {
            selectedCards = ["Who is likely to fix the internet connection?"];
        }

        setCards(selectedCards);
        setCurrentIndex(0);
        setGameState('PLAYING');
    };

    const startCustomGame = async () => {
        if (customContext.trim().length < 10) {
            setCustomError('Give us a bit more detail! At least a couple of sentences.');
            return;
        }
        if (wordCount > WORD_LIMIT) {
            setCustomError(`Keep it under ${WORD_LIMIT} words — shorter context = sharper cards.`);
            return;
        }

        setCustomError('');
        const groupLabel = GROUP_TYPES.find(g => g.id === selectedGroupType)?.label || 'Friends';
        setCategory({ id: 'custom_vibe', label: `✨ ${groupLabel.replace(/^.*\s/, '')} Vibe`, color: 'bg-gradient-to-r from-violet-600 to-fuchsia-500' });
        setGameState('LOADING');

        try {
            const toneLabel = selectedTone ? TONE_OPTIONS.find(t => t.id === selectedTone)?.hint || '' : '';
            const generatedCards = await generateCustomMostLikelyTo(groupLabel, customContext.trim(), 15, toneLabel);

            if (generatedCards.length > 0) {
                setCards(generatedCards);
                setCurrentIndex(0);
                setGameState('PLAYING');
            } else {
                setCustomError('AI generation failed. Please try again or tweak your description.');
                setGameState('CUSTOM_SETUP');
            }
        } catch (e) {
            console.error("Custom generation failed", e);
            setCustomError('Something went wrong. Please try again.');
            setGameState('CUSTOM_SETUP');
        }
    };

    const handleVote = () => {
        setCountingDown(true);
        setCount(3);
    };

    useEffect(() => {
        if (countingDown && count > 0) {
            const timer = setTimeout(() => setCount(c => c - 1), 1000);
            return () => clearTimeout(timer);
        } else if (countingDown && count === 0) {
            const timer = setTimeout(() => setCountingDown(false), 1000);
            return () => clearTimeout(timer);
        }
    }, [countingDown, count]);

    const nextCard = async () => {
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(c => c + 1);
        } else if (category?.id === 'custom_vibe') {
            // For custom vibe, regenerate more with same context
            setGameState('LOADING');
            const groupLabel = GROUP_TYPES.find(g => g.id === selectedGroupType)?.label || 'Friends';
            const toneLabel = selectedTone ? TONE_OPTIONS.find(t => t.id === selectedTone)?.hint || '' : '';
            const more = await generateCustomMostLikelyTo(groupLabel, customContext.trim(), 10, toneLabel);
            setCards(prev => [...prev, ...more]);
            setCurrentIndex(c => c + 1);
            setGameState('PLAYING');
        } else {
            setGameState('LOADING');
            const more = await generateMostLikelyTo(category.id, 5);
            setCards(prev => [...prev, ...more]);
            setCurrentIndex(c => c + 1);
            setGameState('PLAYING');
        }
    };

    // --- CUSTOM SETUP SCREEN ---
    if (gameState === 'CUSTOM_SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Create Your Vibe" onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-1">
                    {/* Intro */}
                    <div className="text-center mb-6">
                        <div className="inline-flex bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 border border-violet-500/30 rounded-2xl p-4 mb-3">
                            <Wand2 size={32} className="text-violet-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">Personalised Cards</h2>
                        <p className="text-gray-400 text-sm max-w-sm mx-auto">
                            Tell us about your group and AI will generate "Most Likely To" cards that feel like they were written just for you.
                        </p>
                    </div>

                    {/* Step 1: Group Type Chips */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">
                            1. Who's playing?
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {GROUP_TYPES.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => setSelectedGroupType(g.id)}
                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 border
                                        ${selectedGroupType === g.id
                                            ? 'bg-violet-600/30 border-violet-500 text-violet-300 shadow-lg shadow-violet-500/20'
                                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                                        }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Tone Chips (optional) */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">
                            2. Set the tone <span className="text-gray-600 normal-case tracking-normal font-medium">(optional)</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {TONE_OPTIONS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedTone(selectedTone === t.id ? null : t.id)}
                                    className={`px-4 py-2.5 rounded-xl text-sm font-bold transition-all active:scale-95 border
                                        ${selectedTone === t.id
                                            ? 'bg-violet-600/30 border-violet-500 text-violet-300 shadow-lg shadow-violet-500/20'
                                            : 'bg-white/5 border-white/10 text-gray-400 hover:border-white/20'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        {selectedTone && (
                            <p className="text-xs text-gray-500 mt-2 pl-1">
                                {TONE_OPTIONS.find(t => t.id === selectedTone)?.hint}
                            </p>
                        )}
                    </div>

                    {/* Step 3: Context Text Box */}
                    <div className="mb-6">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 block">
                            3. The secret sauce — describe your group
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
                                className="w-full bg-transparent p-4 text-white placeholder-gray-600 text-sm leading-relaxed resize-none focus:outline-none"
                            />
                            <div className="flex justify-between items-center px-4 py-2 border-t border-white/5">
                                <span className={`text-xs font-bold ${wordCount > WORD_LIMIT ? 'text-red-400' : wordCount > WORD_LIMIT * 0.8 ? 'text-amber-400' : 'text-gray-500'}`}>
                                    {wordCount}/{WORD_LIMIT} words
                                </span>
                                {wordCount > 0 && wordCount <= 15 && (
                                    <span className="text-xs text-amber-400 font-medium">A bit more detail will help!</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tips */}
                    <div className="bg-violet-900/20 border border-violet-500/20 rounded-xl p-4 mb-6">
                        <p className="text-xs text-violet-300 font-bold uppercase tracking-widest mb-2">💡 Pro Tips for Better Cards</p>
                        <ul className="text-xs text-gray-400 space-y-1.5">
                            <li>• <strong className="text-gray-300">Name names:</strong> "Rahul always burns the food" → hilarious card</li>
                            <li>• <strong className="text-gray-300">Be specific:</strong> "Goa trip" → "Goa trip where Priya lost her passport"</li>
                            <li>• <strong className="text-gray-300">Add dynamics:</strong> "One person is vegetarian, one snores..."</li>
                        </ul>
                    </div>

                    {/* Error */}
                    {customError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
                            <p className="text-red-400 text-sm font-medium">{customError}</p>
                        </div>
                    )}

                    {/* Generate Button */}
                    <button
                        onClick={startCustomGame}
                        disabled={customContext.trim().length < 10 || wordCount > WORD_LIMIT}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                            ${customContext.trim().length >= 10 && wordCount <= WORD_LIMIT
                                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white shadow-lg shadow-violet-600/30 active:scale-[0.98]'
                                : 'bg-white/5 text-gray-500 cursor-not-allowed'
                            }`}
                    >
                        <Sparkles size={20} />
                        Generate Your Cards
                    </button>
                </div>
            </div>
        );
    }

    if (gameState === 'CATEGORY') {
        // Tab sizing matches Truth or Drink (compact py-3 px-4, 16px inline icon).
        // Per-category bottom-line variations (test designs — finalize later):
        //   pattern 'custom'       -> custom vibe: 2px colored ring + soft outer glow
        //   pattern 'full-bottom'  -> full-width 2px bottom line
        //   pattern 'third-bottom' -> 33% center-aligned bottom line
        //   pattern 'third-both'   -> 33% center-aligned line at top AND bottom
        // After the custom tile, the remaining categories cycle through the
        // 3 non-custom patterns so each appears in different colors.
        const TILES: Record<string, string> = {
            custom_vibe:     '#8B5CE0',
            family_friendly: '#35B4C8',
            fun:             '#6D72DD',
            scandalous:      '#E66AA3',
            adult:           '#EF4444',
            chaos:           '#A855F7',
            bbf:             '#9333EA',
        };
        const ICON_FOR: Record<string, React.ReactNode> = {
            custom_vibe:     <Wand2 size={16} />,
            family_friendly: <Users size={16} />,
            fun:             <Sparkles size={16} />,
            scandalous:      <Zap size={16} />,
            adult:           <Flame size={16} />,
            chaos:           <AlertTriangle size={16} />,
            bbf:             <Users size={16} />,
        };
        type AccentPattern = 'custom' | 'full-bottom' | 'third-bottom' | 'third-both';
        const NON_CUSTOM_CYCLE: AccentPattern[] = ['full-bottom', 'third-bottom', 'third-both'];
        const isAdultCat = (id: string) => ADULT_CATEGORY_IDS.includes(id);

        return (
            <div className="h-full flex flex-col animate-fade-in -mx-4 md:-mx-6 -mt-4 md:-mt-6">
                {/* Top bar — back chevron left + 32x32 home button right */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                    <button
                        onClick={onExit}
                        aria-label="Back"
                        className="p-1.5 -ml-1.5 text-ink-soft hover:text-ink transition-colors"
                    >
                        <ArrowLeft size={22} strokeWidth={2.2} />
                    </button>
                    <button
                        onClick={onExit}
                        aria-label="Home"
                        className="w-8 h-8 rounded-[10px] bg-surface-alt border border-border text-ink-soft hover:text-ink hover:bg-surface transition-colors flex items-center justify-center"
                    >
                        <Home size={18} strokeWidth={2} />
                    </button>
                </div>

                {/* Title block */}
                <div className="px-5 pt-1 pb-4">
                    <h1 className="font-serif font-bold text-[28px] tracking-[-0.015em] text-ink leading-tight">
                        Most Likely To…
                    </h1>
                    <p className="mt-1.5 text-[13px] text-muted leading-[1.5]">
                        Pick a category to begin. Swap anytime.
                    </p>
                </div>

                {showPinGate && (
                    <PinGateModal
                        onSuccess={() => {
                            setShowPinGate(false);
                            if (pendingAdultCat) startGame(pendingAdultCat);
                            setPendingAdultCat(null);
                        }}
                        onCancel={() => {
                            setShowPinGate(false);
                            setPendingAdultCat(null);
                        }}
                    />
                )}

                {/* Category list — TOD-sized tabs, 4 different accent patterns */}
                <div className="flex-1 overflow-y-auto px-4 pb-5">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {MOST_LIKELY_TO_CATEGORIES.map((cat: any, idx: number) => {
                            const color = TILES[cat.id] || '#94A3B8';
                            const adult = isAdultCat(cat.id);
                            const isCustom = cat.id === 'custom_vibe';
                            // Custom always gets the special pattern; others cycle.
                            const pattern: AccentPattern = isCustom
                                ? 'custom'
                                : NON_CUSTOM_CYCLE[(idx - 1) % NON_CUSTOM_CYCLE.length];

                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => !cat.disabled && startGame(cat)}
                                    disabled={cat.disabled}
                                    className={`group relative w-full text-left transition-all duration-200 ${cat.disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-[0.99] cursor-pointer'}`}
                                >
                                    <div
                                        className="relative bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/[0.08] hover:border-white/20 rounded-xl py-3 px-4 transition-colors overflow-hidden"
                                        style={pattern === 'custom' ? {
                                            borderColor: color,
                                            borderWidth: 2,
                                            boxShadow: `0 0 18px ${color}55, inset 0 0 0 1px ${color}33`,
                                        } : undefined}
                                    >
                                        {/* Pattern: full-width bottom line */}
                                        {pattern === 'full-bottom' && (
                                            <span
                                                className="absolute left-0 right-0 bottom-0 h-[2px]"
                                                style={{ background: color }}
                                            />
                                        )}
                                        {/* Pattern: 33% center bottom only */}
                                        {pattern === 'third-bottom' && (
                                            <span
                                                className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                                style={{ background: color }}
                                            />
                                        )}
                                        {/* Pattern: 33% center top AND bottom */}
                                        {pattern === 'third-both' && (
                                            <>
                                                <span
                                                    className="absolute top-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
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
                                                {ICON_FOR[cat.id]}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{cat.label}</span>
                                                    {adult && (
                                                        <span className="text-[9px] font-extrabold tracking-[0.1em] text-red-400 bg-red-500/15 px-1.5 py-[2px] rounded flex-shrink-0">
                                                            18+
                                                        </span>
                                                    )}
                                                    {cat.disabled && (
                                                        <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded uppercase tracking-wider text-muted font-medium flex-shrink-0">
                                                            Soon
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-xs text-muted leading-snug truncate">
                                                    {cat.description}
                                                </p>
                                            </div>
                                            <ChevronRight size={16} className="text-muted flex-shrink-0" />
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


    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Generating..." onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-violet-400 animate-pulse" size={24} />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-white mb-1">
                            {category?.id === 'custom_vibe' ? 'Crafting your personalised cards...' : `Brewing ${category?.label} questions...`}
                        </p>
                        {category?.id === 'custom_vibe' && (
                            <p className="text-gray-500 text-sm">AI is reading your context and writing cards just for you</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // PLAYING State — V1 top + card (kept), original bottom (restored per feedback).
    // Solid + tint colors live alongside the card. Custom vibe uses violet,
    // adult uses red, everything else picks from a small palette.
    const PLAY_TILES: Record<string, { solid: string; tint: string }> = {
        custom_vibe:     { solid: '#8B5CE0', tint: 'rgba(139, 92, 224, 0.18)' },
        family_friendly: { solid: '#35B4C8', tint: 'rgba(53, 180, 200, 0.18)' },
        fun:             { solid: '#6D72DD', tint: 'rgba(109, 114, 221, 0.18)' },
        scandalous:      { solid: '#E66AA3', tint: 'rgba(230, 106, 163, 0.18)' },
        adult:           { solid: '#EF4444', tint: 'rgba(239, 68, 68, 0.18)' },
        chaos:           { solid: '#A855F7', tint: 'rgba(168, 85, 247, 0.18)' },
        bbf:             { solid: '#9333EA', tint: 'rgba(147, 51, 234, 0.18)' },
    };
    const playTile = PLAY_TILES[category?.id as string] || PLAY_TILES.fun;
    const total = cards.length;

    return (
        <div className="h-full flex flex-col animate-fade-in -mx-4 md:-mx-6 -mt-4 md:-mt-6">
            {/*
             * V1 top bar — back left, center 2-line label (BIGGER bolder per
             * feedback), home button right. Counter moves above progress dots
             * so the home button can occupy the traditional top-right slot and
             * the rule "home available at all times" is satisfied on every screen.
             */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <button
                    onClick={() => setGameState('CATEGORY')}
                    aria-label="Back to categories"
                    className="p-1.5 -ml-1.5 text-ink-soft hover:text-ink transition-colors disabled:opacity-50"
                    disabled={countingDown}
                >
                    <ArrowLeft size={22} strokeWidth={2.2} />
                </button>
                <div className="text-center flex-1 px-2 min-w-0">
                    <div className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-ink-soft truncate">
                        Most Likely To
                    </div>
                    <div className="text-[13px] font-semibold mt-0.5 truncate" style={{ color: playTile.solid }}>
                        {category?.label}
                    </div>
                </div>
                <button
                    onClick={onExit}
                    aria-label="Home"
                    className="w-8 h-8 rounded-[10px] bg-surface-alt border border-border text-ink-soft hover:text-ink hover:bg-surface transition-colors flex items-center justify-center flex-shrink-0"
                    disabled={countingDown}
                >
                    <Home size={18} strokeWidth={2} />
                </button>
            </div>

            {/* Counter + progress dots row */}
            <div className="px-5 pb-3.5">
                <div className="text-[11px] text-muted text-center mb-1.5">
                    Card {currentIndex + 1} of {total}
                </div>
                <div className="flex justify-center gap-[5px]">
                    {Array.from({ length: total }).map((_, i) => (
                        <div
                            key={i}
                            className="h-[3px] flex-1 max-w-[32px] rounded-[2px] transition-colors"
                            style={{ background: i <= currentIndex ? playTile.solid : 'var(--color-border)' }}
                        />
                    ))}
                </div>
            </div>

            {/* Portrait 3:4 prompt card — kept from V1 */}
            <div className="flex-1 flex items-center justify-center px-4 pb-4 relative">
                <div
                    className="w-full aspect-[3/4] max-h-[460px] bg-surface border border-border rounded-[22px] p-7 flex flex-col relative overflow-hidden"
                    style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                >
                    {/* Decorative blob top-right */}
                    <div
                        className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                        style={{ background: playTile.tint }}
                    />
                    {/* Game-name pill, top-left */}
                    <div
                        className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                        style={{ background: playTile.tint, color: playTile.solid }}
                    >
                        Most Likely To
                    </div>
                    {/* Prompt — Playfair, centered vertically */}
                    <div className="flex-1 flex items-center relative z-10">
                        <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-ink">
                            {cards[currentIndex]}
                        </p>
                    </div>
                    {/* Footer — verb left, "PartySpark" italic right */}
                    <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                        <span>Point to who fits.</span>
                        <span className="font-serif italic text-[12px]" style={{ color: playTile.solid }}>
                            PartySpark
                        </span>
                    </div>
                </div>

                {/* Countdown Overlay (original game mechanic, preserved) */}
                {countingDown && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="text-center">
                            <div className="text-[120px] font-black text-white animate-bounce leading-none">
                                {count === 0 ? "👉 POINT!" : count}
                            </div>
                            <p className="text-2xl font-bold mt-4 text-party-accent">
                                {count === 0 ? "" : "Get Ready to Point..."}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/*
             * Bottom actions — RESTORED original layout:
             *   • Big "3-2-1 Vote!" gradient button (primary mechanic)
             *   • Secondary row with [Skip] (renamed from "Change Topic" per
             *     user feedback — Skip advances without voting) + [Next Card →]
             */}
            <div className="px-4 pb-5 flex flex-col gap-3">
                <button
                    onClick={handleVote}
                    disabled={countingDown}
                    className="w-full py-5 rounded-lg font-bold text-xl tracking-wide bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                    <Hand size={24} />
                    3-2-1 Vote!
                </button>
                <div className="flex gap-3">
                    <button
                        onClick={nextCard}
                        disabled={countingDown}
                        className="flex-1 py-3 rounded-lg font-medium text-sm bg-party-surface text-white border border-white/5 hover:bg-slate-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Skip
                    </button>
                    <button
                        onClick={nextCard}
                        disabled={countingDown}
                        className="flex-1 py-3 rounded-lg font-bold text-sm bg-party-secondary text-slate-900 hover:bg-yellow-400 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                        Next Card
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
