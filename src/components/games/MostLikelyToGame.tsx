import React, { useState, useEffect } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
import { generateMostLikelyTo, generateCustomMostLikelyTo } from '../../services/geminiService';
import { MOST_LIKELY_TO_CATEGORIES } from '../../constants';
import { Users, ChevronRight, Hand, AlertTriangle, Sparkles, Flame, Zap, Wand2 } from 'lucide-react';
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
        // Variation A — "Slim Row"
        // Compact horizontal rows with a colored left accent bar.
        // Static maps (not dynamic) so Tailwind v4's JIT compiles every class.
        const ACCENT_BORDER: Record<string, string> = {
            custom_vibe: 'border-l-violet-500',
            family_friendly: 'border-l-emerald-500',
            fun: 'border-l-blue-500',
            scandalous: 'border-l-pink-500',
            adult: 'border-l-red-500',
            chaos: 'border-l-purple-500',
            bbf: 'border-l-purple-500',
        };
        const ICON_ACCENT: Record<string, string> = {
            custom_vibe: 'text-violet-400',
            family_friendly: 'text-emerald-400',
            fun: 'text-blue-400',
            scandalous: 'text-pink-400',
            adult: 'text-red-400',
            chaos: 'text-purple-400',
            bbf: 'text-purple-400',
        };

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
                <p className="text-gray-400 mb-4 text-sm text-center">
                    Pick a vibe. Read the card. Everyone points on 3!
                </p>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-2">
                        {MOST_LIKELY_TO_CATEGORIES.map((cat: any) => (
                            <button
                                key={cat.id}
                                onClick={() => !cat.disabled && startGame(cat)}
                                disabled={cat.disabled}
                                className={`group relative w-full text-left transition-all duration-200
                                    ${cat.disabled ? 'opacity-40 cursor-not-allowed' : 'active:scale-[0.99] cursor-pointer'}
                                `}
                            >
                                <div className={`bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 ${ACCENT_BORDER[cat.id] || 'border-l-white/20'} hover:bg-white/[0.08] hover:border-white/20 rounded-xl py-3 px-4 transition-colors`}>
                                    <div className="flex items-center gap-3">
                                        <span className={`${ICON_ACCENT[cat.id] || 'text-white'} flex-shrink-0`}>
                                            {cat.id === 'custom_vibe'     && <Wand2 size={16} />}
                                            {cat.id === 'family_friendly' && <Users size={16} />}
                                            {cat.id === 'fun'             && <Sparkles size={16} />}
                                            {cat.id === 'scandalous'      && <Zap size={16} />}
                                            {cat.id === 'adult'           && <Flame size={16} />}
                                            {cat.id === 'chaos'           && <AlertTriangle size={16} />}
                                            {cat.id === 'bbf'             && <Users size={16} />}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-white leading-tight flex items-center gap-2">
                                                {cat.label}
                                                {cat.disabled && <span className="text-[9px] bg-white/10 px-1.5 py-0.5 rounded uppercase tracking-wider text-neutral-400 font-medium">Soon</span>}
                                            </h3>
                                            <p className="text-xs text-gray-400 leading-snug truncate">{cat.description}</p>
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

    // PLAYING State
    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Most Likely To..." onBack={onExit} onHome={onExit} />

            <div className="flex-1 flex flex-col justify-center items-center relative px-2">
                {/* Floating Category Label */}
                <div className={`absolute top-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${category?.id === 'custom_vibe' ? 'bg-violet-600/20 text-violet-300 border border-violet-500/30' : 'bg-white/10 text-white/50'}`}>
                    {category?.label}
                </div>

                <Card className="w-full aspect-[4/5] max-h-[50vh] flex items-center justify-center p-6 text-center shadow-2xl border-t border-white/10 bg-gradient-to-br from-party-surface to-party-dark relative overflow-hidden">
                    {/* Card Content */}
                    <div className="relative z-10">
                        <h2 className="text-3xl md:text-4xl font-bold leading-tight font-serif">
                            {cards[currentIndex]}
                        </h2>
                    </div>
                </Card>

                {/* Countdown Overlay */}
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

            <div className="mt-6 flex flex-col gap-3">
                <Button
                    onClick={handleVote}
                    className="py-6 text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 shadow-lg shadow-purple-900/40"
                    fullWidth
                    disabled={countingDown}
                >
                    <Hand className="mr-2" size={24} />
                    3-2-1 Vote!
                </Button>

                <div className="flex gap-3">
                    <Button onClick={() => setGameState('CATEGORY')} variant="secondary" fullWidth disabled={countingDown}>
                        Change Topic
                    </Button>
                    <Button onClick={nextCard} variant="primary" fullWidth disabled={countingDown}>
                        Next Card <ChevronRight size={18} className="ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    );
};
