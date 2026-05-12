import React, { useState, useEffect, useRef } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Timer, ChevronRight, Plus, X, Zap, Trophy, ArrowRight, Minus } from 'lucide-react';
import fiveAliveData from '../../data/five_alive.json';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';

interface Props {
    onExit: () => void;
}

type Difficulty = 'easy' | 'hard';
type Mode = 'named' | 'just_play';
type GameState =
    | 'CATEGORY_SELECT'  // pick Easy / Hard
    | 'SETUP'            // player names OR Just Play
    | 'PASS'             // "Pass to <player>" gate (named mode only)
    | 'PLAYING'          // category shown + timer running (auto-starts on entry — no Start button)
    | 'TALLY'            // judge enters score (named) or "Next round" (just play)
    | 'END';             // leaderboard (named) or "Play again" (just play)

// Five rounds, descending: name N in N seconds. Perfect round = +1 bonus.
// Max per round = count + 1 (bonus). Max game = 6+5+4+3+2 = 20.
const ROUNDS: { time: number; count: number }[] = [
    { time: 5, count: 5 },
    { time: 4, count: 4 },
    { time: 3, count: 3 },
    { time: 2, count: 2 },
    { time: 1, count: 1 },
];
const TOTAL_ROUNDS = ROUNDS.length;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const CATEGORIES_PER_GAME = TOTAL_ROUNDS;

// Tile metadata for the CATEGORY_SELECT slim-row screen. Colors are inline
// hex (not Tailwind classes) so they can drive the left-accent bar + icon.
const DIFFICULTY_TILES: { id: Difficulty; title: string; tagline: string; color: string }[] = [
    { id: 'easy', title: 'Easy',  tagline: 'Broad categories — everyone can play.', color: '#10B981' },
    { id: 'hard', title: 'Hard',  tagline: 'Specialist territory. Brains required.', color: '#E11D48' },
];

// Static color map for the live timer — green → amber → red as seconds drain.
// (No template-literal Tailwind classes; map is all static literals.)
const TIMER_TIERS: Record<'green' | 'amber' | 'red', { text: string; ring: string }> = {
    green: { text: 'text-emerald-400', ring: '#10B981' },
    amber: { text: 'text-amber-400',   ring: '#F59E0B' },
    red:   { text: 'text-red-500',     ring: '#EF4444' },
};
const tierForSecond = (sec: number): 'green' | 'amber' | 'red' => (sec >= 3 ? 'green' : sec === 2 ? 'amber' : 'red');

// ---------------------------------------------------------------------------
// Audio — synthesized via Web Audio API. No bundled assets, sub-millisecond
// latency, and dodges the royalty-free-buzzer hunt entirely. The context is
// created lazily and resumed on the first user gesture (mobile autoplay
// unlock), which happens when the player taps a difficulty tile or "Start".
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
// Call on a user gesture to prime the context before the first round.
function unlockAudio() { getAudioCtx(); }

function playBuzzer() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.85;
    // Two slightly detuned square oscillators for a harsh game-show buzz.
    [110, 165].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.32, now + 0.01);
        gain.gain.setValueAtTime(0.32, now + dur - 0.06);
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
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

interface PlayerScore { name: string; total: number; breakdown: number[] }

export const FiveAliveGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('CATEGORY_SELECT');
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');
    const [mode, setMode] = useState<Mode>('named');
    const [players, setPlayers] = useState<string[]>(['', '']);

    // Per-turn / per-round tracking
    const [playerIndex, setPlayerIndex] = useState(0);
    const [roundIndex, setRoundIndex] = useState(0);
    const [turnCategories, setTurnCategories] = useState<string[]>([]);
    const [scores, setScores] = useState<PlayerScore[]>([]);
    const [tally, setTally] = useState(0);          // judge's entered count for the current round
    const [expandedPlayer, setExpandedPlayer] = useState<number | null>(null); // END-screen breakdown toggle

    // Live timer
    const [remainingMs, setRemainingMs] = useState(ROUNDS[0].time * 1000);
    const firedRef = useRef(false);                 // guards against double buzzer
    const lastTickRef = useRef<number>(99);         // last second that played a tick

    const round = ROUNDS[roundIndex];
    const trimmedPlayers = players.map(p => p.trim()).filter(Boolean);
    const canStartNamed = trimmedPlayers.length >= MIN_PLAYERS;

    // Judge of player i = the next player in turn order, wrapping around.
    const judgeName = mode === 'named' && trimmedPlayers.length > 0
        ? trimmedPlayers[(playerIndex + 1) % trimmedPlayers.length]
        : '';
    const currentPlayerName = mode === 'named' ? (trimmedPlayers[playerIndex] || '') : '';

    // -----------------------------------------------------------------------
    // Timer loop — RAF-driven so the visual ring drains smoothly. Buzzer fires
    // the instant the deadline passes (well under the 50ms target). Tick plays
    // once at each of 3 / 2 / 1 seconds remaining (so a 1-second round still
    // gets a single tick at the start — extra urgency).
    // -----------------------------------------------------------------------
    useEffect(() => {
        if (gameState !== 'PLAYING') return;
        const totalMs = round.time * 1000;
        const deadline = performance.now() + totalMs;
        firedRef.current = false;
        lastTickRef.current = 99;
        setRemainingMs(totalMs);

        let raf = 0;
        const frame = () => {
            const left = Math.max(0, deadline - performance.now());
            setRemainingMs(left);
            const sec = Math.ceil(left / 1000);
            if (sec >= 1 && sec <= 3 && sec !== lastTickRef.current) {
                lastTickRef.current = sec;
                playTick();
            }
            if (left <= 0) {
                if (!firedRef.current) {
                    firedRef.current = true;
                    playBuzzer();
                    setTally(0);
                    setGameState('TALLY');
                }
                return;
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameState, roundIndex]);

    // -----------------------------------------------------------------------
    // Flow handlers
    // -----------------------------------------------------------------------

    // Draw 5 unique categories for a fresh turn. Prefer ones not yet used this
    // session (per-difficulty bucket); fall back to the full shuffled pool if
    // the bucket is exhausted. Marks all 5 as used immediately.
    const drawTurnCategories = (diff: Difficulty): string[] => {
        const pool = (fiveAliveData as Record<Difficulty, string[]>)[diff] || [];
        const available = sessionService.filterContent(GameType.FIVE_ALIVE, diff, pool, (c) => c);
        const source = available.length >= CATEGORIES_PER_GAME ? available : pool;
        const picked = shuffle(source).slice(0, CATEGORIES_PER_GAME);
        picked.forEach(c => sessionService.markAsUsed(GameType.FIVE_ALIVE, diff, c));
        return picked;
    };

    // CATEGORY_SELECT tile tap → unlock audio, stash difficulty, go to SETUP.
    const handlePickDifficulty = (diff: Difficulty) => {
        unlockAudio();
        setDifficulty(diff);
        setGameState('SETUP');
    };

    // Start the first turn. Takes the mode explicitly so it doesn't have to
    // wait for the setMode state flush. just_play has no pass-the-phone gate,
    // so it drops straight into PLAYING (category + timer fire together).
    const beginFirstTurn = (m: Mode) => {
        setTurnCategories(drawTurnCategories(difficulty));
        setRoundIndex(0);
        setTally(0);
        setGameState(m === 'just_play' ? 'PLAYING' : 'PASS');
    };

    const handleStartNamed = () => {
        unlockAudio();
        setMode('named');
        setScores(trimmedPlayers.map(name => ({ name, total: 0, breakdown: [] })));
        setPlayerIndex(0);
        beginFirstTurn('named');
    };

    const handleJustPlay = () => {
        unlockAudio();
        setMode('just_play');
        setPlayers(['', '']);
        setScores([]);
        setPlayerIndex(0);
        beginFirstTurn('just_play');
    };

    // PASS → PLAYING: the category appears and the timer starts at the same
    // instant the next player taps "I'm Ready" — no separate Start step.
    const handleReady = () => { unlockAudio(); setGameState('PLAYING'); };

    // TALLY → next round (or next player, or END). The "Next Round" tap is
    // the reveal+start trigger for the next round.
    const handleNextRound = () => {
        // Record the round's points for named mode.
        if (mode === 'named') {
            const perfect = tally === round.count;
            const pts = tally + (perfect ? 1 : 0);
            setScores(prev => prev.map((s, i) =>
                i === playerIndex ? { ...s, total: s.total + pts, breakdown: [...s.breakdown, pts] } : s
            ));
        }

        if (roundIndex < TOTAL_ROUNDS - 1) {
            unlockAudio();
            setRoundIndex(r => r + 1);
            setTally(0);
            setGameState('PLAYING');
            return;
        }

        // Turn over.
        if (mode === 'named' && playerIndex < trimmedPlayers.length - 1) {
            const next = playerIndex + 1;
            setPlayerIndex(next);
            setTurnCategories(drawTurnCategories(difficulty));
            setRoundIndex(0);
            setTally(0);
            setGameState('PASS');
            return;
        }
        setGameState('END');
    };

    const handlePlayAgain = () => {
        // Same difficulty + same player roster; reset scores/turn state.
        if (mode === 'named') {
            setScores(trimmedPlayers.map(name => ({ name, total: 0, breakdown: [] })));
        }
        setPlayerIndex(0);
        setExpandedPlayer(null);
        setTurnCategories(drawTurnCategories(difficulty));
        setRoundIndex(0);
        setTally(0);
        setGameState(mode === 'just_play' ? 'PLAYING' : 'PASS');
    };

    // -----------------------------------------------------------------------
    // Player-setup field handlers (named mode)
    // -----------------------------------------------------------------------
    const addPlayer = () => { if (players.length < MAX_PLAYERS) setPlayers([...players, '']); };
    const removePlayer = (i: number) => { if (players.length > MIN_PLAYERS) setPlayers(players.filter((_, idx) => idx !== i)); };
    const setPlayerName = (i: number, v: string) => { const n = [...players]; n[i] = v; setPlayers(n); };

    // =======================================================================
    // RENDER
    // =======================================================================

    // ---- CATEGORY_SELECT ----
    if (gameState === 'CATEGORY_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="5 Alive" onBack={onExit} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">⏱️</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">Can you beat the <em>buzzer</em>?</h2>
                    <p className="text-muted text-sm">5 in 5 seconds. Then 4 in 4. Then 3 in 3…</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {DIFFICULTY_TILES.map(t => (
                            <button
                                key={t.id}
                                onClick={() => handlePickDifficulty(t.id)}
                                className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                            >
                                <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                    <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: t.color }} />
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: t.color }} />
                                    <div className="flex items-center gap-3">
                                        <span className="flex-shrink-0" style={{ color: t.color }}><Timer size={16} /></span>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-ink leading-tight">{t.title}</h3>
                                            <p className="text-xs text-muted leading-snug truncate">{t.tagline}</p>
                                        </div>
                                        <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ---- SETUP ----
    if (gameState === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Who's Playing?" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <span className="text-xs font-bold uppercase tracking-widest text-emerald-500">
                            {difficulty === 'easy' ? 'Easy' : 'Hard'} mode
                        </span>
                        <span className="text-muted">•</span>
                        <span className="text-xs font-medium text-muted">5 rounds · ~30 sec each</span>
                    </div>

                    <div className="space-y-3 flex-1">
                        {players.map((name, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-sm shrink-0">
                                    {i + 1}
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={e => setPlayerName(i, e.target.value)}
                                    placeholder={`Player ${i + 1}`}
                                    maxLength={15}
                                    className="flex-1 bg-surface-alt border border-divider focus:border-emerald-500 rounded-xl p-3 text-ink font-medium placeholder:text-muted outline-none transition-colors"
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
                        onClick={handleStartNamed}
                        className={`w-full py-4 text-lg mt-6 ${!canStartNamed ? 'opacity-40' : ''}`}
                        disabled={!canStartNamed}
                    >
                        Start <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                    <button
                        onClick={handleJustPlay}
                        className="w-full mt-3 py-4 rounded-xl font-bold text-base text-emerald-600 bg-transparent border-2 border-emerald-500/60 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors flex items-center justify-center gap-2"
                    >
                        <Zap size={18} /> Just Play — Skip the Setup
                    </button>
                </div>
            </div>
        );
    }

    // ---- PASS (named mode) ----
    if (gameState === 'PASS') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Pass the Phone" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-6 animate-slide-up">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Hand the device to</p>
                    <h2 className="text-5xl font-black text-ink">{currentPlayerName || `Player ${playerIndex + 1}`}</h2>
                    <p className="text-muted text-sm max-w-[280px]">
                        {judgeName ? <><span className="font-bold text-ink">{judgeName}</span> will judge this turn.</> : 'Get ready.'}
                        <br />Don't peek until they tap Ready.
                    </p>
                    <Button onClick={handleReady} fullWidth className="h-14 text-lg">
                        I'm {currentPlayerName ? currentPlayerName : 'Ready'} — Let's Go
                    </Button>
                </div>
            </div>
        );
    }

    // ---- PLAYING — category + live timer (no Start button: the timer starts
    //      the instant this screen mounts, simultaneous with the reveal) ----
    if (gameState === 'PLAYING') {
        const totalMs = round.time * 1000;
        const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
        const displaySec = Math.max(1, Math.ceil(remainingMs / 1000));
        const tier = TIMER_TIERS[tierForSecond(displaySec)];
        const R = 125, C = 2 * Math.PI * R;
        const cat = turnCategories[roundIndex] || '…';
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title={`Round ${roundIndex + 1} of ${TOTAL_ROUNDS}`} onBack={() => setGameState(mode === 'just_play' ? 'SETUP' : 'PASS')} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 animate-slide-up">
                    <h2 className="font-serif font-bold text-[30px] leading-[1.05] tracking-[-0.015em] text-ink text-center break-words mb-1.5">
                        {cat}
                    </h2>
                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted mb-5">
                        Name {round.count}
                    </p>
                    <div className="relative w-[280px] h-[280px] flex items-center justify-center">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 280 280">
                            <circle cx="140" cy="140" r={R} fill="none" stroke="var(--c-border)" strokeWidth="14" />
                            <circle
                                cx="140" cy="140" r={R} fill="none" strokeWidth="14" strokeLinecap="round"
                                style={{ stroke: tier.ring, strokeDasharray: C, strokeDashoffset: C * (1 - progress), transition: 'stroke-dashoffset 80ms linear' }}
                            />
                        </svg>
                        <span className={`font-black tabular-nums leading-none ${tier.text}`} style={{ fontSize: '110px' }}>
                            {displaySec}
                        </span>
                    </div>
                    <p className="text-muted text-sm mt-5">Say them out loud — go!</p>
                </div>
            </div>
        );
    }

    // ---- TALLY ----
    if (gameState === 'TALLY') {
        const cat = turnCategories[roundIndex] || '';
        const isJustPlay = mode === 'just_play';
        const isPerfect = !isJustPlay && tally === round.count;
        const last = roundIndex === TOTAL_ROUNDS - 1;
        const isLastTurn = mode === 'named' && playerIndex >= trimmedPlayers.length - 1;
        const ctaLabel = !last
            ? 'Next Round'
            : (isJustPlay || isLastTurn)
                ? 'See Results'
                : `Pass to ${trimmedPlayers[(playerIndex + 1) % trimmedPlayers.length] || 'next player'}`;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title={`Round ${roundIndex + 1} of ${TOTAL_ROUNDS}`} onBack={onExit} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-5 animate-slide-up">
                    <div className="text-5xl">⏰</div>
                    <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Buzzer!</p>
                        <h2 className="font-serif font-bold text-2xl text-ink">{cat}</h2>
                    </div>

                    {isJustPlay ? (
                        <p className="text-muted text-sm max-w-[280px]">Did they get {round.count}? Decide among yourselves — no scores in Just Play.</p>
                    ) : (
                        <>
                            <p className="text-sm text-ink-soft">
                                How many did <span className="font-bold text-ink">{currentPlayerName || `Player ${playerIndex + 1}`}</span> get right?
                                {judgeName && <><br /><span className="text-muted text-xs">Judge: {judgeName}</span></>}
                            </p>
                            <div className="flex items-center gap-5">
                                <button
                                    onClick={() => setTally(t => Math.max(0, t - 1))}
                                    disabled={tally <= 0}
                                    aria-label="Decrease"
                                    className="w-12 h-12 rounded-full bg-surface-alt border border-divider text-ink disabled:opacity-30 flex items-center justify-center hover:bg-app-tint transition-colors"
                                >
                                    <Minus size={22} />
                                </button>
                                <span className="text-6xl font-black tabular-nums text-ink w-20">{tally}</span>
                                <button
                                    onClick={() => setTally(t => Math.min(round.count, t + 1))}
                                    disabled={tally >= round.count}
                                    aria-label="Increase"
                                    className="w-12 h-12 rounded-full bg-surface-alt border border-divider text-ink disabled:opacity-30 flex items-center justify-center hover:bg-app-tint transition-colors"
                                >
                                    <Plus size={22} />
                                </button>
                            </div>
                            <p className="text-xs text-muted">out of {round.count}</p>
                            {isPerfect && (
                                <div className="px-4 py-2 rounded-full bg-emerald-500/15 text-emerald-500 font-black tracking-wide text-sm animate-bounce">
                                    🎉 +1 PERFECT-ROUND BONUS!
                                </div>
                            )}
                        </>
                    )}

                    <Button onClick={handleNextRound} fullWidth className="h-14 text-lg mt-2">
                        {ctaLabel} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---- END ----
    if (gameState === 'END') {
        if (mode === 'just_play') {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="Round Done" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                    <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-6 animate-slide-up">
                        <div className="text-6xl">🏁</div>
                        <h2 className="text-3xl font-serif font-bold text-ink">Five rounds, done.</h2>
                        <p className="text-muted text-sm max-w-[260px]">Pass the phone and run it back — or head home.</p>
                        <div className="flex flex-col gap-3 w-full">
                            <Button onClick={handlePlayAgain} fullWidth>Play Again</Button>
                            <Button onClick={onExit} variant="secondary" fullWidth>Back to Home</Button>
                        </div>
                    </div>
                </div>
            );
        }
        const ranked = [...scores].sort((a, b) => b.total - a.total);
        const top = ranked[0];
        const tiedTop = ranked.filter(r => r.total === top.total).length > 1;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Final Scores" onBack={() => setGameState('CATEGORY_SELECT')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto px-4 pb-8 animate-slide-up">
                    <div className="text-center mb-5">
                        <div className="text-5xl mb-2">🏆</div>
                        {tiedTop
                            ? <p className="text-muted">It's a tie at the top.</p>
                            : <p className="text-muted"><span className="font-bold text-ink">{top.name}</span> wins with {top.total}.</p>}
                    </div>
                    <div className="space-y-2 max-w-[360px] mx-auto">
                        {ranked.map((s, i) => {
                            const open = expandedPlayer === i;
                            return (
                                <div key={s.name + i} className={`rounded-xl border ${i === 0 ? 'bg-emerald-500/10 border-emerald-500/50' : 'bg-surface border-divider'}`}>
                                    <button
                                        onClick={() => setExpandedPlayer(open ? null : i)}
                                        className="w-full flex items-center justify-between px-4 py-3"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            {i === 0 && <Trophy size={16} className="text-emerald-500 flex-shrink-0" />}
                                            <span className="font-bold text-ink truncate">{s.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl font-black text-ink">{s.total}</span>
                                            <ChevronRight size={16} className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                                        </div>
                                    </button>
                                    {open && (
                                        <div className="px-4 pb-3 grid grid-cols-5 gap-1.5">
                                            {ROUNDS.map((_, ri) => (
                                                <div key={ri} className="text-center bg-surface-alt rounded-md py-1.5">
                                                    <div className="text-[9px] uppercase tracking-wider text-muted">R{ri + 1}</div>
                                                    <div className="text-sm font-bold text-ink">{s.breakdown[ri] ?? 0}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
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
