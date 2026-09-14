import React, { useState, useEffect, useRef } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    Calculator, ChevronRight, ChevronDown, ArrowRight, Share2, ScrollText, Undo2, Flag, Check, Swords,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { sessionService } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playDing, playBuzzer, playPangram, playReveal, playTick, playPop } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import { useCountdown } from '../../hooks/useCountdown';
import TeamRosterRow from '../ui/TeamRosterRow';
import TimerSetting, { loadTimerPref, saveTimerPref } from '../ui/TimerSetting';
import EndScreen from '../ui/EndScreen';
import RoomPanel from '../ui/RoomPanel';
import { useRoom, msUntil, stateForRound, leaveRoom, type Room, type RoomSession } from '../../services/roomService';
import { mulberry32, roundSeed } from '../../services/seededRandom';
import { GameType } from '../../types';
import {
    dealPuzzle, applyOp, scoreFor, stepText, ROUNDS,
    type Puzzle, type Op, type Step, type Difficulty,
} from '../../services/targetEngine';

// "Target" — six numbers, one three-digit target, and the four operations.
//
// The phone earns its place by solving the puzzle too. At the buzzer it shows
// the way in, and knowing that the answer was always there is what makes the
// near-miss sting in the right way. That reveal is the whole game, and it is
// only possible because there is a search running in your pocket
// (src/services/targetEngine.ts).
//
// Numbers are combined by TAPPING rather than typed as an expression: pick a
// tile, pick an operator, pick another tile, and the two collapse into their
// result. That makes every illegal move unreachable instead of rejected — you
// cannot enter a fraction or a negative, because there is nothing to type.
//
// Fully offline, and the only game here with NO content file at all: every
// puzzle is generated and solved at deal time.

interface Props { onExit: () => void; }

// LOCKED is the live-only stage between "your turn is over" and "everyone's
// turn is over". With a shared clock most players land there at the same
// instant, but an exact hit ends a turn early — so someone always has to wait,
// and the solution must not appear until nobody can still be racing for it.
type Stage = 'SETUP' | 'ROOM' | 'HANDOFF' | 'PLAY' | 'LOCKED' | 'REVEAL' | 'END';

const MAX_PLAYERS = 6;
const STATS_ID = 'TARGET';
const TIMER_KEY = 'target_timer_secs';
const DEFAULT_SECS = 60;
const SOLO_NAME = 'You';

const ACCENT_DARK = '#A78BFA';   // violet-400
const ACCENT_LIGHT = '#6D28D9';  // violet-700, ~25% darker for white surfaces

const OPS: Op[] = ['+', '−', '×', '÷'];

const DIFFS: { id: Difficulty; name: string; tagline: string; emoji: string }[] = [
    { id: 'classic', name: 'Classic', tagline: 'One or two big ones, target under 500', emoji: '🎯' },
    { id: 'tough', name: 'Tough', tagline: 'Bigger numbers, and no cheap way in', emoji: '🔥' },
];

interface Tile { id: number; v: number; derived: boolean; }
interface Turn { best: number | null; steps: Step[]; exact: boolean; }
// A finished round keeps its own puzzle: scoring a turn needs the target that
// turn was played against, and by the end screen the live puzzle has moved on.
interface RoundResult { puzzle: Puzzle; turns: Turn[]; }

let tileSeq = 0;
const toTiles = (nums: number[]): Tile[] => nums.map(v => ({ id: ++tileSeq, v, derived: false }));

export const TargetGame: React.FC<Props> = ({ onExit }) => {
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const GOOD = light ? '#15803D' : '#4ADE80';
    const BAD = light ? '#BE123C' : '#FB7185';

    const [stage, setStage] = useState<Stage>('SETUP');
    // Live (separate phones). Null until a room actually starts, which is also
    // what keeps this component and RoomPanel from both polling.
    const [session, setSession] = useState<RoomSession | null>(null);
    const room = useRoom(session, ['PLAY']);
    const live = session !== null;
    const [liveMs, setLiveMs] = useState(0);   // ms left when THIS phone started
    // Seeded from the shared session roster so names carry in from other games.
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('target'));
    const [secs, setSecs] = useState(() => loadTimerPref(TIMER_KEY, DEFAULT_SECS));
    const [difficulty, setDifficulty] = useState<Difficulty>('classic');

    const [round, setRound] = useState(0);
    const [turn, setTurn] = useState(0);
    const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
    const [pool, setPool] = useState<Tile[]>([]);
    const [steps, setSteps] = useState<Step[]>([]);
    const [history, setHistory] = useState<{ pool: Tile[]; steps: Step[] }[]>([]);
    const [sel, setSel] = useState<number | null>(null);
    const [op, setOp] = useState<Op | null>(null);
    const [best, setBest] = useState<number | null>(null);
    const [shake, setShake] = useState(0);
    const [rounds, setRounds] = useState<RoundResult[]>([]);
    const [revealStep, setRevealStep] = useState(0);
    const [shareMsg, setShareMsg] = useState('');

    const named = players.map(p => p.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
    // In live play the roster IS the room, ordered by join time so every phone
    // indexes the same player at the same position.
    const liveRoster = room.room?.players.map(p => p.name) ?? [];
    const roster = live
        ? (liveRoster.length ? liveRoster : [SOLO_NAME])
        : (named.length >= 2 ? named : [named[0] || SOLO_NAME]);
    const solo = !live && roster.length === 1;
    const mySeat = live && room.room && session
        ? room.room.players.findIndex(p => p.id === session.playerId)
        : 0;
    const target = puzzle?.target ?? 0;
    const dist = best === null ? null : Math.abs(best - target);

    const localTotals = roster.map((_, pi) =>
        rounds.reduce((sum, r) => sum + (r.turns[pi] ? scoreFor(r.turns[pi].best, r.puzzle.target) : 0), 0),
    );
    // Each phone reports its OWN running total, because that phone is the only
    // one guaranteed to hold that player's full history — so a late joiner's
    // row reads right instead of silently short. One source per player, and the
    // end screen, the stats write and the share card all read it through here.
    const totals = live && room.room
        ? room.room.players.map((p, i) => {
            const reported = Number(p.state.total);
            return Number.isFinite(reported) ? reported : (localTotals[i] ?? 0);
        })
        : localTotals;

    // ---- turn lifecycle -----------------------------------------------------
    const startTurn = (p: Puzzle) => {
        setPool(toTiles(p.numbers));
        setSteps([]);
        setHistory([]);
        setSel(null);
        setOp(null);
        // A given number can already be the closest thing on the board.
        setBest(p.numbers.reduce((b, v) => (Math.abs(v - p.target) < Math.abs(b - p.target) ? v : b), p.numbers[0]));
        setStage('PLAY');
    };

    const finishTurn = (exact: boolean) => {
        const seat = live ? mySeat : turn;
        setRounds(rs => {
            const next = rs.map(r => ({ ...r, turns: [...r.turns] }));
            while (next.length <= round) {
                next.push({ puzzle: puzzle!, turns: roster.map(() => ({ best: null, steps: [], exact: false })) });
            }
            next[round].puzzle = puzzle!;
            next[round].turns[seat] = { best, steps, exact };
            return next;
        });

        if (live) {
            // Post the finished turn and wait for the room. `steps` rides along
            // so everyone's working can be shown on the reveal — it is the only
            // part of a turn another player cannot re-derive from the seed.
            const prior = rounds.reduce((sum, r, ri) => {
                if (ri >= round) return sum;
                const t = r.turns[seat];
                return sum + (t ? scoreFor(t.best, r.puzzle.target) : 0);
            }, 0);
            const gained = puzzle ? scoreFor(best, puzzle.target) : 0;
            void room.patch({
                best, exact, done: true,
                steps: steps.map(st => stepText(st)),
                total: prior + gained,
            });
            setStage('LOCKED');
            return;
        }

        if (turn + 1 < roster.length) {
            setTurn(turn + 1);
            setStage('HANDOFF');
        } else {
            setRevealStep(0);
            setStage('REVEAL');
        }
    };
    // finishTurn reads `best`/`steps` from the current render, so it must not be
    // called from a stale closure — the countdown's onExpire is refreshed every
    // render by useCountdown, so this is safe.
    const finishRef = useRef(finishTurn);
    finishRef.current = finishTurn;

    // Live rounds count down to the time left until the room's shared deadline
    // AT THE MOMENT THIS PHONE STARTED, not to the round length — so a phone
    // that entered late buzzes with everyone else rather than a second after.
    const { secondsLeft } = useCountdown({
        running: stage === 'PLAY',
        durationMs: live ? liveMs : secs * 1000,
        restartKey: live ? `live-${round}` : `${round}-${turn}`,
        onSecond: s => { if (s > 0 && s <= 5) playTick(0.12); },
        onExpire: () => { hapticHeavy(); playBuzzer(); finishRef.current(false); },
    });

    // ---- board ---------------------------------------------------------------
    const tapTile = (i: number) => {
        if (sel === null) { setSel(i); hapticLight(); playPop(); return; }
        if (sel === i) { setSel(null); setOp(null); hapticLight(); return; }
        if (op === null) { setSel(i); hapticLight(); playPop(); return; }

        const r = applyOp(pool[sel].v, op, pool[i].v);
        if (r === null) {
            // The move is void — clear the whole attempt rather than leaving a
            // tile selected with no operator, which reads as a half-finished
            // move the player did not make.
            hapticError(); playBuzzer();
            setShake(s => s + 1);
            setSel(null);
            setOp(null);
            return;
        }
        const step: Step = { a: pool[sel].v, op, b: pool[i].v, r };
        setHistory(h => [...h, { pool, steps }]);
        const next = pool.filter((_, k) => k !== sel && k !== i).concat({ id: ++tileSeq, v: r, derived: true });
        setPool(next);
        setSteps(s => [...s, step]);
        setSel(null);
        setOp(null);
        if (best === null || Math.abs(r - target) < Math.abs(best - target)) {
            setBest(r);
            // Live: publish how CLOSE you are, never the number itself. Distance
            // is the pressure — "Priya is 2 away" — while the number would hand
            // over part of the answer to a player still searching.
            if (live && session) void room.patch({ dist: Math.abs(r - target) });
        }

        if (r === target) {
            hapticSuccess(); playPangram();
            setBest(r);
            // the turn is over the moment it is exact — nothing beats exact
            setTimeout(() => finishRef.current(true), 700);
        } else {
            hapticLight(); playDing();
        }
    };

    const undo = () => {
        const prev = history[history.length - 1];
        if (!prev) return;
        hapticLight(); playPop();
        setPool(prev.pool);
        setSteps(prev.steps);
        setHistory(h => h.slice(0, -1));
        setSel(null);
        setOp(null);
    };

    // Everyone's turn for the round now in play, straight off the room. Read
    // through stateForRound so a turn left over from the previous round can
    // never be mistaken for an answer to this one.
    const liveTurns = () => {
        const r = room.room;
        if (!r) return [];
        return r.players.map(p => {
            const st = stateForRound(p, r.meta.round);
            return {
                id: p.id,
                name: p.name,
                best: st.best === null || st.best === undefined ? null : Number(st.best),
                exact: Boolean(st.exact),
                done: Boolean(st.done),
                dist: Number.isFinite(Number(st.dist)) ? Number(st.dist) : null,
                steps: Array.isArray(st.steps) ? (st.steps as string[]) : [],
                me: p.id === session?.playerId,
            };
        });
    };

    // Live start / re-deal. The puzzle is generated from the seed, never sent:
    // dealPuzzle already accepts an injectable rnd, so every phone runs the
    // same search and lands on the same six numbers, target AND solution.
    const startLive = (s: RoomSession, r: Room) => {
        const diff = (r.meta.config.difficulty as Difficulty) ?? 'classic';
        const rIdx = Math.max(0, r.meta.round - 1);
        const p = dealPuzzle(diff, mulberry32(roundSeed(r.meta.seed, rIdx)));
        hapticLight(); playReveal();
        setDifficulty(diff);
        setPuzzle(p);
        setRound(rIdx);
        setTurn(0);
        setShareMsg('');
        setLiveMs(msUntil(r.meta.deadlineAt));
        liveRoundRef.current = r.meta.round;
        setSession(s);
        startTurn(p);
    };

    // Guests learn the round advanced from the round number changing on a poll —
    // there is no push. Host and guest take the identical path in, so they
    // cannot end up on different puzzles.
    const liveRoundRef = useRef(0);
    useEffect(() => {
        if (!live) return;
        const r = room.room;
        if (!r || r.meta.phase !== 'PLAY' || r.meta.round === liveRoundRef.current) return;
        if (session) startLive(session, r);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, session]);

    // The reveal waits for the whole room. An exact hit ends a turn early, so
    // without this the fast player would be shown the solution while everyone
    // else is still hunting for it.
    useEffect(() => {
        if (!live || stage !== 'LOCKED') return;
        const turns = liveTurns();
        if (turns.length === 0 || turns.some(t => !t.done)) return;
        setRounds(rs => {
            const next = rs.map(rr => ({ ...rr, turns: [...rr.turns] }));
            while (next.length <= round) {
                next.push({ puzzle: puzzle!, turns: roster.map(() => ({ best: null, steps: [], exact: false })) });
            }
            next[round].puzzle = puzzle!;
            turns.forEach((t, i) => { next[round].turns[i] = { best: t.best, steps: [], exact: t.exact }; });
            return next;
        });
        setRevealStep(0);
        setStage('REVEAL');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, stage]);

    // The room ending is the guests' cue to score up. finish() stays local to
    // each device on purpose — every phone records its own stats — so this is a
    // signal to run it, not a result being handed over.
    useEffect(() => {
        if (!live || stage === 'END' || stage === 'SETUP' || stage === 'ROOM') return;
        if (room.room?.meta.phase !== 'END') return;
        finish();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, stage]);

    // Backing out of a live game must free the seat — the reveal waits for
    // everyone, so a ghost player who never finishes hangs the round.
    const exitLive = () => {
        if (session) void leaveRoom(session.code, session.playerId);
        setSession(null);
        setStage('SETUP');
    };

    // ---- flow ----------------------------------------------------------------
    const start = (d: Difficulty) => {
        hapticLight(); playReveal();
        setDifficulty(d);
        const p = dealPuzzle(d);
        setPuzzle(p);
        setRound(0);
        setTurn(0);
        setRounds([]);
        setShareMsg('');
        if (roster.length > 1) setStage('HANDOFF'); else startTurn(p);
    };

    const nextRound = () => {
        hapticLight();
        if (round + 1 >= ROUNDS) {
            // The host finishing is a ROOM event, not a local one. Without this
            // the host lands on the leaderboard and every guest sits on the last
            // reveal waiting for a round that never comes.
            if (live && room.isHost) void room.host({ phase: 'END' });
            finish();
            return;
        }
        if (live) {
            if (room.isHost) void room.host({ round: round + 2, durationMs: secs * 1000 });
            return;
        }
        const p = dealPuzzle(difficulty);
        setPuzzle(p);
        setRound(round + 1);
        setTurn(0);
        if (roster.length > 1) setStage('HANDOFF'); else startTurn(p);
    };

    const finish = () => {
        hapticHeavy();
        statsStore.recordPlay(STATS_ID);
        const top = Math.max(...totals, 0);
        if (solo) {
            statsStore.recordBest(STATS_ID, totals[0], `${totals[0]} pts`);
        } else {
            const winners = roster.filter((_, i) => totals[i] === top && top > 0);
            if (winners.length) statsStore.recordWins(STATS_ID, winners);
        }
        gameNightService.reportResult(GameType.TARGET, roster.map((n, i) => ({ name: n, score: totals[i] })));
        setStage('END');
    };

    // The reveal walks the solution one step at a time.
    useEffect(() => {
        if (stage !== 'REVEAL' || !puzzle) return;
        setRevealStep(0);
        let i = 0;
        const id = setInterval(() => {
            i += 1;
            setRevealStep(i);
            playPop();
            if (i >= puzzle.solution.length) clearInterval(id);
        }, 460);
        return () => clearInterval(id);
    }, [stage, puzzle]);

    const share = async () => {
        const ranked = roster.map((n, i) => ({ n, s: totals[i] })).sort((a, b) => b.s - a.s);
        const exacts = rounds.reduce((a, r) => a + r.turns.filter(t => t?.exact).length, 0);
        const out = await shareResultCard({
            gameTitle: 'Target',
            accent: ACCENT_DARK,
            heading: solo ? `${ranked[0].s} points` : `${ranked[0].n} got closest`,
            sub: `${difficulty === 'tough' ? 'Tough' : 'Classic'} · ${ROUNDS} rounds · ${exacts} exact`,
            tagline: 'Six numbers, one target, and the four operations.',
            context: 'Exact is 10, within 5 is 7, within 10 is 5',
            challenge: 'Reckon you can beat that in your head?',
            emoji: '🧮',
            rows: ranked.map(r => ({ label: r.n, value: `${r.s} pts` })),
        });
        setShareMsg(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Saved to your device' : out === 'failed' ? "Couldn't share" : '');
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Target" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🧮</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            Six numbers. One target. <em>Go</em>.
                        </h2>
                        <p className="text-muted text-sm px-6">
                            And when the clock stops, the app shows you the way in. There always was one.
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} />
                        <p className="text-center text-[11px] text-muted mt-1">
                            {named.length >= 2
                                ? `${named.length} players — same numbers, one at a time.`
                                : 'Playing solo. Add 2+ names for pass-and-play.'}
                        </p>
                        <div className="flex justify-center mt-3 mb-4">
                            <TimerSetting duration={secs} accent={ACCENT} onPick={s => { setSecs(s); saveTimerPref(TIMER_KEY, s); }} />
                        </div>
                    </div>

                    <p className="max-w-[340px] mx-auto w-full text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2 px-1">
                        Pick your numbers
                    </p>
                    <div className="max-w-[340px] mx-auto w-full mb-5">
                        <button
                            onClick={() => { hapticLight(); setStage('ROOM'); }}
                            className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 border-l-sky-500 border-b-sky-500 hover:bg-app-tint rounded-xl py-3 px-4 transition-colors overflow-hidden"
                        >
                            <div className="flex items-center gap-3 relative z-10">
                                <Swords size={16} className="text-sky-500 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-bold text-ink leading-snug">Race on separate phones</p>
                                    <p className="text-[11px] text-muted leading-snug">Same six numbers, same clock. Needs internet.</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-500 group-hover:text-ink flex-shrink-0" />
                            </div>
                        </button>
                    </div>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {DIFFS.map(d => (
                            <button
                                key={d.id}
                                onClick={() => start(d.id)}
                                className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25 rounded-xl py-3 px-4 transition-colors overflow-hidden"
                                style={{ borderLeftColor: ACCENT, borderBottomColor: ACCENT }}
                            >
                                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                                <div className="flex items-center gap-3 relative z-10">
                                    <span className="text-base leading-none">{d.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-bold text-ink leading-snug truncate">{d.name}</p>
                                        <p className="text-[11px] text-muted leading-snug truncate">{d.tagline}</p>
                                    </div>
                                    <ChevronRight size={16} className="text-gray-500 group-hover:text-ink flex-shrink-0" />
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-5">
                        <button onClick={() => setShowRules(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink text-sm font-bold">
                            <span className="flex items-center gap-2"><ScrollText size={14} className="text-muted" /> How to play</span>
                            <ChevronDown size={16} className={`text-muted transition-transform ${showRules ? 'rotate-180' : ''}`} />
                        </button>
                        {showRules && (
                            <div className="mt-2 px-4 py-3.5 rounded-xl bg-surface border border-divider text-sm text-ink-soft leading-relaxed animate-slide-up space-y-2">
                                <p><span className="font-bold text-ink">1.</span> Six numbers, one target. Reach it with + − × ÷, using each number at most once. You don't have to use them all.</p>
                                <p><span className="font-bold text-ink">2.</span> Tap a number, tap an operator, tap another number — the two collapse into their answer. No fractions and no going below zero, so an illegal move simply won't take.</p>
                                <p><span className="font-bold text-ink">3.</span> Exact scores 10. Within 5 scores 7, within 10 scores 5. Further than that and it's nothing.</p>
                                <p><span className="font-bold text-ink">4.</span> Five rounds. Your closest number counts automatically — there's nothing to declare.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Every target is one the app has already solved, so there is always a way in. It'll show you at the buzzer.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- ROOM (live lobby) ----------------
    if (stage === 'ROOM') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Race live" onBack={() => setStage('SETUP')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-2">
                    <RoomPanel
                        game={GameType.TARGET}
                        title="Same numbers, same clock"
                        blurb="Five rounds. Everyone gets the identical six numbers and target at the same moment, and races the same countdown on their own phone."
                        accent="violet"
                        config={{ difficulty }}
                        startDurationMs={secs * 1000}
                        minPlayers={2}
                        hostControls={
                            <div className="space-y-3">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Difficulty</p>
                                    <div className="grid grid-cols-2 gap-2">
                                        {(['classic', 'tough'] as Difficulty[]).map(d => (
                                            <button key={d} onClick={() => { hapticLight(); setDifficulty(d); }}
                                                className={`rounded-lg py-2 px-3 border text-sm font-semibold capitalize transition-colors ${difficulty === d ? 'bg-violet-400/10 border-violet-400/50 text-ink' : 'bg-surface-alt border-divider text-ink-soft hover:bg-app-tint'}`}>
                                                {d}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="flex justify-center">
                                    <TimerSetting duration={secs} accent={ACCENT} onPick={v => { setSecs(v); saveTimerPref(TIMER_KEY, v); }} />
                                </div>
                            </div>
                        }
                        onStart={(s, r) => startLive(s, r)}
                        onCancel={() => setStage('SETUP')}
                    />
                </div>
            </div>
        );
    }

    if (!puzzle) return null;

    // ---------------- LOCKED (turn over, waiting on the room) ----------------
    if (stage === 'LOCKED' && puzzle) {
        const turns = liveTurns();
        const waiting = turns.filter(t => !t.done);
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`Round ${round + 1} of ${ROUNDS}`} onBack={exitLive} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted mb-2">Your best</p>
                    <p className="font-serif font-black text-[46px] leading-none text-ink tabular-nums">{best ?? '—'}</p>
                    <p className="text-sm mt-2" style={{ color: ACCENT }}>
                        {best === null ? 'Nothing landed' : dist === 0 ? 'Exact.' : `${dist} away from ${target}`}
                    </p>
                    <div className="mt-8">
                        {waiting.length > 0 ? (
                            <>
                                <p className="text-sm text-muted">
                                    Waiting on <span className="text-ink font-semibold">{waiting.map(t => t.name).join(', ')}</span>
                                </p>
                                <p className="text-[11px] text-muted mt-2 max-w-[280px]">
                                    The solution stays hidden until nobody is still hunting for it.
                                </p>
                            </>
                        ) : (
                            <p className="text-sm text-muted">Everyone's in…</p>
                        )}
                    </div>
                    {room.offline && <p className="text-xs text-rose-500 mt-4">Lost the connection. Retrying…</p>}
                </div>
            </div>
        );
    }

    if (stage === 'HANDOFF') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Target" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Round {round + 1} of {ROUNDS}
                        </p>
                        <Calculator size={32} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-3 relative z-10">
                            Phone to {roster[turn]}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            Same six numbers for everyone. {secs} seconds from the moment you tap.
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); startTurn(puzzle); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Start the clock <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- PLAY (the board) ----------------
    if (stage === 'PLAY') {
        const pct = Math.max(0, Math.min(100, (secondsLeft / (live ? Math.max(1, Math.round(liveMs / 1000)) : secs)) * 100));
        const low = secondsLeft <= 5;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader
                    title={live ? `Round ${round + 1} of ${ROUNDS}` : solo ? `Round ${round + 1} of ${ROUNDS}` : roster[turn]}
                    onBack={live ? exitLive : () => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-4">
                    {/* Live: how close everyone ELSE is. Distance only — the
                        number itself would hand over part of the answer. */}
                    {live && (
                        <div className="max-w-[340px] mx-auto w-full flex items-center gap-2 mb-2 overflow-x-auto">
                            {liveTurns().filter(t => !t.me).map(t => (
                                <div key={t.id} className="flex items-center gap-2 bg-surface-alt border border-divider rounded-lg px-2.5 py-1.5 shrink-0">
                                    <span className="text-[11px] font-semibold text-ink-soft truncate max-w-[90px]">{t.name}</span>
                                    <span className="text-sm font-black tabular-nums" style={{ color: t.exact ? GOOD : ACCENT }}>
                                        {t.done && t.exact ? 'exact' : t.dist === null ? '—' : `${t.dist} away`}
                                    </span>
                                </div>
                            ))}
                            {room.offline && <span className="text-[11px] text-rose-500 shrink-0">reconnecting…</span>}
                        </div>
                    )}
                    <div className="max-w-[340px] mx-auto w-full">
                        <div className="flex items-end justify-between mb-1">
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Target</p>
                                <p className="font-serif font-black text-[46px] leading-none text-ink tabular-nums">{target}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Closest</p>
                                <p className="text-[26px] font-black leading-none tabular-nums" style={{ color: dist === 0 ? GOOD : ACCENT }}>
                                    {best ?? '—'}
                                </p>
                                <p className="text-[11px] font-bold" style={{ color: dist === 0 ? GOOD : 'var(--c-muted)' }}>
                                    {dist === null ? '' : dist === 0 ? 'exact!' : `${dist} away`}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 mt-3 mb-4">
                            <div className="flex-1 h-1.5 rounded-full bg-surface-alt overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: low ? BAD : ACCENT }} />
                            </div>
                            <span className="text-sm font-black tabular-nums w-8 text-right" style={{ color: low ? BAD : 'var(--c-ink)' }}>{secondsLeft}</span>
                        </div>
                    </div>

                    {/* The pool — tiles collapse into their results as you go.
                        `key={shake}` deliberately remounts the grid so the
                        shake animation replays on every refused move; without
                        the changing key the class is already applied and the
                        second rejection would be silent. */}
                    <div key={shake} className={`grid grid-cols-3 gap-2 max-w-[340px] mx-auto w-full ${shake ? 'animate-shake' : ''}`}>
                        {pool.map((t, i) => {
                            const on = sel === i;
                            return (
                                <button key={t.id} onClick={() => tapTile(i)}
                                    className="rounded-xl border-2 py-4 font-black tabular-nums transition-colors active:scale-95"
                                    style={on
                                        ? { borderColor: ACCENT, background: ACCENT + '26', color: ACCENT, fontSize: t.v > 9999 ? 20 : 26 }
                                        : {
                                            borderColor: t.derived ? ACCENT + '66' : 'var(--c-border)',
                                            background: 'var(--c-surface-alt)', color: 'var(--c-ink)',
                                            fontSize: t.v > 9999 ? 20 : 26,
                                        }}>
                                    {t.v}
                                </button>
                            );
                        })}
                    </div>

                    <div className="grid grid-cols-4 gap-2 max-w-[340px] mx-auto w-full mt-3">
                        {OPS.map(o => {
                            const on = op === o;
                            return (
                                <button key={o} onClick={() => { if (sel !== null) { setOp(on ? null : o); hapticLight(); } }}
                                    disabled={sel === null}
                                    className="rounded-xl border-2 py-3 text-2xl font-black transition-colors active:scale-95 disabled:opacity-30 disabled:active:scale-100"
                                    style={on
                                        ? { borderColor: ACCENT, background: ACCENT + '26', color: ACCENT }
                                        : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)', color: 'var(--c-ink)' }}>
                                    {o}
                                </button>
                            );
                        })}
                    </div>

                    <p className="text-center text-[11px] text-muted mt-2.5 px-6">
                        {sel === null ? 'Tap a number to start.' : op === null ? 'Now pick an operator.' : 'Now tap the second number.'}
                    </p>

                    {steps.length > 0 && (
                        <div className="grid gap-1.5 max-w-[340px] mx-auto w-full mt-3">
                            {steps.map((s, i) => (
                                <div key={i} className="rounded-lg border px-3 py-1.5 text-[13px] font-bold tabular-nums text-ink-soft animate-slide-up"
                                    style={{ borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}>
                                    {stepText(s)}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className="px-2 pb-6 pt-2 max-w-[340px] mx-auto w-full flex gap-2">
                    <button onClick={undo} disabled={!history.length}
                        className="flex-1 py-3.5 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                        style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink-soft)' }}>
                        <Undo2 size={16} /> Undo
                    </button>
                    <button onClick={() => { hapticLight(); finishRef.current(dist === 0); }}
                        className="flex-1 py-3.5 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT, background: ACCENT + '1A', color: ACCENT }}>
                        <Flag size={16} /> I'm done
                    </button>
                </div>
            </div>
        );
    }

    // ---------------- REVEAL (the signature screen) ----------------
    if (stage === 'REVEAL') {
        const row = rounds[round]?.turns ?? [];
        const last = round + 1 >= ROUNDS;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`Round ${round + 1}`} onBack={live ? exitLive : () => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="text-center mb-4">
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">The target was</p>
                        <p className="font-serif font-black text-[52px] leading-none text-ink tabular-nums">{target}</p>
                    </div>

                    <div className="grid gap-2 max-w-[340px] mx-auto w-full mb-5">
                        {roster.map((n, i) => {
                            const t = row[i];
                            const d = t?.best === null || t?.best === undefined ? null : Math.abs(t.best - target);
                            const pts = t ? scoreFor(t.best, target) : 0;
                            return (
                                <div key={n} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                                    style={d === 0
                                        ? { borderColor: GOOD + '77', background: GOOD + '14' }
                                        : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}>
                                    {d === 0 && <Check size={16} style={{ color: GOOD }} className="flex-shrink-0" />}
                                    <span className="text-[13px] font-bold text-ink truncate flex-1">{n}</span>
                                    <span className="text-[13px] text-muted tabular-nums">
                                        {t?.best ?? '—'}{d === null ? '' : d === 0 ? ' · exact' : ` · ${d} away`}
                                    </span>
                                    <span className="text-lg font-black tabular-nums w-7 text-right" style={{ color: pts > 0 ? GOOD : 'var(--c-muted)' }}>{pts}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-5 py-5 relative overflow-hidden" style={{ boxShadow: 'var(--shadow-card)', borderColor: ACCENT + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] relative z-10" style={{ color: ACCENT }}>The way in</p>
                        <p className="text-[11px] text-muted mt-0.5 mb-3 relative z-10">
                            {puzzle.numbers.join(' · ')}
                        </p>
                        <div className="grid gap-1.5 relative z-10">
                            {puzzle.solution.slice(0, revealStep).map((s, i) => (
                                <div key={i} className="rounded-lg border px-3 py-2 text-[15px] font-black tabular-nums animate-slide-up"
                                    style={{
                                        borderColor: i === puzzle.solution.length - 1 ? ACCENT + '99' : 'var(--c-border)',
                                        background: i === puzzle.solution.length - 1 ? ACCENT + '14' : 'var(--c-surface-alt)',
                                        color: i === puzzle.solution.length - 1 ? ACCENT : 'var(--c-ink)',
                                    }}>
                                    {stepText(s)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {live && !room.isHost && round + 1 < ROUNDS ? (
                        <p className="text-center text-sm text-muted mt-6">Waiting for the host to deal the next round…</p>
                    ) : (
                    <Button onClick={nextRound} disabled={revealStep < puzzle.solution.length} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {last ? 'Final scores' : `Round ${round + 2}`} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                    )}
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const entries = roster.map((n, i) => {
        const exacts = rounds.filter(r => r.turns[i]?.exact).length;
        const scored = rounds.filter(r => r.turns[i] && scoreFor(r.turns[i].best, r.puzzle.target) > 0).length;
        return {
            name: n,
            score: totals[i],
            expand: (
                <div className="px-4 pb-3 text-sm text-muted">
                    {exacts} exact · scored in {scored} of {rounds.length} round{rounds.length === 1 ? '' : 's'}
                </div>
            ),
        };
    });

    return (
        <EndScreen
            title="Target"
            onBack={exitLive}
            onHome={onExit}
            entries={entries}
            accent="theme"
            winnerText={top => (solo ? `scored ${top.score} point${top.score === 1 ? '' : 's'}.` : `got closest — ${top.score} points.`)}
            playAgainLabel="New numbers"
            onPlayAgain={exitLive}
            exitLabel="Back to Home"
            onExit={onExit}
            footerExtra={
                <div className="max-w-[340px] mx-auto w-full space-y-3">
                    <button onClick={share}
                        className="w-full h-12 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT + '99', color: ACCENT }}>
                        <Share2 size={17} /> Share the score
                    </button>
                    {shareMsg && <p className="text-center text-xs text-muted">{shareMsg}</p>}
                </div>
            }
        />
    );
};

export default TargetGame;
