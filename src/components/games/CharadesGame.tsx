import React, { useState, useEffect, useRef, use } from 'react';
import { Button, ScreenHeader } from '../ui/Layout';
import {
    Timer, ThumbsUp, ThumbsDown, ChevronRight, Shuffle, Users, Film, Star, Sparkles, Share2,
    Eye, Drama, MessageSquareQuote, Baby, Flag,
} from 'lucide-react';
import EndScreen from '../ui/EndScreen';
import { generateCharadesWords } from '../../services/geminiService';
import { useContent } from '../../contexts/ContentContext';
import { CHARADES_CATEGORIES } from '../../constants';
import { loadGamesData } from '../../services/LocalGameService';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';
import TeamRosterRow from '../ui/TeamRosterRow';
import TimerSetting, { loadTimerPref, saveTimerPref } from '../ui/TimerSetting';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { useCountdown } from '../../hooks/useCountdown';
import { hapticLight, hapticSuccess, hapticHeavy } from '../../services/haptics';
import {
    loadCharadesClues, packClues, dealClues, MIX_PACK,
    type Clue, type CharadesClueData,
} from '../../services/charadesClues';

// games_data.json is lazy-loaded via LocalGameService (one shared chunk with
// Taboo). The fetch starts as soon as this game chunk loads; use() below
// suspends into the App-level Suspense boundary on first render.
const gamesDataPromise = loadGamesData();

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

// ---------------------------------------------------------------------------
// Round format. RAPID is the original loop — one deck, one clock, get through
// as many cards as you can. ONE_CLUE is the way the game actually gets played
// at a table: a single clue per turn with the whole 30/60s to land it, which
// is why it draws from a completely different deck (see charadesClues.ts).
// ---------------------------------------------------------------------------
type Format = 'RAPID' | 'ONE_CLUE';
const FORMAT_KEY = 'charades_format';
const loadFormat = (): Format => {
    try { return localStorage.getItem(FORMAT_KEY) === 'ONE_CLUE' ? 'ONE_CLUE' : 'RAPID'; }
    catch { return 'RAPID'; }
};
const saveFormat = (f: Format) => { try { localStorage.setItem(FORMAT_KEY, f); } catch { /* private mode */ } };

// Icon + accent per One Clue pack. Names and blurbs come from the JSON so the
// two can't drift; only the presentation lives here (and the hex goes through
// an inline style, so the Tailwind v4 JIT gotcha doesn't apply).
const PACK_META: Record<string, { Icon: typeof Sparkles; dark: string; light: string }> = {
    [MIX_PACK]:   { Icon: Shuffle,             dark: '#94A3B8', light: '#475569' },
    scenes:       { Icon: Drama,               dark: '#EFC050', light: '#B8922F' },
    screen:       { Icon: Film,                dark: '#65B7F0', light: '#1F77C9' },
    desi:         { Icon: Star,                dark: '#EC4899', light: '#C72D7F' },
    sayings:      { Icon: MessageSquareQuote,  dark: '#A78BFA', light: '#7C3AED' },
    characters:   { Icon: Users,               dark: '#34D399', light: '#0F9D6E' },
    family:       { Icon: Baby,                dark: '#FB923C', light: '#C2570A' },
};

const CLUES_EACH = [3, 5, 7] as const;

/** One result per completed turn, in schedule order. */
interface TurnResult { got: boolean; leftMs: number; }

export const CharadesGame: React.FC<Props> = ({ onExit }) => {
    const gamesDataRaw = use(gamesDataPromise);
    const { theme } = useTheme();
    const TILES_MAP = theme === 'light' ? TILES_LIGHT : TILES_DARK;
    const [words, setWords] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(false);
    const [gameState, setGameState] = useState<'SETUP' | 'TEAM_INTRO' | 'BRIEF' | 'PLAYING' | 'REVEAL' | 'SUMMARY'>('SETUP');
    const [score, setScore] = useState(0);
    const [duration, setDuration] = useState(() => loadTimerPref('charades_timer'));
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
    const [showHowToPlay, setShowHowToPlay] = useState(() => shouldAutoExpandRules('charades'));
    const [sharing, setSharing] = useState(false);
    // Guards the SUMMARY side-effects (stats + game-night report) so they
    // fire exactly once per game end, even across re-renders.
    const recordedRef = useRef(false);

    // --- One Clue format -------------------------------------------------
    // A match is a flat SCHEDULE of turns (actor + their clue), dealt up front
    // so the difficulty curve in dealClues() is a property of the whole match
    // rather than of each draw. `results` runs parallel to it, one entry per
    // completed turn — which is also what makes "whose turn is it" derived
    // (schedule[results.length]) instead of a second thing to keep in sync.
    const [format, setFormat] = useState<Format>(loadFormat);
    const [clueData, setClueData] = useState<CharadesClueData | null>(null);
    const [pack, setPack] = useState<string>(MIX_PACK);
    const [cluesEach, setCluesEach] = useState<number>(3);
    const [schedule, setSchedule] = useState<{ actor: string; clue: Clue }[]>([]);
    const [results, setResults] = useState<TurnResult[]>([]);
    const [revealed, setRevealed] = useState(false);
    const [deckError, setDeckError] = useState(false);
    const oneClue = format === 'ONE_CLUE';
    const turn = results.length;
    const currentTurn = schedule[turn];
    // Frozen at the moment the timer stopped, so REVEAL can say "with 23s left".
    const remainingRef = useRef(0);

    // The pack list has to render before anything is dealt, so the deck is
    // fetched as soon as the format is flipped rather than on the tile tap.
    // 38KB, its own chunk, and never touched at all in Rapid Fire.
    useEffect(() => {
        if (!oneClue || clueData || deckError) return;
        // A failed chunk fetch (offline before the service worker has precached
        // it) would otherwise leave the pack list on "Loading the deck…"
        // forever — a spinner is a lie once the request is already dead.
        loadCharadesClues().then(setClueData).catch(() => setDeckError(true));
    }, [oneClue, clueData, deckError]);

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

    // -----------------------------------------------------------------------
    // One Clue round loop
    // -----------------------------------------------------------------------

    /** Everyone who takes a turn. An empty roster is one anonymous actor. */
    const actorList = () => (teams.length >= 1 ? teams : ['You']);

    const startOneClue = async (packId: string) => {
        setPack(packId);
        setLoading(true);
        try {
            const data = clueData ?? await loadCharadesClues();
            if (!clueData) setClueData(data);

            const pool = packClues(data, packId);
            // Session dedupe, keyed per pack so the Mix and a single pack don't
            // fight over the same used-list. If a full match no longer fits in
            // what's unseen, fall back to the whole pack rather than dealing a
            // short match.
            const actors = actorList();
            const total = actors.length * cluesEach;
            const fresh = sessionService.filterContent(GameType.CHARADES, `oneclue_${packId}`, pool, c => c.t);
            const dealt = dealClues(fresh.length >= total ? fresh : pool, total);

            setSchedule(dealt.map((clue, i) => ({ actor: actors[i % actors.length], clue })));
            setResults([]);
            setRevealed(false);
            setTeamScores([]);
            setScore(0);
            setGameState('BRIEF');
        } catch (e) {
            console.error('Failed to load charades clues', e);
            setDeckError(true);
            setGameState('SETUP');
        }
        setLoading(false);
    };

    /** Close the whole match: tally per actor, then hand off to SUMMARY. */
    const finishOneClue = (all: TurnResult[]) => {
        const actors = actorList();
        const hits = actors.map((_, i) => all.filter((r, idx) => r.got && idx % actors.length === i).length);
        // Same convention as Rapid Fire: 2+ named actors gets the ranked
        // EndScreen, anything less gets the single-number summary.
        if (teams.length >= 2) setTeamScores(hits);
        else setScore(all.filter(r => r.got).length);
        setGameState('SUMMARY');
    };

    /** End the turn under the clock — `got` is the room's own verdict. */
    const finishTurn = (got: boolean) => {
        const entry = schedule[results.length];
        if (!entry) return;
        if (got) hapticSuccess(); else hapticHeavy();
        sessionService.markAsUsed(GameType.CHARADES, `oneclue_${pack}`, entry.clue.t);
        setResults(r => [...r, { got, leftMs: got ? remainingRef.current : 0 }]);
        setGameState('REVEAL');
    };

    /** REVEAL → the next actor's brief, or the end of the match. */
    const nextTurn = () => {
        setRevealed(false);
        if (results.length >= schedule.length) finishOneClue(results);
        else setGameState('BRIEF');
    };

    // Round clock — shared deadline-based countdown (no interval drift). Both
    // formats share it; only what happens at zero differs.
    const { secondsLeft: timeLeft, remainingMs } = useCountdown({
        running: gameState === 'PLAYING',
        durationMs: duration * 1000,
        onExpire: () => {
            if (oneClue) { finishTurn(false); return; }  // finishTurn buzzes for itself
            hapticHeavy();
            endRound();
        },
    });
    remainingRef.current = remainingMs;

    // Once per game end: lifetime stats + (in team mode) win credits and the
    // Game Night report. reportResult is a safe no-op when no night is
    // active. The ref resets on leaving SUMMARY so "Play Again" records too.
    useEffect(() => {
        if (gameState !== 'SUMMARY') {
            recordedRef.current = false;
            return;
        }
        if (recordedRef.current) return;
        recordedRef.current = true;
        statsStore.recordPlay('CHARADES');
        if (teamScores.length > 0) {
            const entries = teamScores.map((s, i) => ({ name: teams[i] || `Team ${i + 1}`, score: s }));
            const top = Math.max(...entries.map(e => e.score));
            statsStore.recordWins('CHARADES', entries.filter(e => e.score === top).map(e => e.name));
            gameNightService.reportResult('CHARADES', entries);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState]);

    const handleCorrect = () => {
        hapticSuccess();
        setScore(s => s + 1);
        nextCard();
    };

    const handleSkip = () => {
        hapticLight();
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
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🎭</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">All mime, <em>no</em> words.</h2>
                    <p className="text-muted text-sm">
                        {oneClue
                            ? `${duration} seconds on one clue.`
                            : `${duration} seconds, as many as you can.`}
                    </p>
                </div>
                {/* Round format. The two halves draw from different decks —
                    short cards for Rapid Fire, a clue with a minute in it for
                    One Clue — so this switch changes the tiles below too. */}
                <div className="max-w-[340px] mx-auto w-full mb-3">
                    <div className="grid grid-cols-2 gap-1 p-1 bg-surface-alt border border-divider rounded-xl" role="tablist" aria-label="Round format">
                        {([['RAPID', 'Rapid Fire', 'Many cards'], ['ONE_CLUE', 'One Clue', 'One card, one minute']] as const).map(([id, label, sub]) => (
                            <button
                                key={id}
                                role="tab"
                                aria-selected={format === id}
                                aria-label={label}
                                onClick={() => { hapticLight(); setFormat(id); saveFormat(id); }}
                                className={`rounded-lg py-2 px-2 text-center transition-colors ${
                                    format === id
                                        ? 'bg-app-tint border border-gold/50 shadow-inner'
                                        : 'border border-transparent hover:bg-app-tint/60'
                                }`}
                            >
                                <span className={`block text-sm font-bold leading-tight ${format === id ? 'text-ink' : 'text-muted'}`}>{label}</span>
                                <span className="block text-[10px] text-muted leading-tight">{sub}</span>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="text-center mb-3">
                    <button onClick={() => setShowHowToPlay(!showHowToPlay)} className="text-xs font-bold text-amber-500 border border-amber-500/30 px-3 py-1 bg-surface-alt hover:bg-app-tint transition relative z-10 mx-auto block rounded shadow-lg uppercase">
                        {showHowToPlay ? 'Hide Rules' : 'How To Play'}
                    </button>
                    {showHowToPlay && (
                        <div className="text-left text-xs text-ink-soft bg-black/20 border border-divider p-4 mt-2 relative z-10 space-y-3 font-medium rounded animate-fade-in shadow-inner max-w-[340px] mx-auto">
                            <p><strong className="text-ink">1. GOAL:</strong> One player acts out the word on screen using <strong className="text-amber-500">gestures only</strong> — get your team to guess it.</p>
                            <p><strong className="text-red-500">2. NO TALKING:</strong> No speaking, no mouthing words, no pointing at objects in the room. Mime it out.</p>
                            {oneClue ? (
                                <>
                                    <p><strong className="text-amber-500">3. ONE CLUE:</strong> One card per turn, and the whole {duration} seconds to land it. Only the actor reveals the card — the rest of the room looks away, then guesses.</p>
                                    <p><strong className="text-emerald-500">4. SCORING:</strong> One point per clue the room gets. Everyone takes the same number of turns; add names to play it as a contest.</p>
                                </>
                            ) : (
                                <>
                                    <p><strong className="text-amber-500">3. RAPID FIRE:</strong> Act out as many cards as you can before time runs out. Tap the clock chip above to change the round length.</p>
                                    <p><strong className="text-emerald-500">4. SCORING:</strong> One point per correct guess; skip anything too tough. Add team names to compete head-to-head, or just pass the phone.</p>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <div className="flex justify-center items-center gap-2 mb-3 flex-wrap">
                    <TimerSetting duration={duration} onPick={s => { setDuration(s); saveTimerPref('charades_timer', s); }} accent="#EFC050" />
                    {oneClue && (
                        <div className="flex items-center gap-1 bg-surface-alt border border-divider rounded-full pl-3 pr-1 py-1" aria-label="Clues each">
                            <span className="text-[11px] text-muted font-bold uppercase tracking-wider">Clues each</span>
                            {CLUES_EACH.map(n => (
                                <button
                                    key={n}
                                    aria-label={`${n} clues each`}
                                    aria-pressed={cluesEach === n}
                                    onClick={() => { hapticLight(); setCluesEach(n); }}
                                    className={`w-7 h-7 rounded-full text-xs font-bold transition-colors ${
                                        cluesEach === n ? 'bg-gold/20 text-gold border border-gold/50' : 'text-muted hover:text-ink'
                                    }`}
                                >{n}</button>
                            ))}
                        </div>
                    )}
                </div>
                <TeamRosterRow teams={teams} onTeamsChange={setTeams} />
                {oneClue && (
                    <div className="flex-1 overflow-y-auto pb-8">
                        <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                            {deckError ? (
                                <div className="text-center py-8 space-y-3">
                                    <p className="text-muted text-sm">Could not load the One Clue deck.</p>
                                    <Button onClick={() => setDeckError(false)}>Try again</Button>
                                    <button
                                        onClick={() => { setFormat('RAPID'); saveFormat('RAPID'); }}
                                        className="block mx-auto text-xs text-muted underline hover:text-ink"
                                    >
                                        Play Rapid Fire instead
                                    </button>
                                </div>
                            ) : clueData === null ? (
                                <p className="text-center text-muted text-sm py-8">Loading the deck…</p>
                            ) : (
                                [{ id: MIX_PACK, name: 'Everything', description: 'All six packs shuffled together.' }, ...clueData.packs].map(p => {
                                    const meta = PACK_META[p.id] ?? PACK_META[MIX_PACK];
                                    const color = theme === 'light' ? meta.light : meta.dark;
                                    const Icon = meta.Icon;
                                    return (
                                        <button
                                            key={p.id}
                                            onClick={() => startOneClue(p.id)}
                                            className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                        >
                                            <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: color }} />
                                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: color }} />
                                                <div className="flex items-center gap-3">
                                                    <span className="flex-shrink-0" style={{ color }}><Icon size={16} /></span>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="text-base font-bold text-ink leading-tight truncate">{p.name}</h3>
                                                        <p className="text-xs text-muted leading-snug truncate">{p.description}</p>
                                                    </div>
                                                    <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>
                )}
                {!oneClue && (
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
                )}
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
                    confirmOnExit
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

    // -----------------------------------------------------------------------
    // One Clue: the brief. The actor gets the card to themselves and a beat to
    // plan before the clock starts — the whole difference between a minute of
    // performance and a minute of panic. Two taps on purpose: reveal, then go.
    // -----------------------------------------------------------------------
    const kindLabel = (k: Clue['k']) => clueData?.kinds[k] ?? k;
    const DIFF_WORD = ['', 'Warm-up', 'Standard', 'Brutal'];

    const clueCard = (clue: Clue, opts: { blurred?: boolean } = {}) => (
        <div
            className="w-full aspect-[3/4] max-h-[340px] bg-surface border border-divider rounded-[22px] p-6 flex flex-col relative overflow-hidden"
            style={{ boxShadow: 'var(--shadow-card)' }}
        >
            <div
                className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                style={{ background: 'var(--c-gold-soft)' }}
            />
            <div className="flex items-center justify-between relative z-10">
                <div
                    className="text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md"
                    style={{ background: 'var(--c-gold-soft)', color: 'var(--c-gold)' }}
                >
                    {kindLabel(clue.k)}
                </div>
                <div className="flex items-center gap-1" title={DIFF_WORD[clue.d]} aria-label={DIFF_WORD[clue.d]}>
                    {[1, 2, 3].map(i => (
                        <span
                            key={i}
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: i <= clue.d ? 'var(--c-gold)' : 'var(--c-gold-soft)' }}
                        />
                    ))}
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center relative z-10">
                <h2
                    className={`font-serif font-bold leading-[1.15] tracking-[-0.015em] text-ink text-center break-words animate-slide-up transition-all duration-200 ${
                        clue.t.length > 44 ? 'text-[24px]' : clue.t.length > 24 ? 'text-[30px]' : 'text-[36px]'
                    } ${opts.blurred ? 'blur-md select-none' : ''}`}
                >
                    {opts.blurred ? 'Only the actor should read this card' : clue.t}
                </h2>
            </div>
            <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                <span>{DIFF_WORD[clue.d]}</span>
                <span className="font-serif italic text-[12px]" style={{ color: 'var(--c-gold)' }}>PartySpark</span>
            </div>
        </div>
    );

    if (oneClue && (gameState === 'BRIEF' || gameState === 'REVEAL') && schedule.length === 0) {
        // Belt and braces: a one-clue screen with nothing dealt would
        // otherwise fall through to the Rapid Fire card and render a word
        // from the wrong deck. Send them back to pick a pack instead.
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Charades" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <p className="text-muted text-sm">That deck came up empty.</p>
                    <Button onClick={() => setGameState('SETUP')}>Pick another pack</Button>
                </div>
            </div>
        );
    }

    if (gameState === 'BRIEF' && currentTurn) {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader
                    title={`Clue ${turn + 1} of ${schedule.length}`}
                    onBack={() => setGameState('SETUP')}
                    onHome={onExit}
                    confirmOnExit
                />
                <div className="text-center mb-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Acting</p>
                    <h2 className="text-3xl font-black text-ink">{currentTurn.actor}</h2>
                    <p className="text-muted text-xs mt-1">
                        {revealed ? 'Plan it out, then start the clock.' : 'Everyone else, look away.'}
                    </p>
                </div>
                <div className="flex-1 flex items-center justify-center">
                    {clueCard(currentTurn.clue, { blurred: !revealed })}
                </div>
                <div className="mt-6">
                    {revealed ? (
                        <Button onClick={() => { hapticLight(); setGameState('PLAYING'); }} fullWidth className="h-14 text-lg">
                            Start the {duration}s clock
                        </Button>
                    ) : (
                        <button
                            onClick={() => { hapticLight(); setRevealed(true); }}
                            className="w-full h-14 rounded-xl font-bold text-lg text-gold bg-transparent border-2 border-gold/60 hover:bg-gold/10 transition-colors active:scale-95 flex items-center justify-center gap-2"
                        >
                            <Eye size={20} /> Reveal my clue
                        </button>
                    )}
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // One Clue: the verdict. Always shows the clue — a miss you never get to
    // see is the most annoying thing a party game can do.
    // -----------------------------------------------------------------------
    if (gameState === 'REVEAL') {
        const last = results[results.length - 1];
        const played = schedule[results.length - 1];
        if (!last || !played) {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="Charades" onBack={() => setGameState('SETUP')} onHome={onExit} />
                    <div className="flex-1 flex items-center justify-center">
                        <Button onClick={() => setGameState('SETUP')}>Back to packs</Button>
                    </div>
                </div>
            );
        }
        const secs = Math.ceil(last.leftMs / 1000);
        const done = results.length >= schedule.length;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader
                    title={`Clue ${results.length} of ${schedule.length}`}
                    onBack={() => setGameState('SETUP')}
                    onHome={onExit}
                    confirmOnExit
                />
                <div className="flex-1 flex flex-col items-center justify-center gap-6 animate-slide-up px-2">
                    <div className="text-center">
                        <h2 className={`text-4xl font-black mb-1 ${last.got ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {last.got ? 'Got it!' : "Time's up"}
                        </h2>
                        <p className="text-muted text-sm">
                            {last.got
                                ? `${played.actor} landed it with ${secs}s to spare.`
                                : `${played.actor} could not get it across.`}
                        </p>
                    </div>
                    <div className="bg-surface-alt border border-divider rounded-xl px-5 py-4 max-w-[320px] w-full text-center">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-muted mb-1.5">{kindLabel(played.clue.k)}</p>
                        <p className="text-xl font-serif font-bold text-ink leading-snug">{played.clue.t}</p>
                    </div>
                    <p className="text-muted text-xs">
                        {results.filter(r => r.got).length} of {results.length} landed so far
                    </p>
                </div>
                <div className="mt-6">
                    <Button onClick={nextTurn} fullWidth className="h-14 text-lg">
                        {done ? 'See the results' : `Next up: ${schedule[results.length].actor}`}
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
        const packLabel = pack === MIX_PACK
            ? 'Everything'
            : (clueData?.packs.find(p => p.id === pack)?.name ?? pack);
        const catLabel = oneClue
            ? packLabel
            : (categories.find(c => c.id === category)?.label ?? category);
        const handleShare = async () => {
            if (sharing) return;
            setSharing(true);
            await shareResultCard({
                gameTitle: 'Charades',
                accent: TILES_MAP[category] || '#F59E0B',
                emoji: '🎭',
                heading: inTeamMode
                    ? (tiedTop ? 'Tie at the top!' : `${winner.name} wins!`)
                    : oneClue
                        ? `${score} of ${schedule.length} landed!`
                        : `${score} acted out!`,
                sub: oneClue
                    ? `${catLabel} · One Clue · ${duration}s each`
                    : `${catLabel} · ${duration}s ${inTeamMode ? 'rounds' : 'round'}`,
                tagline: 'Act it out — not a single word allowed',
                context: oneClue
                    ? `Score = clues landed inside their own ${duration}s`
                    : `Score = cards guessed before the ${duration}s timer`,
                challenge: inTeamMode
                    ? (tiedTop ? 'Someone has to break this tie…' : `Think your team can beat ${winner.name}?`)
                    : `Can your crew beat ${score}?`,
                rows: inTeamMode
                    ? ranked.map(r => ({ label: r.name, value: `${r.score}`, highlight: r.score === winner.score }))
                    : undefined,
            });
            setSharing(false);
        };
        const shareButton = (
            <button
                onClick={handleShare}
                disabled={sharing}
                className="w-full py-3 px-6 bg-transparent border-2 border-gold/60 text-gold hover:bg-gold/10 rounded-xl font-bold transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                <Share2 size={18} /> Share Result
            </button>
        );
        if (inTeamMode) {
            return (
                <EndScreen
                    title="Game Over"
                    onBack={() => setGameState('SETUP')}
                    onHome={onExit}
                    heading="Time's Up!"
                    accent="theme"
                    entries={ranked}
                    winnerText={() => 'takes it.'}
                    footerExtra={shareButton}
                    onPlayAgain={() => setGameState('SETUP')}
                    exitLabel="Exit"
                    onExit={onExit}
                />
            );
        }
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Game Over" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    <div className="text-center">
                        <h2 className="text-4xl font-bold mb-2 text-ink">{oneClue ? 'That\u2019s a wrap!' : "Time's Up!"}</h2>
                        <p className="text-muted">{oneClue ? 'Clues landed' : 'You got'}</p>
                    </div>
                    <div className="text-8xl font-black text-accent">
                        {oneClue ? `${score}/${schedule.length}` : score}
                    </div>
                    <div className="flex flex-col gap-3 w-full">
                        <button
                            onClick={handleShare}
                            disabled={sharing}
                            className="w-full py-3 px-6 bg-transparent border-2 border-gold/60 text-gold hover:bg-gold/10 rounded-xl font-bold transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Share2 size={18} /> Share Result
                        </button>
                        <Button onClick={() => setGameState('SETUP')} fullWidth>Play Again</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Exit</Button>
                    </div>
                </div>
            </div>
        );
    }

    // -----------------------------------------------------------------------
    // One Clue: under the clock. One card, no Next — the turn ends when the
    // room lands it or the buzzer does.
    // -----------------------------------------------------------------------
    if (oneClue && currentTurn) {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title={`Clue ${turn + 1} of ${schedule.length}`} onBack={() => setGameState('SETUP')} onHome={onExit} confirmOnExit />
                <div className="grid grid-cols-3 items-center mb-6">
                    <div className="text-[10px] uppercase tracking-wider text-muted truncate">{currentTurn.actor}</div>
                    <div className="flex justify-center">
                        <div className="flex items-center gap-2 bg-surface border border-divider px-4 py-2 rounded-full shadow-lg">
                            <Timer size={18} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-party-accent'} />
                            <span className={`font-mono font-bold text-xl ${timeLeft < 10 ? 'text-red-500' : 'text-ink'}`}>{timeLeft}</span>
                        </div>
                    </div>
                    <div className="font-bold text-ink flex justify-end text-right text-xl">
                        {results.filter(r => r.got).length}
                    </div>
                </div>

                <div className="flex-1 flex items-center justify-center perspective-1000">
                    {clueCard(currentTurn.clue)}
                </div>

                <div className="grid grid-cols-2 gap-4 mt-8">
                    <button onClick={() => finishTurn(false)} className="h-24 rounded-xl font-bold text-rose-600 bg-transparent border-2 border-rose-500/60 hover:bg-rose-500/10 hover:border-rose-500 transition-colors active:scale-95 flex flex-col items-center justify-center gap-2">
                        <Flag size={32} />
                        <span>Give up</span>
                    </button>
                    <button onClick={() => finishTurn(true)} className="h-24 rounded-xl font-bold text-emerald-600 bg-transparent border-2 border-emerald-500/60 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors active:scale-95 flex flex-col items-center justify-center gap-2">
                        <ThumbsUp size={32} />
                        <span>They got it</span>
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Charades" onBack={() => setGameState('SETUP')} onHome={onExit} confirmOnExit />

            <div className="grid grid-cols-3 items-center mb-6">
                <div />
                <div className="flex justify-center">
                    <div className="flex items-center gap-2 bg-surface border border-divider px-4 py-2 rounded-full shadow-lg">
                        <Timer size={18} className={timeLeft < 10 ? 'text-red-500 animate-pulse' : 'text-party-accent'} />
                        <span className={`font-mono font-bold text-xl ${timeLeft < 10 ? 'text-red-500' : 'text-ink'}`}>{timeLeft}</span>
                    </div>
                </div>
                <div className="font-bold text-ink flex justify-end text-right">
                    {teams.length >= 2
                        ? <div className="flex flex-col items-end leading-tight">
                            <span className="text-[10px] uppercase tracking-wider text-muted truncate max-w-[80px]">{teams[currentTeamIndex] || `Team ${currentTeamIndex + 1}`}</span>
                            <span className="text-xl">{score}</span>
                          </div>
                        : <span className="text-xl">{score}</span>
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
                <button onClick={handleSkip} className="h-24 rounded-xl font-bold text-rose-600 bg-transparent border-2 border-rose-500/60 hover:bg-rose-500/10 hover:border-rose-500 transition-colors active:scale-95 flex flex-col items-center justify-center gap-2">
                    <ThumbsDown size={32} />
                    <span>Skip</span>
                </button>
                <button onClick={handleCorrect} className="h-24 rounded-xl font-bold text-emerald-600 bg-transparent border-2 border-emerald-500/60 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors active:scale-95 flex flex-col items-center justify-center gap-2">
                    <ThumbsUp size={32} />
                    <span>Correct</span>
                </button>
            </div>
        </div>
    );
};
