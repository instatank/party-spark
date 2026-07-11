import React, { useState, useRef, useEffect } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { Dices, Flame, Hourglass, Repeat, ChevronRight, ArrowRight, Wine, Undo2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { hapticLight, hapticSuccess, hapticHeavy } from '../../services/haptics';
import { playReveal } from '../../services/audio';

// "Intimate Drinking" — adult two-dice games surfaced inside Truth or Drink and
// gated by its own PIN. Classic modes map two dice to an action + target /
// sensation + duration / position + twist. "The Slow Burn" is the featured
// date-night variant: a 15-roll night in three escalating acts (own dice
// tables per act), a heat meter, Wildfire interrupts on doubles, intermission
// rituals between acts, and a finale that ends the game at its peak.
// Fully offline, no data files — all mappings live here.

interface Props { onExit: () => void; }

type DiceOption = 'slowburn' | 'action' | 'countdown' | 'positions';

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

// --- Option 3: Positions (the main event) ---------------------------------
const POSITION_DIE: string[] = [
    'You on top', 'Them on top', 'From behind', 'Face to face, wrapped up', 'Seated', "Roller's pick",
];
const MODIFIER_DIE: string[] = [
    'for 60 seconds', 'until you switch', 'eyes locked — no looking away', 'no hands', 'in slow motion', 'partner sets the pace',
];

// --- The Slow Burn: a night in three acts ----------------------------------
// The roller gives; their partner receives. Alternate rolls. 5 rolls per act,
// doubles interrupt with a Wildfire card, intermission rituals between acts.

type Act = 1 | 2 | 3;
const ROLLS_PER_ACT = 5;
const TOTAL_ROLLS = ROLLS_PER_ACT * 3;

const EMBER: Record<Act, string> = { 1: '#F59E0B', 2: '#F97316', 3: '#F43F5E' };
const HEAT_GRADIENT = 'linear-gradient(90deg, #F59E0B, #F97316, #F43F5E)';

interface BurnAct {
    numeral: string;
    title: string;
    sub: string;
    rules: string;
    d1: string;      // die 1 label
    d2: string;      // die 2 label
    connector: string; // eyebrow between action and modifier on the result card
    actions: { t: string; d: string }[];
    mods: string[];
}

const BURN_ACTS: Record<Act, BurnAct> = {
    1: {
        numeral: 'I',
        title: 'The Tease',
        sub: 'Anticipation is the whole game.',
        rules: 'Clothes stay on. Lips are forbidden — no kissing on the mouth until Act II, and every slip costs a sip. Take turns rolling: the roller gives, their partner receives. Build the ache.',
        d1: 'Tease', d2: 'Where', connector: 'on',
        actions: [
            { t: 'Trace', d: 'One fingertip. Featherlight. Unhurried.' },
            { t: 'Kiss', d: 'Soft and slow — and remember: never the lips' },
            { t: 'Whisper', d: 'Lips grazing skin — tell them what tonight has coming' },
            { t: 'Breathe', d: 'Warm and close. Never quite touching.' },
            { t: 'Nibble', d: 'Gently. Let them feel you smile.' },
            { t: 'Sip First', d: 'A slow sip of your drink, then your cool mouth' },
        ],
        mods: [
            'their neck',
            'their ear',
            'their collarbone',
            'their inner wrist, trailing upward',
            'their lower back',
            'wherever they point',
        ],
    },
    2: {
        numeral: 'II',
        title: 'The Heat',
        sub: 'Now it gets hands-on.',
        rules: 'The lip rule is dead, and clothes are now negotiable. Keep trading rolls. Too much? Trade any dare: two sips, and your partner rewrites it.',
        d1: 'Move', d2: 'How', connector: 'and',
        actions: [
            { t: 'Deep Kiss', d: 'The rule is dead. Make up for lost time.' },
            { t: 'Shared Sip', d: 'Take a sip, hold it — pass it to them mouth to mouth' },
            { t: 'Mouth Only', d: 'Anywhere above the waist. Hands behind your back.' },
            { t: 'Undress Them', d: 'One item — using anything but your hands' },
            { t: 'Pin Them', d: 'Hands above their head. Kiss them like you mean it.' },
            { t: 'Skin to Skin', d: 'Full-body press. Slow grind. No kissing allowed.' },
        ],
        mods: [
            'take it agonizingly slow',
            'hold it for 30 full seconds',
            "don't stop for a full minute",
            'stay silent — first sound drinks',
            'keep your eyes locked, the entire time',
            'do it twice — once tender, once anything but',
        ],
    },
    3: {
        numeral: 'III',
        title: 'The Inferno',
        sub: 'Whoever rolls, commands.',
        rules: 'No more warm-up. Whoever rolls is in charge — their partner moves only when told. One rule survives: make it unforgettable.',
        d1: 'Command', d2: 'The Rule', connector: 'the rule',
        actions: [
            { t: 'Take Charge', d: 'They move only when you say so' },
            { t: 'To the Edge', d: 'Bring them right to the brink — then stop' },
            { t: 'Your Mouth', d: 'They choose exactly where. Take your time.' },
            { t: 'Narrate It', d: 'Tell them your favorite thing to do to them — while doing it' },
            { t: 'What’s Left, Goes', d: 'Whatever they’re still wearing — deal with it. Slowly.' },
            { t: 'Their Fantasy', d: 'They confess one. You perform the opening scene.' },
        ],
        mods: [
            'no rushing — one full minute, minimum',
            'in total silence, eyes open',
            'they may not touch you back',
            "don't stop until they beg",
            'voices low, lights lower',
            'no rules left — your way',
        ],
    },
};

// Wildfire interrupts — dealt when the dice land doubles. No repeats until
// the pool runs dry.
const WILDFIRE: { t: string; d: string }[] = [
    { t: 'Freeze', d: 'Both of you — freeze exactly as you are. Twenty seconds, eye contact. First to laugh or move, drinks.' },
    { t: 'Mirror', d: 'Whatever was just done to you — return it. Do it better.' },
    { t: 'The Quiet Game', d: 'The next dare happens in total silence. Whoever breaks it, drinks.' },
    { t: 'Strip or Sip', d: 'Both of you, on the count of three: lose one item, or take two sips. Choose in secret, reveal together.' },
    { t: 'Confession', d: 'Tell one fantasy you’ve never said out loud. They decide: it happens tonight — or you drink.' },
    { t: 'Slow Motion', d: 'The next dare runs at half speed and double the time. No exceptions.' },
    { t: 'Dealer’s Choice', d: 'No dice this round. Your partner invents your dare from scratch — and you do it.' },
    { t: 'Hands Off', d: 'Sixty seconds on your partner — using anything except your hands.' },
    { t: 'The Toast', d: 'Eyes locked: tell them the single sexiest thing about them. Then drink to it, arms linked.' },
    { t: 'Role Reversal', d: 'For the rest of this act, every roll flips: the roller receives.' },
];

const INTERMISSIONS: Record<1 | 2, { body: string; cta: string }> = {
    1: {
        body: 'Put the dice down. Both of you — drink. Then the lip rule dies: sixty seconds of kissing and nothing else, hands behind your backs. When you come up for air, Act II is waiting.',
        cta: 'On to Act II — The Heat',
    },
    2: {
        body: 'Both drink. Now: a ten-second staring contest. Loser sheds one item of clothing — winner picks which. Take a breath. Act III doesn’t have a warm-up.',
        cta: 'On to Act III — The Inferno',
    },
};

const OPTIONS: { id: DiceOption; title: string; tagline: string; Icon: LucideIcon }[] = [
    { id: 'action', title: 'The Action', tagline: 'An action + where to do it.', Icon: Flame },
    { id: 'countdown', title: 'The High-Stakes Countdown', tagline: 'A sensation + how long to hold it.', Icon: Hourglass },
    { id: 'positions', title: 'Positions', tagline: 'A position + a twist.', Icon: Repeat },
];

const META: Record<Exclude<DiceOption, 'slowburn'>, { title: string; d1: string; d2: string }> = {
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

// Slim gradient heat meter — fills across all 15 rolls of The Slow Burn.
const HeatMeter: React.FC<{ progress: number }> = ({ progress }) => (
    <div className="w-full h-[5px] rounded-full bg-app-tint overflow-hidden">
        <div
            className="h-full rounded-full transition-all duration-700"
            style={{
                width: `${Math.max(3, Math.round(progress * 100))}%`,
                background: HEAT_GRADIENT,
                boxShadow: '0 0 10px rgba(244, 63, 94, 0.45)',
            }}
        />
    </div>
);

export const IntimateDiceGame: React.FC<Props> = ({ onExit }) => {
    const [option, setOption] = useState<DiceOption | null>(null);
    const [d1, setD1] = useState(1);
    const [d2, setD2] = useState(1);
    const [rolling, setRolling] = useState(false);
    const [rolled, setRolled] = useState(false);
    const flickRef = useRef<number | null>(null);
    const landRef = useRef<number | null>(null);

    // Slow Burn state
    const [act, setAct] = useState<Act>(1);
    const [rollsDone, setRollsDone] = useState(0); // landed rolls in the current act
    const [stage, setStage] = useState<'INTRO' | 'ROLL' | 'INTERMISSION' | 'FINALE'>('INTRO');
    const [wildfire, setWildfire] = useState<number | null>(null); // index into WILDFIRE
    const [usedWildfires, setUsedWildfires] = useState<number[]>([]);

    const clearTimers = () => {
        if (flickRef.current) { clearInterval(flickRef.current); flickRef.current = null; }
        if (landRef.current) { clearTimeout(landRef.current); landRef.current = null; }
    };
    useEffect(() => () => clearTimers(), []);

    const roll = () => {
        if (rolling) return;
        hapticLight();
        setRolling(true);
        setRolled(false);
        setWildfire(null);
        clearTimers();
        flickRef.current = window.setInterval(() => { setD1(rand()); setD2(rand()); }, 70);
        landRef.current = window.setTimeout(() => {
            clearTimers();
            const n1 = rand();
            const n2 = rand();
            setD1(n1);
            setD2(n2);
            setRolling(false);
            setRolled(true);
            if (option === 'slowburn') {
                setRollsDone(r => r + 1);
                if (n1 === n2) {
                    const all = WILDFIRE.map((_, i) => i);
                    const avail = all.filter(i => !usedWildfires.includes(i));
                    const pool = avail.length ? avail : all;
                    const idx = pool[Math.floor(Math.random() * pool.length)];
                    setWildfire(idx);
                    setUsedWildfires(avail.length ? [...usedWildfires, idx] : [idx]);
                    hapticHeavy();
                    playReveal();
                    return;
                }
            }
            hapticSuccess();
        }, 650);
    };

    const resetBurn = () => {
        setAct(1);
        setRollsDone(0);
        setStage('INTRO');
        setWildfire(null);
        setUsedWildfires([]);
    };

    const resetTo = (next: DiceOption | null) => {
        clearTimers();
        setRolling(false);
        setRolled(false);
        resetBurn();
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
                        {/* Featured: The Slow Burn — the date-night arc */}
                        <button onClick={() => resetTo('slowburn')}
                            className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer">
                            <div className="relative bg-surface-alt backdrop-blur-sm border rounded-xl py-3.5 px-4 transition-colors overflow-hidden hover:bg-app-tint"
                                style={{ borderColor: 'rgba(249, 115, 22, 0.45)', boxShadow: '0 0 22px rgba(249, 115, 22, 0.14)' }}>
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: HEAT_GRADIENT }} />
                                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]" style={{ background: HEAT_GRADIENT }} />
                                <div className="absolute -top-[46px] -right-[46px] w-[120px] h-[120px] rounded-full pointer-events-none" style={{ background: 'rgba(249, 115, 22, 0.14)' }} />
                                <div className="flex items-center gap-3 relative">
                                    <span className="flex-shrink-0 animate-ember" style={{ color: '#F97316' }}><Flame size={18} /></span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] mb-0.5" style={{ color: '#F59E0B' }}>Tonight’s special</p>
                                        <h3 className="text-base font-bold text-ink leading-tight">The Slow Burn</h3>
                                        <p className="text-xs text-muted leading-snug truncate">One night. Three acts. Rising heat.</p>
                                    </div>
                                    <ChevronRight size={16} className="text-muted group-hover:text-ink transition-colors flex-shrink-0" />
                                </div>
                            </div>
                        </button>

                        <p className="text-center text-[10px] uppercase tracking-[0.22em] text-muted -mb-1 mt-1">or the classics</p>

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

    // ---- THE SLOW BURN ----
    if (option === 'slowburn') {
        const A = BURN_ACTS[act];
        const accent = EMBER[act];
        const heat = ((act - 1) * ROLLS_PER_ACT + rollsDone) / TOTAL_ROLLS;
        const actDone = rollsDone >= ROLLS_PER_ACT;

        // ACT INTRO
        if (stage === 'INTRO') {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="The Slow Burn" onBack={() => resetTo(null)} onHome={onExit} confirmOnExit />
                    <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                        <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-8 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                            <div className="absolute -top-[70px] -right-[70px] w-[180px] h-[180px] rounded-full pointer-events-none" style={{ background: accent + '22' }} />
                            <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: accent }}>Act {A.numeral} of III</p>
                            <Flame size={30} className="mx-auto mt-4 animate-ember relative z-10" style={{ color: accent }} />
                            <h2 className="font-serif font-black text-4xl text-ink mt-3 relative z-10">{A.title}</h2>
                            <p className="text-sm italic text-muted mt-1 relative z-10">{A.sub}</p>
                            <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">{A.rules}</p>
                            {act === 1 && (
                                <p className="text-[11px] text-muted leading-relaxed mt-4 relative z-10 flex items-center justify-center gap-1.5">
                                    <Wine size={12} className="flex-shrink-0" /> Any dare can be traded: two sips, and your partner rewrites it.
                                </p>
                            )}
                        </div>
                        <Button onClick={() => { hapticLight(); setRolled(false); setStage('ROLL'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                            <Flame className="inline mr-2" size={20} /> Begin Act {A.numeral}
                        </Button>
                    </div>
                </div>
            );
        }

        // INTERMISSION
        if (stage === 'INTERMISSION') {
            const inter = INTERMISSIONS[act as 1 | 2];
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="The Slow Burn" onBack={() => resetTo(null)} onHome={onExit} confirmOnExit />
                    <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                        <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-8 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                            <div className="absolute -top-[70px] -left-[70px] w-[180px] h-[180px] rounded-full pointer-events-none bg-gold-soft" />
                            <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-gold relative z-10">Intermission</p>
                            <p className="text-3xl mt-4 relative z-10">🥂</p>
                            <h2 className="font-serif font-black text-3xl text-ink mt-2 relative z-10">End of Act {A.numeral}</h2>
                            <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">{inter.body}</p>
                        </div>
                        <Button onClick={() => { hapticLight(); setAct((act + 1) as Act); setRollsDone(0); setStage('INTRO'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                            {inter.cta} <ArrowRight className="inline ml-2" size={18} />
                        </Button>
                    </div>
                </div>
            );
        }

        // FINALE — The Last Ember
        if (stage === 'FINALE') {
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="The Slow Burn" onBack={() => resetTo(null)} onHome={onExit} />
                    <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                        <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-8 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: 'rgba(244, 63, 94, 0.4)' }}>
                            <div className="absolute -top-[70px] -right-[70px] w-[180px] h-[180px] rounded-full pointer-events-none" style={{ background: 'rgba(244, 63, 94, 0.16)' }} />
                            <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ROSE }}>The Last Ember</p>
                            <Flame size={34} className="mx-auto mt-4 animate-ember relative z-10" style={{ color: ROSE }} />
                            <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-3 relative z-10">Finish what you started.</h2>
                            <p className="text-sm text-ink-soft leading-relaxed mt-5 relative z-10">
                                Fifteen rolls, three acts — the dice have carried you as far as dice can.
                                The rest of tonight doesn’t need instructions. Phone face-down. Lights low.
                                Take your time — that’s the last rule left.
                            </p>
                            <div className="mt-6 relative z-10"><HeatMeter progress={1} /></div>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-muted mt-2 relative z-10">Heat: maximum</p>
                        </div>
                        <button onClick={() => { hapticLight(); resetBurn(); }} className="mx-auto mt-6 text-xs font-bold text-muted hover:text-ink flex items-center gap-1 transition-colors">
                            Encore — from the top <ArrowRight size={13} />
                        </button>
                        <button onClick={() => resetTo(null)} className="mx-auto mt-3 text-xs font-bold text-muted hover:text-ink flex items-center gap-1 transition-colors">
                            Back to modes
                        </button>
                    </div>
                </div>
            );
        }

        // ROLL
        // Before a roll lands, show the upcoming roll number; once landed, the one just played.
        const shownRoll = Math.min(rolled && !rolling ? rollsDone : rollsDone + 1, ROLLS_PER_ACT);
        const wf = wildfire !== null ? WILDFIRE[wildfire] : null;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="The Slow Burn" onBack={() => resetTo(null)} onHome={onExit} confirmOnExit />

                <div className="px-2 flex-1 flex flex-col min-h-0">
                    <div className="max-w-[340px] mx-auto w-full mb-2.5">
                        <div className="flex items-baseline justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>Act {A.numeral} · {A.title}</span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Roll {shownRoll} of {ROLLS_PER_ACT}</span>
                        </div>
                        <HeatMeter progress={heat} />
                    </div>

                    <div className="w-full bg-surface border border-divider rounded-[22px] px-4 py-4 flex flex-col relative overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none" style={{ background: accent + '22' }} />

                        <span className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10" style={{ background: accent + '22', color: accent }}>
                            Slow Burn · {A.title}
                        </span>

                        {/* dice */}
                        <div className="flex items-start justify-center gap-8 relative z-10 mt-5">
                            <div className="flex flex-col items-center gap-2">
                                <DieFace value={d1} rolling={rolling} />
                                <span className="text-[10px] uppercase tracking-wider text-muted font-bold">{A.d1}</span>
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <DieFace value={d2} rolling={rolling} />
                                <span className="text-[10px] uppercase tracking-wider text-muted font-bold">{A.d2}</span>
                            </div>
                        </div>

                        {/* result */}
                        <div className="relative z-10 mt-6 min-h-[180px] flex items-center justify-center text-center px-1">
                            {!rolled && !rolling && (
                                <p className="text-sm text-muted">The roller gives. Tap <span className="font-bold" style={{ color: accent }}>Roll</span>.</p>
                            )}
                            {rolling && <p className="text-sm text-muted">Rolling…</p>}
                            {rolled && !rolling && wf && (
                                <div className="animate-slide-up">
                                    <p className="text-[11px] font-black uppercase tracking-[0.3em] animate-ember" style={{ color: '#F97316' }}>🔥 Doubles — Wildfire 🔥</p>
                                    <p className="font-serif font-black text-4xl text-ink leading-[1.05] tracking-tight mt-3">{wf.t}</p>
                                    <p className="text-sm text-ink-soft leading-relaxed mt-3 max-w-[300px] mx-auto">{wf.d}</p>
                                </div>
                            )}
                            {rolled && !rolling && !wf && (
                                <div className="animate-fade-in">
                                    <p className="font-serif font-black text-[40px] text-ink leading-[1.05] tracking-tight">{A.actions[d1 - 1].t}</p>
                                    <p className="text-sm text-muted italic mt-1">{A.actions[d1 - 1].d}</p>
                                    <p className="text-[11px] uppercase tracking-[0.2em] text-muted mt-4">{A.connector}</p>
                                    <p className="font-serif font-black text-[26px] mt-1 leading-tight" style={{ color: accent }}>{A.mods[d2 - 1]}</p>
                                </div>
                            )}
                        </div>

                        <div className="text-[11px] text-muted flex items-center justify-end relative z-10 mt-3">
                            <span className="font-serif italic text-[12px]" style={{ color: accent }}>PartySpark</span>
                        </div>
                    </div>

                    {actDone && rolled && !rolling ? (
                        <Button onClick={() => { hapticLight(); setRolled(false); setWildfire(null); setStage(act < 3 ? 'INTERMISSION' : 'FINALE'); }} fullWidth className="h-14 text-lg mt-5 max-w-[340px] mx-auto w-full">
                            {act < 3 ? 'Intermission' : 'The Last Ember'} <ArrowRight className="inline ml-2" size={20} />
                        </Button>
                    ) : (
                        <Button onClick={roll} disabled={rolling} fullWidth className="h-14 text-lg mt-5 max-w-[340px] mx-auto w-full">
                            <Dices className="inline mr-2" size={22} /> {rolled ? 'Pass & Roll' : 'Roll'}
                        </Button>
                    )}

                    <p className="text-center text-[11px] text-muted mt-3 max-w-[320px] mx-auto flex items-center justify-center gap-1.5">
                        <Undo2 size={12} className="flex-shrink-0" /> Too far? Trade it: two sips, and your partner rewrites the dare.
                    </p>
                </div>
            </div>
        );
    }

    const meta = META[option];
    const die1Label = meta.d1;
    const die2Label = meta.d2;
    const optTitle = meta.title;

    // ---- PLAY (classic dice roller) ----
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
