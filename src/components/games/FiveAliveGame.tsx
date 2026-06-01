import React, { useState, useEffect, useRef } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Timer, ChevronRight, Plus, Zap, Trophy, ArrowRight, Minus, Flame } from 'lucide-react';
import TeamRosterRow from '../ui/TeamRosterRow';
import type { LucideIcon } from 'lucide-react';
import fiveAliveData from '../../data/five_alive.json';
import { sessionService, shuffle } from '../../services/SessionManager';
import { GameType } from '../../types';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';

interface Props {
    onExit: () => void;
}

type Difficulty = 'easy' | 'hard' | 'spicy';
type Mode = 'named' | 'just_play';
type GameState =
    | 'CATEGORY_SELECT'  // pick Easy / Hard
    | 'SETUP'            // player names OR Just Play
    | 'PASS'             // "Pass to <player>" gate (named mode only)
    | 'PLAYING'          // category shown + timer running (auto-starts on entry — no Start button)
    | 'TALLY'            // judge enters score (named) or "Next round" (just play)
    | 'TURN_END'         // per-player turn recap (both modes) — total + per-round breakdown
    | 'END';             // leaderboard (named) or "Play again" (just play)

// Five rounds, descending: name N in N+1 seconds (the extra second covers
// reading the clue). Perfect round = +1 bonus. Max per round = count + 1
// (bonus). Max game = 6+5+4+3+2 = 20.
const ROUNDS: { time: number; count: number }[] = [
    { time: 6, count: 5 },
    { time: 5, count: 4 },
    { time: 4, count: 3 },
    { time: 3, count: 2 },
    { time: 2, count: 1 },
];
const TOTAL_ROUNDS = ROUNDS.length;

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const CATEGORIES_PER_GAME = TOTAL_ROUNDS;

// Tile metadata for the CATEGORY_SELECT slim-row screen. Colors are inline
// hex (not Tailwind classes) so they can drive the left-accent bar + icon.
const DIFFICULTY_TILES: { id: Difficulty; title: string; tagline: string; color: string; Icon: LucideIcon; adult?: boolean }[] = [
    { id: 'easy',  title: 'Easy',  tagline: 'Broad categories — everyone can play.',       color: '#10B981', Icon: Timer },
    { id: 'hard',  title: 'Hard',  tagline: 'Specialist territory. Brains required.',      color: '#E11D48', Icon: Timer },
    { id: 'spicy', title: 'Spicy', tagline: 'After dark · dating, drinks, drama · 18+',    color: '#BE185D', Icon: Flame, adult: true },
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

// End-of-round signal — a bright bell "ding-ding" rather than a harsh buzzer.
// Each strike is a stack of sine partials (roughly modeled on a struck bell:
// fundamental + a few inharmonic overtones) with a fast attack and a long
// exponential ring-out.
function playBell() {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const strike = (t0: number, base: number) => {
        const partials: { ratio: number; gain: number; decay: number }[] = [
            { ratio: 1.0,  gain: 0.26, decay: 1.5 },
            { ratio: 2.0,  gain: 0.16, decay: 1.0 },
            { ratio: 2.97, gain: 0.10, decay: 0.7 },
            { ratio: 4.1,  gain: 0.06, decay: 0.45 },
        ];
        partials.forEach(({ ratio, gain, decay }) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = base * ratio;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
            osc.connect(g).connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + decay + 0.05);
        });
    };
    const now = ctx.currentTime;
    strike(now, 880);          // first ding (~A5)
    strike(now + 0.17, 1175);  // second, brighter (~D6) — "ding-ding, time!"
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
    const [gameState, setGameState] = useState<GameState>('SETUP');
    const [difficulty, setDifficulty] = useState<Difficulty>('easy');
    const [mode, setMode] = useState<Mode>('named');
    const [players, setPlayers] = useState<string[]>([]);
    // PIN gate for the adult ("Spicy") difficulty tile. Same session-scoped
    // unlock as the rest of the app (PinGate stores it in sessionStorage).
    const [showPinGate, setShowPinGate] = useState(false);
    const [pendingAdultDiff, setPendingAdultDiff] = useState<Difficulty | null>(null);
    const [showHowToPlay, setShowHowToPlay] = useState(false);

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
                    playBell();
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

    // SETUP → CATEGORY_SELECT (Easy/Hard). "Start" picks the scored mode;
    // "Just Play" picks the no-scoring mode. Difficulty is chosen next.
    const handleStartNamed = () => {
        unlockAudio();
        setMode('named');
        setScores(trimmedPlayers.map(name => ({ name, total: 0, breakdown: [] })));
        setPlayerIndex(0);
        setGameState('CATEGORY_SELECT');
    };

    const handleJustPlay = () => {
        unlockAudio();
        setMode('just_play');
        // One pseudo-player slot so the round-by-round tally still has
        // somewhere to write to. The TURN_END recap reads from this slot.
        setScores([{ name: 'Just Play', total: 0, breakdown: [] }]);
        setPlayerIndex(0);
        setGameState('CATEGORY_SELECT');
    };

    // CATEGORY_SELECT tile tap → stash difficulty, draw this turn's categories,
    // begin the first turn. The Spicy tile is adult-gated; first tap shows the
    // PIN modal and stashes the pick, then a successful unlock replays the
    // handler. just_play has no pass-the-phone gate, so it drops straight into
    // PLAYING (category + timer fire together).
    const handlePickDifficulty = (diff: Difficulty) => {
        const tile = DIFFICULTY_TILES.find(t => t.id === diff);
        if (tile?.adult && !isAdultUnlocked()) {
            setPendingAdultDiff(diff);
            setShowPinGate(true);
            return;
        }
        unlockAudio();
        setDifficulty(diff);
        setTurnCategories(drawTurnCategories(diff));
        setRoundIndex(0);
        setTally(0);
        setGameState(mode === 'just_play' ? 'PLAYING' : 'PASS');
    };

    // PASS → PLAYING: the category appears and the timer starts at the same
    // instant the next player taps "I'm Ready" — no separate Start step.
    const handleReady = () => { unlockAudio(); setGameState('PLAYING'); };

    // TALLY → next round (or next player, or END). The "Next Round" tap is
    // the reveal+start trigger for the next round.
    const handleNextRound = () => {
        // Record the round's points. Both named and just-play modes track
        // scores now — just-play uses a single pseudo-player slot.
        const perfect = tally === round.count;
        const pts = tally + (perfect ? 1 : 0);
        setScores(prev => prev.map((s, i) =>
            i === playerIndex ? { ...s, total: s.total + pts, breakdown: [...s.breakdown, pts] } : s
        ));

        if (roundIndex < TOTAL_ROUNDS - 1) {
            unlockAudio();
            setRoundIndex(r => r + 1);
            setTally(0);
            setGameState('PLAYING');
            return;
        }

        // Turn over — show the per-turn recap before passing the phone
        // (named) or wrapping the just-play session.
        setGameState('TURN_END');
    };

    // TURN_END CTA — advance to the next player or to the match END.
    const handleAfterTurn = () => {
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
        } else {
            setScores([{ name: 'Just Play', total: 0, breakdown: [] }]);
        }
        setPlayerIndex(0);
        setExpandedPlayer(null);
        setTurnCategories(drawTurnCategories(difficulty));
        setRoundIndex(0);
        setTally(0);
        setGameState(mode === 'just_play' ? 'PLAYING' : 'PASS');
    };

    // =======================================================================
    // RENDER
    // =======================================================================

    // ---- CATEGORY_SELECT (difficulty picker — comes after the player screen) ----
    if (gameState === 'CATEGORY_SELECT') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Pick a Level" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-muted text-sm">{mode === 'just_play' ? 'Just Play · solo · 5 rounds' : 'Scored · 5 rounds'}</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {DIFFICULTY_TILES.map(t => {
                            const Icon = t.Icon;
                            return (
                            <button
                                key={t.id}
                                onClick={() => handlePickDifficulty(t.id)}
                                className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                            >
                                <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                    <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: t.color }} />
                                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: t.color }} />
                                    <div className="flex items-center gap-3">
                                        <span className="flex-shrink-0" style={{ color: t.color }}><Icon size={16} /></span>
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-base font-bold text-ink leading-tight">{t.title}</h3>
                                            <p className="text-xs text-muted leading-snug truncate">{t.tagline}</p>
                                        </div>
                                        <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                    </div>
                                </div>
                            </button>
                            );
                        })}
                    </div>
                </div>
                {showPinGate && (
                    <PinGateModal
                        onSuccess={() => {
                            setShowPinGate(false);
                            if (pendingAdultDiff) {
                                const d = pendingAdultDiff;
                                setPendingAdultDiff(null);
                                handlePickDifficulty(d);
                            }
                        }}
                        onCancel={() => { setShowPinGate(false); setPendingAdultDiff(null); }}
                    />
                )}
            </div>
        );
    }

    // ---- SETUP — the landing screen: enter names (→ scored) or Just Play (→ no scoring) ----
    if (gameState === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="5 Alive" onBack={onExit} onHome={onExit} />
                <div className="px-2 pb-4 flex-1 flex flex-col">
                    <div className="text-center mb-3 -mt-2">
                        <p className="text-2xl mb-1 leading-none">⏱️</p>
                        <h2 className="text-base font-serif font-bold text-ink">Can you beat the <em>buzzer</em>?</h2>
                        <p className="text-muted text-xs mt-0.5">5 in 5 seconds. Then 4 in 4. Then 3 in 3…</p>
                    </div>

                    <div className="text-center mb-3">
                        <button onClick={() => setShowHowToPlay(!showHowToPlay)} className="text-xs font-bold text-emerald-500 border border-emerald-500/30 px-3 py-1 bg-surface-alt hover:bg-app-tint transition relative z-10 mx-auto block rounded shadow-lg uppercase">
                            {showHowToPlay ? 'Hide Rules' : 'How To Play'}
                        </button>
                        {showHowToPlay && (
                            <div className="text-left text-xs text-ink-soft bg-black/20 border border-divider p-4 mt-2 relative z-10 space-y-3 font-medium rounded animate-fade-in shadow-inner">
                                <p><strong className="text-ink">1. GOAL:</strong> Rattle off real answers to a category before the buzzer goes off. Beat the clock.</p>
                                <p><strong className="text-emerald-500">2. ROUNDS:</strong> Five rounds, getting tighter each time — name 5, then 4, then 3, 2, and finally 1.</p>
                                <p><strong className="text-amber-500">3. THE CLOCK:</strong> Each round gives you one extra second to read the clue (6 / 5 / 4 / 3 / 2 secs). The bell ends the round.</p>
                                <p><strong className="text-red-500">4. SCORING:</strong> The judge tallies your correct answers — one point each, plus a bonus point for a perfect round. Highest total after 5 rounds wins. Or hit <strong className="text-emerald-500">Just Play</strong> to skip scoring entirely.</p>
                            </div>
                        )}
                    </div>

                    <div className="flex-1 flex flex-col justify-center">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-2 text-center">Add players to keep score — or just play</p>
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} persist={false} />
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
                <ScreenHeader title="Pass the Phone" onBack={() => setGameState('SETUP')} onHome={onExit} confirmOnExit />
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

    // ---- PLAYING — clue card centerstage, compact timer strip on top. The
    //      timer starts the instant this screen mounts (no Start button), so
    //      the reveal and the countdown are simultaneous. ----
    if (gameState === 'PLAYING') {
        const totalMs = round.time * 1000;
        const progress = Math.max(0, Math.min(1, remainingMs / totalMs));
        const displaySec = Math.max(1, Math.ceil(remainingMs / 1000));
        const tier = TIMER_TIERS[tierForSecond(displaySec)];
        const cat = turnCategories[roundIndex] || '…';
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title={`Round ${roundIndex + 1} of ${TOTAL_ROUNDS}`} onBack={() => setGameState(mode === 'just_play' ? 'SETUP' : 'PASS')} onHome={onExit} confirmOnExit />
                {/* Compact timer — small color-shifting number + draining bar.
                    Deliberately small: the clue card below is the centerpiece. */}
                <div className="flex items-center gap-3 max-w-[340px] mx-auto w-full px-1 mb-4">
                    <span className={`font-black tabular-nums leading-none ${tier.text}`} style={{ fontSize: '32px', minWidth: '34px' }}>
                        {displaySec}
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-surface-alt overflow-hidden">
                        <div
                            className="h-full rounded-full"
                            style={{ width: `${progress * 100}%`, background: tier.ring, transition: 'width 80ms linear' }}
                        />
                    </div>
                </div>
                {/* Clue card — the centerpiece. Same surface + decorative-blob
                    language as the other game play screens. */}
                <div className="flex-1 flex flex-col items-center justify-center px-4 animate-slide-up">
                    <div
                        className="w-full max-w-[340px] aspect-[3/4] max-h-[420px] bg-surface border border-divider rounded-[22px] p-6 flex flex-col items-center justify-center relative overflow-hidden"
                        style={{ boxShadow: 'var(--shadow-card)' }}
                    >
                        <div className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none bg-emerald-500/15" />
                        <div className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md bg-emerald-500/15 text-emerald-500 relative z-10">
                            5 Alive
                        </div>
                        <div className="flex-1 flex items-center justify-center relative z-10 px-2">
                            <h2 className="font-serif font-bold text-[44px] leading-[1.05] tracking-[-0.015em] text-ink text-center break-words">
                                {cat}
                            </h2>
                        </div>
                        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted relative z-10">
                            Name {round.count} in {round.time} second{round.time === 1 ? '' : 's'}
                        </p>
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
        const isPerfect = tally === round.count;
        const last = roundIndex === TOTAL_ROUNDS - 1;
        const ctaLabel = !last ? 'Next Round' : 'See My Total';
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title={`Round ${roundIndex + 1} of ${TOTAL_ROUNDS}`} onBack={onExit} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-5 animate-slide-up">
                    <div className="text-5xl">⏰</div>
                    <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">Buzzer!</p>
                        <h2 className="font-serif font-bold text-2xl text-ink">{cat}</h2>
                    </div>

                    <p className="text-sm text-ink-soft">
                        How many did {isJustPlay
                            ? <span className="font-bold text-ink">you</span>
                            : <span className="font-bold text-ink">{currentPlayerName || `Player ${playerIndex + 1}`}</span>} get right?
                        {!isJustPlay && judgeName && <><br /><span className="text-muted text-xs">Judge: {judgeName}</span></>}
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

                    <Button onClick={handleNextRound} fullWidth className="h-14 text-lg mt-2">
                        {ctaLabel} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---- TURN_END — per-turn recap after the 1-guess round. Shows the total
    //      + per-round breakdown. Named mode CTA passes the phone (or to the
    //      leaderboard on the last player). Just Play folds the End screen
    //      into this one — Play Again / Back to Home live right here. ----
    if (gameState === 'TURN_END') {
        const isJustPlay = mode === 'just_play';
        const me = scores[playerIndex] || { name: currentPlayerName || `Player ${playerIndex + 1}`, total: 0, breakdown: [] };
        const isLastTurn = !isJustPlay && playerIndex >= trimmedPlayers.length - 1;
        const nextLabel = isLastTurn
            ? 'See Final Scores'
            : `Pass to ${trimmedPlayers[(playerIndex + 1) % trimmedPlayers.length] || 'next player'}`;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title={isJustPlay ? 'Round Done' : 'Turn Over'} onBack={onExit} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col items-center justify-center px-4 text-center gap-5 animate-slide-up">
                    <div className="text-5xl">{isJustPlay ? '🏁' : '🎯'}</div>
                    <div>
                        <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">
                            {isJustPlay ? "Here's how it went" : "That's a wrap on"}
                        </p>
                        {!isJustPlay && (
                            <h2 className="font-serif font-bold text-3xl text-ink break-words">{me.name}</h2>
                        )}
                    </div>
                    <div className="flex flex-col items-center">
                        <p className="text-xs uppercase tracking-[0.18em] text-muted mb-1">
                            {isJustPlay ? 'Final score' : 'Turn total'}
                        </p>
                        <span className="text-7xl font-black tabular-nums text-emerald-500 leading-none">{me.total}</span>
                        {isJustPlay && <p className="text-xs text-muted mt-1">out of 20</p>}
                    </div>
                    <div className="w-full max-w-[340px] grid grid-cols-5 gap-1.5 mt-1">
                        {ROUNDS.map((r, ri) => {
                            const pts = me.breakdown[ri] ?? 0;
                            const perfect = pts === r.count + 1;
                            return (
                                <div
                                    key={ri}
                                    className={`text-center rounded-md py-2 border ${perfect ? 'bg-emerald-500/15 border-emerald-500/50' : 'bg-surface-alt border-divider'}`}
                                >
                                    <div className="text-[9px] uppercase tracking-wider text-muted">R{ri + 1}</div>
                                    <div className="text-base font-bold text-ink leading-tight">{pts}</div>
                                    {perfect && <div className="text-[8px] uppercase tracking-wider text-emerald-500 font-black">+1</div>}
                                </div>
                            );
                        })}
                    </div>
                    {isJustPlay ? (
                        <div className="flex flex-col gap-3 w-full max-w-[340px] mt-2">
                            <Button onClick={handlePlayAgain} fullWidth>Play Again</Button>
                            <Button onClick={onExit} variant="secondary" fullWidth>Back to Home</Button>
                        </div>
                    ) : (
                        <Button onClick={handleAfterTurn} fullWidth className="h-14 text-lg mt-2">
                            {nextLabel} <ArrowRight className="inline ml-2" size={20} />
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // ---- END (named-mode leaderboard only — just_play wraps inside TURN_END) ----
    if (gameState === 'END') {
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
