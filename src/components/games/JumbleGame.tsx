import React, { useState, useEffect, useRef } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Shuffle, Delete, Plus, ArrowRight, User, Users, Check, X, CalendarDays, Share2, Image as ImageIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import TimerSetting, { loadTimerPref, saveTimerPref } from '../ui/TimerSetting';
import {
    loadJumblePack, pickSet, buildAnswerIndex, validateWord, summarizeMisses,
    scoreForWord, setKey, TILE_COUNT, poolSize, setAtIndex, commonWordCount,
    type JumbleSet, type JumbleDifficulty, type ValidationStatus, type JumblePack,
} from '../../services/jumbleEngine';
import { unlockAudio, playDingSoft, playPangram, playBuzzEnd, playTickSoft, hapticSuccess, hapticBuzz } from '../../services/audio';
import { shareResultCard, shareText } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import { dayLabel, dailySetIndex, dailyStore, buildDailyShareText, type DailyResult } from '../../services/dailyChallenge';
import { shouldAutoExpandRules } from '../../services/firstPlay';

interface Props { onExit: () => void; }

type GameMode = 'solo' | 'multi' | 'daily';
type GameState = 'MODE_SELECT' | 'DIFFICULTY_SELECT' | 'SETUP' | 'READY' | 'PASS_TO_NEXT' | 'TIMER_ACTIVE' | 'END' | 'DAILY_RESULT';

interface FoundWord { word: string; points: number; pangram: boolean }
interface PlayerResult { name: string; words: string[] }

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

const ACCENT = '#14B8A6';        // teal — Jumble's brand color
const CENTER = '#F59E0B';        // amber — the hard-mode center tile
const GOLD = '#F2B544';          // brand gold — the Daily Scramble accent

const DAILY_SECONDS = 60;                          // the Daily is a fixed 60s run for everyone
const DAILY_DEEP_LINK = 'partyspark_open_daily';   // sessionStorage flag set by Home, consumed here

const TIMER_KEY = 'jumble_timer';
const bestKey = (d: JumbleDifficulty) => `jumble_best_${d}`;

// Gold-outline share button (shared convention across games' end screens).
const SHARE_BTN = 'py-3 px-4 bg-transparent border-2 border-gold/60 text-gold hover:bg-gold/10 rounded-xl font-bold transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50';

const DIFFICULTY_TILES: { id: JumbleDifficulty; title: string; tagline: string; color: string; Icon: LucideIcon }[] = [
    { id: 'easy', title: 'Easy', tagline: 'Use any of the 7 letters.',          color: '#10B981', Icon: Shuffle },
    { id: 'hard', title: 'Hard', tagline: 'Every word must use the center tile.', color: '#E11D48', Icon: Shuffle },
];

// Friendly one-liners for each rejection so the feedback isn't cryptic.
const REJECT_MSG: Record<Exclude<ValidationStatus, 'valid'>, string> = {
    too_short:      'Too short — 4+ letters',
    not_formable:   "Can't make that from these tiles",
    missing_center: 'Must use the center letter',
    already_found:  'Already found',
    not_a_word:     'Not in the word list',
};

// Pass-and-Play unique-word scoring (Boggle rule): a word scores for a player
// only if nobody else found it. Shared by the END screen, the stats/Game
// Night reporting, and the share card.
interface MultiDetailRow { name: string; unique: string[]; total: number; score: number }
const byLenThenAlpha = (a: string, b: string) => b.length - a.length || (a < b ? -1 : a > b ? 1 : 0);
function computeMultiDetail(results: PlayerResult[]): { detail: MultiDetailRow[]; counts: Map<string, number> } {
    const counts = new Map<string, number>();
    results.forEach(r => r.words.forEach(w => counts.set(w, (counts.get(w) || 0) + 1)));
    const detail = results
        .map(r => {
            const unique = r.words.filter(w => counts.get(w) === 1).sort(byLenThenAlpha);
            return { name: r.name, unique, total: r.words.length, score: unique.reduce((s, w) => s + scoreForWord(w), 0) };
        })
        .sort((a, b) => b.score - a.score || b.unique.length - a.unique.length);
    return { detail, counts };
}

export const JumbleGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('MODE_SELECT');
    const [mode, setMode] = useState<GameMode>('solo');
    const [showHowToPlay, setShowHowToPlay] = useState(() => shouldAutoExpandRules('jumble'));
    const [difficulty, setDifficulty] = useState<JumbleDifficulty>('easy');
    const [duration, setDuration] = useState<number>(() => loadTimerPref(TIMER_KEY));

    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [set, setSet] = useState<JumbleSet | null>(null);
    const [tiles, setTiles] = useState<string[]>([]);     // the 6 OUTER honeycomb letters (shuffleable)
    const [centerLetter, setCenterLetter] = useState(''); // the middle hex (amber + required on Hard)
    const [input, setInput] = useState('');
    const [found, setFound] = useState<FoundWord[]>([]);
    const [score, setScore] = useState(0);
    const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad' | 'dup'; text: string } | null>(null);
    const [pangramFlash, setPangramFlash] = useState(false);
    const [tappedIdx, setTappedIdx] = useState<number | null>(null);  // brief tile press feedback
    const [remainingMs, setRemainingMs] = useState(duration * 1000);
    const [best, setBest] = useState(0);
    const [sharing, setSharing] = useState(false);

    // Daily Scramble: the streak/freeze outcome of THIS run (set once on END).
    const [dailyOutcome, setDailyOutcome] = useState<{ streak: number; usedFreeze: boolean } | null>(null);
    // Home's Daily card sets this flag before routing here — consume it once
    // (same side-effectful-initializer pattern as shouldAutoExpandRules).
    const [deepLinkDaily] = useState<boolean>(() => {
        try {
            if (sessionStorage.getItem(DAILY_DEEP_LINK) === '1') {
                sessionStorage.removeItem(DAILY_DEEP_LINK);
                return true;
            }
        } catch { /* privacy mode */ }
        return false;
    });

    // Pass-and-Play state
    const [players, setPlayers] = useState<string[]>(['', '']);
    const [playerIndex, setPlayerIndex] = useState(0);
    const [results, setResults] = useState<PlayerResult[]>([]);

    const answerIndex = useRef<Set<string>>(new Set());
    const foundSet = useRef<Set<string>>(new Set());
    const seenSets = useRef<Set<string>>(new Set());      // session dedupe
    const packRef = useRef<JumblePack | null>(null);      // resolved pack (for the deterministic Daily pick)
    const fbTimer = useRef<number | null>(null);
    const lastTickSec = useRef(99);
    const tapTimer = useRef<number | null>(null);

    const totalSeconds = mode === 'daily' ? DAILY_SECONDS : duration;

    // ---- load the sets pack lazily on first entry ----
    useEffect(() => {
        let alive = true;
        setLoading(true);
        loadJumblePack()
            .then((pack) => {
                if (!alive) return;
                packRef.current = pack;
                setLoading(false);
                // Deep link from Home: jump straight into the Daily flow —
                // today's summary if already played, else the run itself.
                if (deepLinkDaily) {
                    if (dailyStore.hasPlayedToday()) { setMode('daily'); setGameState('DAILY_RESULT'); }
                    else void startDaily(pack);
                }
            })
            .catch(() => { if (alive) { setLoading(false); setLoadError(true); } });
        return () => { alive = false; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ---- timer loop (RAF) ----
    useEffect(() => {
        if (gameState !== 'TIMER_ACTIVE') return;
        const deadline = performance.now() + totalSeconds * 1000;
        lastTickSec.current = 99;
        setRemainingMs(totalSeconds * 1000);
        let raf = 0;
        const frame = () => {
            const left = Math.max(0, deadline - performance.now());
            setRemainingMs(left);
            const sec = Math.ceil(left / 1000);
            if (sec <= 3 && sec >= 1 && sec !== lastTickSec.current) { lastTickSec.current = sec; playTickSoft(); }
            if (left <= 0) { playBuzzEnd(); hapticBuzz(); endRound(); return; }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, playerIndex]);

    // ---- flow ----
    const trimmedPlayers = players.map(p => p.trim()).filter(Boolean);

    // Lay out a chosen set: build its answer index, lay out the honeycomb.
    // Center hex = the required letter on Hard, else an arbitrary one (no rule).
    const applySet = (chosen: JumbleSet) => {
        answerIndex.current = buildAnswerIndex(chosen);
        const letters = [...chosen.letters];
        const center = chosen.center ?? letters[0];
        letters.splice(letters.indexOf(center), 1);   // remove one instance for the center
        setSet(chosen);
        setCenterLetter(center);
        setTiles(shuffle(letters));                   // 6 outer
    };

    // Pick one fresh letter set (session-deduped) for Solo / Pass and Play.
    const prepareSet = async (): Promise<void> => {
        const pack = await loadJumblePack();
        packRef.current = pack;
        const chosen = pickSet(pack, difficulty, seenSets.current);
        seenSets.current.add(setKey(chosen));
        applySet(chosen);
    };

    // Today's Daily set — date-seeded deterministic pick from the EASY pool
    // (same set for everyone in the world today; session dedupe does NOT apply).
    const getDailySet = (pack?: JumblePack | null): JumbleSet | null => {
        const p = pack ?? packRef.current;
        if (!p) return null;
        return setAtIndex(p, 'easy', dailySetIndex(poolSize(p, 'easy')));
    };

    // Daily Scramble: EASY pool, fixed 60s, one attempt per day.
    const startDaily = async (loaded?: JumblePack): Promise<void> => {
        unlockAudio();
        if (dailyStore.hasPlayedToday()) { setMode('daily'); setGameState('DAILY_RESULT'); return; }
        const pack = loaded ?? await loadJumblePack();
        packRef.current = pack;
        const chosen = getDailySet(pack);
        if (!chosen) return;
        seenSets.current.add(setKey(chosen));   // a later Solo round shouldn't re-serve today's Daily
        applySet(chosen);
        resetTurnState();
        setDailyOutcome(null);
        setMode('daily');
        setDifficulty('easy');
        setGameState('READY');
    };

    // Daily READY → the one timed attempt (set already prepared by startDaily).
    const startDailyRun = () => {
        unlockAudio();
        resetTurnState();
        setGameState('TIMER_ACTIVE');
    };

    // Wipe per-turn state (kept separate so a new player reuses the SAME set).
    const resetTurnState = () => {
        foundSet.current = new Set();
        setInput('');
        setFound([]);
        setScore(0);
        setFeedback(null);
    };

    // Solo: a brand-new set every round.
    const startSolo = async () => {
        unlockAudio();
        await prepareSet();
        resetTurnState();
        setBest(Number(localStorage.getItem(bestKey(difficulty))) || 0);
        setGameState('TIMER_ACTIVE');
    };

    // Multiplayer: one shared set + timer for everyone. Pick the set once, then
    // loop players through PASS_TO_NEXT → TIMER_ACTIVE.
    const beginMultiGame = async () => {
        unlockAudio();
        await prepareSet();
        setResults([]);
        setPlayerIndex(0);
        setGameState('PASS_TO_NEXT');
    };

    const handleSetupStart = () => {
        const clean = players.map(p => p.trim()).filter(Boolean);
        if (clean.length < MIN_PLAYERS) return;
        setPlayers(clean);
        beginMultiGame();
    };

    // PASS_TO_NEXT → the current player's timed round.
    const startPlayerTurn = () => {
        unlockAudio();
        resetTurnState();
        setGameState('TIMER_ACTIVE');
    };

    const playAgain = () => { if (mode === 'multi') beginMultiGame(); else if (mode === 'solo') startSolo(); };

    const endRound = () => {
        if (mode === 'multi') {
            const entry: PlayerResult = {
                name: (players[playerIndex] || '').trim() || `Player ${playerIndex + 1}`,
                words: [...foundSet.current],
            };
            setResults(prev => [...prev, entry]);
            if (playerIndex < players.length - 1) {
                setPlayerIndex(i => i + 1);
                setGameState('PASS_TO_NEXT');
            } else {
                setGameState('END');
            }
            return;
        }
        // solo & daily — the RAF callback captures stale state, so re-derive the
        // final tally from the live foundSet ref (score is a pure function of it).
        const words = [...foundSet.current];
        const finalScore = words.reduce((s, w) => s + scoreForWord(w), 0);
        setScore(finalScore);
        if (mode === 'solo') {
            // The pre-existing per-difficulty solo bests (jumble_best_*) are the
            // in-game source of truth — the Daily doesn't touch them.
            const prevBest = Number(localStorage.getItem(bestKey(difficulty))) || 0;
            if (finalScore > prevBest) { localStorage.setItem(bestKey(difficulty), String(finalScore)); setBest(finalScore); }
            else setBest(prevBest);
        }
        setGameState('END');
    };

    // ---- lifetime stats + Daily record + Game Night — once per finished game.
    // Runs after the END render, when score/found/results state has settled.
    // The ref resets on leaving END so Play Again records a fresh game;
    // dailyStore.recordResult additionally ignores repeat calls same-day.
    const recordedRef = useRef(false);
    useEffect(() => {
        if (gameState !== 'END') { recordedRef.current = false; return; }
        if (recordedRef.current) return;
        recordedRef.current = true;
        statsStore.recordPlay('JUMBLE');
        if (mode === 'multi') {
            const { detail } = computeMultiDetail(results);
            const top = detail[0]?.score ?? 0;
            if (top > 0) statsStore.recordWins('JUMBLE', detail.filter(d => d.score === top).map(d => d.name));
            gameNightService.reportResult('JUMBLE', detail.map(d => ({ name: d.name, score: d.score })));
        } else if (mode === 'daily') {
            const outcome = dailyStore.recordResult({ score, words: found.length, pangram: found.some(f => f.pangram) });
            setDailyOutcome(outcome);
            statsStore.recordBest('JUMBLE', score, `${score} pts · Daily`);
        } else {
            statsStore.recordBest('JUMBLE', score, `${score} pts · ${difficulty === 'hard' ? 'Hard' : 'Easy'}`);
        }
    }, [gameState, mode, results, score, found, difficulty]);

    // Player-setup field handlers (multiplayer SETUP screen).
    const addPlayer = () => { if (players.length < MAX_PLAYERS) setPlayers([...players, '']); };
    const removePlayer = (i: number) => { if (players.length > MIN_PLAYERS) setPlayers(players.filter((_, idx) => idx !== i)); };
    const setPlayerName = (i: number, v: string) => { const n = [...players]; n[i] = v; setPlayers(n); };

    const flashFeedback = (kind: 'ok' | 'bad' | 'dup', text: string) => {
        setFeedback({ kind, text });
        if (fbTimer.current) clearTimeout(fbTimer.current);
        fbTimer.current = window.setTimeout(() => setFeedback(null), 1300);
    };

    const submit = () => {
        if (!set) return;
        const res = validateWord(input, set, answerIndex.current, foundSet.current);
        if (res.status === 'valid') {
            foundSet.current.add(res.word);
            setFound(prev => [{ word: res.word, points: res.points, pangram: res.isPangram }, ...prev]);
            setScore(s => s + res.points);
            if (res.isPangram) {
                playPangram();
                hapticSuccess();
                setPangramFlash(true);
                setTimeout(() => setPangramFlash(false), 1500);
                flashFeedback('ok', `PANGRAM! +${res.points}`);
            } else {
                playDingSoft();
                flashFeedback('ok', `+${res.points}  ${res.word}`);
            }
        } else if (res.status === 'already_found') {
            flashFeedback('dup', REJECT_MSG.already_found);
        } else {
            flashFeedback('bad', REJECT_MSG[res.status]);
        }
        setInput('');
    };

    // Tap a hex to append its letter. key: -1 = center, 0..5 = outer (for flash).
    const appendLetter = (letter: string, key: number) => {
        setInput(v => v + letter);
        setTappedIdx(key);
        if (tapTimer.current) clearTimeout(tapTimer.current);
        tapTimer.current = window.setTimeout(() => setTappedIdx(null), 200);
    };
    const backspace = () => setInput(v => v.slice(0, -1));
    const onShuffle = () => setTiles(t => shuffle([...t]));


    const onPickTimer = (secs: number) => { setDuration(secs); saveTimerPref(TIMER_KEY, secs); };

    // ---- share (all handlers disabled while a share is in flight) ----
    const handleShareSolo = async () => {
        if (sharing) return;
        setSharing(true);
        const foundPangram = found.some(f => f.pangram);
        await shareResultCard({
            gameTitle: 'Scramble',
            accent: ACCENT,
            emoji: '🔠',
            heading: `${score} pts`,
            sub: `${found.length} words · ${difficulty === 'hard' ? 'Hard' : 'Easy'}${foundPangram ? ' · pangram!' : ''}`,
        });
        setSharing(false);
    };

    const handleShareMulti = async () => {
        if (sharing) return;
        setSharing(true);
        const { detail } = computeMultiDetail(results);
        const top = detail[0]?.score ?? 0;
        const tied = detail.filter(d => d.score === top).length > 1;
        await shareResultCard({
            gameTitle: 'Scramble',
            accent: ACCENT,
            emoji: '🔠',
            heading: top > 0 ? (tied ? "It's a tie!" : `${detail[0].name} wins!`) : 'All words cancelled!',
            sub: `${detail.length} players · ${difficulty === 'hard' ? 'Hard' : 'Easy'}`,
            rows: detail.map(d => ({ label: d.name, value: `${d.score} pts`, highlight: d.score === top && top > 0 })),
        });
        setSharing(false);
    };

    // Daily share — spoiler-free emoji grid (text) or the image card. Used by
    // both the daily END screen and the played-today summary (after reload).
    const shareDaily = async (kind: 'text' | 'card', res: DailyResult, streak: number) => {
        if (sharing) return;
        setSharing(true);
        const dSet = getDailySet();
        const maxWords = dSet ? commonWordCount(dSet) : Math.max(1, res.words);
        if (kind === 'text') {
            await shareText(buildDailyShareText({ words: res.words, score: res.score, pangram: res.pangram, streak, maxWords }));
        } else {
            await shareResultCard({
                gameTitle: 'Daily Scramble',
                accent: GOLD,
                emoji: '🔠',
                heading: `${res.score} pts`,
                sub: `${res.words}/${maxWords} words · ${dayLabel()}${res.pangram ? ' · pangram!' : ''}`,
            });
        }
        setSharing(false);
    };

    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
    const low = sec <= 10;

    // =======================================================================
    // RENDER
    // =======================================================================

    // ---- MODE_SELECT ----
    if (gameState === 'MODE_SELECT') {
        const streak = dailyStore.getStreak();
        const playedToday = dailyStore.hasPlayedToday();
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Scramble" onBack={onExit} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🔠</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">How many words can you <em>find</em>?</h2>
                    <p className="text-muted text-sm">7 letters. Beat the clock.</p>
                </div>
                <div className="text-center mb-3">
                    <button onClick={() => setShowHowToPlay(!showHowToPlay)} className="text-xs font-bold text-teal-500 border border-teal-500/30 px-3 py-1 bg-surface-alt hover:bg-app-tint transition relative z-10 mx-auto block rounded shadow-lg uppercase">
                        {showHowToPlay ? 'Hide Rules' : 'How To Play'}
                    </button>
                    {showHowToPlay && (
                        <div className="text-left text-xs text-ink-soft bg-black/20 border border-divider p-4 mt-2 relative z-10 space-y-3 font-medium rounded animate-fade-in shadow-inner max-w-[340px] mx-auto">
                            <p><strong className="text-ink">1. GOAL:</strong> Make as many words as you can from the 7 letters before the timer runs out. Tap the tiles to spell a word, then hit Enter.</p>
                            <p><strong className="text-teal-500">2. WORDS:</strong> 4+ letters only. Longer words score more — a 7-letter word (a <strong className="text-ink">pangram</strong>) is the jackpot.</p>
                            <p><strong className="text-amber-500">3. HARD MODE:</strong> every word must include the highlighted <strong style={{ color: CENTER }}>center letter</strong>. Easy uses any of the 7.</p>
                            <p><strong className="text-violet-500">4. PLAY:</strong> Go <strong className="text-ink">Solo</strong> to beat your best, or <strong className="text-ink">Pass and Play</strong> — everyone gets the same letters and the most <em>unique</em> words wins (shared words cancel).</p>
                            <p><strong className="text-gold">5. DAILY:</strong> one shared puzzle a day — the same letters for everyone, one attempt, 60 seconds. Keep the streak alive.</p>
                        </div>
                    )}
                </div>
                {loadError && (
                    <p className="text-center text-xs text-red-500 mb-2">Couldn't load puzzles. Check your connection and reopen.</p>
                )}
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        <ModeTile Icon={CalendarDays} title="Daily"
                            tagline={playedToday ? 'Played today ✓ — see your result' : "Today's letters — same for everyone."}
                            color={GOLD}
                            badge={streak > 0 ? `🔥 ${streak} day streak` : undefined}
                            onClick={() => { if (playedToday) { setMode('daily'); setGameState('DAILY_RESULT'); } else void startDaily(); }}
                            disabled={loading} />
                        <ModeTile Icon={User} title="Solo" tagline="One round, beat your own best." color={ACCENT}
                            onClick={() => { setMode('solo'); setGameState('DIFFICULTY_SELECT'); }} disabled={loading} />
                        <ModeTile Icon={Users} title="Pass and Play" tagline="Same letters — most unique words wins." color="#8B5CF6"
                            onClick={() => { setMode('multi'); setGameState('DIFFICULTY_SELECT'); }} disabled={loading} />
                    </div>
                    {loading && <p className="text-center text-xs text-muted mt-4">Loading puzzles…</p>}
                </div>
            </div>
        );
    }

    // ---- DIFFICULTY_SELECT ----
    if (gameState === 'DIFFICULTY_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Pick a Level" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex justify-center mb-4">
                    <TimerSetting duration={duration} onPick={onPickTimer} accent={ACCENT} />
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {DIFFICULTY_TILES.map(t => {
                            const Icon = t.Icon;
                            return (
                                <button key={t.id} onClick={() => { setDifficulty(t.id); setGameState(mode === 'multi' ? 'SETUP' : 'READY'); }}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer">
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: t.color }} />
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: t.color }} />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color: t.color }}><Icon size={16} /></span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight">{t.title}</h3>
                                                <p className="text-xs text-muted leading-snug truncate">{t.tagline}</p>
                                            </div>
                                            <ArrowRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
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

    // ---- SETUP (multiplayer player names) ----
    if (gameState === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Who's Playing?" onBack={() => setGameState('DIFFICULTY_SELECT')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <p className="text-center text-muted text-sm mb-4 -mt-1">Everyone gets the same letters. Most <span className="font-bold text-ink">unique</span> words wins.</p>
                    <div className="space-y-3 flex-1 max-w-[340px] mx-auto w-full">
                        {players.map((name, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-full bg-teal-500/20 text-teal-500 flex items-center justify-center font-bold text-sm shrink-0">{i + 1}</div>
                                <input
                                    type="text" value={name} maxLength={15}
                                    onChange={e => setPlayerName(i, e.target.value)}
                                    placeholder={`Player ${i + 1}`}
                                    className="flex-1 bg-surface-alt border border-divider focus:border-teal-500 rounded-xl p-3 text-ink font-medium placeholder:text-muted outline-none transition-colors"
                                />
                                {players.length > MIN_PLAYERS && (
                                    <button onClick={() => removePlayer(i)} aria-label={`Remove player ${i + 1}`}
                                        className="p-2 rounded-lg bg-surface-alt hover:bg-red-500/15 text-muted hover:text-red-500 transition-colors">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {players.length < MAX_PLAYERS && (
                            <button onClick={addPlayer}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-divider hover:border-ink-soft text-muted hover:text-ink transition-colors">
                                <Plus size={18} /> Add player
                            </button>
                        )}
                    </div>
                    <Button onClick={handleSetupStart} disabled={trimmedPlayers.length < MIN_PLAYERS}
                        className={`w-full py-4 text-lg mt-6 max-w-[340px] mx-auto ${trimmedPlayers.length < MIN_PLAYERS ? 'opacity-40' : ''}`}>
                        Start <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---- PASS_TO_NEXT (multiplayer hand-off) ----
    if (gameState === 'PASS_TO_NEXT') {
        const name = (players[playerIndex] || '').trim() || `Player ${playerIndex + 1}`;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Pass the Phone" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-5 animate-slide-up">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Hand the device to</p>
                    <h2 className="text-5xl font-black text-ink">{name}</h2>
                    <p className="text-muted text-sm">Player {playerIndex + 1} of {players.length} · {duration}s · {difficulty === 'easy' ? 'Easy' : 'Hard'}</p>
                    <p className="text-muted text-xs max-w-[280px]">Same 7 letters for everyone. Don't peek until you tap Go.</p>
                    <Button onClick={startPlayerTurn} fullWidth className="h-14 text-lg max-w-[300px]">
                        I'm {name} — Go
                    </Button>
                </div>
            </div>
        );
    }

    // ---- READY (solo + the Daily's pre-attempt gate) ----
    if (gameState === 'READY') {
        const isDaily = mode === 'daily';
        const streakOnTheLine = isDaily ? dailyStore.getStreak() : 0;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={isDaily ? 'Daily Scramble' : 'Ready?'}
                    onBack={() => setGameState(isDaily ? 'MODE_SELECT' : 'DIFFICULTY_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5 animate-slide-up">
                    <p className="text-5xl">🔠</p>
                    {isDaily ? (
                        <>
                            <h2 className="text-2xl font-serif font-bold text-ink">Today's puzzle · {dayLabel()}</h2>
                            <p className="text-muted text-sm max-w-[300px]">
                                Everyone gets the <span className="font-bold text-ink">same 7 letters</span> today.
                                You get <span className="font-bold text-ink">one attempt</span> — make it count.
                            </p>
                            {streakOnTheLine > 0 && (
                                <p className="text-sm font-bold" style={{ color: GOLD }}>🔥 {streakOnTheLine}-day streak on the line</p>
                            )}
                            <p className="text-xs text-muted">{DAILY_SECONDS}s · Easy</p>
                            <Button onClick={startDailyRun} fullWidth className="h-14 text-lg max-w-[300px]">Start Today's Scramble</Button>
                        </>
                    ) : (
                        <>
                            <h2 className="text-2xl font-serif font-bold text-ink">Find as many words as you can</h2>
                            <p className="text-muted text-sm max-w-[300px]">
                                {difficulty === 'hard'
                                    ? <>Every word must use the <span className="font-bold" style={{ color: CENTER }}>center letter</span>. </>
                                    : null}
                                Words are 4+ letters. Longer words score more — a 7-letter <span className="font-bold text-ink">pangram</span> is the jackpot.
                            </p>
                            <p className="text-xs text-muted">{duration}s · {difficulty === 'easy' ? 'Easy' : 'Hard'}</p>
                            <Button onClick={startSolo} fullWidth className="h-14 text-lg max-w-[300px]">Start</Button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ---- DAILY_RESULT (already played today — the persistent summary) ----
    if (gameState === 'DAILY_RESULT') {
        const res = dailyStore.getTodayResult();
        const streak = dailyStore.getStreak();
        const dSet = getDailySet();
        const maxWords = dSet ? commonWordCount(dSet) : 0;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Daily Scramble" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-3 pb-6">
                    <div className="text-center mt-3 mb-5">
                        <p className="text-4xl mb-1.5">🔠</p>
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Played today ✓ · {dayLabel()}</p>
                        {res ? (
                            <>
                                <p className="text-6xl font-black tabular-nums mt-1" style={{ color: GOLD }}>{res.score}</p>
                                <p className="text-xs text-muted mt-1">
                                    {res.words}{maxWords > 0 ? `/${maxWords}` : ''} word{res.words === 1 ? '' : 's'}
                                    {res.pangram && <span className="font-bold" style={{ color: CENTER }}> · ✨ pangram!</span>}
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-muted mt-3">Today's attempt is done.</p>
                        )}
                        {streak > 0 && <p className="text-xl font-black mt-3" style={{ color: GOLD }}>🔥 {streak}-day streak</p>}
                        <p className="text-xs text-muted mt-2">New letters tomorrow — come back to keep the streak alive.</p>
                    </div>
                    {res && (
                        <div className="max-w-[340px] mx-auto w-full flex gap-3">
                            <button onClick={() => void shareDaily('text', res, streak)} disabled={sharing} className={`flex-1 ${SHARE_BTN}`}>
                                <Share2 size={18} /> Share
                            </button>
                            <button onClick={() => void shareDaily('card', res, streak)} disabled={sharing} className={`flex-1 ${SHARE_BTN}`}>
                                <ImageIcon size={18} /> Share Card
                            </button>
                        </div>
                    )}
                    <div className="max-w-[340px] mx-auto w-full mt-4">
                        <Button onClick={() => setGameState('MODE_SELECT')} variant="secondary" fullWidth>Back to Scramble</Button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- END (multiplayer leaderboard — unique-word scoring) ----
    if (gameState === 'END' && mode === 'multi') {
        // A word scores for a player only if no one else found it (Boggle rule).
        const { detail, counts } = computeMultiDetail(results);
        const byLen = byLenThenAlpha;
        const topScore = detail[0]?.score ?? 0;
        // Words found by 2+ players (cancelled for everyone), listed once.
        const sharedAll = [...counts.entries()].filter(([, n]) => n >= 2).map(([w]) => w).sort(byLen);
        // The group's best misses — the answer key nobody got (Easy = common subset).
        const unionFound = new Set<string>(results.flatMap(r => r.words));
        const universe = set ? (set.commonWords ?? set.words) : [];
        const groupMisses = universe.filter(w => !unionFound.has(w) && w.length >= 5).sort(byLen).slice(0, 30);
        const pangramFound = [...unionFound].some(w => w.length === TILE_COUNT);
        const chip = (w: string, kind: 'score' | 'shared' | 'miss') =>
            kind === 'score'
                ? <span key={w} className="text-[11px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: ACCENT }}>{w} <span className="opacity-70">+{scoreForWord(w)}</span></span>
                : kind === 'shared'
                ? <span key={w} className="text-[11px] font-medium px-1.5 py-0.5 rounded text-muted bg-surface-alt border border-divider line-through">{w}</span>
                : <span key={w} className="text-[11px] font-semibold px-1.5 py-0.5 rounded text-ink-soft bg-surface-alt border border-divider">{w} <span className="opacity-50">+{scoreForWord(w)}</span></span>;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Results" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-3 pb-6">
                    <div className="text-center mt-1 mb-3">
                        <p className="text-4xl mb-0.5">🏆</p>
                        <h2 className="text-2xl font-serif font-bold text-ink">{detail[0]?.name} wins!</h2>
                        <p className="text-[11px] text-muted mt-1">Only words no one else found score · {sharedAll.length} shared cancelled{pangramFound ? ' · ✨ pangram found' : ''}</p>
                    </div>

                    {/* leaderboard */}
                    <div className="max-w-[400px] mx-auto w-full space-y-1.5">
                        {detail.map((r, i) => {
                            const win = r.score === topScore && topScore > 0;
                            return (
                                <div key={r.name + i}
                                    className={`flex items-center justify-between px-4 py-2.5 rounded-xl border ${win ? 'bg-teal-500/10 border-teal-500/50' : 'bg-surface border-divider'}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`w-5 text-center font-black ${win ? 'text-teal-500' : 'text-muted'}`}>{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-ink truncate leading-tight">{r.name}</p>
                                            <p className="text-[10px] text-muted">{r.unique.length} scored · {r.total} found</p>
                                        </div>
                                    </div>
                                    <span className="text-xl font-black tabular-nums" style={{ color: ACCENT }}>{r.score}</span>
                                </div>
                            );
                        })}
                    </div>

                    {/* per-player scoring words */}
                    <div className="max-w-[460px] mx-auto w-full mt-5 space-y-3">
                        {detail.map((r, i) => (
                            <div key={r.name + i}>
                                <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-1.5 truncate">{r.name} — scored {r.score}</p>
                                {r.unique.length > 0 ? (
                                    <div className="flex flex-wrap gap-1">
                                        {r.unique.slice(0, 24).map(w => chip(w, 'score'))}
                                        {r.unique.length > 24 && <span className="text-[11px] text-muted self-center">+{r.unique.length - 24}</span>}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted italic">No words only they found.</p>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* shared (cancelled) words — listed once */}
                    {sharedAll.length > 0 && (
                        <Section title={`Cancelled — found by 2+ (${sharedAll.length})`}>
                            <div className="flex flex-wrap gap-1">
                                {sharedAll.slice(0, 30).map(w => chip(w, 'shared'))}
                                {sharedAll.length > 30 && <span className="text-[11px] text-muted self-center">+{sharedAll.length - 30}</span>}
                            </div>
                        </Section>
                    )}

                    {/* group misses — the answer key nobody got */}
                    {groupMisses.length > 0 && (
                        <div className="max-w-[460px] mx-auto w-full mt-4">
                            <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-1.5">Nobody found ({groupMisses.length} big ones)</p>
                            <div className="flex flex-wrap gap-1">
                                {groupMisses.map(w => chip(w, 'miss'))}
                            </div>
                        </div>
                    )}

                    {set && (
                        <p className="text-center text-xs text-muted mt-4">Letters: <span className="font-bold text-ink tracking-widest">{[...set.letters].sort().join('')}</span>{set.pangrams[0] && <> · pangram <span className="font-bold" style={{ color: CENTER }}>{set.pangrams[0]}</span> {pangramFound ? '✓' : '— missed by all'}</>}</p>
                    )}

                    <div className="max-w-[340px] mx-auto w-full mt-6 flex flex-col gap-3">
                        <button onClick={() => void handleShareMulti()} disabled={sharing} className={`w-full ${SHARE_BTN}`}>
                            <Share2 size={18} /> Share Result
                        </button>
                        <Button onClick={playAgain} fullWidth className="h-13 text-lg">
                            <Shuffle className="inline mr-2" size={18} /> Play Again
                        </Button>
                        <button onClick={() => setGameState('MODE_SELECT')} className="w-full py-3 rounded-xl font-bold text-sm text-muted hover:text-ink border border-divider transition-colors">
                            Change level / players
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- END (daily) — recording happened in the END effect; show the streak
    // prominently + spoiler-free share. One attempt: no Play Again.
    if (gameState === 'END' && mode === 'daily') {
        const summary = set ? summarizeMisses(set, foundSet.current) : null;
        const maxWords = set ? commonWordCount(set) : 0;
        const streak = dailyOutcome?.streak ?? dailyStore.getStreak();
        const res: DailyResult = { score, words: found.length, pangram: found.some(f => f.pangram) };
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Time!" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-3 pb-6">
                    <div className="text-center mt-1 mb-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Daily Scramble · {dayLabel()}</p>
                        <p className="text-6xl font-black tabular-nums" style={{ color: GOLD }}>{score}</p>
                        <p className="text-xs text-muted mt-1">{found.length}{maxWords > 0 ? `/${maxWords}` : ''} word{found.length === 1 ? '' : 's'} · one attempt a day</p>
                        {res.pangram && <p className="text-xs font-bold mt-1 text-teal-500">✨ You found a pangram!</p>}
                        <p className="text-2xl font-black mt-3" style={{ color: GOLD }}>🔥 {streak}-day streak</p>
                        {dailyOutcome?.usedFreeze && (
                            <p className="text-xs font-bold text-sky-400 mt-1">❄️ streak freeze used — one missed day forgiven</p>
                        )}
                    </div>

                    <div className="max-w-[340px] mx-auto w-full flex gap-3 mb-5">
                        <button onClick={() => void shareDaily('text', res, streak)} disabled={sharing} className={`flex-1 ${SHARE_BTN}`}>
                            <Share2 size={18} /> Share
                        </button>
                        <button onClick={() => void shareDaily('card', res, streak)} disabled={sharing} className={`flex-1 ${SHARE_BTN}`}>
                            <ImageIcon size={18} /> Share Card
                        </button>
                    </div>

                    {found.length > 0 && (
                        <Section title={`You found (${found.length})`}>
                            <div className="flex flex-wrap gap-1.5">
                                {found.map(f => (
                                    <span key={f.word} className={`text-xs font-bold px-2 py-1 rounded-md ${f.pangram ? 'text-white' : 'text-ink bg-surface-alt border border-divider'}`}
                                        style={f.pangram ? { background: CENTER } : undefined}>
                                        {f.word} <span className="opacity-60">+{f.points}</span>
                                    </span>
                                ))}
                            </div>
                        </Section>
                    )}

                    {summary && summary.topMisses.length > 0 && (
                        <Section title={`Words you missed (${summary.topMisses.length} big ones)`}>
                            <div className="flex flex-wrap gap-1.5">
                                {summary.topMisses.slice(0, 40).map(w => (
                                    <span key={w} className="text-xs font-semibold px-2 py-1 rounded-md text-ink-soft bg-surface-alt border border-divider">
                                        {w} <span className="opacity-50">+{scoreForWord(w)}</span>
                                    </span>
                                ))}
                            </div>
                        </Section>
                    )}

                    <div className="max-w-[340px] mx-auto w-full mt-6 flex flex-col gap-3">
                        <p className="text-center text-xs text-muted">New letters tomorrow — come back to keep the streak alive.</p>
                        <Button onClick={() => setGameState('MODE_SELECT')} fullWidth>Done</Button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- END (solo) ----
    if (gameState === 'END') {
        const summary = set ? summarizeMisses(set, foundSet.current) : null;
        const isNewBest = score > 0 && score >= best;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Time!" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-3 pb-6">
                    <div className="text-center mt-1 mb-4">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-muted">Your score</p>
                        <p className="text-6xl font-black tabular-nums" style={{ color: ACCENT }}>{score}</p>
                        <p className="text-xs text-muted mt-1">
                            {found.length} word{found.length === 1 ? '' : 's'} · best {Math.max(best, score)}
                            {summary && <> · {Math.min(100, Math.round((score / Math.max(1, summary.maxPossibleScore)) * 100))}% of max</>}
                        </p>
                        {isNewBest && <p className="text-xs font-bold mt-1" style={{ color: CENTER }}>🏆 New personal best!</p>}
                        {summary?.foundPangram && <p className="text-xs font-bold mt-1 text-teal-500">✨ You found a pangram!</p>}
                    </div>

                    {found.length > 0 && (
                        <Section title={`You found (${found.length})`}>
                            <div className="flex flex-wrap gap-1.5">
                                {found.map(f => (
                                    <span key={f.word} className={`text-xs font-bold px-2 py-1 rounded-md ${f.pangram ? 'text-white' : 'text-ink bg-surface-alt border border-divider'}`}
                                        style={f.pangram ? { background: CENTER } : undefined}>
                                        {f.word} <span className="opacity-60">+{f.points}</span>
                                    </span>
                                ))}
                            </div>
                        </Section>
                    )}

                    {summary && summary.topMisses.length > 0 && (
                        <Section title={`Words you missed (${summary.topMisses.length} big ones)`}>
                            <div className="flex flex-wrap gap-1.5">
                                {summary.topMisses.slice(0, 40).map(w => (
                                    <span key={w} className="text-xs font-semibold px-2 py-1 rounded-md text-ink-soft bg-surface-alt border border-divider">
                                        {w} <span className="opacity-50">+{scoreForWord(w)}</span>
                                    </span>
                                ))}
                            </div>
                            {!summary.foundPangram && summary.missed.some(w => w.length === TILE_COUNT) && (
                                <p className="text-xs text-muted mt-2">You missed the pangram. 👀</p>
                            )}
                        </Section>
                    )}

                    <div className="max-w-[340px] mx-auto w-full mt-6 flex flex-col gap-3">
                        <button onClick={() => void handleShareSolo()} disabled={sharing} className={`w-full ${SHARE_BTN}`}>
                            <Share2 size={18} /> Share Result
                        </button>
                        <Button onClick={playAgain} fullWidth className="h-13 text-lg">
                            <Shuffle className="inline mr-2" size={18} /> Play Again
                        </Button>
                        <button onClick={() => setGameState('MODE_SELECT')} className="w-full py-3 rounded-xl font-bold text-sm text-muted hover:text-ink border border-divider transition-colors">
                            Change level / timer
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---- TIMER_ACTIVE ----
    // Tap-only honeycomb — no text input / no keyboard. Center hex is the
    // required letter on Hard (amber); on Easy it's just the middle position.
    const runAccent = mode === 'daily' ? GOLD : ACCENT;   // the Daily plays in gold
    const HEX_CLIP = 'polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)';
    const SP_W = 80, SP_H = 70, HEX_W = 79, HEX_H = 69;   // near-touching → minimal dead gap between hexes
    const outerPos = [
        { x: 0, y: -SP_H }, { x: 0.75 * SP_W, y: -0.5 * SP_H }, { x: 0.75 * SP_W, y: 0.5 * SP_H },
        { x: 0, y: SP_H }, { x: -0.75 * SP_W, y: 0.5 * SP_H }, { x: -0.75 * SP_W, y: -0.5 * SP_H },
    ];
    const renderHex = (letter: string, key: number, isCenterHex: boolean, x: number, y: number) => {
        const requiredCenter = isCenterHex && !!set?.center;
        const pressed = tappedIdx === key;
        const fill = requiredCenter ? CENTER : (pressed ? runAccent : 'var(--color-app-tint)');
        const color = requiredCenter ? '#1a1a1a' : (pressed ? '#ffffff' : 'var(--color-ink)');
        // Fire on pointer-DOWN (not click) for instant response on fast taps,
        // and touch-manipulation to kill the tap delay + double-tap zoom that
        // otherwise swallow rapid successive taps in a timed game.
        return (
            <button key={key}
                onPointerDown={e => { e.preventDefault(); appendLetter(letter, key); }}
                className="absolute flex items-center justify-center font-black text-2xl transition-transform duration-100 select-none touch-manipulation"
                style={{
                    width: HEX_W, height: HEX_H,
                    left: `calc(50% + ${x}px)`, top: `calc(50% + ${y}px)`,
                    transform: `translate(-50%, -50%) scale(${pressed ? 0.9 : 1})`,
                    clipPath: HEX_CLIP, background: fill, color,
                    filter: 'drop-shadow(0 1px 1.5px rgba(0,0,0,0.25))',
                }}>
                {letter}
            </button>
        );
    };

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Scramble" onBack={onExit} onHome={onExit} confirmOnExit />

            <div className="px-2 flex-1 flex flex-col min-h-0">
                {/* Themed stage card — PartySpark play-card family (Taboo / TOD /
                    NHIE): surface card, accent blob, header pill, italic footer. */}
                <div
                    className="w-full bg-surface border border-divider rounded-[22px] px-4 py-3.5 flex flex-col relative overflow-hidden mt-1"
                    style={{ boxShadow: 'var(--shadow-card)' }}
                >
                    <div className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none" style={{ background: runAccent + '22' }} />

                    {/* pill (left) + timer (right) */}
                    <div className="flex items-center justify-between relative z-10">
                        <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md"
                            style={{ background: runAccent + '22', color: runAccent }}>
                            {mode === 'daily' ? `Daily · ${dayLabel()}` : `Scramble · ${difficulty === 'easy' ? 'Easy' : 'Hard'}`}
                        </span>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-3xl font-black tabular-nums leading-none ${low ? 'text-red-500 animate-pulse' : 'text-ink'}`}>{sec}</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted">sec</span>
                        </div>
                    </div>

                    {/* current word being built (tap the tiles) */}
                    <div className="relative z-10 mt-3 h-9 flex items-center justify-center">
                        {input
                            ? <span className="font-black text-2xl tracking-[0.18em] uppercase text-ink">{input}</span>
                            : <span className="text-xs text-muted">Tap the letters to build a word</span>}
                    </div>

                    {/* honeycomb */}
                    <div className={`relative mx-auto mt-2 ${pangramFlash ? 'animate-pulse' : ''}`} style={{ width: 2.5 * SP_W, height: 3 * SP_H, zIndex: 10 }}>
                        {outerPos.map((p, i) => renderHex(tiles[i] || '', i, false, p.x, p.y))}
                        {renderHex(centerLetter, -1, true, 0, 0)}
                    </div>

                    {set?.center && (
                        <p className="text-center text-[11px] font-bold mt-3 relative z-10" style={{ color: CENTER }}>
                            Every word must use the amber letter
                        </p>
                    )}

                    {/* footer — score (left, small) + italic PartySpark (right) */}
                    <div className="text-[11px] text-muted flex items-center justify-between relative z-10 mt-3">
                        <span className="truncate pr-2">
                            {mode === 'multi' && (
                                <span className="text-ink-soft font-semibold">{(players[playerIndex] || '').trim() || `Player ${playerIndex + 1}`} · {playerIndex + 1}/{players.length} · </span>
                            )}
                            Score <span className="font-black tabular-nums" style={{ color: runAccent }}>{score}</span>
                        </span>
                        <span className="font-serif italic text-[12px]" style={{ color: runAccent }}>PartySpark</span>
                    </div>
                </div>

                {/* feedback line */}
                <div className="h-5 text-center mt-2">
                    {feedback && (
                        <span className={`text-sm font-bold ${feedback.kind === 'ok' ? 'text-emerald-500' : feedback.kind === 'dup' ? 'text-amber-500' : 'text-red-500'}`}>
                            {feedback.kind === 'ok' ? <Check size={14} className="inline mr-1" /> : <X size={14} className="inline mr-1" />}
                            {feedback.text}
                        </span>
                    )}
                </div>

                {/* Delete · Shuffle · Enter */}
                <div className="flex items-center justify-center gap-2.5 mt-1 max-w-[440px] mx-auto w-full">
                    <button onClick={backspace} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-surface-alt border border-divider text-ink-soft hover:text-ink text-sm font-bold transition-colors active:scale-95">
                        <Delete size={16} /> Delete
                    </button>
                    <button onClick={onShuffle} className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-surface-alt border border-divider text-ink-soft hover:text-ink text-sm font-bold transition-colors active:scale-95">
                        <Shuffle size={16} /> Shuffle
                    </button>
                    <button onClick={submit} className="flex-[1.3] flex items-center justify-center gap-1.5 py-3 rounded-xl text-white font-bold text-base shadow-lg active:scale-95 transition-transform"
                        style={{ background: runAccent }}>
                        <Check size={18} /> Enter
                    </button>
                </div>

                {/* found words (newest on top) — no "X of Y" counter shown */}
                <div className="flex-1 overflow-y-auto mt-3 min-h-0">
                    <div className="flex flex-wrap gap-1.5 justify-center max-w-[460px] mx-auto pb-4">
                        {found.map(f => (
                            <span key={f.word} className={`text-xs font-bold px-2 py-1 rounded-md ${f.pangram ? 'text-white' : 'text-ink bg-surface-alt border border-divider'}`}
                                style={f.pangram ? { background: CENTER } : undefined}>
                                {f.word} <span className="opacity-60">+{f.points}</span>
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- small presentational helpers ------------------------------------------
const ModeTile: React.FC<{ Icon: LucideIcon; title: string; tagline: string; color: string; onClick: () => void; disabled?: boolean; badge?: string }> =
    ({ Icon, title, tagline, color, onClick, disabled, badge }) => (
    <button onClick={onClick} disabled={disabled}
        className={`group relative w-full text-left transition-all duration-200 active:scale-[0.99] ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
        <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
            <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: color }} />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: color }} />
            <div className="flex items-center gap-3">
                <span className="flex-shrink-0" style={{ color }}><Icon size={16} /></span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-2">
                        {title}
                        {badge && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-app-tint text-muted">{badge}</span>}
                    </h3>
                    <p className="text-xs text-muted leading-snug truncate">{tagline}</p>
                </div>
                {!disabled && <ArrowRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />}
            </div>
        </div>
    </button>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <div className="max-w-[460px] mx-auto w-full mb-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-2">{title}</p>
        {children}
    </div>
);

// Fisher–Yates shuffle (used for both tiles and… nothing else here).
function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
