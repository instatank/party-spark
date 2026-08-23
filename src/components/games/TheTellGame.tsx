import React, { useState, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    VenetianMask, ChevronRight, ChevronDown, Lock, ArrowRight, Eye, EyeOff,
    Wine, Flame, Zap, RotateCcw, Search, Fingerprint, Shuffle,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { shuffle } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playTick, playBuzzEnd, playDing, playReveal } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { useCountdown } from '../../hooks/useCountdown';
import TeamRosterRow from '../ui/TeamRosterRow';
import TimerSetting, { loadTimerPref, saveTimerPref } from '../ui/TimerSetting';
import { PinGateModal, isUnlocked } from '../ui/PinGate';

// "The Tell" — a two-player secret-agenda game living inside Truth or Drink.
// Each round one player (the Operative) is shown a mission only they can see;
// a clock runs with the phone face down while they try to pull it off. When it
// buzzes, their partner has to name what they were up to from three options.
// Read them and they pay; miss and you do.
//
// Two decks: SIPS (drinking, clothes on, funny) and SKIN (after dark). Both
// escalate through three tiers over twelve rounds. Fully offline — the deck is
// a dynamic-imported JSON chunk, no AI, no network.

interface Props { onExit: () => void; }

type Mode = 'sips' | 'skin';
type Stage = 'SETUP' | 'HANDOFF' | 'BRIEF' | 'RUN' | 'DEBRIEF' | 'ACCUSE' | 'VERDICT' | 'END';
type Outcome = 'clean' | 'caught' | 'bust';

interface Mission { t: string; b: string; w: string; l: string; }
interface Tier { name: string; sub: string; bust: string; missions: Mission[]; }
interface ModeData { tiers: Tier[]; }
type TellData = Record<Mode, ModeData>;

// Lazy-loaded so the deck code-splits out of this game's chunk (house pattern).
const dataPromise = import('../../data/the_tell.json').then(m => m.default as unknown as TellData);

const ROUNDS_PER_TIER = 4;
const OPTIONS_PER_GUESS = 3;
const TIMER_KEY = 'the_tell_timer_secs';
const DEFAULT_SECS = 90;

// After Dark shares Intimate Drinking's PIN + storage key on purpose: one
// unlock covers every adult sub-game inside Truth or Drink for the session.
const AFTER_DARK_KEY = 'partyspark_intimate_unlocked';
const AFTER_DARK_PIN = '2525';

// Two palettes: the light variants are darkened ~25% so small caps and the
// verdict headline still hit AA on white surfaces (same rule as TOD's decks).
const ACCENT_DARK: Record<Mode, string> = { sips: '#FBBF24', skin: '#DB2777' };
const ACCENT_LIGHT: Record<Mode, string> = { sips: '#A16207', skin: '#BE185D' };
const CAUGHT_DARK = '#F43F5E';
const CAUGHT_LIGHT = '#BE123C';
const CLEAN_DARK = '#10B981';
const CLEAN_LIGHT = '#047857';

const MODE_META: Record<Mode, { title: string; tagline: string; blurb: string; emoji: string; gated: boolean }> = {
    sips: {
        title: 'Sips',
        tagline: 'Clothes on. Glasses full.',
        blurb: 'Cheeky missions and drinking forfeits. The warm-up — or the whole night.',
        emoji: '🥃',
        gated: false,
    },
    skin: {
        title: 'After Dark',
        tagline: 'Clothes optional. Escalates fast.',
        blurb: 'The same game with its hands where they shouldn’t be. Adults only.',
        emoji: '🔥',
        gated: true,
    },
};

interface Round { tierIdx: number; m: Mission; options: string[]; }

const buildDeck = (data: ModeData): Round[] => {
    const rounds: Round[] = [];
    data.tiers.forEach((tier, tierIdx) => {
        shuffle(tier.missions).slice(0, ROUNDS_PER_TIER).forEach(m => {
            const decoys = shuffle(tier.missions.filter(x => x.t !== m.t))
                .slice(0, OPTIONS_PER_GUESS - 1)
                .map(x => x.t);
            rounds.push({ tierIdx, m, options: shuffle([m.t, ...decoys]) });
        });
    });
    return rounds;
};

// Countdown ring — drains anticlockwise so the last few seconds read as a
// closing gap rather than a growing one.
const R = 54;
const CIRC = 2 * Math.PI * R;
const Ring: React.FC<{ frac: number; accent: string; secs: number; danger: string }> = ({ frac, accent, secs, danger }) => {
    const urgent = secs <= 5;
    return (
        <div className="relative w-[150px] h-[150px] mx-auto">
            <svg viewBox="0 0 130 130" className="w-full h-full -rotate-90">
                <circle cx="65" cy="65" r={R} fill="none" strokeWidth="7" stroke={accent + '26'} />
                <circle
                    cx="65" cy="65" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
                    stroke={urgent ? danger : accent}
                    strokeDasharray={CIRC}
                    strokeDashoffset={CIRC * (1 - frac)}
                    style={{ transition: 'stroke 0.3s linear' }}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span
                    className={`font-black tabular-nums leading-none ${urgent ? 'text-[52px] animate-pulse' : 'text-[46px]'}`}
                    style={{ color: urgent ? danger : 'var(--c-ink, currentColor)' }}
                >
                    {secs}
                </span>
                <span className="text-[10px] uppercase tracking-[0.2em] text-muted mt-1">seconds</span>
            </div>
        </div>
    );
};

export const TheTellGame: React.FC<Props> = ({ onExit }) => {
    const data = use(dataPromise);
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const CAUGHT = light ? CAUGHT_LIGHT : CAUGHT_DARK;
    const CLEAN = light ? CLEAN_LIGHT : CLEAN_DARK;

    const [stage, setStage] = useState<Stage>('SETUP');
    const [mode, setMode] = useState<Mode>('sips');
    const [players, setPlayers] = useState<string[]>([]);
    const [secs, setSecs] = useState(() => loadTimerPref(TIMER_KEY, DEFAULT_SECS));
    const [showGate, setShowGate] = useState(false);
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('the_tell'));

    const [deck, setDeck] = useState<Round[]>([]);
    const [round, setRound] = useState(0);
    const [held, setHeld] = useState(false);
    const [doubled, setDoubled] = useState(false);
    const [outcome, setOutcome] = useState<Outcome>('clean');
    const [guess, setGuess] = useState<string | null>(null);
    // Per-player tallies, indexed by player slot (0 / 1).
    const [cleans, setCleans] = useState<[number, number]>([0, 0]);
    const [reads, setReads] = useState<[number, number]>([0, 0]);

    // Two names, always. The shared session roster feeds them in; blanks fall
    // back to neutral labels so the game is playable without any typing.
    const named = players.map(p => p.trim()).filter(Boolean);
    const name = (i: number): string => named[i] || (i === 0 ? 'Player 1' : 'Player 2');

    const current: Round | undefined = deck[round];
    const tier: Tier | undefined = current ? data[mode].tiers[current.tierIdx] : undefined;
    const accent = ACCENT[mode];
    const opIdx = round % 2;          // whose mission it is this round
    const guessIdx = 1 - opIdx;       // who has to read them
    const isLastRound = round >= deck.length - 1;

    const start = (m: Mode) => {
        hapticLight();
        setMode(m);
        setDeck(buildDeck(data[m]));
        setRound(0);
        setCleans([0, 0]);
        setReads([0, 0]);
        setDoubled(false);
        setHeld(false);
        setStage('HANDOFF');
    };

    const pickMode = (m: Mode) => {
        if (MODE_META[m].gated && !isUnlocked(AFTER_DARK_KEY)) { setMode(m); setShowGate(true); return; }
        start(m);
    };

    const { remainingMs, secondsLeft } = useCountdown({
        running: stage === 'RUN',
        durationMs: secs * 1000,
        restartKey: round,
        onSecond: s => { if (s > 0 && s <= 5) playTick(); },
        onExpire: () => { playBuzzEnd(); hapticHeavy(); setStage('DEBRIEF'); },
    });

    const settle = (o: Outcome, picked: string | null) => {
        setOutcome(o);
        setGuess(picked);
        if (o === 'clean') {
            setCleans(c => { const n: [number, number] = [...c]; n[opIdx] += 1; return n; });
            playDing(); hapticSuccess();
        } else if (o === 'caught') {
            setReads(r => { const n: [number, number] = [...r]; n[guessIdx] += 1; return n; });
            playReveal(); hapticError();
        } else {
            hapticError();
        }
        setStage('VERDICT');
    };

    const nextRound = () => {
        hapticLight();
        setDoubled(false);
        setHeld(false);
        setGuess(null);
        if (isLastRound) { setStage('END'); return; }
        setRound(r => r + 1);
        setStage('HANDOFF');
    };

    // Consent-forward escape hatch: any mission can be swapped for another from
    // the same tier before the clock starts, without ending the round.
    const swapMission = () => {
        if (!current) return;
        hapticLight();
        const pool = data[mode].tiers[current.tierIdx].missions;
        const used = new Set(deck.map(r => r.m.t));
        const spare = pool.filter(m => !used.has(m.t));
        const candidates = spare.length ? spare : pool.filter(m => m.t !== current.m.t);
        const pick = shuffle(candidates)[0];
        const decoys = shuffle(pool.filter(x => x.t !== pick.t))
            .slice(0, OPTIONS_PER_GUESS - 1)
            .map(x => x.t);
        setDeck(d => d.map((r, i) => (
            i === round ? { tierIdx: r.tierIdx, m: pick, options: shuffle([pick.t, ...decoys]) } : r
        )));
        setHeld(false);
    };

    const backToSetup = () => {
        setStage('SETUP');
        setDeck([]);
        setRound(0);
        setHeld(false);
        setDoubled(false);
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The Tell" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🎭</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            One of you has a <em>secret agenda</em>.
                        </h2>
                        <p className="text-muted text-sm px-6">
                            The other has {secs} seconds to work out what it is.
                        </p>
                    </div>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {(['sips', 'skin'] as Mode[]).map(m => {
                            const meta = MODE_META[m];
                            const c = ACCENT[m];
                            return (
                                <button key={m} onClick={() => pickMode(m)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer">
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3.5 px-4 transition-colors overflow-hidden">
                                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: c }} />
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: c }} />
                                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${c}2E, transparent 62%)` }} />
                                        <div className="flex items-center gap-3 relative">
                                            <span className="flex-shrink-0" style={{ color: c }}>
                                                {m === 'sips' ? <Wine size={18} /> : <Flame size={18} />}
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
                        <div className="flex justify-center mt-1">
                            <TimerSetting duration={secs} accent={ACCENT.sips}
                                onPick={s => { setSecs(s); saveTimerPref(TIMER_KEY, s); }} />
                        </div>
                    </div>

                    {/* How to play */}
                    <div className="max-w-[340px] mx-auto w-full mt-5">
                        <button onClick={() => setShowRules(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink text-sm font-bold">
                            <span className="flex items-center gap-2"><Search size={14} className="text-muted" /> How to play</span>
                            <ChevronDown size={16} className={`text-muted transition-transform ${showRules ? 'rotate-180' : ''}`} />
                        </button>
                        {showRules && (
                            <div className="mt-2 px-4 py-3.5 rounded-xl bg-surface border border-divider text-sm text-ink-soft leading-relaxed animate-slide-up space-y-2">
                                <p><span className="font-bold text-ink">1.</span> The phone shows one of you a secret mission. The other must not see it.</p>
                                <p><span className="font-bold text-ink">2.</span> Phone goes face down. You have {secs} seconds to pull the mission off — without making it obvious what you're doing.</p>
                                <p><span className="font-bold text-ink">3.</span> At the buzzer, your partner names what you were up to. Three options, one is real.</p>
                                <p><span className="font-bold text-ink">4.</span> Read correctly and they pay the forfeit. Miss, and you do.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Twelve rounds, taking turns, getting worse as it goes. Any mission can be
                                    traded — say so out loud and your partner writes you a new one.
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

    if (!current || !tier) return null;

    const tierLine = `${tier.name} · Round ${round + 1} of ${deck.length}`;

    // ---------------- HANDOFF ----------------
    if (stage === 'HANDOFF') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The Tell" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${accent}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: accent }}>{tierLine}</p>
                        <p className="text-sm italic text-muted mt-1.5 relative z-10">{tier.sub}</p>
                        <VenetianMask size={34} className="mx-auto mt-6 relative z-10" style={{ color: accent }} />
                        <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-4 relative z-10">
                            Phone to {name(opIdx)}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            {name(guessIdx)} — eyes off. You'll get your turn to catch them.
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); setHeld(false); setDoubled(false); setStage('BRIEF'); }}
                        fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        I've got it <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- BRIEF (secret — press and hold) ----------------
    if (stage === 'BRIEF') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Your mission" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: accent }}>
                        {name(opIdx)}'s eyes only
                    </p>

                    <div
                        onPointerDown={() => { setHeld(true); hapticLight(); }}
                        onPointerUp={() => setHeld(false)}
                        onPointerLeave={() => setHeld(false)}
                        onPointerCancel={() => setHeld(false)}
                        onContextMenu={e => e.preventDefault()}
                        className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-8 text-center relative overflow-hidden select-none touch-none cursor-pointer flex flex-col justify-center"
                        style={{ boxShadow: 'var(--shadow-card)', borderColor: accent + '66', minHeight: 260, WebkitTouchCallout: 'none' }}
                    >
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${accent}2E, transparent 62%)` }} />
                        <div
                            className="relative z-10 transition-all duration-200"
                            style={held ? {} : { filter: 'blur(11px)', opacity: 0.45 }}
                            aria-hidden={!held}
                        >
                            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted">{tier.name}</p>
                            <p className="font-serif font-black text-[27px] leading-[1.15] text-ink mt-3">{current.m.b}</p>
                        </div>
                        {!held && (
                            <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
                                <Fingerprint size={30} style={{ color: accent }} />
                                <p className="text-sm font-bold text-ink mt-2">Press and hold to read</p>
                                <p className="text-xs text-muted mt-0.5">Let go and it hides again.</p>
                            </div>
                        )}
                    </div>

                    <button onClick={swapMission}
                        className="mx-auto mt-3 text-xs font-bold text-muted hover:text-ink flex items-center gap-1.5 transition-colors">
                        <Shuffle size={12} /> Not this one — swap it
                    </button>

                    {/* Double Down — a private bluff. Their partner never sees it
                        until the verdict. */}
                    <button
                        onClick={() => { setDoubled(d => !d); hapticLight(); }}
                        className="max-w-[340px] mx-auto w-full mt-4 flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors text-left"
                        style={doubled
                            ? { borderColor: accent, background: accent + '1F' }
                            : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}
                    >
                        <Zap size={17} style={{ color: doubled ? accent : 'var(--c-muted)' }} className="flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-ink leading-tight">
                                Double down {doubled && <span style={{ color: accent }}>· on</span>}
                            </p>
                            <p className="text-[11px] text-muted leading-snug">
                                Both the reward and the forfeit double. They won't know until it's over.
                            </p>
                        </div>
                    </button>

                    <Button onClick={() => { hapticLight(); setHeld(false); setStage('RUN'); }}
                        fullWidth className="h-14 text-lg mt-4 max-w-[340px] mx-auto w-full">
                        <EyeOff className="inline mr-2" size={20} /> Start the clock
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- RUN ----------------
    if (stage === 'RUN') {
        const frac = Math.max(0, Math.min(1, remainingMs / (secs * 1000)));
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The Tell" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-8 text-center relative overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${accent}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: accent }}>
                            {name(opIdx)} is up to something
                        </p>
                        <div className="mt-5 relative z-10"><Ring frac={frac} accent={accent} secs={Math.max(0, secondsLeft)} danger={CAUGHT} /></div>
                        <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">
                            Phone face down. Go and do it — and don't let {name(guessIdx)} work out what
                            <em> it </em> is.
                        </p>
                        {doubled && (
                            <p className="text-[11px] font-bold uppercase tracking-[0.2em] mt-3 relative z-10" style={{ color: accent }}>
                                ⚡ Doubled
                            </p>
                        )}
                    </div>
                    <button onClick={() => { hapticLight(); playBuzzEnd(); setStage('DEBRIEF'); }}
                        className="mx-auto mt-6 text-xs font-bold text-muted hover:text-ink flex items-center gap-1.5 transition-colors">
                        Done early — stop the clock <ArrowRight size={13} />
                    </button>
                </div>
            </div>
        );
    }

    // ---------------- DEBRIEF (operative self-reports) ----------------
    if (stage === 'DEBRIEF') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Time" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-8 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${accent}2E, transparent 62%)` }} />
                        <p className="text-3xl relative z-10">⏱</p>
                        <h2 className="font-serif font-black text-[32px] leading-tight text-ink mt-3 relative z-10">
                            {name(opIdx)} — did you pull it off?
                        </h2>
                        <p className="text-sm text-muted leading-relaxed mt-3 relative z-10">
                            Honour system. They'll find out either way.
                        </p>
                    </div>
                    {/* Negative left, positive right — house convention. */}
                    <div className="grid grid-cols-2 gap-3 mt-6 max-w-[340px] mx-auto w-full">
                        <button onClick={() => settle('bust', null)}
                            className="h-14 rounded-lg font-bold bg-transparent border-2 border-rose-500/60 text-rose-600 hover:bg-rose-500/10 hover:border-rose-500 transition-colors active:scale-95">
                            I bottled it
                        </button>
                        <button onClick={() => { hapticLight(); setStage('ACCUSE'); }}
                            className="h-14 rounded-lg font-bold bg-transparent border-2 border-emerald-500/60 text-emerald-600 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors active:scale-95">
                            Nailed it
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- ACCUSE ----------------
    if (stage === 'ACCUSE') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Name it" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="text-center mb-5">
                        <VenetianMask size={30} className="mx-auto" style={{ color: accent }} />
                        <h2 className="font-serif font-black text-[28px] leading-tight text-ink mt-3 px-4">
                            {name(guessIdx)} — what were they up to?
                        </h2>
                        <p className="text-sm text-muted mt-1.5">One of these is the real mission.</p>
                    </div>
                    <div className="grid gap-2.5 max-w-[340px] mx-auto w-full">
                        {current.options.map(opt => (
                            <button key={opt}
                                onClick={() => settle(opt === current.m.t ? 'caught' : 'clean', opt)}
                                className="w-full text-left px-4 py-3.5 rounded-xl bg-surface-alt border border-divider hover:bg-app-tint hover:border-ink-soft/40 transition-colors active:scale-[0.99]">
                                <span className="text-[15px] font-bold text-ink leading-snug">“{opt}”</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- VERDICT ----------------
    if (stage === 'VERDICT') {
        const isBust = outcome === 'bust';
        const isCaught = outcome === 'caught';
        const c = isCaught || isBust ? CAUGHT : CLEAN;
        const headline = isBust ? 'Bottled it' : isCaught ? 'Caught' : 'Clean getaway';
        const emoji = isBust ? '🫠' : isCaught ? '🎯' : '🕶️';
        const sub = isBust
            ? `${name(opIdx)} never got there.`
            : isCaught
                ? `${name(guessIdx)} read ${name(opIdx)} like a book.`
                : `${name(guessIdx)} had no idea.`;
        const consequence = isBust ? tier.bust : isCaught ? current.m.l : current.m.w;
        const payer = isBust || isCaught ? name(opIdx) : name(guessIdx);

        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Verdict" onBack={backToSetup} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: c + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${c}2E, transparent 62%)` }} />
                        <p className="text-3xl relative z-10">{emoji}</p>
                        <h2 className="font-serif font-black text-[36px] leading-none mt-2 relative z-10" style={{ color: c }}>{headline}</h2>
                        <p className="text-sm text-muted mt-2 relative z-10">{sub}</p>

                        {/* The reveal — the punchline of the round. */}
                        <div className="mt-5 pt-4 border-t border-divider relative z-10">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">The mission was</p>
                            <p className="font-serif font-black text-[22px] leading-tight text-ink mt-1.5">“{current.m.t}”</p>
                            {guess && !isCaught && (
                                <p className="text-xs text-muted mt-2 italic">{name(guessIdx)} guessed “{guess}”.</p>
                            )}
                        </div>

                        <div className="mt-5 pt-4 border-t border-divider relative z-10">
                            <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: c }}>
                                {payer} pays{doubled && ' · ⚡ doubled'}
                            </p>
                            <p className="text-[15px] text-ink-soft leading-relaxed mt-2">{consequence}</p>
                            {doubled && (
                                <p className="text-xs font-bold mt-2" style={{ color: accent }}>
                                    They doubled down — so all of that, twice.
                                </p>
                            )}
                        </div>
                    </div>

                    <Button onClick={nextRound} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {isLastRound ? 'See how it ended' : `Next round — ${name(guessIdx)}'s turn`}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const total = (i: 0 | 1) => cleans[i] + reads[i];
    const lead = total(0) - total(1);
    const winner = lead === 0 ? null : lead > 0 ? 0 : 1;
    const verdict = lead === 0
        ? 'Dead even. Neither of you can be trusted, and neither of you can be fooled.'
        : Math.abs(lead) >= 5
            ? `${name(winner as 0 | 1)} played ${name(1 - (winner as number))} all night. It wasn't close.`
            : `${name(winner as 0 | 1)} edges it — barely. Rematch is the only honourable option.`;

    return (
        <div className="h-full flex flex-col animate-fade-in">
            <ScreenHeader title="The Tell" onBack={backToSetup} onHome={onExit} />
            <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${accent}2E, transparent 62%)` }} />
                    <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: accent }}>
                        Twelve rounds · {MODE_META[mode].title}
                    </p>
                    <p className="text-3xl mt-3 relative z-10">🎭</p>
                    <h2 className="font-serif font-black text-[30px] leading-tight text-ink mt-2 relative z-10">
                        {winner === null ? 'A perfect stalemate' : `${name(winner)} wins the night`}
                    </h2>

                    <div className="grid grid-cols-2 gap-3 mt-6 relative z-10">
                        {([0, 1] as const).map(i => (
                            <div key={i} className="rounded-xl border p-3"
                                style={{ borderColor: winner === i ? accent : 'var(--c-border)', background: winner === i ? accent + '14' : 'transparent' }}>
                                <p className="text-sm font-bold text-ink truncate">{name(i)}</p>
                                <p className="font-black text-[30px] leading-none mt-1" style={{ color: winner === i ? accent : 'var(--c-ink)' }}>{total(i)}</p>
                                <p className="text-[10px] uppercase tracking-wider text-muted mt-1.5">
                                    {cleans[i]} clean · {reads[i]} read{reads[i] === 1 ? '' : 's'}
                                </p>
                            </div>
                        ))}
                    </div>

                    <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">{verdict}</p>
                    <p className="text-[11px] text-muted mt-4 relative z-10 flex items-center justify-center gap-1.5">
                        <Eye size={12} className="flex-shrink-0" /> Whatever's still owed is still owed.
                    </p>
                </div>

                <Button onClick={() => start(mode)} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                    <RotateCcw className="inline mr-2" size={19} /> Run it back
                </Button>
                <button onClick={backToSetup}
                    className="mx-auto mt-4 text-xs font-bold text-muted hover:text-ink flex items-center gap-1 transition-colors">
                    Switch deck <ArrowRight size={13} />
                </button>
            </div>
        </div>
    );
};

export default TheTellGame;
