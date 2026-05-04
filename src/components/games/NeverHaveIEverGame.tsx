import React, { useState, useEffect } from 'react';
import { NEVER_HAVE_I_EVER_CATEGORIES } from '../../constants';
import { ScreenHeader } from '../ui/Layout';
import neverHaveIEverData from '../../data/never_have_i_ever.json';
import { generateNeverHaveIEver, generateCustomNeverHaveIEver } from '../../services/geminiService';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Lock, ChevronRight, Hand, Users, Wand2, ShieldCheck, Flame, Smile } from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';

interface GameProps {
    onExit: () => void;
}

// Per-category palette shared by the SELECT screen tile accents and the PLAY
// screen card body. Two variants — light values darkened ~20% and tint
// alpha bumped so blobs read against #FFFFFF surfaces.
type Pal = { Icon: LucideIcon; solid: string; tintAlpha: number };
const CATEGORY_DARK: Record<string, Pal> = {
    custom_vibe:      { Icon: Wand2,         solid: '#8B5CE0', tintAlpha: 0.18 },
    family_friendly:  { Icon: Smile,         solid: '#0EA5E9', tintAlpha: 0.18 },
    classic:          { Icon: Hand,          solid: '#10B981', tintAlpha: 0.18 },
    bbf:              { Icon: Users,         solid: '#9333EA', tintAlpha: 0.18 },
    guilty_pleasures: { Icon: Lock,          solid: '#EC4899', tintAlpha: 0.18 },
    no_filter:        { Icon: Flame,         solid: '#DC2626', tintAlpha: 0.18 },
};
const CATEGORY_LIGHT: Record<string, Pal> = {
    custom_vibe:      { Icon: Wand2,         solid: '#9266D2', tintAlpha: 0.30 }, // Azure tiles.mostLikely
    family_friendly:  { Icon: Smile,         solid: '#0284C7', tintAlpha: 0.26 },
    classic:          { Icon: Hand,          solid: '#0E8C66', tintAlpha: 0.26 },
    bbf:              { Icon: Users,         solid: '#7B27C9', tintAlpha: 0.26 },
    guilty_pleasures: { Icon: Lock,          solid: '#C72D7F', tintAlpha: 0.26 },
    no_filter:        { Icon: Flame,         solid: '#B91C1C', tintAlpha: 0.26 },
};
const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// Custom-vibe configuration mirrors MLT/TOD — same group/tone chips,
// same word limit, same placeholder rotation. Examples are NHIE-flavored.
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
    `e.g. "5 college friends from Mumbai reuniting in Goa after 8 years. Rahul has a new boyfriend nobody's met. Priya is teetotal now."`,
    `e.g. "A couple's anniversary weekend in Bali. She's obsessed with yoga, he's all about food. They're trying to decide on kids."`,
    `e.g. "Extended family Diwali — 3 generations. Grandma still thinks she's in charge. Two cousins haven't spoken since the 2019 wedding."`,
    `e.g. "4 work friends at a Rishikesh offsite. The manager is trying too hard. Two interns are scared. Someone brought tequila."`,
];

export const NeverHaveIEverGame: React.FC<GameProps> = ({ onExit }) => {
    const { theme } = useTheme();
    const PALETTE_MAP = theme === 'light' ? CATEGORY_LIGHT : CATEGORY_DARK;
    const catPalette = (id: string) => {
        const e = PALETTE_MAP[id] || { Icon: Sparkles as LucideIcon, solid: '#94A3B8', tintAlpha: 0.18 };
        return { Icon: e.Icon, solid: e.solid, tint: hexToRgba(e.solid, e.tintAlpha) };
    };
    const [gameState, setGameState] = useState<'SELECT' | 'CUSTOM_SETUP' | 'LOADING' | 'PLAY'>('SELECT');
    const [category, setCategory] = useState<string>('');
    const [cards, setCards] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Custom-vibe state — same shape as MLT/TOD's custom flow.
    const [selectedGroupType, setSelectedGroupType] = useState('friends');
    const [selectedTone, setSelectedTone] = useState<string | null>(null);
    const [customContext, setCustomContext] = useState('');
    const [customError, setCustomError] = useState('');
    const [placeholderIdx] = useState(Math.floor(Math.random() * PLACEHOLDER_EXAMPLES.length));

    // Temporary PIN gate on the Create-Your-Vibe tile while AI prompts are
    // still being tuned in production. Same PIN as adult content. Drop
    // showPinGate + the gate intercept once Custom Vibe is signed off.
    const [showPinGate, setShowPinGate] = useState(false);

    const wordCount = customContext.trim().split(/\s+/).filter(Boolean).length;

    // Initialize with local data depending on category. Skip for custom_vibe —
    // its deck comes from AI generation and is set directly by startCustomGame.
    // Cards already played this session are filtered out; if the pool runs dry
    // we fall back to the full set so the round can still play.
    useEffect(() => {
        if (gameState === 'PLAY' && category && category !== 'custom_vibe') {
            const localCards = (neverHaveIEverData as Record<string, string[]>)[category] || [];
            const available = sessionService.filterContent(
                GameType.NEVER_HAVE_I_EVER,
                category,
                localCards,
                (c) => c
            );
            const pool = available.length > 0 ? available : localCards;
            setCards(shuffle(pool));
            setCurrentIndex(0);
        }
    }, [gameState, category]);

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
        setGameState('LOADING');

        try {
            // Pass IDs — server-side advanced prompt expands them.
            const generated = await generateCustomNeverHaveIEver(selectedGroupType, customContext.trim(), 15, selectedTone || '');

            if (generated.length > 0) {
                setCards(generated);
                setCurrentIndex(0);
                setGameState('PLAY');
            } else {
                setCustomError('AI generation failed. Please try again or tweak your description.');
                setGameState('CUSTOM_SETUP');
            }
        } catch (e) {
            console.error('Custom NHIE generation failed', e);
            setCustomError('Something went wrong. Please try again.');
            setGameState('CUSTOM_SETUP');
        }
    };

    const handleNextCard = async () => {
        // Mark the card the user just saw as played so it won't repeat this session.
        // Custom-vibe cards are AI-generated per session and not tracked.
        if (cards[currentIndex] && category && category !== 'custom_vibe') {
            sessionService.markAsUsed(GameType.NEVER_HAVE_I_EVER, category, cards[currentIndex]);
        }

        if (currentIndex < cards.length - 1) {
            setCurrentIndex(prev => prev + 1);
            return;
        }
        // Out of cards — refill via the matching generator.
        setIsLoading(true);
        try {
            let newCards: string[] = [];
            if (category === 'custom_vibe') {
                // Mid-game refill — same ID-based call shape as startCustomGame.
                newCards = await generateCustomNeverHaveIEver(selectedGroupType, customContext.trim(), 10, selectedTone || '');
            } else {
                newCards = await generateNeverHaveIEver(category, 5);
            }
            setCards(prev => [...prev, ...newCards]);
            setCurrentIndex(prev => prev + 1);
        } catch (error) {
            console.error('Failed to generate Never Have I Ever cards:', error);
        } finally {
            setIsLoading(false);
        }
    };

    if (gameState === 'SELECT') {
        // Slim Row pattern: 3px inset left bar + 33% center bottom line for the
        // curated decks. The custom-vibe tile gets the MLT-style 2px ring +
        // glow treatment instead so it reads as the AI special.
        return (
            <div className="flex flex-col h-full animate-fade-in relative">
                <ScreenHeader title="Never Have I Ever" onBack={onExit} onHome={onExit} />

                {showPinGate && (
                    <PinGateModal
                        onSuccess={() => {
                            setShowPinGate(false);
                            setGameState('CUSTOM_SETUP');
                        }}
                        onCancel={() => setShowPinGate(false)}
                    />
                )}

                <div className="flex-1 overflow-y-auto pb-8">
                    <p className="text-muted mb-4 text-sm text-center">
                        Pick a category. Stand up if you've done it. Last one sitting wins.
                    </p>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {NEVER_HAVE_I_EVER_CATEGORIES.map((cat) => {
                            const meta = catPalette(cat.id);
                            const Icon = meta.Icon;
                            const color = meta.solid;
                            const isCustom = cat.id === 'custom_vibe';
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        // PIN gate on Custom Vibe (temporary,
                                        // while AI prompts are being tuned).
                                        if (isCustom && !isAdultUnlocked()) {
                                            setCategory(cat.id);
                                            setShowPinGate(true);
                                            return;
                                        }
                                        setCategory(cat.id);
                                        setGameState(isCustom ? 'CUSTOM_SETUP' : 'PLAY');
                                    }}
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
                                                <Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight truncate">{cat.label}</h3>
                                                <p className="text-xs text-muted leading-snug truncate">{cat.description}</p>
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

    // CUSTOM_SETUP — describe your group for AI generation. Mirrors MLT/TOD's
    // Create-Your-Vibe input page: chip sizing, label scale, section spacing,
    // pro-tips treatment all match.
    if (gameState === 'CUSTOM_SETUP') {
        const canGenerate = customContext.trim().length >= 10 && wordCount <= WORD_LIMIT;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Create Your Vibe" onBack={() => setGameState('SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-1">
                    {/* Intro */}
                    <div className="text-center mb-3">
                        <div className="inline-flex bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 border border-violet-500/30 rounded-2xl p-3 mb-2">
                            <Wand2 size={24} className="text-vibe" />
                        </div>
                        <h2 className="text-lg font-bold text-ink mb-0.5">Personalised Statements</h2>
                        <p className="text-muted text-xs">
                            AI-written statements, tailored to your group.
                        </p>
                    </div>

                    {/* Step 1: Group Type Chips */}
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
                                            ? 'bg-violet-600/30 border-violet-500 text-vibe'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft/40'
                                        }`}
                                >
                                    {g.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Step 2: Tone Chips (optional) */}
                    <div className="mb-3">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">
                            2. Set the tone <span className="text-muted normal-case tracking-normal font-medium">(optional)</span>
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {TONE_OPTIONS.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setSelectedTone(selectedTone === t.id ? null : t.id)}
                                    className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border truncate
                                        ${selectedTone === t.id
                                            ? 'bg-violet-600/30 border-violet-500 text-vibe'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft/40'
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

                    {/* Step 3: Context Text Box — starts at rows=2, auto-grows
                        on input via scrollHeight (capped at 240px). */}
                    <div className="mb-3">
                        <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">
                            3. The secret sauce — describe your group
                        </label>
                        <div className="bg-surface-alt border border-divider rounded-xl focus-within:border-violet-500/50 transition-colors">
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

                    {/* Pro Tips — examples shortened so each fits on one line. */}
                    <div className="bg-violet-900/20 border border-violet-500/20 rounded-xl p-3 mb-3">
                        <p className="text-[11px] text-vibe font-bold uppercase tracking-widest mb-1.5">💡 Pro Tips</p>
                        <ul className="text-[11px] text-muted space-y-0.5 leading-snug">
                            <li>• <strong className="text-ink-soft">Name names</strong> — "Aisha hates confrontation"</li>
                            <li>• <strong className="text-ink-soft">Be specific</strong> — places, trips, situations</li>
                            <li>• <strong className="text-ink-soft">Add dynamics</strong> — exes, rivalries, jokes</li>
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
                        onClick={startCustomGame}
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

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Generating..." onBack={() => setGameState('CUSTOM_SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                        <Wand2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-vibe animate-pulse" size={24} />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-ink mb-1">Crafting your personalised statements…</p>
                        <p className="text-muted text-sm">AI is reading your context and writing cards just for you.</p>
                    </div>
                </div>
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <ScreenHeader title="Never Have I Ever" onBack={() => setGameState('SELECT')} onHome={onExit} />
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-pulse flex items-center gap-2 text-cyan-500">
                        <Sparkles className="animate-spin" />
                        <span className="font-bold tracking-widest uppercase">Shuffling Cards...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <ScreenHeader 
                title={NEVER_HAVE_I_EVER_CATEGORIES.find(c => c.id === category)?.label || "Never Have I Ever"} 
                onBack={() => setGameState('SELECT')} 
                onHome={onExit}
            />

            <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
                {/* Decorative background shapes for flavor */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                    <div className="absolute top-10 left-10 w-32 h-32 bg-cyan-600 rounded-full blur-3xl mix-blend-screen" />
                    <div className="absolute bottom-10 right-10 w-40 h-40 bg-pink-600 rounded-full blur-3xl mix-blend-screen" />
                </div>

                {/* Card body — same MLT play-screen styling as Charades / Taboo /
                    MLT itself. Portrait 3:4, surface bg, decorative tinted blob,
                    header pill in the category color, Playfair prompt centered,
                    counter + italic PartySpark footer (replaces the old floating
                    number badge). */}
                {(() => {
                    const palette = catPalette(category);
                    return (
                        <div className="w-full max-w-sm relative z-10 perspective-1000">
                            <div
                                className="w-full aspect-[3/4] max-h-[460px] bg-surface border border-divider rounded-[22px] p-7 flex flex-col relative overflow-hidden"
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
                                    Never Have I Ever
                                </div>
                                <div className="flex-1 flex items-center justify-center relative z-10">
                                    <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-ink text-center whitespace-pre-wrap">
                                        {cards[currentIndex]}
                                    </p>
                                </div>
                                <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                                    <span>Card {currentIndex + 1} of {cards.length}</span>
                                    <span className="font-serif italic text-[12px]" style={{ color: palette.solid }}>PartySpark</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* I've Never / I Have — outline-only CTAs matching the
                    TOD Truth/Drink row. Emerald for the innocent claim,
                    rose for the confession. Tint only appears on hover.
                    Both buttons advance to the next statement (NHIE has
                    no per-player turn so the declaration is purely
                    flavor). */}
                <div className="w-full max-w-sm mt-12 flex flex-col gap-3">
                    <div className="flex gap-3">
                        <button
                            onClick={handleNextCard}
                            disabled={isLoading}
                            className="flex-1 py-4 rounded-xl font-bold text-base text-emerald-600 bg-transparent border-2 border-emerald-500/60 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <ShieldCheck size={18} />
                            I've Never
                        </button>
                        <button
                            onClick={handleNextCard}
                            disabled={isLoading}
                            className="flex-1 py-4 rounded-xl font-bold text-base text-rose-600 bg-transparent border-2 border-rose-500/60 hover:bg-rose-500/10 hover:border-rose-500 transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Hand size={18} />
                            I Have
                        </button>
                    </div>
                    {isLoading ? (
                        <p className="text-center text-xs text-vibe font-medium flex items-center justify-center gap-2">
                            <Sparkles className="animate-spin" size={14} /> Generating more statements…
                        </p>
                    ) : (
                        <p className="text-center text-xs text-muted font-medium">Stand up if you've done it!</p>
                    )}
                </div>
            </div>
        </div>
    );
};
