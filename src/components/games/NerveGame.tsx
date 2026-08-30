import React, { useState, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    Activity, ChevronRight, ChevronDown, Lock, ArrowRight, ArrowBigUp, Flag,
    Wine, Flame, RotateCcw, Shuffle, Trophy,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { shuffle } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playDing, playBuzzEnd, playReveal } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import TeamRosterRow from '../ui/TeamRosterRow';
import { PinGateModal, isUnlocked } from '../ui/PinGate';

// "Nerve" — two-player chicken, living inside Truth or Drink. One ladder of
// escalating dares; players alternate. On your turn you either DO the rung
// (the ladder climbs and passes to your partner) or FOLD (round over, you pay
// the forfeit printed on the rung you wouldn't take). Clear the whole ladder
// and you win the round outright.
//
// Unlike The Tell there is no timer and no RNG in the play loop — the only
// pressure is which of you blinks first. Folding is the game's core verb, not
// a failure state, which is also what makes the exit ramp part of the design
// rather than a footnote.
//
// Two decks: SIPS (drinking, clothes on) and SKIN (after dark, PIN-gated).
// Fully offline; the ladder is a dynamic-imported JSON chunk.

interface Props { onExit: () => void; }

type Deck = 'sips' | 'skin';
type Stage = 'SETUP' | 'ROUND_INTRO' | 'TURN' | 'FOLD' | 'CLEARED' | 'END';

interface Rung { t: string; d: string; f: string; }
interface Tier { name: string; sub: string; rules: string; top: string; rungs: Rung[]; }
interface DeckData { tiers: Tier[]; }
type NerveData = Record<Deck, DeckData>;

const dataPromise = import('../../data/nerve.json').then(m => m.default as unknown as NerveData);

const RUNGS_PER_ROUND = 6;   // drawn in order from the tier's 8, so it still escalates
const TOTAL_ROUNDS = 3;      // one per tier
const SWAPS_PER_ROUND = 1;   // per player

// Shares Intimate Drinking's PIN + key so one unlock covers every adult
// sub-game inside Truth or Drink for the session.
const AFTER_DARK_KEY = 'partyspark_intimate_unlocked';
const AFTER_DARK_PIN = '2525';

// Cool + high-voltage, deliberately clear of the warm hues already used by
// Intimate Drinking (rose), Slow Burn (amber→rose) and The Tell (amber→pink).
const ACCENT_DARK: Record<Deck, string> = { sips: '#06B6D4', skin: '#8B5CF6' };
const ACCENT_LIGHT: Record<Deck, string> = { sips: '#0E7490', skin: '#6D28D9' };
const FOLD_DARK = '#F43F5E';
const FOLD_LIGHT = '#BE123C';
const HOLD_DARK = '#10B981';
const HOLD_LIGHT = '#047857';

const DECK_META: Record<Deck, { title: string; tagline: string; emoji: string; gated: boolean }> = {
    sips: { title: 'Sips', tagline: 'Clothes on. Glasses full.', emoji: '🥃', gated: false },
    skin: { title: 'After Dark', tagline: 'Clothes optional. Climbs fast.', emoji: '🔥', gated: true },
};

// A ladder is stored as AUTHORED INDICES into the tier, never as loose rung
// objects: the whole game rests on the ladder escalating, so every operation
// on it (including swaps) has to be able to reason about relative height.
// Pick RUNGS_PER_ROUND at random, then sort — random content, fixed direction.
const buildLadder = (tier: Tier): number[] =>
    shuffle(tier.rungs.map((_, i) => i)).slice(0, RUNGS_PER_ROUND).sort((a, b) => a - b);

// The signature UI: a rung meter. Cleared rungs fill, the live one glows,
// the ones above stay faint — the climb is legible at a glance.
const Ladder: React.FC<{ total: number; current: number; accent: string }> = ({ total, current, accent }) => (
    <div className="flex items-end justify-center gap-1.5" aria-hidden>
        {Array.from({ length: total }).map((_, i) => {
            const done = i < current;
            const live = i === current;
            return (
                <div
                    key={i}
                    className="rounded-full transition-all duration-300"
                    style={{
                        width: live ? 30 : 20,
                        height: live ? 7 : 5,
                        background: done || live ? accent : 'var(--c-border)',
                        opacity: done ? 0.55 : 1,
                        boxShadow: live ? `0 0 12px ${accent}99` : 'none',
                    }}
                />
            );
        })}
    </div>
);

export const NerveGame: React.FC<Props> = ({ onExit }) => {
    const data = use(dataPromise);
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const FOLD_C = light ? FOLD_LIGHT : FOLD_DARK;
    const HOLD_C = light ? HOLD_LIGHT : HOLD_DARK;

    const [stage, setStage] = useState<Stage>('SETUP');
    const [deck, setDeck] = useState<Deck>('sips');
    const [players, setPlayers] = useState<string[]>([]);
    const [showGate, setShowGate] = useState(false);
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('nerve'));

    const [round, setRound] = useState(0);              // 0..2, also the tier index
    const [ladder, setLadder] = useState<number[]>([]);
    const [rungIdx, setRungIdx] = useState(0);
    const [wins, setWins] = useState<[number, number]>([0, 0]);
    const [swaps, setSwaps] = useState<[number, number]>([SWAPS_PER_ROUND, SWAPS_PER_ROUND]);
    const [folder, setFolder] = useState(0);
    const [clearedBy, setClearedBy] = useState(0);

    const named = players.map(p => p.trim()).filter(Boolean);
    const name = (i: number): string => named[i] || (i === 0 ? 'Player 1' : 'Player 2');

    const accent = ACCENT[deck];
    const tier: Tier | undefined = data[deck].tiers[round];
    const rung: Rung | undefined = tier && ladder[rungIdx] !== undefined ? tier.rungs[ladder[rungIdx]] : undefined;
    // Rounds alternate who opens, so neither player always draws the first rung.
    const opener = round % 2;
    const turn = (opener + rungIdx) % 2;
    const other = 1 - turn;
    const isTopRung = rungIdx === ladder.length - 1;

    const startRound = (r: number, d: Deck = deck) => {
        setLadder(buildLadder(data[d].tiers[r]));
        setRungIdx(0);
        setSwaps([SWAPS_PER_ROUND, SWAPS_PER_ROUND]);
        setStage('ROUND_INTRO');
    };

    const start = (d: Deck) => {
        hapticLight();
        setDeck(d);
        setRound(0);
        setWins([0, 0]);
        startRound(0, d);
    };

    const pickDeck = (d: Deck) => {
        if (DECK_META[d].gated && !isUnlocked(AFTER_DARK_KEY)) { setDeck(d); setShowGate(true); return; }
        start(d);
    };

    const doIt = () => {
        if (isTopRung) {
            setClearedBy(turn);
            setWins(w => { const n: [number, number] = [...w]; n[turn] += 1; return n; });
            playDing(); hapticSuccess();
            setStage('CLEARED');
            return;
        }
        hapticLight();
        setRungIdx(i => i + 1);
    };

    const fold = () => {
        setFolder(turn);
        setWins(w => { const n: [number, number] = [...w]; n[other] += 1; return n; });
        playBuzzEnd(); hapticError();
        setStage('FOLD');
    };

    // One swap each per round — the consent affordance that doesn't undercut
    // the chicken (you still have to take a rung at this height).
    // Eligible replacements are the unused rungs that sit ABOVE the last rung
    // already taken — anything lower would make the ladder descend.
    const spareRungs = (): number[] => {
        if (!tier) return [];
        const floor = rungIdx > 0 ? ladder[rungIdx - 1] : -1;
        const inUse = new Set(ladder);
        return tier.rungs.map((_, i) => i).filter(i => !inUse.has(i) && i > floor);
    };
    const canSwap = swaps[turn] > 0 && spareRungs().length > 0;

    const swapRung = () => {
        if (!canSwap) return;
        hapticLight(); playReveal();
        const pick = shuffle(spareRungs())[0];
        // Substitute, then re-sort the unplayed tail so the climb still rises.
        const tail = ladder.slice(rungIdx);
        tail[0] = pick;
        tail.sort((a, b) => a - b);
        setLadder([...ladder.slice(0, rungIdx), ...tail]);
        setSwaps(s => { const n: [number, number] = [...s]; n[turn] -= 1; return n; });
    };

    const nextRound = () => {
        hapticLight();
        if (round >= TOTAL_ROUNDS - 1) { hapticHeavy(); setStage('END'); return; }
        const r = round + 1;
        setRound(r);
        startRound(r);
    };

    const backToSetup = () => {
        setStage('SETUP');
        setLadder([]);
        setRungIdx(0);
        setRound(0);
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Nerve" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🪜</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            One ladder. <em>Who blinks first?</em>
                        </h2>
                        <p className="text-muted text-sm px-6">
                            Every rung is worse than the last. Do it, or fold and pay.
                        </p>
                    </div>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {(['sips', 'skin'] as Deck[]).map(d => {
                            const meta = DECK_META[d];
                            const c = ACCENT[d];
                            return (
                                <button key={d} onClick={() => pickDeck(d)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer">
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3.5 px-4 transition-colors overflow-hidden">
                                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: c }} />
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: c }} />
                                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${c}2E, transparent 62%)` }} />
                                        <div className="flex items-center gap-3 relative">
                                            <span className="flex-shrink-0" style={{ color: c }}>
                                                {d === 'sips' ? <Wine size={18} /> : <Flame size={18} />}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{meta.title}</span>
                                                    <span className="text-sm flex-shrink-0">{meta.emoji}</span>
                                                    {meta.gated && !isUnlocked(AFTER_DARK_KEY) && <Lock size={12} className="text-muted flex-shrink-0" />}
                                                </h3>
                                                <p className="text-xs text-muted leading-snug">{meta.tagline}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-4">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={2} />
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-4">
                        <button onClick={() => setShowRules(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink text-sm font-bold">
                            <span className="flex items-center gap-2"><Activity size={14} className="text-muted" /> How to play</span>
                            <ChevronDown size={16} className={`text-muted transition-transform ${showRules ? 'rotate-180' : ''}`} />
                        </button>
                        {showRules && (
                            <div className="mt-2 px-4 py-3.5 rounded-xl bg-surface border border-divider text-sm text-ink-soft leading-relaxed animate-slide-up space-y-2">
                                <p><span className="font-bold text-ink">1.</span> You climb one ladder together, taking turns. Every rung is worse than the one below it.</p>
                                <p><span className="font-bold text-ink">2.</span> On your turn: <span className="font-bold text-ink">do it</span> and the ladder passes to them one rung higher — or <span className="font-bold text-ink">fold</span>.</p>
                                <p><span className="font-bold text-ink">3.</span> Folding ends the round. You pay the forfeit printed on the rung you wouldn't take, and they win it.</p>
                                <p><span className="font-bold text-ink">4.</span> Clear the whole ladder and you win the round outright. Best of three.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Folding is a move, not a failure — it's how the game ends. You also get one
                                    swap each per round if a rung isn't your thing.
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                {showGate && (
                    <PinGateModal
                        pin={AFTER_DARK_PIN}
                        storageKey={AFTER_DARK_KEY}
                        title="After Dark"
                        subtitle="Enter the 4-digit PIN for this content"
                        onSuccess={() => { setShowGate(false); start('skin'); }}
                        onCancel={() => setShowGate(false)}
                    />
                )}
            </div>
        );
    }

    if (!tier) return null;

    // ---------------- ROUND INTRO ----------------
    if (stage === 'ROUND_INTRO') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Nerve" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${accent}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: accent }}>
                            Round {round + 1} of {TOTAL_ROUNDS}
                        </p>
                        <ArrowBigUp size={32} className="mx-auto mt-4 relative z-10" style={{ color: accent }} />
                        <h2 className="font-serif font-black text-[38px] leading-tight text-ink mt-2 relative z-10">{tier.name}</h2>
                        <p className="text-sm italic text-muted mt-1 relative z-10">{tier.sub}</p>
                        <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">{tier.rules}</p>
                        <p className="text-[11px] text-muted mt-4 relative z-10">
                            {name(opener)} takes the first rung.
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); setStage('TURN'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Start climbing <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- TURN ----------------
    if (stage === 'TURN' && rung) {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Nerve" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="px-2 flex-1 flex flex-col">
                    <div className="max-w-[340px] mx-auto w-full mb-3">
                        <div className="flex items-baseline justify-between mb-2">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>
                                Round {round + 1} · {tier.name}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                                Rung {rungIdx + 1} of {ladder.length}
                            </span>
                        </div>
                        <Ladder total={ladder.length} current={rungIdx} accent={accent} />
                    </div>

                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: accent + '55' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${accent}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] relative z-10" style={{ color: accent }}>
                            {name(turn)}, you're up
                        </p>
                        <p className="font-serif font-black text-[27px] leading-[1.15] text-ink mt-4 relative z-10">{rung.t}</p>
                        <p className="text-sm text-muted italic mt-3 relative z-10">{rung.d}</p>
                        {isTopRung && (
                            <p className="text-[10px] font-black uppercase tracking-[0.22em] mt-5 relative z-10" style={{ color: accent }}>
                                ⚡ Top rung — do this and you take the round
                            </p>
                        )}
                    </div>

                    {/* Negative left, positive right — house convention. */}
                    <div className="grid grid-cols-2 gap-3 mt-5 max-w-[340px] mx-auto w-full">
                        <button onClick={fold}
                            className="h-16 rounded-lg font-bold bg-transparent border-2 transition-colors active:scale-95 flex flex-col items-center justify-center gap-0.5"
                            style={{ borderColor: FOLD_C + '99', color: FOLD_C }}>
                            <Flag size={16} />
                            <span>Fold</span>
                        </button>
                        <button onClick={doIt}
                            className="h-16 rounded-lg font-bold bg-transparent border-2 transition-colors active:scale-95 flex flex-col items-center justify-center gap-0.5"
                            style={{ borderColor: HOLD_C + '99', color: HOLD_C }}>
                            <ArrowBigUp size={16} />
                            <span>Do it</span>
                        </button>
                    </div>

                    {canSwap ? (
                        <button onClick={swapRung}
                            className="mx-auto mt-4 text-xs font-bold text-muted hover:text-ink flex items-center gap-1.5 transition-colors">
                            <Shuffle size={12} /> Not this one — swap it ({swaps[turn]} left)
                        </button>
                    ) : (
                        <p className="text-center text-[11px] text-muted mt-4">
                            {swaps[turn] > 0 ? 'Nothing left to swap in at this height.' : 'No swaps left this round.'}
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // ---------------- FOLD ----------------
    if (stage === 'FOLD' && rung) {
        const dodged = ladder[rungIdx + 1] !== undefined ? tier.rungs[ladder[rungIdx + 1]] : undefined;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Folded" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: FOLD_C + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${FOLD_C}2E, transparent 62%)` }} />
                        <p className="text-3xl relative z-10">🏳️</p>
                        <h2 className="font-serif font-black text-[34px] leading-none mt-2 relative z-10" style={{ color: FOLD_C }}>
                            {name(folder)} folds
                        </h2>
                        <p className="text-sm text-muted mt-2 relative z-10">
                            Round {round + 1} goes to {name(1 - folder)}.
                        </p>

                        <div className="mt-5 pt-4 border-t border-divider relative z-10">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Wouldn't do</p>
                            <p className="font-serif font-black text-[19px] leading-tight text-ink mt-1.5">“{rung.t}”</p>
                        </div>

                        <div className="mt-5 pt-4 border-t border-divider relative z-10">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: FOLD_C }}>The price</p>
                            <p className="text-[15px] text-ink-soft leading-relaxed mt-2">{rung.f}</p>
                        </div>

                        {dodged && (
                            <div className="mt-5 pt-4 border-t border-divider relative z-10">
                                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">And what was next…</p>
                                <p className="text-[15px] italic text-ink-soft leading-relaxed mt-2">“{dodged.t}”</p>
                            </div>
                        )}
                    </div>
                    <Button onClick={nextRound} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {round >= TOTAL_ROUNDS - 1 ? 'See how it ended' : `Round ${round + 2} — ${data[deck].tiers[round + 1].name}`}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- CLEARED ----------------
    if (stage === 'CLEARED') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Ladder cleared" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-8 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: accent + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${accent}33, transparent 62%)` }} />
                        <p className="text-3xl relative z-10">🪜</p>
                        <h2 className="font-serif font-black text-[32px] leading-tight text-ink mt-2 relative z-10">
                            {name(clearedBy)} cleared it
                        </h2>
                        <p className="text-sm text-muted mt-2 relative z-10">Nobody blinked. All the way to the top.</p>
                        <div className="mt-5 pt-4 border-t border-divider relative z-10">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: accent }}>
                                {name(1 - clearedBy)} pays
                            </p>
                            <p className="text-[15px] text-ink-soft leading-relaxed mt-2">{tier.top}</p>
                        </div>
                    </div>
                    <Button onClick={nextRound} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {round >= TOTAL_ROUNDS - 1 ? 'See how it ended' : `Round ${round + 2} — ${data[deck].tiers[round + 1].name}`}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const lead = wins[0] - wins[1];
    const winner = lead === 0 ? null : lead > 0 ? 0 : 1;
    const verdict = lead === 0
        ? 'Honours even. You are both exactly as shameless as each other.'
        : Math.abs(lead) >= 3
            ? `${name(winner as 0 | 1)} never blinked once. ${name(1 - (winner as number))} has some thinking to do.`
            : `${name(winner as 0 | 1)} takes it. Close enough that a rematch is basically compulsory.`;

    return (
        <div className="h-full flex flex-col animate-fade-in">
            <ScreenHeader title="Nerve" onBack={backToSetup} onHome={onExit} />
            <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${accent}2E, transparent 62%)` }} />
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: accent }}>
                        Best of three · {DECK_META[deck].title}
                    </p>
                    <Trophy size={30} className="mx-auto mt-4 relative z-10" style={{ color: accent }} />
                    <h2 className="font-serif font-black text-[30px] leading-tight text-ink mt-2 relative z-10">
                        {winner === null ? 'A dead heat' : `${name(winner)} has the nerve`}
                    </h2>

                    <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
                        {([0, 1] as const).map(i => (
                            <div key={i} className="rounded-xl border p-3"
                                style={{ borderColor: winner === i ? accent : 'var(--c-border)', background: winner === i ? accent + '14' : 'transparent' }}>
                                <p className="text-sm font-bold text-ink truncate">{name(i)}</p>
                                <p className="font-black text-[30px] leading-none mt-1" style={{ color: winner === i ? accent : 'var(--c-ink)' }}>{wins[i]}</p>
                                <p className="text-[10px] uppercase tracking-wider text-muted mt-1.5">
                                    round{wins[i] === 1 ? '' : 's'} won
                                </p>
                            </div>
                        ))}
                    </div>

                    <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">{verdict}</p>
                </div>

                <Button onClick={() => start(deck)} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                    <RotateCcw className="inline mr-2" size={19} /> Climb again
                </Button>
                <button onClick={backToSetup}
                    className="mx-auto mt-4 text-xs font-bold text-muted hover:text-ink flex items-center gap-1 transition-colors">
                    Switch deck <ArrowRight size={13} />
                </button>
            </div>
        </div>
    );
};

export default NerveGame;
