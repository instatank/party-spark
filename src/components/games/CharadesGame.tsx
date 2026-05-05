import React, { useState, useEffect } from 'react';
import { Button, ScreenHeader } from '../ui/Layout';
import { Timer, ThumbsUp, ThumbsDown, ChevronRight, Shuffle, Users, Film, Star, Sparkles, Trophy } from 'lucide-react';
import { generateCharadesWords } from '../../services/geminiService';
import { useContent } from '../../contexts/ContentContext';
import { CHARADES_CATEGORIES } from '../../constants';
import gamesDataRaw from '../../data/games_data.json';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import TeamRosterRow from '../ui/TeamRosterRow';

interface Props {
    onExit: () => void;
}

// Per-category tile color. Light values darkened so they read on #EEF4FA.
const TILES_DARK: Record<string, string> = {
    mix_movies:        '#94A3B8',
    family_mix:        '#EFC050',
    bollywood_movies:  '#EC4899',
    hollywood_movies:  '#65B7F0',
};
const TILES_LIGHT: Record<string, string> = {
    mix_movies:        '#475569', // slate-600
    family_mix:        '#B8922F', // Azure gold
    bollywood_movies:  '#C72D7F',
    hollywood_movies:  '#1F77C9',
};

export const CharadesGame: React.FC<Props> = ({ onExit }) => {
    const { theme } = useTheme();
    const TILES_MAP = theme === 'light' ? TILES_LIGHT : TILES_DARK;
    const [words, setWords] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [gameState, setGameState] = useState<'SETUP' | 'TEAM_INTRO' | 'PLAYING' | 'SUMMARY'>('SETUP');
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [category, setCategory] = useState("mix_movies");
    const { prefetchGameContent } = useContent();

    // Team mode is opt-in via TeamRosterRow on the SETUP screen. When teams.length
    // >= 2, the match becomes a sequence of 60s rounds — one per team — with a
    // TEAM_INTRO ("pass the phone") screen between them. teamScores accumulates
    // each team's final round score for the SUMMARY ranking. Empty teams = the
    // original single-round / single-score flow.
    const [teams, setTeams] = useState<string[]>(() => sessionService.getTeams());
    const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
    const [teamScores, setTeamScores] = useState<number[]>([]);

    // const categories = ["Movies", "Animals", "Actions", "Celebrities", "Objects"]; // Replaced by constant
    const categories = CHARADES_CATEGORIES;

    // Tile tap from SETUP. In team mode, this only stages the category and
    // routes to the TEAM_INTRO screen for the first team; the actual round
    // (word-load + timer start) happens on TEAM_INTRO's Start button. In solo
    // mode, this calls startGame directly to preserve the existing one-tap
    // flow.
    const handleCategoryTap = (cat: string) => {
        if (teams.length >= 2) {
            setCategory(cat);
            setCurrentTeamIndex(0);
            setTeamScores([]);
            setScore(0);
            setGameState('TEAM_INTRO');
        } else {
            startGame(cat);
        }
    };

    // Optional `selectedCat` lets a tile tap immediately start with the tapped
    // category (avoids a stale-state read since setCategory is async and the
    // function would otherwise see the previous value).
    const startGame = async (selectedCat?: string) => {
        const cat = selectedCat ?? category;
        if (selectedCat) setCategory(selectedCat);
        setLoading(true);

        // Prefetch for background to keep buffer full
        prefetchGameContent('CHARADES', cat);

        try {
            // 1. Get all local words for this category
            const charadesData = (gamesDataRaw as any).games.charades;
            let allLocalWords: string[] = [];

            if (cat === 'mix_movies') {
                // Combine ALL movie categories for the mix
                const hollywood = charadesData.categories.find((c: any) => c.id === 'hollywood_movies')?.items || [];
                const bollywood = charadesData.categories.find((c: any) => c.id === 'bollywood_movies')?.items || [];
                const mixUnique = charadesData.categories.find((c: any) => c.id === 'mix_movies')?.items || [];
                allLocalWords = Array.from(new Set([...hollywood, ...bollywood, ...mixUnique]));
            } else if (cat === 'family_mix') {
                // Combine all family-friendly sub-categories
                const everyday = charadesData.categories.find((c: any) => c.id === 'everyday_actions')?.items || [];
                const house = charadesData.categories.find((c: any) => c.id === 'around_the_house')?.items || [];
                const zoo = charadesData.categories.find((c: any) => c.id === 'the_zoo')?.items || [];
                const familyBase = charadesData.categories.find((c: any) => c.id === 'family_mix')?.items || [];
                allLocalWords = Array.from(new Set([...familyBase, ...everyday, ...house, ...zoo]));
            } else {
                // Standard category behavior
                const categoryData = charadesData.categories.find((c: any) => c.id === cat);
                allLocalWords = categoryData ? categoryData.items : [];
            }

            // 2. Filter used words
            const availableLocal = sessionService.filterContent(
                GameType.CHARADES,
                cat,
                allLocalWords,
                (w) => w
            );

            let selectedWords: string[] = [];
            const INITIAL_BATCH_SIZE = 30;

            if (availableLocal.length >= INITIAL_BATCH_SIZE) {
                // Enough local content
                selectedWords = shuffle(availableLocal).slice(0, INITIAL_BATCH_SIZE);
            } else {
                // Not enough local, use what's left + generate
                selectedWords = [...availableLocal];
                const needed = INITIAL_BATCH_SIZE - selectedWords.length;
                try {
                    const generated = await generateCharadesWords(cat, needed);
                    selectedWords = [...selectedWords, ...generated];
                } catch (e) {
                    console.error("Failed to generate charades", e);
                    // Fallback to all local (repeats)
                    selectedWords = [...selectedWords, ...shuffle(allLocalWords).slice(0, needed)];
                }
            }

            if (selectedWords.length > 0) {
                setWords(selectedWords);
            } else {
                setWords(["Error loading words", "Please try again"]);
            }
        } catch (e) {
            console.error(e);
            setWords(["Connection Error", "Check Settings"]);
        }

        setLoading(false);
        setGameState('PLAYING');
        setScore(0);
        setCurrentIndex(0);
        setTimeLeft(60);
    };

    // End the current team's round. In team mode, push the score onto the
    // tally and either pass the phone to the next team or roll into SUMMARY.
    // In solo mode, just go straight to SUMMARY.
    const endRound = () => {
        if (teams.length >= 2) {
            const tallied = [...teamScores, score];
            setTeamScores(tallied);
            if (currentTeamIndex < teams.length - 1) {
                setCurrentTeamIndex(i => i + 1);
                setGameState('TEAM_INTRO');
                return;
            }
        }
        setGameState('SUMMARY');
    };

    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (gameState === 'PLAYING' && timeLeft > 0) {
            interval = setInterval(() => setTimeLeft(t => t - 1), 1000);
        } else if (timeLeft === 0 && gameState === 'PLAYING') {
            endRound();
        }
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, timeLeft]);

    const handleCorrect = () => {
        setScore(s => s + 1);
        nextCard();
    };

    const handleSkip = () => {
        nextCard();
    };

    const nextCard = async () => {
        // Mark current word as used
        if (words[currentIndex]) {
            sessionService.markAsUsed(GameType.CHARADES, category, words[currentIndex]);
        }

        // Check buffer and fetch more if needed
        if (words.length - currentIndex < 5) {
            try {
                const moreWords = await generateCharadesWords(category, 10);
                setWords(prev => [...prev, ...moreWords]);
            } catch (e) {
                console.warn("Background fetch failed", e);
            }
        }

        if (currentIndex < words.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            // Word pool exhausted before the timer expired — end this team's
            // round (or the whole match in solo mode).
            endRound();
        }
    };

    if (gameState === 'SETUP') {
        // Slim Row pattern. Charades has no AI custom-vibe deck so no
        // ring/glow tile. Tile color resolves through the theme map.
        const TILE_META: Record<string, { Icon: typeof Sparkles; description: string }> = {
            mix_movies:        { Icon: Shuffle, description: 'Hollywood + Bollywood + arthouse. Pure chaos.' },
            family_mix:        { Icon: Users,   description: 'Wholesome titles only. PG vibes.' },
            bollywood_movies:  { Icon: Film,    description: 'All Hindi cinema. Iconic to underrated.' },
            hollywood_movies:  { Icon: Star,    description: 'American studio + indie. Big-budget energy.' },
        };

        // Loading state — full-screen spinner while words are being fetched.
        if (loading) {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="Charades" onBack={onExit} onHome={onExit} />
                    <div className="flex-1 flex flex-col items-center justify-center gap-6">
                        <div className="relative">
                            <div className="w-16 h-16 border-4 border-accent/30 border-t-accent rounded-full animate-spin" />
                            <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent animate-pulse" size={24} />
                        </div>
                        <p className="text-xl font-bold text-ink">Brewing your words…</p>
                    </div>
                </div>
            );
        }

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Charades" onBack={onExit} onHome={onExit} />
                <p className="text-muted mb-4 text-sm text-center">
                    Pick a category. 60-second round, act them out silently.
                </p>
                <TeamRosterRow teams={teams} onTeamsChange={setTeams} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {categories.map(c => {
                            const meta = TILE_META[c.id] || { Icon: Sparkles, description: '' };
                            const color = TILES_MAP[c.id] || '#94A3B8';
                            const Icon = meta.Icon;
                            return (
                                <button
                                    key={c.id}
                                    onClick={() => handleCategoryTap(c.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span
                                            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]"
                                            style={{ background: color }}
                                        />
                                        <span
                                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                            style={{ background: color }}
                                        />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color }}>
                                                <Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight truncate">{c.label}</h3>
                                                <p className="text-xs text-muted leading-snug truncate">{meta.description}</p>
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

    if (gameState === 'TEAM_INTRO') {
        const upName = teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`;
        const isFirst = currentTeamIndex === 0;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader
                    title={isFirst ? 'Charades' : `Round ${currentTeamIndex + 1} of ${teams.length}`}
                    onBack={() => setGameState('SETUP')}
                    onHome={onExit}
                />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up px-4">
                    <div className="text-center">
                        <p className="text-sm uppercase tracking-[0.18em] text-muted mb-3">Up next</p>
                        <h2 className="text-5xl font-black text-ink">{upName}</h2>
                    </div>
                    {!isFirst && (
                        <div className="bg-surface-alt border border-divider rounded-xl px-4 py-3 max-w-[280px] w-full">
                            <p className="text-xs uppercase tracking-wider text-muted mb-1.5 text-center">Standings</p>
                            <div className="space-y-1">
                                {teamScores.map((s, i) => (
                                    <div key={i} className="flex justify-between text-sm">
                                        <span className="text-ink-soft truncate">{teams[i] || `Team ${i + 1}`}</span>
                                        <span className="font-bold text-ink ml-3">{s}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <p className="text-muted text-sm text-center max-w-[280px]">
                        Pass the phone. 60-second round — act them out silently.
                    </p>
                    <Button onClick={() => startGame(category)} fullWidth className="h-14 text-lg">
                        Start {upName}'s Round
                    </Button>
                </div>
            </div>
        );
    }

    if (gameState === 'SUMMARY') {
        const inTeamMode = teamScores.length > 0;
        const ranked = inTeamMode
            ? teamScores
                .map((s, i) => ({ name: teams[i] || `Team ${i + 1}`, score: s }))
                .sort((a, b) => b.score - a.score)
            : [];
        const winner = ranked[0];
        const tiedTop = inTeamMode && ranked.filter(r => r.score === winner.score).length > 1;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Game Over" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    {inTeamMode ? (
                        <>
                            <div className="text-center">
                                <h2 className="text-3xl font-bold mb-1 text-ink">Time's Up!</h2>
                                {tiedTop ? (
                                    <p className="text-muted">It's a tie at the top.</p>
                                ) : (
                                    <p className="text-muted">
                                        <span className="font-bold text-ink">{winner.name}</span> takes it.
                                    </p>
                                )}
                            </div>
                            <div className="w-full max-w-[320px] space-y-2">
                                {ranked.map((r, i) => (
                                    <div
                                        key={i}
                                        className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                                            i === 0
                                                ? 'bg-accent-soft border-accent text-ink'
                                                : 'bg-surface border-divider text-ink-soft'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {i === 0 && <Trophy size={16} className="text-accent flex-shrink-0" />}
                                            <span className="font-bold truncate">{r.name}</span>
                                        </div>
                                        <span className="text-2xl font-black ml-3">{r.score}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="text-center">
                                <h2 className="text-4xl font-bold mb-2 text-ink">Time's Up!</h2>
                                <p className="text-muted">You got</p>
                            </div>
                            <div className="text-8xl font-black text-accent">
                                {score}
                            </div>
                        </>
                    )}

                    <div className="flex flex-col gap-3 w-full">
                        <Button onClick={() => setGameState('SETUP')} fullWidth>Play Again</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Exit</Button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Charades" onBack={() => setGameState('SETUP')} onHome={onExit} />

            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 bg-app-tint px-4 py-2 rounded-full">
                    <Timer size={18} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-ink-soft'} />
                    <span className={`font-mono font-bold ${timeLeft < 10 ? 'text-red-500' : 'text-ink'}`}>{timeLeft}s</span>
                </div>
                <div className="font-bold text-xl text-ink">
                    {teams.length >= 2
                        ? <><span className="text-muted text-sm font-semibold mr-1.5">{teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`}:</span>{score}</>
                        : <>Score: {score}</>
                    }
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center perspective-1000">
                {/* Card body — MLT play-screen style. Charades brand color is gold,
                    so blob + pill + footer pull from the gold token (var(--c-gold)
                    → #EFC050 dark / #B8922F light). */}
                <div
                    className="w-full aspect-[3/4] max-h-[340px] bg-surface border border-divider rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                >
                    <div
                        className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                        style={{ background: 'var(--c-gold-soft)' }}
                    />
                    <div
                        className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                        style={{ background: 'var(--c-gold-soft)', color: 'var(--c-gold)' }}
                    >
                        Charades
                    </div>
                    <div className="flex-1 flex items-center justify-center relative z-10">
                        <h2 className="font-serif font-bold text-[36px] leading-[1.1] tracking-[-0.015em] text-ink text-center break-words animate-slide-up">
                            {words[currentIndex]}
                        </h2>
                    </div>
                    <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                        <span>Act it out silently.</span>
                        <span className="font-serif italic text-[12px]" style={{ color: 'var(--c-gold)' }}>PartySpark</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-8">
                <Button onClick={handleSkip} variant="secondary" className="h-24 flex flex-col items-center justify-center gap-2">
                    <ThumbsDown size={32} className="text-muted" />
                    <span>Skip</span>
                </Button>
                <Button onClick={handleCorrect} className="h-24 bg-green-500 hover:bg-green-600 flex flex-col items-center justify-center gap-2 text-white">
                    <ThumbsUp size={32} />
                    <span>Correct</span>
                </Button>
            </div>
        </div>
    );
};
