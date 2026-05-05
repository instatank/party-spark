import React, { useState, useEffect } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
// generateTabooCards removed — full local deck is loaded each round
import { useContent } from '../../contexts/ContentContext';
import type { TabooCard } from '../../types';
import { Timer, ThumbsUp, X, Ban, Trophy } from 'lucide-react';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import gamesDataRaw from '../../data/games_data.json';
import { TABOO_CATEGORIES } from '../../constants';
import TeamRosterRow from '../ui/TeamRosterRow';

interface Props {
    onExit: () => void;
}

export const TabooGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'CATEGORY' | 'LOADING' | 'READY' | 'PLAYING' | 'SUMMARY'>('CATEGORY');
    const [cards, setCards] = useState<TabooCard[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [score, setScore] = useState(0);
    const [timeLeft, setTimeLeft] = useState(60);
    const [currentCategory, setCurrentCategory] = useState("");
    const { prefetchGameContent } = useContent();

    // Team mode: opt-in via TeamRosterRow on the CATEGORY screen. When teams
    // are set, each team plays its own 60-second round on the same category;
    // session dedupe ensures Team B gets fresh cards Team A didn't touch.
    // Solo mode (teams=[]) preserves the original single-round flow.
    const [teams, setTeams] = useState<string[]>(() => sessionService.getTeams());
    const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
    const [teamScores, setTeamScores] = useState<number[]>([]);

    // Initial category tap from CATEGORY screen. Resets team-match state
    // (team index, accumulated team scores) before entering the load flow.
    // In solo mode, this is just a thin wrapper around startGame.
    const handleCategoryTap = (category: string) => {
        if (teams.length >= 2) {
            setCurrentTeamIndex(0);
            setTeamScores([]);
        }
        startGame(category);
    };

    const startGame = async (category: string) => {
        setCurrentCategory(category);
        setGameState('LOADING');

        // Trigger background prefetch (100 items)
        prefetchGameContent('TABOO', category);

        // 1. Get all local cards
        let allLocalCards: any[] = [];
        try {
            if (category === 'mix_taboo') {
                allLocalCards = (gamesDataRaw as any).games.taboo.categories
                    .filter((c: any) => c.id !== 'mix_taboo')
                    .flatMap((c: any) => c.items);
            } else {
                const catData = (gamesDataRaw as any).games.taboo.categories.find((c: any) => c.id === category);
                if (catData && catData.items) {
                    allLocalCards = catData.items;
                }
            }
        } catch (e) {
            console.warn("Failed to read local taboo data", e);
        }

        // 2. Filter used cards from this session
        const availableLocal = sessionService.filterContent(
            GameType.TABOO,
            category,
            allLocalCards,
            (c) => c.word
        );

        let selectedCards: TabooCard[];

        if (availableLocal.length >= 5) {
            // Shuffle ALL available cards and load the full deck — no repeats until exhausted
            selectedCards = shuffle(availableLocal);
        } else {
            // Pool nearly exhausted — reshuffle from full set so the round can finish
            selectedCards = shuffle(allLocalCards);
        }

        setCards(selectedCards);
        setScore(0);
        setCurrentIndex(0);
        setTimeLeft(60);
        setGameState('READY');
    };

    const startRound = () => {
        setGameState('PLAYING');
    };

    // End the current team's round. In team mode, push the score onto the
    // tally and either pass the phone to the next team (re-load fresh cards
    // via startGame, which routes back through LOADING → READY) or roll into
    // SUMMARY. In solo mode, jump straight to SUMMARY.
    const endRound = () => {
        if (teams.length >= 2) {
            const tallied = [...teamScores, score];
            setTeamScores(tallied);
            if (currentTeamIndex < teams.length - 1) {
                setCurrentTeamIndex(i => i + 1);
                startGame(currentCategory);
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

    const nextCard = () => {
        // Mark current as used
        if (cards[currentIndex]) {
            sessionService.markAsUsed(GameType.TABOO, currentCategory, cards[currentIndex].word);
        }

        if (currentIndex < cards.length - 1) {
            setCurrentIndex(c => c + 1);
        } else {
            // Deck exhausted before the timer ran out — end this team's
            // round (or the whole match in solo mode).
            endRound();
        }
    };

    if (gameState === 'CATEGORY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Taboo Categories" onBack={onExit} onHome={onExit} />
                <p className="text-muted mb-4 text-sm">Pick a topic. Describe the word without using forbidden words!</p>
                <TeamRosterRow teams={teams} onTeamsChange={setTeams} />
                <div className="grid grid-cols-2 gap-3 overflow-y-auto pb-4">
                    {TABOO_CATEGORIES.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => handleCategoryTap(cat.id)}
                            className={`p-4 rounded-xl flex flex-col items-center gap-3 transition-all active:scale-95 bg-surface hover:bg-surface-alt border-2 ${(cat as any).borderColor || 'border-divider-soft'}`}
                        >
                            <div className={`p-2 rounded-full bg-surface-alt ${cat.color}`}>
                                {cat.icon}
                            </div>
                            <span className="font-bold text-sm text-center text-ink">{cat.label}</span>
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Preparing Deck..." onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6">
                    <div className="w-16 h-16 border-4 border-party-secondary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xl font-medium animate-pulse text-center">
                        Generating forbidden words for<br /><span className="text-party-secondary font-bold">{currentCategory}</span>...
                    </p>
                </div>
            </div>
        );
    }

    if (gameState === 'READY') {
        const inTeamMode = teams.length >= 2;
        const upName = inTeamMode ? (teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`) : null;
        const isFirstTeam = currentTeamIndex === 0;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader
                    title={inTeamMode ? `Round ${currentTeamIndex + 1} of ${teams.length}` : 'Ready?'}
                    onBack={() => setGameState('CATEGORY')}
                    onHome={onExit}
                />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8">
                    <Card className="w-full text-center py-12 bg-surface border border-divider-soft shadow-xl">
                        {inTeamMode ? (
                            <>
                                <p className="text-xs uppercase tracking-[0.18em] text-muted mb-2">Pass the phone to</p>
                                <h2 className="text-4xl font-black mb-4 text-ink">{upName}</h2>
                                <div className="text-6xl mb-4">🤫</div>
                                <p className="text-muted text-sm px-6">
                                    60 seconds to describe as many words as possible — no forbidden words.
                                </p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-bold mb-4 font-serif text-ink">Pass the phone to the<br />Clue Giver!</h2>
                                <div className="text-6xl mb-4">🤫</div>
                                <p className="text-muted text-sm px-6">
                                    When you're ready, hit start. You have 60 seconds to describe as many words as possible.
                                </p>
                            </>
                        )}
                    </Card>
                    {inTeamMode && !isFirstTeam && teamScores.length > 0 && (
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
                    <Button fullWidth onClick={startRound} className="h-16 text-xl">START TIMER</Button>
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
                <ScreenHeader title="Time's Up!" onBack={() => setGameState('CATEGORY')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    {inTeamMode ? (
                        <>
                            <div className="text-center">
                                <h2 className="text-3xl font-bold mb-1">Round Over</h2>
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
                                <h2 className="text-4xl font-bold mb-2">Round Over</h2>
                                <p className="text-muted">Team Score</p>
                            </div>
                            <div className="text-9xl font-black text-party-secondary drop-shadow-lg">
                                {score}
                            </div>
                        </>
                    )}

                    <div className="flex flex-col gap-3 w-full">
                        <Button onClick={() => setGameState('CATEGORY')} fullWidth>Next Category</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Exit</Button>
                    </div>
                </div>
            </div>
        );
    }

    const card = cards[currentIndex];

    // Difficulty palette for the new MLT-style card body. solid colors the
    // header pill text + decorative blob; tint backs the pill bg + blob fill.
    const getTilePalette = (difficulty?: string): { solid: string; tint: string } => {
        switch (difficulty) {
            case 'easy': return { solid: '#22C55E', tint: 'rgba(34, 197, 94, 0.18)' };
            case 'hard': return { solid: '#EF4444', tint: 'rgba(239, 68, 68, 0.18)' };
            default:     return { solid: '#EAB308', tint: 'rgba(234, 179, 8, 0.18)' }; // Medium
        }
    };

    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-2 pt-2">
                <Button variant="ghost" onClick={() => setGameState('CATEGORY')} className="!p-2">
                    <span className="text-muted">Quit</span>
                </Button>
                <div className="flex items-center gap-2 bg-surface border border-divider px-4 py-2 rounded-full shadow-lg">
                    <Timer size={18} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-party-accent'} />
                    <span className={`font-mono font-bold text-xl ${timeLeft < 10 ? 'text-red-500' : 'text-ink'}`}>{timeLeft}</span>
                </div>
                <div className="font-bold text-party-primary text-right min-w-[60px]">
                    {teams.length >= 2 ? (
                        <div className="flex flex-col items-end leading-tight">
                            <span className="text-[10px] uppercase tracking-wider text-muted truncate max-w-[80px]">
                                {teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`}
                            </span>
                            <span className="text-xl">{score}</span>
                        </div>
                    ) : (
                        <span className="text-xl">{score}</span>
                    )}
                </div>
            </div>

            {/* Card body — MLT play-screen styling adapted for Taboo's two-section
                layout (target word + forbidden list). Header pill on top, target
                word in Playfair centered upper-half, forbidden block on lower
                third with a divider. Difficulty drives the blob/pill color.
                Header/buttons margins trimmed so the card eats more vertical
                space without overflow; inner type sized up ~40% for legibility. */}
            <div className="flex-1 flex flex-col perspective-1000">
                {(() => {
                    const palette = getTilePalette(card.difficulty);
                    return (
                        <div
                            className="flex-1 w-full bg-surface border border-divider rounded-[22px] p-6 flex flex-col relative overflow-hidden"
                            style={{ boxShadow: 'var(--shadow-card)' }}
                        >
                            <div
                                className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                                style={{ background: palette.tint }}
                            />
                            <div
                                className="self-start text-[11px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                                style={{ background: palette.tint, color: palette.solid }}
                            >
                                Taboo {card.difficulty ? `· ${card.difficulty}` : ''}
                            </div>

                            {/* Target Word — fills upper portion, divider underneath */}
                            <div className="flex-1 flex items-center justify-center relative z-10 border-b border-divider py-4">
                                <h2 className="font-serif font-bold text-[56px] leading-[1.02] tracking-[-0.02em] text-ink text-center break-words">
                                    {card.word}
                                </h2>
                            </div>

                            {/* Forbidden Words */}
                            <div className="relative z-10 pt-4 flex flex-col items-center gap-2">
                                <div className="flex items-center gap-2 text-red-500 font-bold uppercase tracking-[0.14em] text-[12px] mb-1">
                                    <Ban size={14} /> Forbidden
                                </div>
                                {card.forbidden.map((word, i) => (
                                    <div key={i} className="text-[20px] font-medium text-ink-soft uppercase tracking-wide leading-tight">
                                        {word}
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-3">
                <Button onClick={handleSkip} variant="secondary" className="h-20 flex flex-col items-center justify-center gap-1">
                    <X size={28} className="text-muted" />
                    <span className="text-sm uppercase font-bold tracking-wider text-muted">Skip</span>
                </Button>
                <Button onClick={handleCorrect} className="h-20 bg-gold text-slate-900 hover:brightness-110 flex flex-col items-center justify-center gap-1 border-0">
                    <ThumbsUp size={28} className="text-slate-900" />
                    <span className="text-sm uppercase font-bold tracking-wider text-slate-900">Correct</span>
                </Button>
            </div>
        </div>
    );
};
