import React, { useState, useMemo, useEffect, useRef, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Flame, ChevronRight, Shuffle, GlassWater, MessageCircleHeart, DoorClosed, HeartCrack, Waves, Zap, Wand2, Dices, Lock, Share2, Wine, VenetianMask, ArrowBigUp } from 'lucide-react';
import { generateCustomTruthOrDrink } from '../../services/geminiService';
import { useTheme } from '../../contexts/ThemeContext';
import { sessionService, shuffle } from '../../services/SessionManager';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import TeamRosterRow from '../ui/TeamRosterRow';
import { PinGateModal, isUnlocked } from '../ui/PinGate';
import { IntimateDiceGame } from './IntimateDiceGame';
import { TheTellGame } from './TheTellGame';
import { NerveGame } from './NerveGame';
import SpinTheBottle from '../ui/SpinTheBottle';
import { GameType } from '../../types';

// The question decks are lazy-loaded so they code-split out of this game's
// chunk. The fetch starts as soon as the chunk loads; use() below suspends
// into the App-level Suspense boundary on first render.
const questionDataPromise = import('../../data/truth_or_drink.json').then(m => m.default);

type Category = 'classic' | 'spicy' | 'deep' | 'exes' | 'chaos' | 'custom';
type GameState =
    | 'CATEGORY_SELECT'
    | 'CUSTOM_SETUP'
    | 'LOADING'
    | 'PROMPT'
    | 'INTIMATE'
    | 'TELL'
    | 'NERVE'
    | 'BOTTLE'
    | 'END';

const INTIMATE_KEY = 'partyspark_intimate_unlocked';
const INTIMATE_PIN = '2525';

// Amber — deliberately outside the six deck hues so the bottle tile reads as
// a utility, not another question deck.
const BOTTLE_ACCENT = '#F59E0B';

// The Tell's accent bar IS its two decks: amber (Sips) → pink (After Dark).
const TELL_GRADIENT = 'linear-gradient(90deg, #FBBF24, #DB2777)';

// Nerve runs cool on purpose — every other tile down here is warm.
const NERVE_GRADIENT = 'linear-gradient(90deg, #06B6D4, #8B5CF6)';

const GROUP_TYPES = [
    { id: 'friends', label: '🍻 Friends', description: 'Your crew' },
    { id: 'couple', label: '💕 Couple', description: 'Just the two of you' },
    { id: 'family', label: '👨‍👩‍👧‍👦 Family', description: 'Relatives, generations' },
    { id: 'colleagues', label: '💼 Colleagues', description: 'Work people, off-duty' },
    { id: 'mixed', label: '🎉 Mixed', description: 'All sorts' },
];

const TONE_OPTIONS = [
    { id: 'clean', label: '😇 Clean',  hint: 'PG — safe for all ages' },
    { id: 'cheeky', label: '😏 Cheeky', hint: 'PG-13 — light teasing, innuendo OK' },
    { id: 'spicy', label: '🔥 Spicy',  hint: 'R-rated — bold, flirty, no filter' },
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

export const TruthOrDrinkGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const questionData = use(questionDataPromise);
    const { theme } = useTheme();
    const DECK_MAP = theme === 'light' ? DECK_PALETTE_LIGHT : DECK_PALETTE_DARK;
    const deckPalette = (id: Category): { solid: string; tint: string } => {
        const e = DECK_MAP[id] || { solid: '#94A3B8', tintAlpha: 0.18 };
        return { solid: e.solid, tint: hexToRgba(e.solid, e.tintAlpha) };
    };
    const [gameState, setGameState] = useState<GameState>('CATEGORY_SELECT');
    const [showIntimateGate, setShowIntimateGate] = useState(false);
    const [bottleMode, setBottleMode] = useState<'single' | 'pair'>('single');
    // Auto-expand the rules on this device's very first Truth or Drink open.
    const [showHowToPlay, setShowHowToPlay] = useState(() => shouldAutoExpandRules('tod'));
    const [isSharing, setIsSharing] = useState(false);
    const [category, setCategory] = useState<Category>('classic');
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
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
    // For curated decks, drop questions already played this session before shuffling; if the
    // pool is empty (everything's been played) fall back to the full deck so the round still works.
    const deck = useMemo(() => {
        if (category === 'custom') {
            return customDeck ? customDeck.slice(0, TOTAL_ROUNDS) : [];
        }
        const pool = (questionData as Record<string, string[]>)[category] || [];
        const available = sessionService.filterContent(
            GameType.TRUTH_OR_DRINK,
            category,
            pool,
            (q) => q,
        );
        const source = available.length > 0 ? available : pool;
        return shuffle(source).slice(0, TOTAL_ROUNDS);
    }, [category, customDeck, players.length, gameState === 'CATEGORY_SELECT']);

    const wordCount = customContext.trim().split(/\s+/).filter(Boolean).length;

    const trimmedPlayers = players.map(p => p.trim()).filter(Boolean);
    const currentPlayer = trimmedPlayers[turnIndex % trimmedPlayers.length] || '';
    const currentQuestion = deck[roundIndex] || '';
    const isLastRound = roundIndex >= deck.length - 1;

    // Named-mode wrap-up data: per-player tallies + most-truths winners
    // (ties share the crown). Used by both the stats effect and the share card.
    const getNamedResults = () => {
        const entries = trimmedPlayers.map(name => {
            const s = scores[name] || { truths: 0, drinks: 0 };
            return { name, truths: s.truths, drinks: s.drinks };
        });
        const topTruths = entries.length ? Math.max(...entries.map(e => e.truths)) : 0;
        const winners = entries.filter(e => e.truths === topTruths).map(e => e.name);
        return { entries, winners };
    };

    // Record lifetime stats (and report to an active Game Night) exactly once
    // per game when the wrap screen is reached. The ref is re-armed on every
    // new deck selection so a replay records again.
    const endRecordedRef = useRef(false);
    useEffect(() => {
        if (gameState !== 'END' || endRecordedRef.current) return;
        endRecordedRef.current = true;
        statsStore.recordPlay('TRUTH_OR_DRINK');
        if (playMode === 'named' && trimmedPlayers.length >= 2) {
            const { entries, winners } = getNamedResults();
            statsStore.recordWins('TRUTH_OR_DRINK', winners);
            gameNightService.reportResult(
                'TRUTH_OR_DRINK',
                entries.map(e => ({ name: e.name, score: e.truths })),
            );
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState]);

    // ========================
    // Handlers
    // ========================
    const handleCategorySelect = (c: Category) => {
        setCategory(c);
        setTurnIndex(0);
        setRoundIndex(0);
        setLastChoice(null);
        setScores({});
        endRecordedRef.current = false;
        // No dedicated roster screen — a deck tap drops straight into play.
        // If the optional roster on the category screen has 2+ names we run
        // named mode (per-player turns + leaderboard); otherwise it's a
        // pass-the-phone just-play session, same as MLT / NHIE. Custom deck
        // still routes to its context screen first for AI generation.
        setPlayMode(trimmedPlayers.length >= 2 ? 'named' : 'just_play');
        setGameState(c === 'custom' ? 'CUSTOM_SETUP' : 'PROMPT');
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
            // Pass IDs (e.g. 'friends', 'spicy') — the server-side advanced
            // prompt expands them via GROUP_TYPE_GUIDANCE / TONE_DEFINITIONS.
            const cards = await generateCustomTruthOrDrink(
                customGroupType,
                customContext.trim(),
                trimmedPlayers,
                CUSTOM_DECK_SIZE,
                customTone || ''
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

    // Tally truth/drink per player in named mode, then either wrap up
    // (last round) or advance to the next prompt. In just_play we skip
    // tallying — choice stays purely cosmetic.
    const handleChoice = (choice: Choice) => {
        // Mark the question the player just answered as used so it won't repeat
        // this session. Custom-vibe questions are AI-generated and not tracked.
        if (currentQuestion && category !== 'custom') {
            sessionService.markAsUsed(GameType.TRUTH_OR_DRINK, category, currentQuestion);
        }
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
        // Keep the saved roster so "Play Again" doesn't wipe the names.
        setPlayers(sessionService.getTeams());
        setTurnIndex(0);
        setRoundIndex(0);
        setLastChoice(null);
        setCustomDeck(null);
        setCustomContext('');
        setCustomTone(null);
        setCustomError('');
        setScores({});
        endRecordedRef.current = false;
    };

    // Share the wrap screen as a result-card image. Named mode leads with the
    // most-truths winner(s) + a per-player leaderboard; just-play shares the
    // rounds survived. Card carries names/counts only — never question text.
    const handleShareResult = async () => {
        if (isSharing) return;
        setIsSharing(true);
        try {
            const accent = deckPalette(category).solid;
            const roundsPlayed = roundIndex + (lastChoice ? 1 : 0);
            if (playMode === 'named' && trimmedPlayers.length >= 2) {
                const { entries, winners } = getNamedResults();
                await shareResultCard({
                    gameTitle: 'Truth or Drink',
                    accent,
                    emoji: '🥂',
                    heading: winners.length === 1
                        ? `${winners[0]} told the truth`
                        : 'Tied on truths',
                    sub: `${categoryMeta.title} · ${roundsPlayed} rounds`,
                    tagline: 'Answer honestly — or take the sip',
                    context: 'Most truths told takes the night',
                    challenge: 'Could your table survive these questions?',
                    rows: entries.map(e => ({
                        label: e.name,
                        value: `${e.truths} truths · ${e.drinks} sips`,
                        highlight: winners.includes(e.name),
                    })),
                });
            } else {
                await shareResultCard({
                    gameTitle: 'Truth or Drink',
                    accent,
                    emoji: '🥂',
                    heading: `${roundsPlayed} rounds survived`,
                    sub: categoryMeta.title,
                    tagline: 'Answer honestly — or take the sip',
                    challenge: `Could you survive ${roundsPlayed} rounds?`,
                });
            }
        } finally {
            setIsSharing(false);
        }
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
                {/* Game-home hero — same compact pattern as The Forecast:
                    icon on its own line, Playfair tagline, then a tight
                    descriptor. -mt-3 closes the dead gap below ScreenHeader. */}
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🍷</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">How honest are you <em>really</em>?</h2>
                    <p className="text-muted text-sm">Answer honestly — or take a sip.</p>
                </div>
                <div className="text-center mb-3">
                    <button onClick={() => setShowHowToPlay(!showHowToPlay)} className="text-xs font-bold text-red-500 border border-red-500/30 px-3 py-1 bg-surface-alt hover:bg-app-tint transition relative z-10 mx-auto block rounded shadow-lg uppercase">
                        {showHowToPlay ? 'Hide Rules' : 'How To Play'}
                    </button>
                    {showHowToPlay && (
                        <div className="text-left text-xs text-ink-soft bg-black/20 border border-divider p-4 mt-2 relative z-10 space-y-3 font-medium rounded animate-fade-in shadow-inner max-w-[340px] mx-auto">
                            <p><strong className="text-ink">1. GOAL:</strong> Take turns reading the question on screen. Answer it <strong className="text-red-500">honestly</strong>… or take a drink to skip.</p>
                            <p><strong className="text-amber-500">2. NO HALF-TRUTHS:</strong> If you answer, the table decides whether you were honest. Dodge it? That's a sip. Your secret stays safe.</p>
                            <p><strong className="text-red-500">3. PICK YOUR HEAT:</strong> Five decks from Classic to Chaos — the spicier ones are 18+. "Create Your Vibe" tailors questions to your group.</p>
                            <p><strong className="text-emerald-500">4. KEEP SCORE:</strong> Add 2+ player names for a truths-vs-drinks leaderboard, or leave it empty and just pass the phone.</p>
                        </div>
                    )}
                </div>
                {/* Optional roster — add 2+ names to keep score (per-player
                    truths/drinks leaderboard); leave empty for a no-score
                    pass-the-phone session. Persists across games. */}
                <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={10} />
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

                        {/* The Tell — the two-player secret-agenda game. Owns all
                            of its own screens (decks, timer, PIN for After Dark);
                            only the entry point lives here. */}
                        <button
                            onClick={() => setGameState('TELL')}
                            className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                        >
                            <div className="relative bg-surface-alt backdrop-blur-sm border hover:bg-app-tint rounded-xl py-3.5 px-4 transition-colors overflow-hidden"
                                style={{ borderColor: 'rgba(219, 39, 119, 0.45)', boxShadow: '0 0 22px rgba(219, 39, 119, 0.14)' }}>
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: TELL_GRADIENT }} />
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: TELL_GRADIENT }} />
                                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(95% 75% at 100% 0%, rgba(219, 39, 119, 0.20), transparent 62%)' }} />
                                <div className="flex items-center gap-3 relative">
                                    <span className="flex-shrink-0" style={{ color: '#DB2777' }}><VenetianMask size={18} /></span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: theme === 'light' ? '#A16207' : '#FBBF24' }}>New · just for two</p>
                                        <h3 className="text-base font-bold text-ink leading-tight">The Tell</h3>
                                        <p className="text-xs text-muted leading-snug truncate">Secret missions. Don’t get read.</p>
                                    </div>
                                    <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                </div>
                            </div>
                        </button>

                        {/* Nerve — two-player chicken up a ladder of dares. Owns
                            all of its own screens (decks, PIN for After Dark);
                            only the entry point lives here. */}
                        <button
                            onClick={() => setGameState('NERVE')}
                            className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                        >
                            <div className="relative bg-surface-alt backdrop-blur-sm border hover:bg-app-tint rounded-xl py-3.5 px-4 transition-colors overflow-hidden"
                                style={{ borderColor: 'rgba(139, 92, 246, 0.45)', boxShadow: '0 0 22px rgba(139, 92, 246, 0.14)' }}>
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: NERVE_GRADIENT }} />
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: NERVE_GRADIENT }} />
                                <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(95% 75% at 100% 0%, rgba(139, 92, 246, 0.20), transparent 62%)' }} />
                                <div className="flex items-center gap-3 relative">
                                    <span className="flex-shrink-0" style={{ color: '#8B5CF6' }}><ArrowBigUp size={18} /></span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: theme === 'light' ? '#0E7490' : '#06B6D4' }}>New · just for two</p>
                                        <h3 className="text-base font-bold text-ink leading-tight">Nerve</h3>
                                        <p className="text-xs text-muted leading-snug truncate">One ladder. Who blinks first?</p>
                                    </div>
                                    <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                </div>
                            </div>
                        </button>

                        {/* Spin the Bottle — the shared "who goes next?" decider,
                            parked here as a test page while we decide which games
                            it gets baked into. No gate: it's just a picker. */}
                        <button
                            onClick={() => setGameState('BOTTLE')}
                            className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                        >
                            <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: BOTTLE_ACCENT }} />
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: BOTTLE_ACCENT }} />
                                <div className="flex items-center gap-3">
                                    <span className="flex-shrink-0" style={{ color: BOTTLE_ACCENT }}><Wine size={16} /></span>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                            <span className="truncate">Spin the Bottle</span>
                                            <span className="text-sm flex-shrink-0">🍾</span>
                                        </h3>
                                        <p className="text-xs text-muted leading-snug truncate">Let the bottle pick whose turn it is.</p>
                                    </div>
                                    <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                </div>
                            </div>
                        </button>

                        {/* Intimate Drinking — adult dice sub-game, gated by its
                            own PIN (2525), separate from the app's adult gate. */}
                        <button
                            onClick={() => { if (isUnlocked(INTIMATE_KEY)) setGameState('INTIMATE'); else setShowIntimateGate(true); }}
                            className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                        >
                            <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: '#F43F5E' }} />
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: '#F43F5E' }} />
                                <div className="flex items-center gap-3">
                                    <span className="flex-shrink-0" style={{ color: '#F43F5E' }}><Dices size={16} /></span>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                            <span className="truncate">Intimate Drinking</span>
                                            <Lock size={12} className="text-muted flex-shrink-0" />
                                        </h3>
                                        <p className="text-xs text-muted leading-snug truncate">Adults only · dice dares for two. PIN required.</p>
                                    </div>
                                    <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                </div>
                            </div>
                        </button>
                    </div>
                </div>

                {showIntimateGate && (
                    <PinGateModal
                        pin={INTIMATE_PIN}
                        storageKey={INTIMATE_KEY}
                        title="Intimate Drinking"
                        subtitle="Enter the 4-digit PIN for this content"
                        onSuccess={() => { setShowIntimateGate(false); setGameState('INTIMATE'); }}
                        onCancel={() => setShowIntimateGate(false)}
                    />
                )}
            </div>
        );
    }

    if (gameState === 'INTIMATE') {
        return <IntimateDiceGame onExit={() => setGameState('CATEGORY_SELECT')} />;
    }

    if (gameState === 'TELL') {
        return <TheTellGame onExit={() => setGameState('CATEGORY_SELECT')} />;
    }

    if (gameState === 'NERVE') {
        return <NerveGame onExit={() => setGameState('CATEGORY_SELECT')} />;
    }

    // BOTTLE — test bed for the shared Spin the Bottle decider. Standalone for
    // now (it picks a name and stops); the component already exposes onPick /
    // ctaLabel for the games we choose to wire it into.
    if (gameState === 'BOTTLE') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Spin the Bottle" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-3 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🍾</p>
                        <p className="text-muted text-sm">Who's up next? The bottle decides.</p>
                    </div>

                    {/* Same shared roster as the deck screen — names typed here
                        carry into every other game this session. */}
                    <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={12} />

                    {/* Single vs pair — pair does two spins (who asks → who answers),
                        which is how the bottle actually gets used at a table. */}
                    <div className="flex gap-1.5 justify-center mb-4">
                        {([
                            { id: 'single' as const, label: "Whose turn" },
                            { id: 'pair' as const, label: 'Who asks whom' },
                        ]).map(m => (
                            <button
                                key={m.id}
                                onClick={() => setBottleMode(m.id)}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border"
                                style={bottleMode === m.id
                                    ? { borderColor: BOTTLE_ACCENT, color: BOTTLE_ACCENT, background: `${BOTTLE_ACCENT}22` }
                                    : { borderColor: 'var(--c-border)', color: 'var(--c-muted)', background: 'var(--c-surface-alt)' }}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    <SpinTheBottle
                        key={bottleMode}
                        names={trimmedPlayers}
                        accent={BOTTLE_ACCENT}
                        mode={bottleMode}
                    />
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
                <ScreenHeader title="Create Your Vibe" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-1">
                    {/* Intro */}
                    <div className="text-center mb-3">
                        <div className="inline-flex bg-gradient-to-r from-violet-600/20 to-fuchsia-500/20 border border-violet-500/30 rounded-2xl p-3 mb-2">
                            <Wand2 size={24} className="text-vibe" />
                        </div>
                        <h2 className="text-lg font-bold text-ink mb-0.5">Personalised Questions</h2>
                        <p className="text-muted text-xs">
                            AI-written questions, tailored to your group.
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
                                    onClick={() => setCustomGroupType(g.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border
                                        ${customGroupType === g.id
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
                                    onClick={() => setCustomTone(customTone === t.id ? null : t.id)}
                                    className={`px-2 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95 border truncate
                                        ${customTone === t.id
                                            ? 'bg-violet-600/30 border-violet-500 text-vibe'
                                            : 'bg-surface-alt border-divider text-muted hover:border-ink-soft/40'
                                        }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                        {customTone && (
                            <p className="text-[11px] text-muted mt-1 pl-1">
                                {TONE_OPTIONS.find(t => t.id === customTone)?.hint}
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
                    confirmOnExit
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
                        formatting as the Just Play tab. Outline-only by
                        default, tint on hover. Emerald for truths, amber for
                        drinks, matching the wrap-screen leaderboard. */}
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleChoice('drink')}
                            className="flex-1 py-4 rounded-xl font-bold text-base text-amber-600 bg-transparent border-2 border-amber-500/60 hover:bg-amber-500/10 hover:border-amber-500 transition-colors flex items-center justify-center gap-2"
                        >
                            <GlassWater size={18} />
                            Take a Drink
                        </button>
                        <button
                            onClick={() => handleChoice('truth')}
                            className="flex-1 py-4 rounded-xl font-bold text-base text-emerald-600 bg-transparent border-2 border-emerald-500/60 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors flex items-center justify-center gap-2"
                        >
                            <MessageCircleHeart size={18} />
                            Tell the Truth
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
                        <button
                            onClick={handleShareResult}
                            disabled={isSharing}
                            className="w-full py-3 bg-transparent border-2 border-gold/60 text-gold hover:bg-gold/10 rounded-xl font-bold transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Share2 size={18} /> Share Result
                        </button>
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
