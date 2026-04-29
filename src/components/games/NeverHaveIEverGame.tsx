import React, { useState, useEffect } from 'react';
import { NEVER_HAVE_I_EVER_CATEGORIES } from '../../constants';
import { ScreenHeader } from '../ui/Layout';
import neverHaveIEverData from '../../data/never_have_i_ever.json';
import { generateNeverHaveIEver, generateCustomNeverHaveIEver } from '../../services/geminiService';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Lock, ChevronRight, Hand, MessageCircle, Flame, Landmark, Users, Wand2 } from 'lucide-react';

interface GameProps {
    onExit: () => void;
}

// Per-category palette shared by the SELECT screen tile accents and the PLAY
// screen card body (decorative blob, header pill, italic PartySpark footer).
// Hex stays as solid; rgba 18% gives the tint variant.
const CATEGORY_PALETTE: Record<string, { Icon: LucideIcon; solid: string; tint: string }> = {
    custom_vibe:      { Icon: Wand2,         solid: '#8B5CE0', tint: 'rgba(139, 92, 224, 0.18)' }, // violet
    rehaan:           { Icon: MessageCircle, solid: '#06B6D4', tint: 'rgba(6, 182, 212, 0.18)' },   // cyan-500
    rehaan_asks:      { Icon: Flame,         solid: '#F97316', tint: 'rgba(249, 115, 22, 0.18)' },  // orange-500
    agra:             { Icon: Landmark,      solid: '#D97706', tint: 'rgba(217, 119, 6, 0.18)' },   // amber-600
    bbf:              { Icon: Users,         solid: '#9333EA', tint: 'rgba(147, 51, 234, 0.18)' },  // purple-600
    classic:          { Icon: Hand,          solid: '#10B981', tint: 'rgba(16, 185, 129, 0.18)' },  // emerald-500
    guilty_pleasures: { Icon: Lock,          solid: '#EC4899', tint: 'rgba(236, 72, 153, 0.18)' },  // pink-500
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
    { id: 'clean', label: '😇 Keep it Clean', hint: 'PG — safe for all ages' },
    { id: 'cheeky', label: '😏 Cheeky', hint: 'PG-13 — light teasing, innuendo OK' },
    { id: 'spicy', label: '🔥 Spicy', hint: 'R-rated — bold, flirty, no filter' },
];

const WORD_LIMIT = 150;

const PLACEHOLDER_EXAMPLES = [
    `e.g. "5 college friends from Mumbai reuniting in Goa after 8 years. Rahul has a new boyfriend nobody's met. Priya is teetotal now."`,
    `e.g. "A couple's anniversary weekend in Bali. She's obsessed with yoga, he's all about food. They're trying to decide on kids."`,
    `e.g. "Extended family Diwali — 3 generations. Grandma still thinks she's in charge. Two cousins haven't spoken since the 2019 wedding."`,
    `e.g. "4 work friends at a Rishikesh offsite. The manager is trying too hard. Two interns are scared. Someone brought tequila."`,
];

export const NeverHaveIEverGame: React.FC<GameProps> = ({ onExit }) => {
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

    const wordCount = customContext.trim().split(/\s+/).filter(Boolean).length;

    // Initialize with local data depending on category. Skip for custom_vibe —
    // its deck comes from AI generation and is set directly by startCustomGame.
    useEffect(() => {
        if (gameState === 'PLAY' && category && category !== 'custom_vibe') {
            const localCards = (neverHaveIEverData as Record<string, string[]>)[category] || [];
            const shuffled = [...localCards].sort(() => 0.5 - Math.random());
            setCards(shuffled);
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
            const groupLabel = GROUP_TYPES.find(g => g.id === selectedGroupType)?.label || 'Friends';
            const toneLabel = selectedTone ? TONE_OPTIONS.find(t => t.id === selectedTone)?.hint || '' : '';
            const generated = await generateCustomNeverHaveIEver(groupLabel, customContext.trim(), 15, toneLabel);

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
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(prev => prev + 1);
            return;
        }
        // Out of cards — refill via the matching generator.
        setIsLoading(true);
        try {
            let newCards: string[] = [];
            if (category === 'custom_vibe') {
                const groupLabel = GROUP_TYPES.find(g => g.id === selectedGroupType)?.label || 'Friends';
                const toneLabel = selectedTone ? TONE_OPTIONS.find(t => t.id === selectedTone)?.hint || '' : '';
                newCards = await generateCustomNeverHaveIEver(groupLabel, customContext.trim(), 10, toneLabel);
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

                <div className="flex-1 overflow-y-auto pb-8">
                    <p className="text-gray-400 mb-4 text-sm text-center">
                        Pick a category. Stand up if you've done it. Last one sitting wins.
                    </p>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {NEVER_HAVE_I_EVER_CATEGORIES.map((cat) => {
                            const meta = CATEGORY_PALETTE[cat.id];
                            const Icon = meta?.Icon || Sparkles;
                            const color = meta?.solid || '#94A3B8';
                            const isCustom = cat.id === 'custom_vibe';
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        setCategory(cat.id);
                                        setGameState(isCustom ? 'CUSTOM_SETUP' : 'PLAY');
                                    }}
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
                                                <Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-white leading-tight truncate">{cat.label}</h3>
                                                <p className="text-xs text-gray-400 leading-snug truncate">{cat.description}</p>
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
                    <div className="text-center mb-6">
                        <div className="inline-flex bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 border border-violet-500/30 rounded-2xl p-4 mb-3">
                            <Wand2 size={32} className="text-violet-400" />
                        </div>
                        <h2 className="text-xl font-bold text-white mb-1">Personalised Statements</h2>
                        <p className="text-gray-400 text-sm max-w-sm mx-auto">
                            Tell us about your group and AI will write "Never Have I Ever" statements that feel like they were written just for you.
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

                    {/* Pro Tips */}
                    <div className="bg-violet-900/20 border border-violet-500/20 rounded-xl p-4 mb-6">
                        <p className="text-xs text-violet-300 font-bold uppercase tracking-widest mb-2">💡 Pro Tips for Better Cards</p>
                        <ul className="text-xs text-gray-400 space-y-1.5">
                            <li>• <strong className="text-gray-300">Name names:</strong> "Aisha hates confrontation" → gold</li>
                            <li>• <strong className="text-gray-300">Be specific:</strong> "Goa trip where Priya lost her passport"</li>
                            <li>• <strong className="text-gray-300">Add dynamics:</strong> exes, rivalries, running jokes</li>
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
                        disabled={!canGenerate}
                        className={`w-full py-4 rounded-xl font-bold text-lg transition-all flex items-center justify-center gap-2
                            ${canGenerate
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

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Generating..." onBack={() => setGameState('CUSTOM_SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-violet-500/30 border-t-violet-500 rounded-full animate-spin" />
                        <Wand2 className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-violet-400 animate-pulse" size={24} />
                    </div>
                    <div className="text-center">
                        <p className="text-xl font-bold text-white mb-1">Crafting your personalised statements…</p>
                        <p className="text-gray-500 text-sm">AI is reading your context and writing cards just for you.</p>
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
                    const palette = CATEGORY_PALETTE[category] || { solid: '#94A3B8', tint: 'rgba(148, 163, 184, 0.18)' };
                    return (
                        <div className="w-full max-w-sm relative z-10 perspective-1000">
                            <div
                                className="w-full aspect-[3/4] max-h-[460px] bg-party-surface border border-white/10 rounded-[22px] p-7 flex flex-col relative overflow-hidden"
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
                                    Never Have I Ever
                                </div>
                                <div className="flex-1 flex items-center justify-center relative z-10">
                                    <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-white text-center whitespace-pre-wrap">
                                        {cards[currentIndex]}
                                    </p>
                                </div>
                                <div className="text-[11px] text-gray-400 flex items-center justify-between relative z-10">
                                    <span>Card {currentIndex + 1} of {cards.length}</span>
                                    <span className="font-serif italic text-[12px]" style={{ color: palette.solid }}>PartySpark</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                <div className="w-full max-w-sm mt-12 grid grid-cols-1 gap-4">
                    <button
                        onClick={handleNextCard}
                        disabled={isLoading}
                        className={`w-full py-4 rounded-xl font-bold tracking-wider text-white shadow-lg transition-all active:scale-[0.98] ${category === 'rehaan' ? 'bg-cyan-600 hover:bg-cyan-500' : category === 'guilty_pleasures' ? 'bg-pink-600 hover:bg-pink-500' : category === 'custom_vibe' ? 'bg-violet-600 hover:bg-violet-500' : 'bg-emerald-600 hover:bg-emerald-500'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <Sparkles className="animate-spin" size={20} /> Generating via AI...
                            </span>
                        ) : (
                            "NEXT STATEMENT"
                        )}
                    </button>
                    <p className="text-center text-xs text-neutral-500 font-medium">Stand up if you've done it!</p>
                </div>
            </div>
        </div>
    );
};
