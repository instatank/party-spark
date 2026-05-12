import React, { useState, useEffect, useRef } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Link2, ChevronRight, Plus, X, Trophy, ArrowRight, Eye, Check } from 'lucide-react';
import linkedData from '../../data/linked.json';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';

interface Props {
    onExit: () => void;
}

type Difficulty = 'easy' | 'hard';
type Mode = 'just_play' | 'pass';
type Position = 'prefix' | 'suffix';
type GameState =
    | 'MODE_SELECT'        // Just Play / Pass and Play
    | 'DIFFICULTY_SELECT'  // Easy / Hard
    | 'SETUP'              // player names (pass mode only)
    | 'READY'              // "Pass to <player>" gate (pass mode only)
    | 'PLAY'               // the puzzle screen (both modes; 60s timer in pass mode)
    | 'ROUND_OVER'         // player's round score + "Pass to next" (pass mode only)
    | 'END';               // leaderboard (pass mode only)

interface Puzzle {
    clues: string[];
    answer: string;
    // Side the connector attaches to. The bundled data is all-suffix; the
    // field is optional and defaults to 'suffix'. Renderer supports both so a
    // 'prefix' puzzle ("over"/"under"/"in" + "take" → OVERtake) can be added
    // later without code changes.
    position?: Position;
}

const ROUND_SECONDS = 60;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
// A 60s round can chew through a lot of puzzles; insist on at least this many
// fresh-this-session ones before falling back to the full (possibly-repeated)
// pool, so the early rounds stay novel.
const MIN_FRESH_BUFFER = 10;
// How long the answer flashes after "Got it!" in pass mode before auto-advance.
const GOT_IT_FLASH_MS = 1200;

const ACCENT = '#6366F1'; // indigo-500 — the game's brand accent

// Slim-row tiles. Colors are inline hex (drive the left accent bar + icon).
const MODE_TILES: { id: Mode; title: string; tagline: string; color: string }[] = [
    { id: 'pass',      title: 'Pass and Play', tagline: '60 seconds each — most links wins.', color: '#10B981' },
    { id: 'just_play', title: 'Just Play',     tagline: 'No timer. Shout it out together.',   color: ACCENT },
];

const DIFFICULTY_TILES: { id: Difficulty; title: string; tagline: string; color: string }[] = [
    { id: 'easy', title: 'Easy', tagline: 'Everyday words — warm-up territory.', color: '#10B981' },
    { id: 'hard', title: 'Hard', tagline: 'Trickier connectors. Brains on.',     color: '#E11D48' },
];

// ---------------------------------------------------------------------------
// Audio — synthesized via Web Audio API (same approach as 5 Alive). No bundled
// assets, sub-millisecond latency. Context is created lazily and resumed on the
// first user gesture (tile tap / "I'm Ready").
// ---------------------------------------------------------------------------
let audioCtx: AudioContext | null = null;
function getAudioCtx(): AudioContext | null {
    try {
        if (!audioCtx) {
            const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;
            audioCtx = new Ctor();
        }
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        return audioCtx;
    } catch {
        return null;
    }
}
function unlockAudio() { getAudioCtx(); }

function playBuzzer() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.85;
    [110, 165].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
        gain.gain.setValueAtTime(0.3, now + dur - 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
    });
}

function playTick() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

function playDing() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = now + i * 0.07;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
    });
}

// ---------------------------------------------------------------------------
const POOL = linkedData as unknown as Record<Difficulty, Puzzle[]>;
const puzzleId = (p: Puzzle) => `${p.clues.join('+')}>${p.answer}`;
const posOf = (p: Puzzle): Position => p.position ?? 'suffix';

interface PlayerScore { name: string; score: number }

// Slim-row tile (mode picker / difficulty picker). Module-scoped so it keeps a
// stable component identity across the RAF-driven re-renders on the play screen.
const SlimTile: React.FC<{ title: string; tagline: string; color: string; onClick: () => void }> = ({ title, tagline, color, onClick }) => (
    <button
        onClick={onClick}
        className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
    >
        <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
            <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: color }} />
            <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: color }} />
            <div className="flex items-center gap-3">
                <span className="flex-shrink-0" style={{ color }}><Link2 size={16} /></span>
                <div className="flex-1 min-w-0">
                    <h3 className="text-base font-bold text-ink leading-tight">{title}</h3>
                    <p className="text-xs text-muted leading-snug truncate">{tagline}</p>
                </div>
                <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
            </div>
        </div>
    </button>
);

// One clue chip. Unrevealed: clue + a dim blank on the connector side (position
// is the only hint). Revealed: the full compound, connector uppercase + accent.
const ClueChip: React.FC<{ clue: string; answer: string; position: Position; revealed: boolean }> = ({ clue, answer, position, revealed }) => {
    const blank = <span className="text-indigo-400/50 font-bold tracking-[0.05em]">_ _ _</span>;
    const conn = <span className="font-extrabold uppercase tracking-[0.04em] text-indigo-500">{answer}</span>;
    const clueEl = <span className="font-bold text-ink">{clue}</span>;
    return (
        <div className="flex items-center justify-center gap-2 bg-surface-alt border border-divider rounded-xl py-3.5 px-4 text-xl">
            {revealed
                ? <span className="break-words">{position === 'prefix' ? <>{conn}{clueEl}</> : <>{clueEl}{conn}</>}</span>
                : <span className="flex items-center gap-2">{position === 'prefix' ? <>{blank}{clueEl}</> : <>{clueEl}{blank}</>}</span>}
        </div>
    );
};

export const LinkedGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('MODE_SELECT');
    const [mode, setMode] = useState<Mode>('pass');
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');
    const [players, setPlayers] = useState<string[]>(['', '']);

    // Pass-mode turn state
    const [playerIndex, setPlayerIndex] = useState(0);
    const [scores, setScores] = useState<PlayerScore[]>([]);
    const [turnId, setTurnId] = useState(0);          // bumps each fresh PLAY turn so the timer effect restarts
    const [roundGot, setRoundGot] = useState(0);      // links this player got this turn
    const [roundSkipped, setRoundSkipped] = useState(0);

    // Puzzle queue (shared by both modes)
    const [queue, setQueue] = useState<Puzzle[]>([]);
    const [qIndex, setQIndex] = useState(0);
    const [revealed, setRevealed] = useState(false);

    // Live timer (pass mode)
    const [remainingMs, setRemainingMs] = useState(ROUND_SECONDS * 1000);
    const firedRef = useRef(false);
    const lastTickRef = useRef(99);
    const flashRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearFlash = () => { if (flashRef.current) { clearTimeout(flashRef.current); flashRef.current = null; } };
    useEffect(() => () => clearFlash(), []);

    const trimmedPlayers = players.map(p => p.trim()).filter(Boolean);
    const canStart = trimmedPlayers.length >= MIN_PLAYERS;
    const currentName = mode === 'pass' ? (trimmedPlayers[playerIndex] || `Player ${playerIndex + 1}`) : '';
    const nextName = mode === 'pass' ? (trimmedPlayers[(playerIndex + 1) % trimmedPlayers.length] || 'next player') : '';
    const isLastPlayer = mode === 'pass' && playerIndex >= trimmedPlayers.length - 1;
    const puzzle: Puzzle | undefined = queue[qIndex];

    // -----------------------------------------------------------------------
    // Timer loop — RAF-driven for a smooth countdown. Only runs in pass mode
    // while PLAY is active. Ticks once per second over the last 5 seconds;
    // buzzer the instant the deadline passes → ROUND_OVER.
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (gameState !== 'PLAY' || mode !== 'pass') return;
        const totalMs = ROUND_SECONDS * 1000;
        const deadline = performance.now() + totalMs;
        firedRef.current = false;
        lastTickRef.current = 99;
        setRemainingMs(totalMs);

        let raf = 0;
        const frame = () => {
            const left = Math.max(0, deadline - performance.now());
            setRemainingMs(left);
            const sec = Math.ceil(left / 1000);
            if (sec >= 1 && sec <= 5 && sec !== lastTickRef.current) {
                lastTickRef.current = sec;
                playTick();
            }
            if (left <= 0) {
                if (!firedRef.current) {
                    firedRef.current = true;
                    clearFlash();
                    playBuzzer();
                    setGameState('ROUND_OVER');
                }
                return;
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, turnId]);

    // -----------------------------------------------------------------------
    // Queue helpers
    // -----------------------------------------------------------------------
    const buildQueue = (diff: Difficulty): Puzzle[] => {
        const pool = POOL[diff] || [];
        const fresh = sessionService.filterContent(GameType.LINKED, diff, pool, puzzleId);
        const source = fresh.length >= MIN_FRESH_BUFFER ? fresh : pool;
        return shuffle(source);
    };

    const startQueue = (diff: Difficulty) => {
        const q = buildQueue(diff);
        setQueue(q);
        setQIndex(0);
        setRevealed(false);
        if (q[0]) sessionService.markAsUsed(GameType.LINKED, diff, puzzleId(q[0]));
    };

    // Advance to the next puzzle, rebuilding the queue (from the full pool) if
    // we've run out — so a long round / endless Just Play never dead-ends.
    const advance = () => {
        clearFlash();
        setRevealed(false);
        const ni = qIndex + 1;
        if (ni < queue.length) {
            sessionService.markAsUsed(GameType.LINKED, difficulty, puzzleId(queue[ni]));
            setQIndex(ni);
        } else {
            const fresh = shuffle(POOL[difficulty] || []);
            setQueue(fresh);
            setQIndex(0);
            if (fresh[0]) sessionService.markAsUsed(GameType.LINKED, difficulty, puzzleId(fresh[0]));
        }
    };

    // -----------------------------------------------------------------------
    // Flow handlers
    // -----------------------------------------------------------------------
    const handlePickMode = (m: Mode) => { unlockAudio(); setMode(m); setGameState('DIFFICULTY_SELECT'); };

    const handlePickDifficulty = (diff: Difficulty) => {
        unlockAudio();
        setDifficulty(diff);
        if (mode === 'just_play') {
            startQueue(diff);
            setGameState('PLAY');
        } else {
            setGameState('SETUP');
        }
    };

    const handleStartPass = () => {
        unlockAudio();
        setScores(trimmedPlayers.map(name => ({ name, score: 0 })));
        setPlayerIndex(0);
        setGameState('READY');
    };

    // READY → PLAY: fresh queue + fresh 60s timer for this player.
    const handleReady = () => {
        unlockAudio();
        startQueue(difficulty);
        setRoundGot(0);
        setRoundSkipped(0);
        setTurnId(t => t + 1);
        setGameState('PLAY');
    };

    // Pass-mode actions during PLAY
    const handleGotIt = () => {
        if (revealed) return;
        playDing();
        setScores(prev => prev.map((s, i) => (i === playerIndex ? { ...s, score: s.score + 1 } : s)));
        setRoundGot(g => g + 1);
        setRevealed(true);
        clearFlash();
        flashRef.current = setTimeout(() => { flashRef.current = null; advance(); }, GOT_IT_FLASH_MS);
    };
    const handleSkip = () => { setRoundSkipped(s => s + 1); advance(); };

    // Just-play actions during PLAY
    const handleReveal = () => { setRevealed(true); };
    const handleNextJustPlay = () => { advance(); };

    // ROUND_OVER → next player (or END)
    const handleAfterRound = () => {
        if (!isLastPlayer) {
            setPlayerIndex(i => i + 1);
            setGameState('READY');
        } else {
            setGameState('END');
        }
    };

    const handlePlayAgain = () => {
        // Same mode + same difficulty + same roster; reset scores/turn state.
        setScores(trimmedPlayers.map(name => ({ name, score: 0 })));
        setPlayerIndex(0);
        setGameState('READY');
    };

    const backToModeSelect = () => { clearFlash(); setGameState('MODE_SELECT'); };

    // -----------------------------------------------------------------------
    // Player-setup field handlers
    // -----------------------------------------------------------------------
    const addPlayer = () => { if (players.length < MAX_PLAYERS) setPlayers([...players, '']); };
    const removePlayer = (i: number) => { if (players.length > MIN_PLAYERS) setPlayers(players.filter((_, idx) => idx !== i)); };
    const setPlayerName = (i: number, v: string) => { const n = [...players]; n[i] = v; setPlayers(n); };

    // =======================================================================
    // RENDER
    // =======================================================================

    // ---- MODE_SELECT ----
    if (gameState === 'MODE_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Linked" onBack={onExit} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🔗</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">What's the word that <em>links</em> all three?</h2>
                    <p className="text-muted text-sm">Three clues. One connector. Say it out loud.</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {MODE_TILES.map(t => (
                            <SlimTile key={t.id} title={t.title} tagline={t.tagline} color={t.color} onClick={() => handlePickMode(t.id)} />
                        ))}
                    </div>
                    <p className="text-center text-xs text-muted mt-6 max-w-[300px] mx-auto leading-relaxed">
                        e.g. <span className="text-ink font-semibold">water</span> · <span className="text-ink font-semibold">down</span> · <span className="text-ink font-semibold">rain</span> → <span className="text-indigo-400 font-bold uppercase">fall</span>
                    </p>
                </div>
            </div>
        );
    }

    // ---- DIFFICULTY_SELECT ----
    if (gameState === 'DIFFICULTY_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Pick a Level" onBack={backToModeSelect} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-muted text-sm">{mode === 'pass' ? 'Pass and Play · 60s per turn' : 'Just Play · no timer'}</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {DIFFICULTY_TILES.map(t => (
                            <SlimTile key={t.id} title={t.title} tagline={t.tagline} color={t.color} onClick={() => handlePickDifficulty(t.id)} />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ---- SETUP (pass mode) ----
    if (gameState === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Who's Playing?" onBack={() => setGameState('DIFFICULTY_SELECT')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-indigo-500">
                            {difficulty === 'easy' ? 'Easy' : 'Hard'} mode
                        </span>
                        <span className="text-muted">•</span>
                        <span className="text-xs font-medium text-muted">60 sec each · 2–10 players</span>
                    </div>

                    <div className="space-y-3 flex-1">
                        {players.map((name, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-500 flex items-center justify-center font-bold text-sm shrink-0">
                                    {i + 1}
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setPlayerName(i, e.target.value)}
                                    placeholder={`Player ${i + 1}`}
                                    maxLength={15}
                                    className="flex-1 bg-surface-alt border border-divider focus:border-indigo-500 rounded-xl p-3 text-ink font-medium placeholder:text-muted outline-none transition-colors"
                                />
                                {players.length > MIN_PLAYERS && (
                                    <button
                                        onClick={() => removePlayer(i)}
                                        aria-label={`Remove player ${i + 1}`}
                                        className="p-2 rounded-lg bg-surface-alt hover:bg-red-500/15 text-muted hover:text-red-500 transition-colors"
                                    >
                                        <X size={18} />
                                    </button>
                                )}
                            </div>
                        ))}
                        {players.length < MAX_PLAYERS && (
                            <button
                                onClick={addPlayer}
                                className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-dashed border-divider hover:border-ink-soft text-muted hover:text-ink transition-colors"
                            >
                                <Plus size={18} /> Add player
                            </button>
                        )}
                    </div>

                    <Button
                        onClick={handleStartPass}
                        className={`w-full py-4 text-lg mt-6 ${!canStart ? 'opacity-40' : ''}`}
                        disabled={!canStart}
                    >
                        Start <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---- READY (pass mode) ----
    if (gameState === 'READY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Pass the Phone" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-6 animate-slide-up">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Hand the device to</p>
                    <h2 className="text-5xl font-black text-ink break-words">{currentName}</h2>
                    <p className="text-muted text-sm max-w-[280px]">
                        60 seconds. Tap <span className="font-bold text-ink">Got it!</span> for every link you find.
                        <br />Don't peek until you tap Ready.
                    </p>
                    <Button onClick={handleReady} fullWidth className="h-14 text-lg">
                        I'm {currentName} — Start
                    </Button>
                </div>
            </div>
        );
    }

    // ---- PLAY (both modes) ----
    if (gameState === 'PLAY') {
        const isPass = mode === 'pass';
        const sec = Math.max(0, Math.ceil(remainingMs / 1000));
        const low = sec <= 10;
        const pos = puzzle ? posOf(puzzle) : 'suffix';
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader
                    title="Linked"
                    onBack={() => { clearFlash(); setGameState(isPass ? 'SETUP' : 'DIFFICULTY_SELECT'); }}
                    onHome={onExit}
                />
                <div className="flex-1 flex flex-col px-2 pb-4">
                    {/* Timer (pass) or mode pill (just play) */}
                    <div className="flex items-center justify-center mb-3">
                        {isPass ? (
                            <div className="flex items-baseline gap-2">
                                <span className={`font-black tabular-nums leading-none transition-colors ${low ? 'text-red-500' : 'text-ink'} ${low ? 'animate-pulse' : ''}`} style={{ fontSize: '44px' }}>
                                    {sec}
                                </span>
                                <span className="text-xs uppercase tracking-widest text-muted">sec</span>
                            </div>
                        ) : (
                            <span className="text-[11px] uppercase tracking-[0.18em] text-muted">{difficulty === 'easy' ? 'Easy' : 'Hard'} · group shout</span>
                        )}
                    </div>

                    {/* Puzzle */}
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 w-full max-w-[340px] mx-auto animate-slide-up">
                        {puzzle ? (
                            <>
                                <div key={`q-${turnId}-${qIndex}`} className="grid gap-2.5 w-full animate-slide-up">
                                    {puzzle.clues.map((c, i) => (
                                        <ClueChip key={i} clue={c} answer={puzzle.answer} position={pos} revealed={revealed} />
                                    ))}
                                </div>
                                {/* Connector slot */}
                                <div className="mt-2 flex flex-col items-center">
                                    {revealed ? (
                                        <div key={`rev-${turnId}-${qIndex}`} className="text-center animate-slide-up">
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted mb-1">The link is</p>
                                            <p className="font-serif font-black text-4xl uppercase tracking-wide text-indigo-500">{puzzle.answer}</p>
                                        </div>
                                    ) : (
                                        <div className="text-center">
                                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted mb-1">{pos === 'prefix' ? 'goes in front' : 'goes on the end'}</p>
                                            <p className="font-serif font-black text-4xl text-indigo-400/40">?</p>
                                        </div>
                                    )}
                                </div>
                            </>
                        ) : (
                            <p className="text-muted text-sm">Loading puzzles…</p>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="w-full max-w-[340px] mx-auto mt-3">
                        {isPass ? (
                            revealed ? (
                                <div className="h-14 flex items-center justify-center rounded-2xl bg-indigo-500/12 text-indigo-500 font-bold text-sm">
                                    <Check size={18} className="mr-2" /> Nice — that's +1
                                </div>
                            ) : (
                                <div className="grid grid-cols-[1fr_1.6fr] gap-2.5">
                                    <button
                                        onClick={handleSkip}
                                        className="h-14 rounded-2xl font-bold text-base text-ink-soft bg-surface-alt border border-divider hover:bg-app-tint transition-colors"
                                    >
                                        Skip
                                    </button>
                                    <Button onClick={handleGotIt} className="h-14 text-lg">
                                        <Check size={20} className="inline mr-1.5" /> Got it!
                                    </Button>
                                </div>
                            )
                        ) : (
                            revealed ? (
                                <Button onClick={handleNextJustPlay} fullWidth className="h-14 text-lg">
                                    Next <ArrowRight className="inline ml-2" size={20} />
                                </Button>
                            ) : (
                                <Button onClick={handleReveal} fullWidth className="h-14 text-lg">
                                    <Eye size={20} className="inline mr-2" /> Reveal
                                </Button>
                            )
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---- ROUND_OVER (pass mode) ----
    if (gameState === 'ROUND_OVER') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Time!" onBack={onExit} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-5 animate-slide-up">
                    <div className="text-5xl">⏰</div>
                    <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Round over</p>
                        <h2 className="font-serif font-bold text-2xl text-ink break-words">{currentName}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-6xl font-black tabular-nums text-indigo-500">{roundGot}</span>
                        <span className="text-lg text-muted">link{roundGot === 1 ? '' : 's'}</span>
                    </div>
                    {roundSkipped > 0 && <p className="text-xs text-muted">({roundSkipped} skipped)</p>}
                    <Button onClick={handleAfterRound} fullWidth className="h-14 text-lg mt-2">
                        {isLastPlayer ? 'See Results' : `Pass to ${nextName}`} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---- END (pass mode) ----
    if (gameState === 'END') {
        const ranked = [...scores].sort((a, b) => b.score - a.score);
        const top = ranked[0];
        const tiedTop = ranked.filter(r => r.score === top.score).length > 1;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Final Scores" onBack={backToModeSelect} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-4 pb-8 animate-slide-up">
                    <div className="text-center mb-5">
                        <div className="text-5xl mb-2">🏆</div>
                        {tiedTop
                            ? <p className="text-muted">It's a tie at the top.</p>
                            : <p className="text-muted"><span className="font-bold text-ink">{top.name}</span> wins with {top.score}.</p>}
                    </div>
                    <div className="space-y-2 max-w-[360px] mx-auto">
                        {ranked.map((s, i) => (
                            <div key={s.name + i} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${i === 0 ? 'bg-indigo-500/10 border-indigo-500/50' : 'bg-surface border-divider'}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    {i === 0 && <Trophy size={16} className="text-indigo-500 flex-shrink-0" />}
                                    <span className="font-bold text-ink truncate">{s.name}</span>
                                </div>
                                <span className="text-2xl font-black text-ink">{s.score}</span>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-3 w-full max-w-[360px] mx-auto mt-6">
                        <Button onClick={handlePlayAgain} fullWidth>Play Again</Button>
                        <Button onClick={onExit} variant="secondary" fullWidth>Back to Home</Button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
