import React, { useState, useEffect } from 'react';
import { ScreenHeader } from '../ui/Layout';
import { generateMostLikelyTo, generateCustomMostLikelyTo } from '../../services/geminiService';
import { MOST_LIKELY_TO_CATEGORIES } from '../../constants';
import { Users, ChevronRight, Hand, AlertTriangle, Sparkles, Flame, Zap, Wand2, ArrowLeft, Home } from 'lucide-react';
import MOST_LIKELY_TO_DATA from '../../data/most_likely_to.json';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';
import { useTheme } from '../../contexts/ThemeContext';

// Per-category accent colors. Dark values are the original hues; light values
// are darkened/saturated so they read against #EEF4FA. Tint opacity bumps in
// light because rgba(...,0.18) blobs disappear against white surfaces.
type TileEntry = { solid: string; tintAlpha: number };
const TILES_DARK: Record<string, TileEntry> = {
    custom_vibe:     { solid: '#8B5CE0', tintAlpha: 0.18 },
    family_friendly: { solid: '#35B4C8', tintAlpha: 0.18 },
    fun:             { solid: '#6D72DD', tintAlpha: 0.18 },
    scandalous:      { solid: '#E66AA3', tintAlpha: 0.18 },
    adult:           { solid: '#EF4444', tintAlpha: 0.18 },
    chaos:           { solid: '#A855F7', tintAlpha: 0.18 },
    bbf:             { solid: '#9333EA', tintAlpha: 0.18 },
};
const TILES_LIGHT: Record<string, TileEntry> = {
    // custom_vibe matches Azure Sky tiles.mostLikely.solid; the rest are
    // darkened ~20% from dark mode so they hit AA contrast on #FFFFFF surface.
    custom_vibe:     { solid: '#9266D2', tintAlpha: 0.30 },
    family_friendly: { solid: '#1F94A6', tintAlpha: 0.28 },
    fun:             { solid: '#4A50C0', tintAlpha: 0.26 },
    scandalous:      { solid: '#C84F87', tintAlpha: 0.26 },
    adult:           { solid: '#C03737', tintAlpha: 0.24 },
    chaos:           { solid: '#7B2EBF', tintAlpha: 0.24 },
    bbf:             { solid: '#7B27C9', tintAlpha: 0.24 },
};
const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

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
    { id: 'clean', label: '😇 Clean',  hint: 'PG — safe for all ages' },
    { id: 'cheeky', label: '😏 Cheeky', hint: 'PG-13 — light teasing, innuendo OK' },
    { id: 'spicy', label: '🔥 Spicy',  hint: 'R-rated — bold, flirty, no filter' },
];

const WORD_LIMIT = 150;

const PLACEHOLDER_EXAMPLES = [
    `e.g. "5 college friends from Mumbai reuniting in Goa after 8 years. Rahul just got divorced, Priya runs a startup, and Sid still acts like he's 20."`,
    `e.g. "A couple celebrating their anniversary in Bali. She's obsessed with yoga, he just wants to eat. They have two kids at home with grandma."`,
    `e.g. "Extended family trip to Jaipur — 3 generations. Grandma thinks she's the boss, the cousins are competing for attention, one uncle won't stop giving speeches."`,
    `e.g. "4 work friends at a weekend offsite in Rishikesh. The manager is trying to be cool. Two interns are terrified. One person brought a guitar nobody asked for."`,
];

export const MostLikelyToGame: React.FC<Props> = ({ onExit }) => {
    const { theme } = useTheme();
    const TILES_MAP = theme === 'light' ? TILES_LIGHT : TILES_DARK;
    const tilePalette = (id: string) => {
        const entry = TILES_MAP[id] || { solid: '#94A3B8', tintAlpha: 0.18 };
        return { solid: entry.solid, tint: hexToRgba(entry.solid, entry.tintAlpha) };
    };
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
        // Gate adult categories AND custom-vibe (the latter is temporary
        // while AI prompts are still being tuned in production — drop the
        // `|| cat.isCustom` clause once Custom Vibe is signed off).
        const needsPin = ADULT_CATEGORY_IDS.includes(cat.id) || cat.isCustom;
        if (needsPin && !isAdultUnlocked()) {
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
            selectedCards = shuffle(availableLocal).slice(0, BATCH_SIZE);
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
            // Pass IDs (e.g. 'friends', 'spicy') — the new MLT prompt expands
            // them server-side via GROUP_TYPE_GUIDANCE / TONE_DEFINITIONS.
            const generatedCards = await generateCustomMostLikelyTo(selectedGroupType, customContext.trim(), 15, selectedTone || '');

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
            // Mid-game refill — same ID-based call shape as startCustomGame.
            const more = await generateCustomMostLikelyTo(selectedGroupType, customContext.trim(), 10, selectedTone || '');
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
                    {/* Intro — short, punchy. Wand2 icon a touch smaller and
                        section gap trimmed. */}
                    <div className="text-center mb-3">
                        <div className="inline-flex bg-accent-soft border border-accent/30 rounded-2xl p-3 mb-2">
                            <Wand2 size={24} className="text-accent" />
                        </div>
                        <h2 className="text-lg font-bold text-ink mb-0.5">Personalised Cards</h2>
                        <p className="text-muted text-xs">
                            AI-written cards, tailored to your group.
                        </p>
                    </div>

                    {/* Step 1: Group Type Chips — slimmer pill height + smaller
                        type so they hug less vertical space. */}
                    <div className="mb-3">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">
                            1. Who's playing?
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                            {GROUP_TYPES.map(g => (
                                <button
                                    key={g.id}
                                    onClick={() => setSelectedGroupType(g.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border
                                        ${selectedGroupType === g.id
                                            ? 'bg-accent-soft border-accent text-accent'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft hover:text-ink-soft'
                                        }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Tone Chips (optional). Equal-width 3-column grid
                        with the same slim height as Step 1. */}
                    <div className="mb-3">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">
                            2. Set the tone <span className="text-muted/70 normal-case tracking-normal font-medium">(optional)</span>
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {TONE_OPTIONS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedTone(selectedTone === t.id ? null : t.id)}
                                    className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border truncate
                                        ${selectedTone === t.id
                                            ? 'bg-accent-soft border-accent text-accent'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft hover:text-ink-soft'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        {selectedTone && (
                            <p className="text-[11px] text-muted mt-1 pl-1">
                                {TONE_OPTIONS.find(t => t.id === selectedTone)?.hint}
                            </p>
                        )}
                    </div>

                    {/* Step 3: Context Text Box — slimmer padding so the default
                        rows=2 actually feels like 2 lines. Grows on input via
                        scrollHeight (capped at 240px). */}
                    <div className="mb-3">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">
                            3. The secret sauce — describe your group
                        </label>
                        <div className="bg-surface-alt border border-divider rounded-xl focus-within:border-accent transition-colors">
                            <textarea
                                value={customContext}
                                onChange={(e) => {
                                    setCustomContext(e.target.value);
                                    setCustomError('');
                                    e.target.style.height = 'auto';
                                    e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
                                }}
                                placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
                                rows={2}
                                className="w-full bg-transparent px-3 pt-2 pb-1 text-ink placeholder:text-muted text-sm leading-snug resize-none focus:outline-none overflow-hidden"
                            />
                            <div className="flex justify-between items-center px-3 py-1 border-t border-divider-soft">
                                <span className={`text-[11px] font-bold ${wordCount > WORD_LIMIT ? 'text-red-500' : wordCount > WORD_LIMIT * 0.8 ? 'text-amber-500' : 'text-muted'}`}>
                                    {wordCount}/{WORD_LIMIT} words
                                </span>
                                {wordCount > 0 && wordCount <= 15 && (
                                    <span className="text-[11px] text-amber-500 font-medium">A bit more detail will help!</span>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Tips — examples shortened so each fits on one line on
                        a 340px-wide layout. */}
                    <div className="bg-accent-soft border border-accent/30 rounded-xl p-3 mb-3">
                        <p className="text-[11px] text-accent font-bold uppercase tracking-widest mb-1.5">💡 Pro Tips</p>
                        <ul className="text-[11px] text-ink-soft space-y-0.5 leading-snug">
                            <li>• <strong className="text-ink">Name names</strong> — "Rahul burns the food"</li>
                            <li>• <strong className="text-ink">Be specific</strong> — places, trips, situations</li>
                            <li>• <strong className="text-ink">Add dynamics</strong> — exes, rivalries, jokes</li>
                        </ul>
                    </div>

                    {/* Error */}
                    {customError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-4 text-center">
                            <p className="text-red-500 text-sm font-medium">{customError}</p>
                        </div>
                    )}

                    {/* Generate Button — keeps the violet→fuchsia gradient as a
                        brand moment that works on both backgrounds. */}
                    <button
                        onClick={startCustomGame}
                        disabled={customContext.trim().length < 10 || wordCount > WORD_LIMIT}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                            ${customContext.trim().length >= 10 && wordCount <= WORD_LIMIT
                                ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 hover:from-violet-500 hover:to-fuchsia-400 text-white active:scale-[0.98] shadow-lg shadow-violet-600/30'
                                : 'bg-surface-alt text-muted cursor-not-allowed border border-divider'
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
        const ICON_FOR: Record<string, React.ReactNode> = {
            custom_vibe:     <Wand2 size={16} />,
            family_friendly: <Users size={16} />,
            fun:             <Sparkles size={16} />,
            scandalous:      <Zap size={16} />,
            adult:           <Flame size={16} />,
            chaos:           <AlertTriangle size={16} />,
            bbf:             <Users size={16} />,
        };
        const isAdultCat = (id: string) => ADULT_CATEGORY_IDS.includes(id);

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Most Likely To..." onBack={onExit} onHome={onExit} />
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
                <p className="text-muted mb-4 text-sm text-center">
                    Pick a vibe. Read the card. Everyone points on 3!
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {MOST_LIKELY_TO_CATEGORIES.map((cat: any) => {
                            const color = tilePalette(cat.id).solid;
                            const adult = isAdultCat(cat.id);
                            const isCustom = cat.id === 'custom_vibe';
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => !cat.disabled && startGame(cat)}
                                    disabled={cat.disabled}
                                    className={`group relative w-full text-left transition-all duration-200 ${cat.disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-[0.99] cursor-pointer'}`}
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
                                                {ICON_FOR[cat.id]}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{cat.label}</span>
                                                    {adult && (
                                                        <span className="text-[9px] font-extrabold tracking-[0.1em] text-red-500 bg-red-500/15 px-1.5 py-[2px] rounded flex-shrink-0">
                                                            18+
                                                        </span>
                                                    )}
                                                    {cat.disabled && (
                                                        <span className="text-[9px] bg-surface-alt px-1.5 py-0.5 rounded uppercase tracking-wider text-muted font-medium flex-shrink-0">
                                                            Soon
                                                        </span>
                                                    )}
                                                </h3>
                                                <p className="text-xs text-muted leading-snug truncate">
                                                    {cat.description}
                                                </p>
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


    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Generating..." onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
                        <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent animate-pulse" size={24} />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-ink mb-1">
                            {category?.id === 'custom_vibe' ? 'Crafting your personalised cards...' : `Brewing ${category?.label} questions...`}
                        </p>
                        {category?.id === 'custom_vibe' && (
                            <p className="text-muted text-sm">AI is reading your context and writing cards just for you</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // PLAYING State — V1 top + portrait card, original 3-2-1 / Skip / Next bottom.
    const playTile = tilePalette((category?.id as string) || 'fun');
    const total = cards.length;

    return (
        <div className="h-full flex flex-col animate-fade-in -mx-4 md:-mx-6 -mt-4 md:-mt-6">
            {/* Top bar — back left, 2-line title center, home right. */}
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
                    className="w-8 h-8 rounded-[10px] bg-surface-alt border border-divider text-ink-soft hover:text-ink hover:bg-app-tint transition-colors flex items-center justify-center flex-shrink-0"
                    disabled={countingDown}
                >
                    <Home size={18} strokeWidth={2} />
                </button>
            </div>

            {/* Counter + progress dots */}
            <div className="px-5 pb-3.5">
                <div className="text-[11px] text-muted text-center mb-1.5">
                    Card {currentIndex + 1} of {total}
                </div>
                <div className="flex justify-center gap-[5px]">
                    {Array.from({ length: total }).map((_, i) => (
                        <div
                            key={i}
                            className="h-[3px] flex-1 max-w-[32px] rounded-[2px] transition-colors"
                            style={{ background: i <= currentIndex ? playTile.solid : 'var(--c-border)' }}
                        />
                    ))}
                </div>
            </div>

            {/* Portrait 3:4 prompt card */}
            <div className="flex-1 flex items-center justify-center px-4 pb-4 relative">
                <div
                    className="w-full aspect-[3/4] max-h-[460px] bg-surface border border-divider rounded-[22px] p-7 flex flex-col relative overflow-hidden"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                >
                    {/* Decorative blob top-right */}
                    <div
                        className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                        style={{ background: playTile.tint }}
                    />
                    {/* Game-name pill */}
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
                    {/* Footer — verb left, italic "PartySpark" right */}
                    <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                        <span>Point to who fits.</span>
                        <span className="font-serif italic text-[12px]" style={{ color: playTile.solid }}>
                            PartySpark
                        </span>
                    </div>
                </div>

                {/* Countdown Overlay — keep dark to maximize legibility of the
                    huge centered count. Works against either theme bg since
                    it's a full-screen scrim with white text on top. */}
                {countingDown && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="text-center">
                            <div className="text-[120px] font-black text-white animate-bounce leading-none">
                                {count === 0 ? "👉 POINT!" : count}
                            </div>
                            <p className="text-2xl font-bold mt-4 text-accent">
                                {count === 0 ? "" : "Get Ready to Point..."}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom actions — keep the violet→pink gradient on the hero CTA
                as a brand moment that reads on either bg. Skip / Next route
                through semantic tokens. */}
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
                        className="flex-1 py-3 rounded-lg font-medium text-sm bg-surface text-ink border border-divider hover:bg-surface-alt transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Skip
                    </button>
                    <button
                        onClick={nextCard}
                        disabled={countingDown}
                        className="flex-1 py-3 rounded-lg font-bold text-sm bg-gold text-slate-900 hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1"
                    >
                        Next Card
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
};
