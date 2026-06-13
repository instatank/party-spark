import React, { useState, useRef, useEffect } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Dices, Flame, Hourglass, Repeat, ChevronRight, ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// "Intimate Drinking" — a pair of adult two-dice games surfaced inside Truth or
// Drink and gated by its own PIN. Each roll randomizes two dice; the numbers
// map to an action + a target (Option 1) or a sensation + a duration (Option 2).
// Fully offline, no data files — the mappings live here.

interface Props { onExit: () => void; }

type DiceOption = 'action' | 'countdown' | 'positions';

const ROSE = '#F43F5E';

// --- Option 1: The Action -------------------------------------------------
const ACTION_DIE: { t: string; d: string }[] = [
    { t: 'Kiss', d: 'Playful or passionate' },
    { t: 'Massage', d: 'Using hands or oil' },
    { t: 'Blow / Breathe', d: 'Warm breath or a cool breeze' },
    { t: 'Trace', d: 'Using fingertips or a feather' },
    { t: 'Nibble / Bite', d: 'Gently' },
    { t: 'Wild Card', d: 'Roller chooses the action' },
];
const ZONE_DIE: string[] = [
    'Neck / Collarbone', 'Lips / Ears', 'Chest / Stomach', 'Inner Thighs', 'Lower Back', "Roller's Choice",
];

// --- Option 2: The High-Stakes Countdown ----------------------------------
const SENSATION_DIE: string[] = [
    'Whisper a specific fantasy or secret',
    'Trace skin with an ice cube',
    'Blindfold your partner and touch them anywhere',
    'Slow kiss without using hands',
    'Light scratch or tickle',
    "Take off one item of your partner's clothes",
];

// --- Option 5: Positions (the main event) ---------------------------------
const POSITION_DIE: string[] = [
    'You on top', 'Them on top', 'From behind', 'Face to face, wrapped up', 'Seated', "Roller's pick",
];
const MODIFIER_DIE: string[] = [
    'for 60 seconds', 'until you switch', 'eyes locked — no looking away', 'no hands', 'in slow motion', 'partner sets the pace',
];

const OPTIONS: { id: DiceOption; title: string; tagline: string; Icon: LucideIcon }[] = [
    { id: 'action', title: 'The Action', tagline: 'An action + where to do it.', Icon: Flame },
    { id: 'countdown', title: 'The High-Stakes Countdown', tagline: 'A sensation + how long to hold it.', Icon: Hourglass },
    { id: 'positions', title: 'Positions', tagline: 'A position + a twist.', Icon: Repeat },
];

const META: Record<DiceOption, { title: string; d1: string; d2: string }> = {
    action: { title: 'The Action', d1: 'Action', d2: 'Target Zone' },
    countdown: { title: 'The High-Stakes Countdown', d1: 'Sensation', d2: 'Duration' },
    positions: { title: 'Positions', d1: 'Position', d2: 'Twist' },
};

// classic die-face pip layout over a 3×3 grid (indices 0–8)
const PIPS: Record<number, number[]> = {
    1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8],
};

const DieFace: React.FC<{ value: number; rolling: boolean }> = ({ value, rolling }) => (
    <div className={`w-20 h-20 rounded-2xl bg-white border border-black/10 shadow-lg grid grid-cols-3 grid-rows-3 gap-0.5 p-2.5 ${rolling ? 'animate-pulse' : ''}`}>
        {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center">
                {PIPS[value]?.includes(i) && <span className="w-3 h-3 rounded-full" style={{ background: '#1a1a1a' }} />}
            </div>
        ))}
    </div>
);

const rand = () => 1 + Math.floor(Math.random() * 6);

export const IntimateDiceGame: React.FC<Props> = ({ onExit }) => {
    const [option, setOption] = useState<DiceOption | null>(null);
    const [d1, setD1] = useState(1);
    const [d2, setD2] = useState(1);
    const [rolling, setRolling] = useState(false);
    const [rolled, setRolled] = useState(false);
    const flickRef = useRef<number | null>(null);

    useEffect(() => () => { if (flickRef.current) clearInterval(flickRef.current); }, []);

    const roll = () => {
        if (rolling) return;
        setRolling(true);
        setRolled(false);
        if (flickRef.current) clearInterval(flickRef.current);
        flickRef.current = window.setInterval(() => { setD1(rand()); setD2(rand()); }, 70);
        window.setTimeout(() => {
            if (flickRef.current) { clearInterval(flickRef.current); flickRef.current = null; }
            setD1(rand());
            setD2(rand());
            setRolling(false);
            setRolled(true);
        }, 650);
    };

    const resetTo = (next: DiceOption | null) => {
        if (flickRef.current) { clearInterval(flickRef.current); flickRef.current = null; }
        setRolling(false);
        setRolled(false);
        setOption(next);
    };

    // ---- OPTION SELECT ----
    if (!option) {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Intimate Drinking" onBack={onExit} onHome={onExit} />
                <div className="text-center mb-4 -mt-3">
                    <p className="text-3xl mb-1.5 leading-none">🎲</p>
                    <h2 className="text-lg font-serif font-bold text-ink mb-0.5">Let the dice <em>decide</em>.</h2>
                    <p className="text-muted text-sm">Pick a mode. Every roll is a new dare.</p>
                </div>
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {OPTIONS.map(o => {
                            const Icon = o.Icon;
                            return (
                                <button key={o.id} onClick={() => resetTo(o.id)}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer">
                                    <div className="relative bg-surface-alt backdrop-blur-sm border border-divider hover:bg-app-tint hover:border-ink-soft/40 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: ROSE }} />
                                        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: ROSE }} />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color: ROSE }}><Icon size={16} /></span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-ink leading-tight">{o.title}</h3>
                                                <p className="text-xs text-muted leading-snug truncate">{o.tagline}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
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

    const meta = META[option];
    const die1Label = meta.d1;
    const die2Label = meta.d2;
    const optTitle = meta.title;

    // ---- PLAY (dice roller) ----
    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Intimate Drinking" onBack={() => resetTo(null)} onHome={onExit} confirmOnExit />

            <div className="px-2 flex-1 flex flex-col min-h-0">
                <div className="w-full bg-surface border border-divider rounded-[22px] px-4 py-4 flex flex-col relative overflow-hidden mt-1" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <div className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none" style={{ background: ROSE + '22' }} />

                    <span className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10" style={{ background: ROSE + '22', color: ROSE }}>
                        Intimate · {optTitle}
                    </span>

                    {/* dice */}
                    <div className="flex items-start justify-center gap-8 relative z-10 mt-5">
                        <div className="flex flex-col items-center gap-2">
                            <DieFace value={d1} rolling={rolling} />
                            <span className="text-[10px] uppercase tracking-wider text-muted font-bold">{die1Label}</span>
                        </div>
                        <div className="flex flex-col items-center gap-2">
                            <DieFace value={d2} rolling={rolling} />
                            <span className="text-[10px] uppercase tracking-wider text-muted font-bold">{die2Label}</span>
                        </div>
                    </div>

                    {/* result — big, bold, fun */}
                    <div className="relative z-10 mt-6 min-h-[170px] flex items-center justify-center text-center px-1">
                        {!rolled && !rolling && (
                            <p className="text-sm text-muted">Tap <span className="font-bold" style={{ color: ROSE }}>Roll</span> to begin.</p>
                        )}
                        {rolling && <p className="text-sm text-muted">Rolling…</p>}
                        {rolled && !rolling && option === 'action' && (
                            <div className="animate-fade-in">
                                <p className="font-serif font-black text-5xl text-ink leading-[1.05] tracking-tight">{ACTION_DIE[d1 - 1].t}</p>
                                <p className="text-sm text-muted italic mt-1">{ACTION_DIE[d1 - 1].d}</p>
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-4">on the</p>
                                <p className="font-serif font-black text-4xl mt-1 leading-tight" style={{ color: ROSE }}>{ZONE_DIE[d2 - 1]}</p>
                            </div>
                        )}
                        {rolled && !rolling && option === 'countdown' && (
                            <div className="animate-fade-in">
                                <p className="font-serif font-black text-3xl text-ink leading-[1.15]">{SENSATION_DIE[d1 - 1]}</p>
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-4">for exactly</p>
                                <p className="font-serif font-black text-6xl mt-1 leading-none" style={{ color: ROSE }}>{d2 * 10}<span className="text-2xl font-bold"> sec</span></p>
                            </div>
                        )}
                        {rolled && !rolling && option === 'positions' && (
                            <div className="animate-fade-in">
                                <p className="font-serif font-black text-5xl text-ink leading-[1.05] tracking-tight">{POSITION_DIE[d1 - 1]}</p>
                                <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-4">with the twist</p>
                                <p className="font-serif font-black text-3xl mt-1 leading-tight" style={{ color: ROSE }}>{MODIFIER_DIE[d2 - 1]}</p>
                            </div>
                        )}
                    </div>

                    <div className="text-[11px] text-muted flex items-center justify-end relative z-10 mt-3">
                        <span className="font-serif italic text-[12px]" style={{ color: ROSE }}>PartySpark</span>
                    </div>
                </div>

                <Button onClick={roll} disabled={rolling} fullWidth className="h-14 text-lg mt-5 max-w-[340px] mx-auto w-full">
                    <Dices className="inline mr-2" size={22} /> {rolled ? 'Roll Again' : 'Roll'}
                </Button>

                {option === 'countdown' && (
                    <p className="text-center text-[11px] text-muted mt-3 max-w-[320px] mx-auto">
                        Hold the action for the full duration without reacting, breaking character, or making a sound — or take a drink / remove an item.
                    </p>
                )}

                <button onClick={() => resetTo(null)} className="mx-auto mt-4 text-xs font-bold text-muted hover:text-ink flex items-center gap-1 transition-colors">
                    Switch mode <ArrowRight size={13} />
                </button>
            </div>
        </div>
    );
};
