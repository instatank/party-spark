import React, { useState, useEffect, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    ChevronRight, ChevronDown, ArrowRight, Share2, ScrollText, Ear,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { sessionService } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { beep, playDing, playBuzzEnd, playReveal, playTick } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import { useCountdown } from '../../hooks/useCountdown';
import TeamRosterRow from '../ui/TeamRosterRow';
import TimerSetting, { loadTimerPref, saveTimerPref } from '../ui/TimerSetting';
import EndScreen from '../ui/EndScreen';
import { GameType } from '../../types';

// "Echo" — the growing chain. One shared list of things; on your turn you tap
// the whole chain back in order from a 16-tile board, and only then do you get
// to CHOOSE the next item to add. That choice is the game: you're not just
// remembering, you're picking the thing you think will break the next player.
// Twins are seeded through every board on purpose — Lemon and Melon, Fish and
// Prawns, Lion and Tiger.
//
// It's the old "I went to the market and I bought…" game with the one thing it
// always lacked: an incorruptible referee. Nobody can argue the chain, nobody
// can quietly drop an item, and the break screen shows exactly what you tapped
// against exactly what you needed.
//
// THE CHAIN INVARIANT: it only ever grows, by exactly one item, and never
// repeats. Every mutation is another place that has to hold — see
// notes/05-invariant-held-by-constructor-only.md.
// Fully offline; the boards are a dynamic-imported JSON chunk.

interface Props { onExit: () => void; }

type Stage = 'SETUP' | 'ROUND_INTRO' | 'HANDOFF' | 'RECITE' | 'ADD' | 'REPLAY' | 'BREAK' | 'ROUND_END' | 'END';

interface Item { e: string; w: string; }
interface Theme { id: string; name: string; tagline: string; emoji: string; verb: string; items: Item[]; }
interface EchoData { themes: Theme[]; }

const dataPromise = import('../../data/echo.json').then(m => m.default as unknown as EchoData);

const ROUNDS = 3;
const MIN_PLAYERS = 2;
const MAX_PLAYERS = 6;
const STATS_ID = 'ECHO';
const TIMER_KEY = 'echo_timer_secs';
const DEFAULT_SECS = 45;
const REPLAY_STEP_MS = 340;

const ACCENT_DARK = '#E879F9';   // fuchsia-400
const ACCENT_LIGHT = '#A21CAF';  // fuchsia-700, ~25% darker for white surfaces

interface RoundLog { round: number; length: number; breaker: string | null; reason: 'wrong' | 'time' | 'cleared' }


// Both of these live at module scope on purpose: declared inside the game
// component they would be a fresh component type on every render, so React
// would remount every tile and chip — and the replay's entrance animation
// would re-fire across the whole chain on each step instead of only the chip
// that just landed.
const Board: React.FC<{
    items: Item[]; mode: 'recite' | 'add'; chain: number[]; recitePos: number;
    accent: string; light: boolean; onPick: (i: number) => void;
}> = ({ items, mode, chain, recitePos, accent, light, onPick }) => (
    <div className="grid grid-cols-4 gap-2 max-w-[340px] mx-auto w-full">
        {items.map((it, i) => {
            const pos = mode === 'recite' ? chain.slice(0, recitePos).indexOf(i) : -1;
            const taken = mode === 'add' && chain.includes(i);
            const marked = pos >= 0;
            return (
                <button
                    key={it.w}
                    onClick={() => { if (!taken) onPick(i); }}
                    disabled={taken}
                    className="relative rounded-xl border-2 py-2.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 disabled:active:scale-100 min-h-[74px]"
                    style={marked
                        ? { borderColor: accent, background: accent + '1F' }
                        : taken
                            ? { borderColor: 'var(--c-border)', background: 'transparent', opacity: 0.3 }
                            : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}
                >
                    <span className="text-[22px] leading-none">{it.e}</span>
                    <span className="text-[9px] font-bold leading-tight text-center text-ink px-0.5">{it.w}</span>
                    {marked && (
                        <span className="absolute top-1 right-1 w-4 h-4 rounded-full text-[9px] font-black flex items-center justify-center"
                            style={{ background: accent, color: light ? '#FFFFFF' : '#0F1E33' }}>
                            {pos + 1}
                        </span>
                    )}
                </button>
            );
        })}
    </div>
);

const Chips: React.FC<{
    items: Item[]; chain: number[]; upto: number; accent: string; mark: string; markAt?: number;
}> = ({ items, chain, upto, accent, mark, markAt }) => (
    <div className="flex flex-wrap justify-center gap-1.5 max-w-[340px] mx-auto w-full">
        {chain.slice(0, upto).map((idx, i) => {
            const bad = markAt === i;
            return (
                <span key={idx}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-bold animate-slide-up"
                    style={bad
                        ? { borderColor: mark, background: mark + '1F', color: mark }
                        : { borderColor: accent + '66', background: accent + '14', color: 'var(--c-ink)' }}>
                    <span className="text-[13px] leading-none">{items[idx].e}</span>{items[idx].w}
                </span>
            );
        })}
    </div>
);

export const EchoGame: React.FC<Props> = ({ onExit }) => {
    const data = use(dataPromise);
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const WRONG = light ? '#BE123C' : '#FB7185';
    const RIGHT = light ? '#15803D' : '#4ADE80';

    const [stage, setStage] = useState<Stage>('SETUP');
    // Seeded from the shared session roster so names carry in from other games.
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('echo'));
    const [secs, setSecs] = useState(() => loadTimerPref(TIMER_KEY, DEFAULT_SECS));

    const [themeId, setThemeId] = useState(data.themes[0].id);
    // The chain is stored as authored item INDICES, never as item objects —
    // holding indices is what makes "grew by one, never repeats" measurable at
    // the point of mutation rather than only at construction.
    const [chain, setChain] = useState<number[]>([]);
    const [round, setRound] = useState(0);
    const [seat, setSeat] = useState(0);          // offset from this round's starter
    const [recitePos, setRecitePos] = useState(0);
    const [wrongPick, setWrongPick] = useState<number | null>(null);
    const [breakReason, setBreakReason] = useState<'wrong' | 'time'>('wrong');
    const [scores, setScores] = useState<number[]>([]);
    const [longest, setLongest] = useState<number[]>([]);
    const [log, setLog] = useState<RoundLog[]>([]);
    const [replayShown, setReplayShown] = useState(0);
    const [shareMsg, setShareMsg] = useState('');

    const named = players.map(p => p.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
    const canStart = named.length >= MIN_PLAYERS;
    const board = data.themes.find(t => t.id === themeId) ?? data.themes[0];
    const items = board.items;

    // Whoever starts a round rotates, so the same person isn't always handed
    // an empty chain (the easiest seat at the table).
    const startIdx = named.length ? round % named.length : 0;
    const turnIdx = named.length ? (startIdx + seat) % named.length : 0;
    const turnName = named[turnIdx] ?? 'Player';

    const boardFull = chain.length >= items.length;

    const breakChain = (picked: number | null, reason: 'wrong' | 'time') => {
        setWrongPick(picked);
        setBreakReason(reason);
        setLog(l => [...l, { round, length: chain.length, breaker: turnName, reason }]);
        playBuzzEnd(); hapticError();
        setStage('BREAK');
    };

    const { secondsLeft } = useCountdown({
        running: stage === 'RECITE',
        durationMs: secs * 1000,
        restartKey: `${round}-${seat}-${chain.length}`,
        onSecond: s => { if (s > 0 && s <= 5) playTick(0.12); },
        onExpire: () => breakChain(null, 'time'),
    });

    // Chain replay — the public moment. Each chip lands on a note a semitone
    // higher than the last, so a long chain literally rises in pitch.
    useEffect(() => {
        if (stage !== 'REPLAY') return;
        setReplayShown(0);
        let i = 0;
        const id = setInterval(() => {
            i += 1;
            setReplayShown(i);
            beep(300 * Math.pow(2, Math.min(i, 24) / 12), 0.1, 'sine', 0.13);
            if (i >= chain.length) clearInterval(id);
        }, REPLAY_STEP_MS);
        return () => clearInterval(id);
    }, [stage, chain.length]);

    const replayDone = replayShown >= chain.length;

    const start = (chosen: string) => {
        hapticLight(); playReveal();
        setThemeId(chosen);
        setChain([]);
        setRound(0);
        setSeat(0);
        setRecitePos(0);
        setWrongPick(null);
        setScores(new Array(named.length).fill(0));
        setLongest(new Array(named.length).fill(0));
        setLog([]);
        setShareMsg('');
        setStage('ROUND_INTRO');
    };

    const beginTurn = () => {
        hapticLight();
        setRecitePos(0);
        setWrongPick(null);
        setStage(chain.length === 0 ? 'ADD' : 'RECITE');
    };

    const tapRecite = (idx: number) => {
        if (idx !== chain[recitePos]) { breakChain(idx, 'wrong'); return; }
        const next = recitePos + 1;
        setRecitePos(next);
        beep(420 + next * 30, 0.07, 'sine', 0.12);
        hapticLight();
        if (next >= chain.length) {
            // A clean recital pays out the length you just carried.
            playDing(); hapticSuccess();
            setScores(s => { const n = [...s]; n[turnIdx] += chain.length; return n; });
            setLongest(l => { const n = [...l]; n[turnIdx] = Math.max(n[turnIdx], chain.length); return n; });
            setStage('ADD');
        }
    };

    // The only mutation of the chain. It appends exactly one item that is not
    // already in the chain — the two halves of the invariant, enforced here
    // rather than assumed.
    const addItem = (idx: number) => {
        if (chain.includes(idx)) return;
        hapticLight();
        setChain(c => [...c, idx]);
        setStage('REPLAY');
    };

    const afterReplay = () => {
        hapticLight();
        if (chain.length >= items.length) {
            // Nobody broke — the board itself ran out.
            setLog(l => [...l, { round, length: chain.length, breaker: null, reason: 'cleared' }]);
            setStage('ROUND_END');
            return;
        }
        setSeat(s => s + 1);
        setStage('HANDOFF');
    };

    const afterBreak = () => { hapticLight(); setStage('ROUND_END'); };

    const nextRound = () => {
        hapticLight();
        if (round + 1 >= ROUNDS) { finish(); return; }
        setRound(round + 1);
        setSeat(0);
        setChain([]);
        setRecitePos(0);
        setWrongPick(null);
        setStage('ROUND_INTRO');
    };

    const finish = () => {
        hapticHeavy();
        statsStore.recordPlay(STATS_ID);
        const top = Math.max(...scores, 0);
        const winners = named.filter((_, i) => scores[i] === top && top > 0);
        if (winners.length) statsStore.recordWins(STATS_ID, winners);
        const bestChain = Math.max(...longest, 0);
        if (bestChain > 0) statsStore.recordBest(STATS_ID, bestChain, `${bestChain}-item chain`);
        gameNightService.reportResult(GameType.ECHO, named.map((n, i) => ({ name: n, score: scores[i] ?? 0 })));
        setStage('END');
    };

    const share = async () => {
        const ranked = named.map((n, i) => ({ n, s: scores[i] ?? 0, l: longest[i] ?? 0 })).sort((a, b) => b.s - a.s);
        const out = await shareResultCard({
            gameTitle: 'Echo',
            accent: ACCENT_DARK,
            heading: ranked[0] && ranked[0].s > 0 ? `${ranked[0].n} held the chain` : 'The chain won',
            sub: `${board.name} · longest chain ${Math.max(...longest, 0)}`,
            tagline: 'Recite the whole chain, then pick what breaks the next player.',
            context: 'Points = the length of every chain you carried clean',
            challenge: 'How many can your crew hold?',
            emoji: '🧠',
            rows: ranked.map(r => ({ label: r.n, value: `${r.s} pts · best ${r.l}` })),
        });
        setShareMsg(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Saved to your device' : out === 'failed' ? "Couldn't share" : '');
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Echo" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🧠</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            Say it all back. Then make it <em>worse</em>.
                        </h2>
                        <p className="text-muted text-sm px-6">
                            Recite the whole chain, then choose the one thing you think they'll trip on.
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} />
                        <p className="text-center text-[11px] text-muted mt-1">
                            {canStart
                                ? `${named.length} players — ${named.join(', ')}`
                                : `Add at least ${MIN_PLAYERS} names to begin.`}
                        </p>
                        <div className="flex justify-center mt-3 mb-4">
                            <TimerSetting duration={secs} accent={ACCENT} onPick={s => { setSecs(s); saveTimerPref(TIMER_KEY, s); }} />
                        </div>
                    </div>

                    <p className="max-w-[340px] mx-auto w-full text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2 px-1">
                        Pick a board
                    </p>
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {data.themes.map(t => (
                            <button
                                key={t.id}
                                onClick={() => canStart && start(t.id)}
                                disabled={!canStart}
                                className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25 rounded-xl py-3 px-4 transition-colors overflow-hidden disabled:opacity-45"
                                style={{ borderLeftColor: ACCENT, borderBottomColor: ACCENT }}
                            >
                                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                                <div className="flex items-center gap-3 relative z-10">
                                    <span className="text-base leading-none">{t.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-bold text-ink leading-snug truncate">{t.name}</p>
                                        <p className="text-[11px] text-muted leading-snug truncate">{t.tagline}</p>
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
                                <p><span className="font-bold text-ink">1.</span> One chain, built together. On your turn you tap the whole thing back in order — from a board of sixteen, with nothing marked.</p>
                                <p><span className="font-bold text-ink">2.</span> Get it all right and you score the length of the chain you just carried.</p>
                                <p><span className="font-bold text-ink">3.</span> Then you add one item — and you choose which. Every board is stocked with twins. Pick cruelly.</p>
                                <p><span className="font-bold text-ink">4.</span> One wrong tap, or the clock runs out, and the round is over. Three rounds, and whoever starts rotates.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    The old market game, with the one thing it never had: a referee nobody can argue with.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- ROUND INTRO ----------------
    if (stage === 'ROUND_INTRO') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Echo" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Round {round + 1} of {ROUNDS}
                        </p>
                        <p className="text-4xl mt-4 relative z-10">{board.emoji}</p>
                        <h2 className="font-serif font-black text-[30px] leading-tight text-ink mt-3 relative z-10">{board.tagline}</h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            Empty chain. <span className="font-bold text-ink">{named[startIdx]}</span> opens — one item, and it's away.
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); setSeat(0); setStage('HANDOFF'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Start the chain <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- HANDOFF ----------------
    if (stage === 'HANDOFF') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Echo" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Round {round + 1} · chain of {chain.length}
                        </p>
                        <Ear size={32} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-3 relative z-10">
                            Phone to {turnName}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            {chain.length === 0
                                ? 'Nothing to remember yet. Just start it.'
                                : `Tap all ${chain.length} back in order. ${secs} seconds.`}
                        </p>
                    </div>
                    <Button onClick={beginTurn} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {chain.length === 0 ? 'Open the chain' : "I'm ready"} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- RECITE ----------------
    if (stage === 'RECITE') {
        const pctLeft = Math.max(0, Math.min(100, (secondsLeft / secs) * 100));
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={turnName} onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="max-w-[340px] mx-auto w-full">
                        <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                                Item {Math.min(recitePos + 1, chain.length)} of {chain.length}
                            </span>
                            <span className="text-lg font-black tabular-nums" style={{ color: secondsLeft <= 5 ? WRONG : 'var(--c-ink)' }}>
                                {secondsLeft}s
                            </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-surface-alt overflow-hidden mb-4">
                            <div className="h-full rounded-full transition-none" style={{ width: `${pctLeft}%`, background: secondsLeft <= 5 ? WRONG : ACCENT }} />
                        </div>
                    </div>
                    <p className="text-center text-sm text-muted mb-3">{board.tagline}</p>
                    <Board items={items} mode="recite" chain={chain} recitePos={recitePos} accent={ACCENT} light={light} onPick={tapRecite} />
                    <p className="text-center text-[11px] text-muted mt-4 px-6">
                        In order, from the very first. One wrong tile ends the round.
                    </p>
                </div>
            </div>
        );
    }

    // ---------------- ADD ----------------
    if (stage === 'ADD') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`${turnName} adds one`} onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="max-w-[340px] mx-auto w-full mb-4 rounded-xl border px-4 py-3 relative overflow-hidden"
                        style={{ borderColor: ACCENT + '55', background: 'var(--c-surface)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] relative z-10" style={{ color: ACCENT }}>
                            {chain.length === 0 ? 'You open it' : `Chain held — +${chain.length} points`}
                        </p>
                        <p className="text-[13px] text-ink-soft leading-snug mt-1 relative z-10">
                            Now add one. The board is stocked with lookalikes — pick the one they'll confuse.
                        </p>
                    </div>
                    <Board items={items} mode="add" chain={chain} recitePos={recitePos} accent={ACCENT} light={light} onPick={addItem} />
                    <p className="text-center text-[11px] text-muted mt-4 px-6">
                        Faded tiles are already in the chain.
                    </p>
                </div>
            </div>
        );
    }

    // ---------------- REPLAY (the public moment) ----------------
    if (stage === 'REPLAY') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The chain" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] mb-1" style={{ color: ACCENT }}>
                        Everybody watch
                    </p>
                    <p className="text-center text-sm text-muted mb-5">{board.tagline}</p>
                    <Chips items={items} chain={chain} upto={replayShown} accent={ACCENT} mark={RIGHT} />
                    <p className="text-center text-3xl font-black tabular-nums mt-6" style={{ color: ACCENT }}>
                        {replayShown}
                        <span className="text-sm font-bold text-muted"> / {chain.length}</span>
                    </p>
                    <Button onClick={afterReplay} disabled={!replayDone} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {boardFull ? 'Board exhausted — end the round' : `Pass to ${named[(startIdx + seat + 1) % named.length]}`}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- BREAK ----------------
    if (stage === 'BREAK') {
        const needed = items[chain[recitePos]];
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Chain broken" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: WRONG + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${WRONG}2E, transparent 62%)` }} />
                        <p className="text-3xl relative z-10">💥</p>
                        <h2 className="font-serif font-black text-[30px] leading-tight text-ink mt-2 relative z-10">
                            {turnName} broke it at {recitePos + 1}
                        </h2>
                        {breakReason === 'time' ? (
                            <p className="text-[15px] text-ink-soft leading-relaxed mt-3 relative z-10">
                                The clock got there first. Item {recitePos + 1} was{' '}
                                <span className="font-bold" style={{ color: RIGHT }}>{needed?.e} {needed?.w}</span>.
                            </p>
                        ) : (
                            <p className="text-[15px] text-ink-soft leading-relaxed mt-3 relative z-10">
                                You tapped <span className="font-bold" style={{ color: WRONG }}>{wrongPick !== null ? `${items[wrongPick].e} ${items[wrongPick].w}` : '—'}</span>.
                                It was <span className="font-bold" style={{ color: RIGHT }}>{needed?.e} {needed?.w}</span>.
                            </p>
                        )}
                        <p className="text-[11px] text-muted mt-4 relative z-10">Chain reached {chain.length}. No points this turn.</p>
                    </div>

                    <p className="text-center text-[10px] font-bold uppercase tracking-[0.22em] text-muted mt-6 mb-2">The full chain — green is where it broke</p>
                    <Chips items={items} chain={chain} upto={chain.length} accent={ACCENT} mark={RIGHT} markAt={recitePos} />

                    <Button onClick={afterBreak} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Round {round + 1} scores <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- ROUND END ----------------
    if (stage === 'ROUND_END') {
        const thisRound = log[log.length - 1];
        const ranked = named.map((n, i) => ({ n, s: scores[i] ?? 0 })).sort((a, b) => b.s - a.s);
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`Round ${round + 1}`} onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="text-center mb-5">
                        <p className="text-3xl mb-1">{thisRound?.breaker ? '🔗' : '🏅'}</p>
                        <h2 className="font-serif font-black text-[26px] leading-tight text-ink">
                            The chain reached {thisRound?.length ?? chain.length}
                        </h2>
                        <p className="text-sm text-muted mt-1">
                            {thisRound?.breaker
                                ? `${thisRound.breaker} let it go.`
                                : 'Nobody broke it — the board simply ran out.'}
                        </p>
                    </div>
                    <div className="space-y-2 max-w-[340px] mx-auto w-full">
                        {ranked.map((r, i) => (
                            <div key={r.n} className="flex items-center justify-between px-4 py-2.5 rounded-xl border"
                                style={i === 0 ? { borderColor: ACCENT + '99', background: ACCENT + '14' } : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}>
                                <span className="text-sm font-bold text-ink truncate">{r.n}</span>
                                <span className="text-xl font-black tabular-nums text-ink">{r.s}</span>
                            </div>
                        ))}
                    </div>
                    <Button onClick={nextRound} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {round + 1 >= ROUNDS ? 'Final scores' : `Round ${round + 2} — ${named[(round + 1) % named.length]} opens`}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const entries = named.map((n, i) => ({
        name: n,
        score: scores[i] ?? 0,
        expand: (
            <div className="px-4 pb-3 text-sm text-muted">
                Longest chain carried clean: {longest[i] ?? 0} item{(longest[i] ?? 0) === 1 ? '' : 's'}
                {log.some(l => l.breaker === n) ? ` · broke ${log.filter(l => l.breaker === n).length} of ${ROUNDS}` : ' · never broke a chain'}
            </div>
        ),
    }));

    return (
        <EndScreen
            title="Echo"
            onBack={() => setStage('SETUP')}
            onHome={onExit}
            entries={entries}
            accent="theme"
            winnerText={top => `held the longest — ${top.score} points.`}
            playAgainLabel="New board, same crew"
            onPlayAgain={() => setStage('SETUP')}
            exitLabel="Back to Home"
            onExit={onExit}
            footerExtra={
                <div className="max-w-[340px] mx-auto w-full space-y-3">
                    <div className="rounded-xl border p-4 relative overflow-hidden" style={{ borderColor: ACCENT + '55', background: 'var(--c-surface)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] relative z-10" style={{ color: ACCENT }}>The three chains</p>
                        <div className="mt-2 space-y-1.5 relative z-10">
                            {log.map((l, i) => (
                                <p key={i} className="text-[12px] text-ink-soft leading-snug">
                                    <span className="font-bold text-ink">Round {l.round + 1}</span> — reached {l.length}
                                    {l.breaker ? `, ${l.breaker} ${l.reason === 'time' ? 'ran out of time' : 'mis-tapped'}` : ', board exhausted'}
                                </p>
                            ))}
                        </div>
                    </div>
                    <button onClick={share}
                        className="w-full h-12 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT + '99', color: ACCENT }}>
                        <Share2 size={17} /> Share the chain
                    </button>
                    {shareMsg && <p className="text-center text-xs text-muted">{shareMsg}</p>}
                </div>
            }
        />
    );
};

export default EchoGame;
