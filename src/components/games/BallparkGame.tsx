import React, { useState, useEffect, useRef, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    Target, ChevronRight, ChevronDown, ArrowRight, Share2, ScrollText, Crosshair, Gauge, Users,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { sessionService, shuffle } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playDing, playBuzzEnd, playReveal, playPop, playTick } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import TeamRosterRow from '../ui/TeamRosterRow';
import EndScreen from '../ui/EndScreen';
import RoomPanel from '../ui/RoomPanel';
import { useRoom, msUntil, stateForRound, leaveRoom, type Room, type RoomSession } from '../../services/roomService';
import { useCountdown } from '../../hooks/useCountdown';
import TimerSetting, { loadTimerPref, saveTimerPref, TIMER_OFF } from '../ui/TimerSetting';
import { mulberry32, seededShuffle } from '../../services/seededRandom';
import { GameType } from '../../types';

// "Ballpark" — an estimation game where you never state a number, you state a
// RANGE. Every question has one true numeric answer; you commit a low and a
// high you're willing to stand behind. The tighter the bracket the more it
// pays, but if the truth falls outside it you score nothing at all.
//
// That single rule turns trivia into calibration: the skill isn't knowing the
// answer, it's knowing how much you know. The end screen scores exactly that —
// hit rate against average bracket width — and tells you whether you're
// overconfident or leaving points on the table.
//
// The phone earns its place three times over: it holds the answer, it prices
// your confidence live as you type, and it draws the log-scale number line
// where everyone's bracket sits side by side and the truth drops in on top.
// Fully offline; the question bank is a dynamic-imported JSON chunk.

interface Props { onExit: () => void; }

// LIVE is the mode this game was really designed for. Pass-and-play forces a
// HANDOFF screen between every bracket, which means everyone but the first
// player has already watched someone else think about the question. On separate
// phones the brackets are committed blind and simultaneously, and only then do
// they all drop onto the number line together — which is what that screen was
// drawn for. ROOM is the lobby; LOCKED is "you've committed, waiting on them".
type Stage = 'SETUP' | 'ROOM' | 'HANDOFF' | 'BRACKET' | 'LOCKED' | 'REVEAL' | 'END';

interface Question { id: string; q: string; a: number; u: string; note: string; }
interface Pack { id: string; name: string; tagline: string; emoji: string; questions: Question[]; }
interface BallparkData { packs: Pack[]; }

const dataPromise = import('../../data/ballpark.json').then(m => m.default as unknown as BallparkData);

const QUESTIONS_PER_GAME = 8;
// The bracket clock is ON by default. A bracket is a commitment, and left
// untimed it is the kind of decision that expands to fill whatever time it is
// given — the table talks itself from a Sniper down to a Wild one. 45s is long
// enough to think and short enough to have to. It can be re-timed or turned
// off entirely on the setup screen.
const TIMER_KEY = 'ballpark_timer_secs';
const DEFAULT_SECS = 45;
const MAX_PLAYERS = 6;
const STATS_ID = 'BALLPARK';
const SOLO_NAME = 'You';

const ACCENT_DARK = '#84CC16';   // lime-500 — unused by any other game
const ACCENT_LIGHT = '#4D7C0F';  // lime-700, ~25% darker for white surfaces
const URGENT_DARK = '#FB7185';   // the last five seconds of the bracket clock
const URGENT_LIGHT = '#BE123C';

// ---------------------------------------------------------------------------
// Scoring. The bracket's RATIO (high / low) is what's priced — not its width —
// so the same tier means the same thing whether the answer is 12 or 6 billion.
// Everything here is computable from the player's own two numbers, which is
// what lets the badge price the bracket live while they're still typing.
// ---------------------------------------------------------------------------
interface Tier { maxRatio: number; pts: number; label: string; blurb: string; }

export const TIERS: Tier[] = [
    { maxRatio: 1.25, pts: 10, label: 'Sniper', blurb: 'Barely any room. Enormous nerve.' },
    { maxRatio: 2, pts: 6, label: 'Sharp', blurb: 'You clearly back yourself.' },
    { maxRatio: 4, pts: 4, label: 'Solid', blurb: 'A sensible bet.' },
    { maxRatio: 10, pts: 2, label: 'Loose', blurb: 'Safe. Cheap.' },
    { maxRatio: Infinity, pts: 1, label: 'Wild', blurb: 'You are guessing and we both know it.' },
];
const BULLSEYE_PTS = 20;

const tierFor = (low: number, high: number): Tier => TIERS.find(t => high / low <= t.maxRatio) ?? TIERS[TIERS.length - 1];
const isHit = (low: number, high: number, a: number): boolean => a >= low && a <= high;
const scoreFor = (low: number, high: number, a: number): number => {
    if (!isHit(low, high, a)) return 0;
    return low === high ? BULLSEYE_PTS : tierFor(low, high).pts;
};

// Tier colours run cool → hot as the bracket tightens, so the badge changing
// under your thumb reads as the stake going up.
const TIER_DARK: Record<string, string> = {
    Wild: '#94A3B8', Loose: '#38BDF8', Solid: '#4ADE80', Sharp: '#A3E635', Sniper: '#FACC15',
};
const TIER_LIGHT: Record<string, string> = {
    Wild: '#64748B', Loose: '#0284C7', Solid: '#16A34A', Sharp: '#65A30D', Sniper: '#CA8A04',
};

// Per-player bracket colours on the shared number line.
const PLAYER_DARK = ['#84CC16', '#38BDF8', '#F472B6', '#FBBF24', '#A78BFA', '#2DD4BF'];
const PLAYER_LIGHT = ['#4D7C0F', '#0369A1', '#BE185D', '#B45309', '#6D28D9', '#0F766E'];

const fmt = (n: number): string => n.toLocaleString('en-US');
const ratioLabel = (r: number): string => (r < 10 ? r.toFixed(2).replace(/\.?0+$/, '') : String(Math.round(r)));

interface Guess { low: number; high: number; }

// Calibration read — the whole point of the game, computed from hit rate
// against how tight the brackets actually were (geometric mean, because
// ratios multiply).
const calibrate = (guesses: (Guess | null)[], answers: number[]): { verdict: string; line: string; rate: number; avgRatio: number } => {
    const played = guesses.map((g, i) => ({ g, a: answers[i] })).filter((x): x is { g: Guess; a: number } => x.g !== null);
    if (!played.length) return { verdict: 'No read', line: 'Not enough brackets to call it.', rate: 0, avgRatio: 1 };
    const hits = played.filter(x => isHit(x.g.low, x.g.high, x.a)).length;
    const rate = hits / played.length;
    const avgRatio = Math.exp(played.reduce((s, x) => s + Math.log(x.g.high / x.g.low), 0) / played.length);
    if (rate >= 0.8 && avgRatio <= 3) return { verdict: 'Deadly', line: 'Tight brackets and you still landed them. That is genuine calibration.', rate, avgRatio };
    if (rate >= 0.8) return { verdict: 'Playing it safe', line: 'You almost always hit — but your brackets were wide. There are points sitting on the table.', rate, avgRatio };
    if (rate >= 0.55) return { verdict: 'Well calibrated', line: 'Confident enough to score, honest enough to land it.', rate, avgRatio };
    if (rate >= 0.3) return { verdict: 'Overconfident', line: 'Your brackets are narrower than your knowledge. Give the truth more room.', rate, avgRatio };
    return { verdict: 'Wildly overconfident', line: 'You backed yourself hard and the numbers disagreed. Repeatedly.', rate, avgRatio };
};

// ---------------------------------------------------------------------------
// The signature screen: every bracket on one log-scaled axis, then the truth
// drops in on top of them. Log scale is not decoration — it is the only way a
// 1.2x bracket and a 40x bracket can share an axis and both stay readable.
// ---------------------------------------------------------------------------
// `none` is a player who never committed a bracket — the clock caught them.
// It is not a 1–1 bracket and must never be drawn as one: a bar at the bottom
// of a log scale would read as a confident, precise, wrong answer.
interface LineRow { name: string; low: number; high: number; color: string; pts: number; hit: boolean; tier: string; none?: boolean }

const NumberLine: React.FC<{ rows: LineRow[]; answer: number; unit: string; revealed: boolean; light: boolean }> = ({ rows, answer, unit, revealed, light }) => {
    const vals = rows.filter(r => !r.none).flatMap(r => [r.low, r.high]).concat(answer).filter(v => v > 0);
    const lo = Math.max(Math.min(...vals) / 2.5, 1e-6);
    const hi = Math.max(...vals) * 2.5;
    const L = Math.log10(lo);
    const H = Math.log10(hi);
    const span = H - L || 1;
    const pct = (v: number): number => Math.min(100, Math.max(0, ((Math.log10(Math.max(v, lo)) - L) / span) * 100));
    const pinAt = pct(answer);
    const labelAt = Math.min(88, Math.max(12, pinAt));

    return (
        <div className="relative w-full max-w-[360px] mx-auto">
            {/* answer flag */}
            <div className="relative h-7 mb-1">
                <div
                    className="absolute top-0 -translate-x-1/2 whitespace-nowrap px-2 py-0.5 rounded-md text-[11px] font-black tabular-nums transition-all duration-500"
                    style={{
                        left: `${labelAt}%`,
                        background: light ? '#0F1E33' : '#EFC050',
                        color: light ? '#EFC050' : '#0F1E33',
                        opacity: revealed ? 1 : 0,
                        transform: `translateX(-50%) translateY(${revealed ? 0 : -10}px)`,
                    }}
                >
                    {fmt(answer)}{unit ? ` ${unit}` : ''}
                </div>
            </div>

            <div className="relative">
                {/* the truth, dropped in on top of everyone's brackets */}
                <div
                    className="absolute top-0 bottom-0 w-[2px] rounded-full pointer-events-none z-10 transition-all duration-500"
                    style={{
                        left: `${pinAt}%`,
                        background: light ? '#0F1E33' : '#EFC050',
                        opacity: revealed ? 1 : 0,
                        transform: `translateY(${revealed ? 0 : -14}px)`,
                        boxShadow: light ? 'none' : '0 0 10px rgba(239,192,80,0.55)',
                    }}
                />
                <div className="space-y-2">
                    {rows.map(r => {
                        const left = pct(r.low);
                        const width = Math.max(2.5, pct(r.high) - left);
                        return (
                            <div key={r.name}>
                                <div className="flex items-baseline justify-between mb-0.5 relative z-20">
                                    <span className="text-[11px] font-bold text-ink truncate max-w-[45%]">{r.name}</span>
                                    <span className="text-[10px] font-bold tabular-nums" style={{ color: r.hit ? r.color : 'var(--c-muted)' }}>
                                        {r.none ? 'ran out of time · 0' : `${fmt(r.low)}–${fmt(r.high)} · ${r.hit ? `+${r.pts}` : '0'}`}
                                    </span>
                                </div>
                                <div className="relative h-3 rounded-full bg-surface-alt border border-divider overflow-hidden">
                                    {!r.none && (
                                        <div
                                            className="absolute top-0 bottom-0 rounded-full transition-opacity duration-300"
                                            style={{
                                                left: `${left}%`,
                                                width: `${width}%`,
                                                background: r.color,
                                                opacity: r.hit ? 0.95 : 0.3,
                                                border: r.hit ? 'none' : `1px dashed ${r.color}`,
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export const BallparkGame: React.FC<Props> = ({ onExit }) => {
    const data = use(dataPromise);
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const URGENT = light ? URGENT_LIGHT : URGENT_DARK;
    const TIER_C = light ? TIER_LIGHT : TIER_DARK;
    const PLAYER_C = light ? PLAYER_LIGHT : PLAYER_DARK;

    const [stage, setStage] = useState<Stage>('SETUP');
    // Seeded from the shared session roster so names typed in any other game
    // this session carry straight in.
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('ballpark'));

    const [packId, setPackId] = useState<string>(data.packs[0].id);
    const [questions, setQuestions] = useState<Question[]>([]);
    const [qIdx, setQIdx] = useState(0);
    const [turn, setTurn] = useState(0);
    // guesses[questionIndex][playerIndex]
    const [guesses, setGuesses] = useState<(Guess | null)[][]>([]);
    const [lowStr, setLowStr] = useState('');
    const [highStr, setHighStr] = useState('');
    const [revealed, setRevealed] = useState(false);
    const [shareMsg, setShareMsg] = useState('');
    const [secs, setSecs] = useState(() => loadTimerPref(TIMER_KEY, DEFAULT_SECS, true));
    // Live rounds count down to the ROOM's deadline as it stood when this phone
    // started the question, not to the round length — a phone that polled the
    // new round a second late still locks out with everyone else.
    const [liveMs, setLiveMs] = useState(0);
    const timerOn = secs !== TIMER_OFF;

    // Live (separate phones). `session` is null until a room starts, which is
    // also what keeps this component and RoomPanel from both polling.
    const [session, setSession] = useState<RoomSession | null>(null);
    const room = useRoom(session, ['PLAY']);
    const live = session !== null;

    // Backing out of a live game must free the seat. A ghost player never
    // brackets, and the reveal waits for everyone — so leaving without this
    // would hang the round for everyone still playing.
    const exitLive = () => {
        if (session) void leaveRoom(session.code, session.playerId);
        setSession(null);
        setStage('SETUP');
    };

    // In a room the HOST's clock governs everyone — the deadline is a property
    // of the round, not of each phone's preference. A guest whose own timer is
    // off must still lock out with the room (otherwise they hang the reveal),
    // and a guest whose timer is on must not buzz when the host started an
    // untimed round (deadlineAt null → liveMs 0, which would fire instantly).
    const clockOn = live ? liveMs > 0 : timerOn;

    const named = players.map(p => p.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
    // One unnamed player is the solo game — Ballpark should be tappable
    // straight into play without typing anything.
    // In live play the roster IS the room, ordered by join time so every phone
    // indexes the same player at the same position — the number line's colours
    // and the guesses matrix both key off that index.
    const liveRoster = room.room?.players.map(p => p.name) ?? [];
    const roster = live
        ? (liveRoster.length ? liveRoster : [SOLO_NAME])
        : (named.length >= 2 ? named : [named[0] || SOLO_NAME]);
    const solo = !live && roster.length === 1;
    const mySeat = live && room.room && session
        ? room.room.players.findIndex(p => p.id === session.playerId)
        : 0;

    const question = questions[qIdx];
    const pack = data.packs.find(p => p.id === packId) ?? data.packs[0];

    const low = Number(lowStr);
    const high = Number(highStr);
    const validBracket = lowStr !== '' && highStr !== '' && Number.isFinite(low) && Number.isFinite(high) && low >= 1 && high >= low;
    const liveTier = validBracket ? tierFor(low, high) : null;
    const liveRatio = validBracket ? high / low : 0;
    const livePts = validBracket ? (low === high ? BULLSEYE_PTS : liveTier!.pts) : 0;

    // A haptic tick each time the bracket crosses a tier boundary — the stake
    // going up should be felt, not just read.
    const lastTier = useRef<string | null>(null);
    useEffect(() => {
        const label = liveTier ? (low === high ? 'Bullseye' : liveTier.label) : null;
        if (label && lastTier.current && label !== lastTier.current) { hapticLight(); playPop(); }
        lastTier.current = label;
    }, [liveTier, low, high]);

    // Locally-derived totals are complete for anyone present the whole game.
    // In live play prefer each player's OWN reported total where it exists —
    // that phone is the only one guaranteed to hold their full history, so a
    // late joiner's row reads right instead of silently short. One source of
    // truth per player, and the end screen, the stats write and the share card
    // all read it through here so they cannot disagree.
    const localScores = roster.map((_, pi) =>
        guesses.reduce((sum, row, qi) => {
            const g = row?.[pi];
            return sum + (g && questions[qi] ? scoreFor(g.low, g.high, questions[qi].a) : 0);
        }, 0),
    );
    const scoresByPlayer = live && room.room
        ? room.room.players.map((p, i) => {
            const reported = Number(p.state.total);
            return Number.isFinite(reported) ? reported : (localScores[i] ?? 0);
        })
        : localScores;

    const start = (chosenPackId: string) => {
        const chosen = data.packs.find(p => p.id === chosenPackId) ?? data.packs[0];
        // Session dedupe so a second game of the same pack draws fresh
        // questions; falls back to the full pack once it's exhausted.
        const fresh = sessionService.filterContent(STATS_ID, chosen.id, chosen.questions, q => q.id);
        const pool = fresh.length >= QUESTIONS_PER_GAME ? fresh : chosen.questions;
        const drawn = shuffle(pool).slice(0, QUESTIONS_PER_GAME);
        drawn.forEach(q => sessionService.markAsUsed(STATS_ID, chosen.id, q.id));
        hapticLight(); playReveal();
        setPackId(chosenPackId);
        setQuestions(drawn);
        setGuesses(drawn.map(() => roster.map(() => null)));
        setQIdx(0);
        setTurn(0);
        setLowStr(''); setHighStr('');
        setRevealed(false);
        setShareMsg('');
        setStage(solo ? 'BRACKET' : 'HANDOFF');
    };

    // Live start. Session dedupe is deliberately NOT applied here: it reads
    // this device's localStorage, so two phones would filter different
    // questions out of the pack and deal different games from the same seed.
    // The seed is the only thing allowed to decide what gets dealt.
    const startLive = (s: RoomSession, r: Room) => {
        const chosenId = (r.meta.config.packId as string) ?? data.packs[0].id;
        const chosen = data.packs.find(p => p.id === chosenId) ?? data.packs[0];
        const drawn = seededShuffle(chosen.questions, mulberry32(r.meta.seed)).slice(0, QUESTIONS_PER_GAME);
        hapticLight(); playReveal();
        setPackId(chosen.id);
        setQuestions(drawn);
        setGuesses(drawn.map(() => r.players.map(() => null)));
        setQIdx(Math.max(0, r.meta.round - 1));
        setTurn(0);
        setLowStr(''); setHighStr('');
        setRevealed(false);
        setShareMsg('');
        setLiveMs(msUntil(r.meta.deadlineAt));
        setSession(s);
        setStage('BRACKET');
    };

    // Everything this player has banked BEFORE the question in play. Sent with
    // every patch so a late joiner's row still reads right (see scoresByPlayer).
    const liveTotalSoFar = (): number => guesses.reduce((sum, row, qi) => {
        if (qi >= qIdx) return sum;
        const g = row?.[mySeat];
        return sum + (g && questions[qi] ? scoreFor(g.low, g.high, questions[qi].a) : 0);
    }, 0);

    const lockBracket = (onTime = false) => {
        if (!validBracket) return;
        if (!onTime) { hapticLight(); playDing(); }

        if (live) {
            // Post the bracket and wait. Every phone scores its OWN answers, so
            // `total` is always computed by the one device that has the full
            // history for that player — which is what keeps the leaderboard
            // right for someone who joined late or refreshed mid-game.
            const gained = question ? scoreFor(low, high, question.a) : 0;
            setGuesses(g => {
                const next = g.map(row => [...row]);
                next[qIdx][mySeat] = { low, high };
                return next;
            });
            void room.patch({ low, high, done: 1, total: liveTotalSoFar() + gained });
            setLowStr(''); setHighStr('');
            setStage('LOCKED');
            return;
        }

        setGuesses(g => {
            const next = g.map(row => [...row]);
            next[qIdx][turn] = { low, high };
            return next;
        });
        setLowStr(''); setHighStr('');
        if (turn + 1 < roster.length) {
            setTurn(turn + 1);
            setStage('HANDOFF');
        } else {
            setRevealed(false);
            setStage('REVEAL');
        }
    };

    // Out of time. A bracket already typed is worth committing — the player
    // made that call, the clock only stopped them fiddling with it — so it
    // locks as-is. Nothing valid on screen means no bracket for this question:
    // zero points, exactly like a miss, and the round still has to move on.
    const timeUp = () => {
        hapticHeavy(); playBuzzEnd();
        if (validBracket) { lockBracket(true); return; }
        if (live) {
            // `done` is what the reveal gate reads, so a phone that ran out of
            // time still counts as "in" — otherwise one distracted player
            // freezes the whole room on a question nobody can leave.
            setLowStr(''); setHighStr('');
            void room.patch({ low: 0, high: 0, done: 1, total: liveTotalSoFar() });
            setStage('LOCKED');
            return;
        }
        setLowStr(''); setHighStr('');
        if (turn + 1 < roster.length) {
            setTurn(turn + 1);
            setStage('HANDOFF');
        } else {
            setRevealed(false);
            setStage('REVEAL');
        }
    };
    const timeUpRef = useRef(timeUp);
    timeUpRef.current = timeUp;

    const { secondsLeft } = useCountdown({
        running: clockOn && stage === 'BRACKET' && Boolean(question),
        durationMs: live ? liveMs : secs * 1000,
        restartKey: live ? `live-${qIdx}` : `${qIdx}-${turn}`,
        onSecond: sec => { if (sec > 0 && sec <= 5) playTick(0.12); },
        onExpire: () => timeUpRef.current(),
    });

    // Everyone's bracket for the question now in play, straight off the room.
    // Read through stateForRound so a bracket left over from the previous
    // question can never be mistaken for an answer to this one — without that
    // stamp, a slow phone's stale payload would reveal the round early.
    const liveBrackets = (): (Guess | null)[] => {
        const r = room.room;
        if (!r) return [];
        return r.players.map(p => {
            const st = stateForRound(p, r.meta.round);
            const l = Number(st.low), h = Number(st.high);
            return Number.isFinite(l) && Number.isFinite(h) && l > 0 ? { low: l, high: h } : null;
        });
    };

    // Who has finished with this question — which is NOT the same as who has a
    // bracket. A player whose clock ran out with nothing typed is done and
    // scores nothing; gating the reveal on a non-null bracket would leave the
    // room waiting on them forever.
    const liveDone = (): boolean[] => {
        const r = room.room;
        if (!r) return [];
        return r.players.map(p => Number(stateForRound(p, r.meta.round).done) === 1);
    };

    // The reveal waits for the whole room. Committing blind is the entire
    // point of playing this on separate phones, so the truth may not drop
    // until nobody can still be influenced by seeing it.
    useEffect(() => {
        if (!live || stage !== 'LOCKED') return;
        const r = room.room;
        if (!r) return;
        const done = liveDone();
        if (done.length === 0 || done.some(d => !d)) return;
        const brackets = liveBrackets();
        setGuesses(g => {
            const next = g.map(row => [...row]);
            const target = Math.max(0, r.meta.round - 1);
            if (next[target]) next[target] = brackets;
            return next;
        });
        setRevealed(false);
        setStage('REVEAL');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, stage]);

    // The room ending is the guests' cue to score up. finish() is local to each
    // device on purpose — every phone records its own stats — so this is a
    // signal to run it, not a result being handed over.
    useEffect(() => {
        if (!live || stage === 'END' || stage === 'SETUP' || stage === 'ROOM') return;
        if (room.room?.meta.phase !== 'END') return;
        finish();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, stage]);

    // Guests learn the question advanced from the round number changing on a
    // poll — there is no push. Host and guest take the identical path in.
    useEffect(() => {
        if (!live) return;
        const r = room.room;
        if (!r || r.meta.phase !== 'PLAY') return;
        const target = Math.max(0, r.meta.round - 1);
        if (target === qIdx || target >= questions.length) return;
        setQIdx(target);
        setLowStr(''); setHighStr('');
        setRevealed(false);
        setLiveMs(msUntil(r.meta.deadlineAt));
        setStage('BRACKET');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, qIdx, questions.length]);

    // The pin drop is the moment — give the brackets a beat on screen first.
    useEffect(() => {
        if (stage !== 'REVEAL' || !question) return;
        const t = setTimeout(() => {
            setRevealed(true);
            const anyHit = (guesses[qIdx] ?? []).some(g => g && isHit(g.low, g.high, question.a));
            if (anyHit) { playDing(); hapticSuccess(); } else { playBuzzEnd(); hapticError(); }
        }, 620);
        return () => clearTimeout(t);
    }, [stage, qIdx, question, guesses]);

    const nextQuestion = () => {
        hapticLight();
        if (qIdx + 1 >= questions.length) {
            // The host finishing is a ROOM event, not a local one. Without this
            // the host lands on the calibration read and every other phone sits
            // on the last reveal forever, waiting for a round that never comes.
            if (live && room.isHost) void room.host({ phase: 'END' });
            finish();
            return;
        }
        if (live) {
            // Only the host moves the room on; every other phone follows the
            // round number. Two devices advancing independently is how a room
            // ends up on two different questions.
            void room.host({ round: qIdx + 2, durationMs: timerOn ? secs * 1000 : null });
            return;
        }
        setQIdx(qIdx + 1);
        setTurn(0);
        setLowStr(''); setHighStr('');
        setRevealed(false);
        setStage(solo ? 'BRACKET' : 'HANDOFF');
    };

    const finish = () => {
        hapticHeavy();
        statsStore.recordPlay(STATS_ID);
        const totals = scoresByPlayer;
        const top = Math.max(...totals, 0);
        if (solo) {
            statsStore.recordBest(STATS_ID, totals[0], `${totals[0]} pts`);
        } else {
            const winners = roster.filter((_, i) => totals[i] === top && top > 0);
            if (winners.length) statsStore.recordWins(STATS_ID, winners);
        }
        gameNightService.reportResult(GameType.BALLPARK, roster.map((n, i) => ({ name: n, score: totals[i] })));
        setStage('END');
    };

    const share = async () => {
        const ranked = roster.map((n, i) => ({ n, s: scoresByPlayer[i], c: calibrate(guesses.map(r => r?.[i] ?? null), questions.map(q => q.a)) }))
            .sort((a, b) => b.s - a.s);
        const out = await shareResultCard({
            gameTitle: 'Ballpark',
            accent: ACCENT_DARK,
            heading: solo ? `${ranked[0].s} point${ranked[0].s === 1 ? '' : 's'}` : `${ranked[0].n} called it closest`,
            sub: `${pack.name} · ${questions.length} questions`,
            tagline: "Don't guess the number. Bracket it.",
            context: 'Tighter bracket = more points. Miss it and you score nothing.',
            challenge: 'How well do you know what you know?',
            emoji: '🎯',
            rows: ranked.map(r => ({ label: r.n, value: `${r.s} pts · ${r.c.verdict.toLowerCase()}` })),
        });
        setShareMsg(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Saved to your device' : out === 'failed' ? "Couldn't share" : '');
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Ballpark" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🎯</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            Don't guess the number. <em>Bracket</em> it.
                        </h2>
                        <p className="text-muted text-sm px-6">
                            The tighter your range, the more it pays — and the easier it is to miss entirely.
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} />
                        <p className="text-center text-[11px] text-muted mt-1 mb-3">
                            {named.length >= 2
                                ? `${named.length} players — pass the phone, brackets stay private.`
                                : 'Playing solo. Add 2+ names for pass-and-play.'}
                        </p>
                        <div className="flex justify-center mb-4">
                            <TimerSetting
                                duration={secs}
                                accent={ACCENT}
                                allowOff
                                unit="bracket"
                                onPick={v => { setSecs(v); saveTimerPref(TIMER_KEY, v); }}
                            />
                        </div>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mb-5">
                        <button
                            onClick={() => { hapticLight(); setStage('ROOM'); }}
                            className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 border-l-sky-500 border-b-sky-500 hover:bg-app-tint rounded-xl py-3 px-4 transition-colors overflow-hidden"
                        >
                            <div className="flex items-center gap-3 relative z-10">
                                <Users size={16} className="text-sky-500 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-bold text-ink leading-snug">Play live on separate phones</p>
                                    <p className="text-[11px] text-muted leading-snug">Everyone brackets at once, blind. Needs internet.</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-500 group-hover:text-ink flex-shrink-0" />
                            </div>
                        </button>
                    </div>

                    <p className="max-w-[340px] mx-auto w-full text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2 px-1">
                        Pick a pack
                    </p>
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {data.packs.map(p => (
                            <button
                                key={p.id}
                                onClick={() => start(p.id)}
                                className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25 rounded-xl py-3 px-4 transition-colors overflow-hidden"
                                style={{ borderLeftColor: ACCENT, borderBottomColor: ACCENT }}
                            >
                                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                                <div className="flex items-center gap-3 relative z-10">
                                    <span className="text-base leading-none">{p.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-bold text-ink leading-snug truncate">{p.name}</p>
                                        <p className="text-[11px] text-muted leading-snug truncate">{p.tagline}</p>
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
                                <p><span className="font-bold text-ink">1.</span> Every question has one true number. You don't name it — you give a low and a high you'd bet on.</p>
                                <p><span className="font-bold text-ink">2.</span> If the truth lands inside your bracket you score. If it doesn't, you get nothing, however close you were.</p>
                                <p><span className="font-bold text-ink">3.</span> The narrower the bracket, the bigger the payout: {TIERS.map(t => t.label).join(' → ')} is 1 up to 10 points. Nail it exactly and it's {BULLSEYE_PTS}.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Eight questions. At the end the app scores something trivia never does — how well your confidence matched your actual knowledge.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- HANDOFF ----------------
    // ---------------- ROOM (live lobby) ----------------
    if (stage === 'ROOM') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Play live" onBack={() => setStage('SETUP')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-2">
                    <RoomPanel
                        game={GameType.BALLPARK}
                        title="Everyone at once"
                        blurb="Same eight questions, each on your own phone. Nobody sees anybody's bracket until every bracket is in — then they all drop onto the line together."
                        accent="lime"
                        config={{ packId }}
                        minPlayers={2}
                        startDurationMs={timerOn ? secs * 1000 : undefined}
                        hostControls={
                            <div>
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Clock</p>
                                    <TimerSetting
                                        duration={secs}
                                        accent={ACCENT}
                                        allowOff
                                        unit="bracket"
                                        onPick={v => { setSecs(v); saveTimerPref(TIMER_KEY, v); }}
                                    />
                                </div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Pack</p>
                                <div className="grid gap-2">
                                    {data.packs.map(p => (
                                        <button key={p.id} onClick={() => { hapticLight(); setPackId(p.id); }}
                                            className={`text-left rounded-lg py-2 px-3 border transition-colors ${packId === p.id ? 'bg-lime-500/10 border-lime-500/50' : 'bg-surface-alt border-divider hover:bg-app-tint'}`}>
                                            <span className="text-sm text-ink font-semibold">{p.emoji} {p.name}</span>
                                        </button>
                                    ))}
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

    // ---------------- LOCKED (committed, waiting on the room) ----------------
    if (stage === 'LOCKED' && question) {
        const done = liveDone();
        const waiting = (room.room?.players ?? []).filter((_, i) => !done[i]);
        const mine = guesses[qIdx]?.[mySeat] ?? null;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`Question ${qIdx + 1} of ${questions.length}`} onBack={onExit} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
                    <p className="text-sm text-ink-soft mb-6 max-w-[300px]">{question.q}</p>
                    <div className="rounded-2xl border-2 px-6 py-5 mb-6" style={{ borderColor: ACCENT }}>
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-1">Your bracket, locked</p>
                        <p className="text-2xl font-black tabular-nums text-ink">
                            {mine ? `${fmt(mine.low)} – ${fmt(mine.high)}` : '—'}
                        </p>
                        <p className="text-[11px] text-muted mt-1">{question.u}</p>
                    </div>
                    {waiting.length > 0 ? (
                        <>
                            <p className="text-sm text-muted">
                                Waiting on <span className="text-ink font-semibold">{waiting.map(p => p.name).join(', ')}</span>
                            </p>
                            <p className="text-[11px] text-muted mt-2 max-w-[280px]">
                                Nobody sees a thing until everyone's in. That's the point.
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-muted">Everyone's in…</p>
                    )}
                    {room.offline && <p className="text-xs text-rose-500 mt-4">Lost the connection. Retrying…</p>}
                </div>
            </div>
        );
    }

    if (stage === 'HANDOFF' && question) {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Ballpark" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Question {qIdx + 1} of {questions.length}
                        </p>
                        <Target size={32} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-3 relative z-10">
                            Phone to {roster[turn]}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            Your bracket is private until everyone has locked one in.
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); setStage('BRACKET'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        I've got it <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- BRACKET ----------------
    if (stage === 'BRACKET' && question) {
        const fullSecs = live ? Math.max(1, Math.round(liveMs / 1000)) : secs;
        const clockPct = Math.max(0, Math.min(100, (secondsLeft / fullSecs) * 100));
        const badgeColor = validBracket ? (low === high ? (light ? '#B8922F' : '#EFC050') : TIER_C[liveTier!.label]) : 'var(--c-muted)';
        const badgeLabel = validBracket ? (low === high ? 'Bullseye or bust' : liveTier!.label) : 'Set your range';
        const badgeBlurb = validBracket
            ? (low === high ? `One number. ${BULLSEYE_PTS} points if you are exactly right, nothing if you are not.` : liveTier!.blurb)
            : 'A low and a high you would actually bet on.';

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`Question ${qIdx + 1} of ${questions.length}`} onBack={live ? exitLive : () => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    {clockOn && (
                        <div className="max-w-[340px] mx-auto w-full mb-2.5">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                                    {validBracket ? 'Locks in as typed' : 'Nothing typed scores nothing'}
                                </span>
                                <span className="text-sm font-black tabular-nums" style={{ color: secondsLeft <= 5 ? URGENT : 'var(--c-ink)' }}>
                                    {secondsLeft}s
                                </span>
                            </div>
                            <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden">
                                <div className="h-full rounded-full transition-none"
                                    style={{ width: `${clockPct}%`, background: secondsLeft <= 5 ? URGENT : ACCENT }} />
                            </div>
                        </div>
                    )}
                    {live ? (
                        <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: ACCENT }}>
                            Everyone brackets now · {roster.length} playing
                        </p>
                    ) : !solo && (
                        <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: ACCENT }}>
                            {roster[turn]}'s bracket
                        </p>
                    )}
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-6 text-center relative overflow-hidden" style={{ boxShadow: 'var(--shadow-card)', borderColor: ACCENT + '55' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted relative z-10">{pack.name}</p>
                        <p className="font-serif font-black text-[24px] leading-[1.2] text-ink mt-3 relative z-10">{question.q}</p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-5">
                        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                            <label className="block">
                                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-1.5">At least</span>
                                <input
                                    type="number" inputMode="numeric" min={1} value={lowStr} placeholder="low"
                                    onChange={e => setLowStr(e.target.value)}
                                    className="w-full bg-surface-alt border-2 border-divider focus:border-ink-soft rounded-xl px-3 py-3 text-ink text-xl font-black tabular-nums text-center placeholder:text-muted placeholder:font-normal placeholder:text-base outline-none transition-colors"
                                />
                            </label>
                            <span className="pb-4 text-muted text-sm font-bold">to</span>
                            <label className="block">
                                <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-1.5">At most</span>
                                <input
                                    type="number" inputMode="numeric" min={1} value={highStr} placeholder="high"
                                    onChange={e => setHighStr(e.target.value)}
                                    className="w-full bg-surface-alt border-2 border-divider focus:border-ink-soft rounded-xl px-3 py-3 text-ink text-xl font-black tabular-nums text-center placeholder:text-muted placeholder:font-normal placeholder:text-base outline-none transition-colors"
                                />
                            </label>
                        </div>
                        {question.u && <p className="text-center text-[11px] text-muted mt-1.5">measured in {question.u}</p>}

                        {/* live price on the bracket — the thing you feel while typing */}
                        <div className="mt-4 rounded-xl border-2 px-4 py-3 flex items-center gap-3 transition-colors"
                            style={{ borderColor: badgeColor + (validBracket ? '99' : '44'), background: validBracket ? badgeColor + '14' : 'transparent' }}>
                            <Gauge size={20} style={{ color: badgeColor }} className="flex-shrink-0" />
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-black leading-tight" style={{ color: badgeColor }}>
                                    {badgeLabel}
                                    {validBracket && low !== high && <span className="text-muted font-bold"> · {ratioLabel(liveRatio)}× spread</span>}
                                </p>
                                <p className="text-[11px] text-muted leading-snug mt-0.5">{badgeBlurb}</p>
                            </div>
                            <span className="text-2xl font-black tabular-nums flex-shrink-0" style={{ color: validBracket ? badgeColor : 'var(--c-muted)' }}>
                                {validBracket ? livePts : '–'}
                            </span>
                        </div>

                        <Button onClick={() => lockBracket()} disabled={!validBracket} fullWidth className="h-14 text-lg mt-4">
                            <Crosshair className="inline mr-2" size={19} /> Lock the bracket
                        </Button>
                        {lowStr !== '' && highStr !== '' && !validBracket && (
                            <p className="text-center text-[11px] text-muted mt-2">The high has to be at least the low, and the low at least 1.</p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- REVEAL ----------------
    if (stage === 'REVEAL' && question) {
        const rows: LineRow[] = roster.map((n, i) => {
            const g = guesses[qIdx]?.[i];
            const lo = g?.low ?? 1;
            const hi = g?.high ?? 1;
            const hit = g ? isHit(lo, hi, question.a) : false;
            return {
                name: n, low: lo, high: hi, color: PLAYER_C[i % PLAYER_C.length],
                pts: g ? scoreFor(lo, hi, question.a) : 0, hit,
                tier: g ? (lo === hi ? 'Bullseye' : tierFor(lo, hi).label) : 'Wild',
                none: !g,
            };
        });
        const last = qIdx + 1 >= questions.length;

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The answer" onBack={exitLive} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-6 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: ACCENT + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[12px] text-muted leading-snug relative z-10">{question.q}</p>
                        <p className="font-serif font-black text-[42px] leading-none text-ink mt-3 tabular-nums relative z-10">{fmt(question.a)}</p>
                        {question.u && <p className="text-sm font-bold relative z-10 mt-1" style={{ color: ACCENT }}>{question.u}</p>}
                        <p className="text-[12px] text-muted italic mt-3 relative z-10">{question.note}</p>
                    </div>

                    <div className="mt-6">
                        <NumberLine rows={rows} answer={question.a} unit={question.u} revealed={revealed} light={light} />
                    </div>

                    <p className="text-center text-[11px] text-muted mt-4">
                        {rows.some(r => r.hit)
                            ? rows.filter(r => r.hit).map(r => (r.tier === 'Bullseye' ? `${r.name} named it exactly` : `${r.name} landed a ${r.tier.toLowerCase()} bracket`)).join(' · ')
                            : rows.every(r => r.none)
                                ? 'No bracket went in before the clock did.'
                                : 'Nobody caught it. The truth was outside every bracket.'}
                    </p>

                    {live && !room.isHost && !last ? (
                        <p className="text-center text-sm text-muted mt-6">
                            Waiting for the host to call the next question…
                        </p>
                    ) : (
                        <Button onClick={nextQuestion} fullWidth className="h-14 text-lg mt-5 max-w-[340px] mx-auto w-full">
                            {last ? 'See the calibration read' : `Question ${qIdx + 2}`} <ArrowRight className="inline ml-2" size={20} />
                        </Button>
                    )}
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const reads = roster.map((_, i) => calibrate(guesses.map(r => r?.[i] ?? null), questions.map(q => q.a)));
    const entries = roster.map((n, i) => {
        const mine = guesses.map(r => r?.[i] ?? null);
        const hits = mine.filter((g, qi) => g && questions[qi] && isHit(g.low, g.high, questions[qi].a)).length;
        const bulls = mine.filter((g, qi) => g && questions[qi] && g.low === g.high && isHit(g.low, g.high, questions[qi].a)).length;
        return {
            name: n,
            score: scoresByPlayer[i],
            expand: (
                <div className="px-4 pb-3 text-sm text-muted">
                    {hits} of {questions.length} brackets landed · average spread {ratioLabel(reads[i].avgRatio)}×
                    {bulls > 0 ? ` · ${bulls} bullseye${bulls === 1 ? '' : 's'}` : ''}
                </div>
            ),
        };
    });

    return (
        <EndScreen
            title="Ballpark"
            onBack={exitLive}
            onHome={onExit}
            entries={entries}
            accent="theme"
            winnerText={top => { const pt = `${top.score} point${top.score === 1 ? '' : 's'}`; return solo ? `scored ${pt}.` : `called it closest — ${pt}.`; }}
            playAgainLabel="New questions"
            onPlayAgain={exitLive}
            exitLabel="Back to Home"
            onExit={onExit}
            footerExtra={
                <div className="max-w-[340px] mx-auto w-full space-y-3">
                    <div className="rounded-xl border p-4 relative overflow-hidden" style={{ borderColor: ACCENT + '55', background: 'var(--c-surface)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] relative z-10" style={{ color: ACCENT }}>Calibration read</p>
                        <div className="mt-2.5 space-y-2.5 relative z-10">
                            {roster.map((n, i) => (
                                <div key={n}>
                                    <p className="text-[13px] font-bold text-ink leading-tight">
                                        {solo ? '' : `${n} — `}{reads[i].verdict}
                                        <span className="text-muted font-normal"> · {Math.round(reads[i].rate * 100)}% landed at {ratioLabel(reads[i].avgRatio)}× average</span>
                                    </p>
                                    <p className="text-[11px] text-muted leading-snug mt-0.5">{reads[i].line}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button onClick={share}
                        className="w-full h-12 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT + '99', color: ACCENT }}>
                        <Share2 size={17} /> Share the read
                    </button>
                    {shareMsg && <p className="text-center text-xs text-muted">{shareMsg}</p>}
                </div>
            }
        />
    );
};

export default BallparkGame;
