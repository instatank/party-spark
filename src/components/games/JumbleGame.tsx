import React, { useState, useEffect, useRef } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Shuffle, Delete, Plus, ArrowRight, User, Users, Check, X, Timer, Pencil } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
    loadJumblePack, pickSet, buildAnswerIndex, validateWord, summarizeMisses,
    scoreForWord, setKey, TILE_COUNT,
    type JumbleSet, type JumbleDifficulty, type ValidationStatus,
} from '../../services/jumbleEngine';

interface Props { onExit: () => void; }

type GameMode = 'solo' | 'multi';
type GameState = 'MODE_SELECT' | 'DIFFICULTY_SELECT' | 'SETUP' | 'READY' | 'PASS_TO_NEXT' | 'TIMER_ACTIVE' | 'END';

interface FoundWord { word: string; points: number; pangram: boolean }
interface PlayerResult { name: string; words: string[] }

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 8;

const ACCENT = '#14B8A6';        // teal — Jumble's brand color
const CENTER = '#F59E0B';        // amber — the hard-mode center tile

const TIMER_PRESETS = [30, 60, 90, 120];
const DEFAULT_DURATION = 60;
const TIMER_KEY = 'jumble_timer';
const bestKey = (d: JumbleDifficulty) => `jumble_best_${d}`;

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

// --- tiny Web Audio kit (synth, no assets; respects the iOS mute switch) ----
let audioCtx: AudioContext | null = null;
const getCtx = (): AudioContext | null => {
    try {
        if (!audioCtx) {
            const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!C) return null;
            audioCtx = new C();
        }
        return audioCtx;
    } catch { return null; }
};
const unlockAudio = () => { const c = getCtx(); if (c && c.state === 'suspended') void c.resume(); };
const beep = (freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) => {
    const ctx = getCtx(); if (!ctx) return;
    const run = () => {
        const t = ctx.currentTime + 0.02;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t); osc.stop(t + dur + 0.03);
    };
    if (ctx.state === 'suspended') ctx.resume().then(run).catch(() => {}); else run();
};
const dingValid = () => beep(880, 0.12, 'sine', 0.16);
const dingPangram = () => { beep(880, 0.18); setTimeout(() => beep(1320, 0.25), 120); };
const buzzEnd = () => { beep(180, 0.5, 'sawtooth', 0.2); };
const tick = () => beep(700, 0.05, 'square', 0.1);

export const JumbleGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('MODE_SELECT');
    const [mode, setMode] = useState<GameMode>('solo');
    const [difficulty, setDifficulty] = useState<JumbleDifficulty>('easy');
    const [duration, setDuration] = useState<number>(() => {
        const saved = Number(localStorage.getItem(TIMER_KEY));
        return TIMER_PRESETS.includes(saved) || (saved >= 15 && saved <= 300) ? saved : DEFAULT_DURATION;
    });

    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(false);
    const [set, setSet] = useState<JumbleSet | null>(null);
    const [tiles, setTiles] = useState<string[]>([]);     // display order (shuffled)
    const [input, setInput] = useState('');
    const [found, setFound] = useState<FoundWord[]>([]);
    const [score, setScore] = useState(0);
    const [feedback, setFeedback] = useState<{ kind: 'ok' | 'bad' | 'dup'; text: string } | null>(null);
    const [pangramFlash, setPangramFlash] = useState(false);
    const [remainingMs, setRemainingMs] = useState(duration * 1000);
    const [best, setBest] = useState(0);

    // Pass-and-Play state
    const [players, setPlayers] = useState<string[]>(['', '']);
    const [playerIndex, setPlayerIndex] = useState(0);
    const [results, setResults] = useState<PlayerResult[]>([]);

    const answerIndex = useRef<Set<string>>(new Set());
    const foundSet = useRef<Set<string>>(new Set());
    const seenSets = useRef<Set<string>>(new Set());      // session dedupe
    const fbTimer = useRef<number | null>(null);
    const lastTickSec = useRef(99);

    const totalSeconds = duration;

    // ---- load the sets pack lazily on first entry ----
    useEffect(() => {
        let alive = true;
        setLoading(true);
        loadJumblePack()
            .then(() => { if (alive) setLoading(false); })
            .catch(() => { if (alive) { setLoading(false); setLoadError(true); } });
        return () => { alive = false; };
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
            if (sec <= 3 && sec >= 1 && sec !== lastTickSec.current) { lastTickSec.current = sec; tick(); }
            if (left <= 0) { buzzEnd(); endRound(); return; }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, playerIndex]);

    // ---- flow ----
    const trimmedPlayers = players.map(p => p.trim()).filter(Boolean);

    // Pick one fresh letter set, build its answer index, lay out the tiles.
    const prepareSet = async (): Promise<void> => {
        const pack = await loadJumblePack();
        const chosen = pickSet(pack, difficulty, seenSets.current);
        seenSets.current.add(setKey(chosen));
        answerIndex.current = buildAnswerIndex(chosen);
        setSet(chosen);
        setTiles(shuffle([...chosen.letters]));
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

    const playAgain = () => { if (mode === 'multi') beginMultiGame(); else startSolo(); };

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
        // solo — read the live score via the functional updater (avoids the
        // stale closure the RAF callback would otherwise capture).
        setGameState('END');
        setScore(s => {
            const prevBest = Number(localStorage.getItem(bestKey(difficulty))) || 0;
            if (s > prevBest) { localStorage.setItem(bestKey(difficulty), String(s)); setBest(s); }
            else setBest(prevBest);
            return s;
        });
    };

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
                dingPangram();
                setPangramFlash(true);
                setTimeout(() => setPangramFlash(false), 1500);
                flashFeedback('ok', `PANGRAM! +${res.points}`);
            } else {
                dingValid();
                flashFeedback('ok', `+${res.points}  ${res.word}`);
            }
        } else if (res.status === 'already_found') {
            flashFeedback('dup', REJECT_MSG.already_found);
        } else {
            flashFeedback('bad', REJECT_MSG[res.status]);
        }
        setInput('');
    };

    const tapTile = (i: number) => setInput(v => v + tiles[i]);
    const onShuffle = () => setTiles(t => shuffle([...t]));
    const onClear = () => setInput('');

    const onPickTimer = (secs: number) => { setDuration(secs); localStorage.setItem(TIMER_KEY, String(secs)); };

    const sec = Math.max(0, Math.ceil(remainingMs / 1000));
    const low = sec <= 10;

    // =======================================================================
    // RENDER
    // =======================================================================

    // ---- MODE_SELECT ----
    if (gameState === 'MODE_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Jumble" onBack={onExit} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🔠</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">How many words can you <em>find</em>?</h2>
                    <p className="text-muted text-sm">7 letters. Beat the clock.</p>
                </div>
                {loadError && (
                    <p className="text-center text-xs text-red-500 mb-2">Couldn't load puzzles. Check your connection and reopen.</p>
                )}
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
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
                    <TimerSetting duration={duration} onPick={onPickTimer} />
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

    // ---- READY ----
    if (gameState === 'READY') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Ready?" onBack={() => setGameState('DIFFICULTY_SELECT')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5 animate-slide-up">
                    <p className="text-5xl">🔠</p>
                    <h2 className="text-2xl font-serif font-bold text-ink">Find as many words as you can</h2>
                    <p className="text-muted text-sm max-w-[300px]">
                        {difficulty === 'hard'
                            ? <>Every word must use the <span className="font-bold" style={{ color: CENTER }}>center letter</span>. </>
                            : null}
                        Words are 4+ letters. Longer words score more — a 7-letter <span className="font-bold text-ink">pangram</span> is the jackpot.
                    </p>
                    <p className="text-xs text-muted">{duration}s · {difficulty === 'easy' ? 'Easy' : 'Hard'}</p>
                    <Button onClick={startSolo} fullWidth className="h-14 text-lg max-w-[300px]">Start</Button>
                </div>
            </div>
        );
    }

    // ---- END (multiplayer leaderboard — unique-word scoring) ----
    if (gameState === 'END' && mode === 'multi') {
        // A word scores for a player only if no one else found it (Boggle rule).
        const counts = new Map<string, number>();
        results.forEach(r => r.words.forEach(w => counts.set(w, (counts.get(w) || 0) + 1)));
        const ranked = results
            .map(r => {
                const unique = r.words.filter(w => counts.get(w) === 1);
                return {
                    name: r.name,
                    score: unique.reduce((s, w) => s + scoreForWord(w), 0),
                    uniqueCount: unique.length,
                    totalWords: r.words.length,
                };
            })
            .sort((a, b) => b.score - a.score || b.uniqueCount - a.uniqueCount);
        const topScore = ranked[0]?.score ?? 0;
        const cancelled = [...counts.values()].filter(n => n >= 2).length;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Results" onBack={() => setGameState('MODE_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-3 pb-6">
                    <div className="text-center mt-1 mb-4">
                        <p className="text-5xl mb-1">🏆</p>
                        <h2 className="text-2xl font-serif font-bold text-ink">{ranked[0]?.name} wins!</h2>
                        <p className="text-xs text-muted mt-1">Only words no one else found count. {cancelled} shared word{cancelled === 1 ? '' : 's'} cancelled.</p>
                    </div>
                    <div className="max-w-[360px] mx-auto w-full space-y-2">
                        {ranked.map((r, i) => {
                            const win = r.score === topScore && topScore > 0;
                            return (
                                <div key={r.name + i}
                                    className={`flex items-center justify-between px-4 py-3 rounded-xl border ${win ? 'bg-teal-500/10 border-teal-500/50' : 'bg-surface border-divider'}`}>
                                    <div className="flex items-center gap-3 min-w-0">
                                        <span className={`w-6 text-center font-black ${win ? 'text-teal-500' : 'text-muted'}`}>{i + 1}</span>
                                        <div className="min-w-0">
                                            <p className="font-bold text-ink truncate">{r.name}</p>
                                            <p className="text-[11px] text-muted">{r.uniqueCount} unique · {r.totalWords} found</p>
                                        </div>
                                    </div>
                                    <span className="text-2xl font-black tabular-nums" style={{ color: ACCENT }}>{r.score}</span>
                                </div>
                            );
                        })}
                    </div>
                    {set && (
                        <p className="text-center text-xs text-muted mt-4">The letters were <span className="font-bold text-ink tracking-widest">{[...set.letters].sort().join('')}</span>{set.pangrams[0] && <> · pangram: <span className="font-bold" style={{ color: CENTER }}>{set.pangrams[0]}</span></>}</p>
                    )}
                    <div className="max-w-[340px] mx-auto w-full mt-6 flex flex-col gap-3">
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
    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Jumble" onBack={onExit} onHome={onExit} confirmOnExit />

            {/* timer + score row (centered timer, score right — matches Charades/Taboo) */}
            <div className="grid grid-cols-3 items-center mb-3 px-1">
                <div />
                <div className="flex justify-center">
                    <div className="flex items-center gap-1.5 bg-surface border border-divider px-4 py-1.5 rounded-full shadow-lg">
                        <span className={`font-mono font-bold text-xl tabular-nums ${low ? 'text-red-500 animate-pulse' : 'text-ink'}`}>{sec}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted">sec</span>
                    </div>
                </div>
                <div className="flex justify-end items-baseline gap-1 pr-1">
                    <span className="text-2xl font-black tabular-nums" style={{ color: ACCENT }}>{score}</span>
                </div>
            </div>

            {mode === 'multi' && (
                <p className="text-center text-xs font-bold text-teal-500 -mt-1 mb-2 truncate px-4">
                    {(players[playerIndex] || '').trim() || `Player ${playerIndex + 1}`} · {playerIndex + 1}/{players.length}
                </p>
            )}

            {/* tiles */}
            <div className={`flex justify-center gap-2 px-2 mb-3 ${pangramFlash ? 'animate-pulse' : ''}`}>
                {tiles.map((t, i) => {
                    const isCenter = set?.center === t;
                    return (
                        <button key={`${t}-${i}`} onClick={() => tapTile(i)}
                            className="w-10 h-12 sm:w-11 sm:h-13 rounded-lg font-black text-xl flex items-center justify-center border-2 transition-transform active:scale-90 shadow-sm"
                            style={isCenter
                                ? { background: CENTER, color: '#1a1a1a', borderColor: CENTER }
                                : { background: 'var(--color-surface-alt)', color: 'var(--color-ink)', borderColor: 'var(--color-divider)' }}>
                            {t}
                        </button>
                    );
                })}
            </div>

            {/* feedback line */}
            <div className="h-5 text-center mb-1">
                {feedback && (
                    <span className={`text-sm font-bold ${feedback.kind === 'ok' ? 'text-emerald-500' : feedback.kind === 'dup' ? 'text-amber-500' : 'text-red-500'}`}>
                        {feedback.kind === 'ok' ? <Check size={14} className="inline mr-1" /> : <X size={14} className="inline mr-1" />}
                        {feedback.text}
                    </span>
                )}
            </div>

            {/* input + controls */}
            <div className="px-3">
                <div className="flex items-center gap-2 max-w-[420px] mx-auto">
                    <input
                        value={input}
                        onChange={e => setInput(e.target.value.replace(/[^a-zA-Z]/g, '').toUpperCase())}
                        onKeyDown={e => { if (e.key === 'Enter') submit(); }}
                        placeholder="Type or tap tiles"
                        autoCapitalize="characters" autoCorrect="off" autoComplete="off"
                        className="flex-1 bg-surface-alt border-2 border-divider focus:border-teal-500 rounded-xl px-4 py-3 text-ink font-bold text-lg tracking-[0.15em] uppercase placeholder:text-muted placeholder:tracking-normal placeholder:font-medium placeholder:text-sm outline-none transition-colors"
                    />
                    <button onClick={submit} aria-label="Add word"
                        className="h-[52px] w-[52px] rounded-xl flex items-center justify-center text-white shadow-lg active:scale-95 transition-transform"
                        style={{ background: ACCENT }}>
                        <Plus size={26} />
                    </button>
                </div>
                <div className="flex items-center justify-center gap-3 mt-3 max-w-[420px] mx-auto">
                    <button onClick={onShuffle} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink-soft hover:text-ink text-sm font-bold transition-colors">
                        <Shuffle size={16} /> Shuffle
                    </button>
                    <button onClick={onClear} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink-soft hover:text-ink text-sm font-bold transition-colors">
                        <Delete size={16} /> Clear
                    </button>
                </div>
            </div>

            {/* found words (newest on top) — no "X of Y" counter shown */}
            <div className="flex-1 overflow-y-auto px-3 mt-4">
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

// Editable round-timer chip — shows the current length with a pencil; tapping
// opens a small bottom-sheet of presets + a custom field. No dedicated step.
// Self-contained (owns its open/custom state) so it can be lifted into other
// games (Charades / Taboo) later. Persistence is the parent's job via onPick.
const TimerSetting: React.FC<{ duration: number; onPick: (secs: number) => void }> = ({ duration, onPick }) => {
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState('');
    const choose = (s: number) => { onPick(s); setCustom(''); setOpen(false); };
    const applyCustom = () => { const n = Math.round(Number(custom)); if (n >= 15 && n <= 300) choose(n); };
    return (
        <>
            <button onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt border border-divider hover:border-ink-soft/40 text-ink text-sm font-bold transition-colors">
                <Timer size={14} className="text-teal-500" />
                {duration}s round
                <Pencil size={12} className="text-muted" />
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-fade-in" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-md bg-surface border-t border-divider rounded-t-2xl p-5 pb-7 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-bold text-ink">Round length</p>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink"><X size={18} /></button>
                        </div>
                        <div className="grid grid-cols-4 gap-2">
                            {TIMER_PRESETS.map(s => {
                                const active = duration === s;
                                return (
                                    <button key={s} onClick={() => choose(s)}
                                        className="rounded-xl py-3 font-black text-lg tabular-nums border-2 transition-colors"
                                        style={active ? { background: ACCENT, color: '#fff', borderColor: ACCENT } : { borderColor: 'var(--color-divider)', color: 'var(--color-ink)' }}>
                                        {s}<span className="text-xs font-bold">s</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            <input type="number" inputMode="numeric" min={15} max={300} placeholder="Custom (15–300s)"
                                value={custom} onChange={e => setCustom(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') applyCustom(); }}
                                className="flex-1 bg-surface-alt border border-divider focus:border-teal-500 rounded-xl p-3 text-ink placeholder:text-muted outline-none transition-colors text-sm" />
                            <button onClick={applyCustom} className="px-4 py-3 rounded-xl bg-surface-alt border border-divider text-ink-soft hover:text-ink text-sm font-bold">Set</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

// Fisher–Yates shuffle (used for both tiles and… nothing else here).
function shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
