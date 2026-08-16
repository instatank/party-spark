import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { RotateCw, Minus, Plus, Repeat } from 'lucide-react';
import { playTickSoft, playReveal, unlockAudio } from '../../services/audio';
import { hapticLight, hapticHeavy } from '../../services/haptics';

// ---------------------------------------------------------------------------
// Spin the Bottle — the "who goes next?" decider.
//
// Shared, game-agnostic on purpose: any social game that needs a turn picked
// (Truth or Drink, Never Have I Ever, Most Likely To…) can drop this in and
// read the result through onPick. It owns no game state and touches no
// storage — names come in as a prop, the chosen name(s) go out as a callback.
//
// How the landing is guaranteed: we pick the winner FIRST (uniform random),
// then solve for the rotation that lands the bottle inside that seat's sector
// (+/- a bit of jitter so it never looks mechanically centred). The animation
// is a rAF-driven ease-out over `spinMs` — the transform is written straight
// to the DOM node so a 5-second spin costs zero React re-renders. Wheel-style
// ticks fire as the neck crosses each seat boundary, so the click cadence
// slows down with the bottle for free.
//
// Pointing is unambiguous by design: the neck ends in a gold arrowhead, and
// on landing a sight-line ray fades in from the tip out to the rim.
// ---------------------------------------------------------------------------

export interface SpinResult {
    names: string[];
    indices: number[];
}

interface SpinTheBottleProps {
    /** Player names. Fewer than 2 falls back to an internal numbered-seat picker. */
    names?: string[];
    /** Accent hex used for the arrow, ray and winner ring. */
    accent?: string;
    /** 'single' = one name (whose turn). 'pair' = two spins (who asks → who answers). */
    mode?: 'single' | 'pair';
    /** Spin duration in ms. Default 5000. */
    spinMs?: number;
    /** Fires once the required number of names has been picked. */
    onPick?: (result: SpinResult) => void;
    /** Optional confirm CTA shown under the result (e.g. "Start their turn"). */
    ctaLabel?: string;
    onCta?: (result: SpinResult) => void;
}

const MAX_SEATS = 12;
const MIN_SEATS = 2;
const SEAT_RADIUS = 41;   // % of container half-size — where the name chips sit
const TICK_MIN_GAP_MS = 55;

const prefersReducedMotion = (): boolean => {
    try {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
        return false;
    }
};

// Fast launch, long deceleration. Quartic ease-out reads as a real bottle
// losing momentum far better than a linear or cubic curve.
const easeOutQuart = (t: number): number => 1 - Math.pow(1 - t, 4);

export const SpinTheBottle: React.FC<SpinTheBottleProps> = ({
    names = [],
    accent = '#F59E0B',
    mode = 'single',
    spinMs = 5000,
    onPick,
    ctaLabel,
    onCta,
}) => {
    const gid = useId().replace(/:/g, '');
    const realNames = useMemo(() => names.map(n => n.trim()).filter(Boolean).slice(0, MAX_SEATS), [names]);
    const hasRoster = realNames.length >= 2;

    const [seatCount, setSeatCount] = useState(6);
    const seats = useMemo(
        () => (hasRoster ? realNames : Array.from({ length: seatCount }, (_, i) => `Seat ${i + 1}`)),
        [hasRoster, realNames, seatCount],
    );

    const [phase, setPhase] = useState<'idle' | 'spinning' | 'result'>('idle');
    const [picks, setPicks] = useState<number[]>([]);
    const [noRepeat, setNoRepeat] = useState(true);

    const needed = mode === 'pair' ? 2 : 1;
    const rotRef = useRef(0);              // accumulated rotation, deg (kept mod 360 between spins)
    const rafRef = useRef<number | null>(null);
    const layerRef = useRef<HTMLDivElement | null>(null);
    const lastWinnerRef = useRef<number | null>(null);

    // The roster changing mid-session (names added, seat count nudged) makes any
    // existing result meaningless — clear it rather than point at a stale seat.
    useEffect(() => {
        setPicks([]);
        setPhase('idle');
        lastWinnerRef.current = null;
        rotRef.current = 0;
        if (layerRef.current) layerRef.current.style.transform = 'rotate(0deg)';
    }, [seats.length, hasRoster]);

    useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

    const doSpin = useCallback((currentPicks: number[]) => {
        const n = seats.length;
        if (n < MIN_SEATS) return;

        // Pick the winner first, then solve for the rotation that lands on it.
        let pool = seats.map((_, i) => i).filter(i => !currentPicks.includes(i));
        if (noRepeat && currentPicks.length === 0 && lastWinnerRef.current !== null && n >= 3) {
            const trimmed = pool.filter(i => i !== lastWinnerRef.current);
            if (trimmed.length > 0) pool = trimmed;
        }
        if (pool.length === 0) pool = seats.map((_, i) => i);
        const winner = pool[Math.floor(Math.random() * pool.length)];

        const sector = 360 / n;
        // Land anywhere in the middle ~55% of the sector: random enough to feel
        // physical, never close enough to a boundary to look ambiguous.
        const jitter = (Math.random() - 0.5) * sector * 0.55;
        const targetAngle = winner * sector + jitter;

        const reduced = prefersReducedMotion();
        const duration = reduced ? 1200 : spinMs;
        const turns = reduced ? 1 : 5 + Math.floor(Math.random() * 2);

        const start = rotRef.current;
        const delta = turns * 360 + (((targetAngle - (start % 360)) % 360) + 360) % 360;

        setPhase('spinning');
        unlockAudio();
        hapticLight();

        const t0 = performance.now();
        let lastSector = Math.floor(start / sector);
        let lastTickAt = 0;

        const frame = (now: number) => {
            const t = Math.min(1, (now - t0) / duration);
            let angle = start + delta * easeOutQuart(t);

            // Micro settle over the last stretch — the bottle rocks a couple of
            // degrees before coming to rest instead of freezing mid-glide.
            if (t > 0.82) {
                const k = (t - 0.82) / 0.18;
                angle += Math.sin(k * Math.PI * 2) * Math.min(5, sector * 0.14) * (1 - k);
            }

            if (layerRef.current) layerRef.current.style.transform = `rotate(${angle}deg)`;

            const s = Math.floor(angle / sector);
            if (s !== lastSector) {
                lastSector = s;
                if (now - lastTickAt > TICK_MIN_GAP_MS) {
                    lastTickAt = now;
                    playTickSoft();
                    if (t > 0.75) hapticLight();
                }
            }

            if (t < 1) {
                rafRef.current = requestAnimationFrame(frame);
                return;
            }

            // Settle exactly on target and normalise so the number stays small.
            rafRef.current = null;
            rotRef.current = (start + delta) % 360;
            if (layerRef.current) layerRef.current.style.transform = `rotate(${rotRef.current}deg)`;

            const nextPicks = [...currentPicks, winner];
            lastWinnerRef.current = winner;
            setPicks(nextPicks);
            setPhase('result');
            playReveal();
            hapticHeavy();
            if (nextPicks.length >= needed) {
                onPick?.({ names: nextPicks.map(i => seats[i]), indices: nextPicks });
            }
        };

        rafRef.current = requestAnimationFrame(frame);
    }, [seats, noRepeat, spinMs, needed, onPick]);

    const handleSpin = () => {
        if (phase === 'spinning') return;
        // A finished round restarts from scratch; a half-done pair continues.
        const carry = picks.length >= needed ? [] : picks;
        if (picks.length >= needed) setPicks([]);
        doSpin(carry);
    };

    const complete = picks.length >= needed;
    const winnerIdx = picks.length > 0 ? picks[picks.length - 1] : null;
    const spinning = phase === 'spinning';

    const buttonLabel = spinning
        ? 'Spinning…'
        : picks.length === 0
            ? 'Spin the Bottle'
            : complete
                ? 'Spin Again'
                : 'Spin for their partner';

    return (
        <div className="w-full flex flex-col items-center">
            {/* Seat-count stepper — only when there's no real roster to spin on. */}
            {!hasRoster && (
                <div className="flex items-center gap-3 mb-3 px-3 py-1.5 rounded-full border border-divider bg-surface-alt">
                    <button
                        onClick={() => { setSeatCount(c => Math.max(MIN_SEATS, c - 1)); hapticLight(); }}
                        disabled={spinning || seatCount <= MIN_SEATS}
                        aria-label="Fewer seats"
                        className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-ink disabled:opacity-30 transition-colors"
                    >
                        <Minus size={13} />
                    </button>
                    <span className="text-xs font-bold text-ink-soft tabular-nums">{seatCount} players</span>
                    <button
                        onClick={() => { setSeatCount(c => Math.min(MAX_SEATS, c + 1)); hapticLight(); }}
                        disabled={spinning || seatCount >= MAX_SEATS}
                        aria-label="More seats"
                        className="w-6 h-6 rounded-full flex items-center justify-center text-muted hover:text-ink disabled:opacity-30 transition-colors"
                    >
                        <Plus size={13} />
                    </button>
                </div>
            )}

            {/* The table */}
            <div className="relative w-full max-w-[320px] aspect-square select-none">
                {/* Felt: soft radial wash + two rings, so the bottle reads as
                    sitting on a table rather than floating on the page. */}
                <div
                    className="absolute inset-0 rounded-full border border-divider"
                    style={{ background: `radial-gradient(circle at 50% 45%, ${accent}1F 0%, transparent 62%)` }}
                />
                <div className="absolute inset-[9%] rounded-full border border-divider-soft" />

                {/* Rotating layer — bottle + sight line share one pivot (the
                    container's centre), which is also the bottle's midpoint. */}
                <div ref={layerRef} className="absolute inset-0 will-change-transform" style={{ transform: 'rotate(0deg)' }}>
                    {/* Sight line: fades in on landing and runs from the neck out
                        to just inside the seat ring, so "who is it pointing at"
                        is never a debate. It stops short of the chip on purpose —
                        an arrow that overshoots the name reads as pointing past it. */}
                    <div
                        className="absolute left-1/2 top-[13%] h-[37%] w-[2px] -translate-x-1/2 transition-opacity duration-500 pointer-events-none"
                        style={{
                            opacity: phase === 'result' ? 1 : 0,
                            background: `linear-gradient(to bottom, ${accent} 0%, ${accent}00 85%)`,
                        }}
                    >
                        <span
                            className="absolute -top-[1px] left-1/2 -translate-x-1/2 w-0 h-0"
                            style={{
                                borderLeft: '5px solid transparent',
                                borderRight: '5px solid transparent',
                                borderBottom: `9px solid ${accent}`,
                            }}
                        />
                    </div>

                    <div className="absolute inset-0 flex items-center justify-center">
                        <svg viewBox="0 0 100 300" className="h-[64%] w-auto" style={{ filter: 'drop-shadow(0 6px 14px rgba(0,0,0,0.45))' }}>
                            <defs>
                                <linearGradient id={`glass-${gid}`} x1="0" y1="0" x2="1" y2="0">
                                    <stop offset="0%" stopColor="#064E3B" />
                                    <stop offset="38%" stopColor="#10B981" />
                                    <stop offset="72%" stopColor="#047857" />
                                    <stop offset="100%" stopColor="#022C22" />
                                </linearGradient>
                                <linearGradient id={`label-${gid}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#FDF3D3" />
                                    <stop offset="100%" stopColor="#E8CE8A" />
                                </linearGradient>
                            </defs>

                            {/* Arrowhead tip — the business end of the pointer */}
                            <polygon points="50,4 68,52 32,52" fill={accent} />
                            <polygon points="50,16 61,50 39,50" fill="#FFFFFF" opacity="0.35" />

                            {/* Neck + collar */}
                            <rect x="42" y="48" width="16" height="62" fill={`url(#glass-${gid})`} />
                            <rect x="38" y="100" width="24" height="12" rx="4" fill={accent} opacity="0.9" />

                            {/* Body */}
                            <path
                                d="M42 110 C42 132, 22 140, 22 172 L22 268 C22 284, 32 292, 50 292 C68 292, 78 284, 78 268 L78 172 C78 140, 58 132, 58 110 Z"
                                fill={`url(#glass-${gid})`}
                            />
                            {/* Glass highlight */}
                            <path d="M32 150 C29 162, 28 180, 28 200 L28 262" stroke="#FFFFFF" strokeOpacity="0.32" strokeWidth="5" strokeLinecap="round" fill="none" />
                            {/* Label */}
                            <rect x="26" y="196" width="48" height="58" rx="4" fill={`url(#label-${gid})`} />
                            <rect x="26" y="196" width="48" height="58" rx="4" fill="none" stroke="#0F172A" strokeOpacity="0.18" />
                            <circle cx="50" cy="217" r="7" fill="none" stroke="#0F172A" strokeOpacity="0.35" strokeWidth="1.5" />
                            <rect x="34" y="231" width="32" height="3" rx="1.5" fill="#0F172A" fillOpacity="0.28" />
                            <rect x="39" y="239" width="22" height="3" rx="1.5" fill="#0F172A" fillOpacity="0.2" />
                        </svg>
                    </div>
                </div>

                {/* Seats */}
                {seats.map((name, i) => {
                    const angle = (i * 360) / seats.length;
                    const rad = (angle * Math.PI) / 180;
                    const x = 50 + SEAT_RADIUS * Math.sin(rad);
                    const y = 50 - SEAT_RADIUS * Math.cos(rad);
                    const isWinner = phase === 'result' && picks.includes(i);
                    const isFirstOfPair = mode === 'pair' && picks[0] === i && picks.length > 1;
                    return (
                        <div
                            key={`${name}-${i}`}
                            className="absolute transition-all duration-300"
                            style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                transform: `translate(-50%, -50%) scale(${isWinner ? 1.12 : 1})`,
                                zIndex: isWinner ? 20 : 10,
                            }}
                        >
                            <div
                                className="px-2.5 py-1 rounded-full border text-[11px] font-bold max-w-[86px] truncate text-center backdrop-blur-sm transition-colors"
                                style={
                                    isWinner
                                        ? {
                                            borderColor: accent,
                                            color: accent,
                                            background: `${accent}1F`,
                                            boxShadow: `0 0 16px ${accent}66`,
                                            opacity: isFirstOfPair ? 0.75 : 1,
                                        }
                                        : {
                                            borderColor: 'var(--c-border)',
                                            color: 'var(--c-muted)',
                                            background: 'var(--c-surface-alt)',
                                            opacity: spinning ? 0.75 : 1,
                                        }
                                }
                            >
                                {name}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Result line — reserves its own height so the button never jumps. */}
            <div className="h-[62px] mt-3 flex flex-col items-center justify-center text-center px-4">
                {spinning && (
                    <p className="text-sm text-muted font-medium">Round and round…</p>
                )}
                {!spinning && phase === 'idle' && (
                    <p className="text-sm text-muted font-medium">
                        {mode === 'pair' ? 'Two spins: who asks, then who answers.' : 'Let the bottle decide who goes next.'}
                    </p>
                )}
                {!spinning && phase === 'result' && winnerIdx !== null && (
                    <div className="animate-fade-in">
                        {mode === 'pair' && picks.length > 1 ? (
                            <p className="text-xl font-serif font-bold text-ink leading-tight">
                                <span style={{ color: accent }}>{seats[picks[0]]}</span>
                                <span className="text-muted font-sans text-base px-2">asks</span>
                                <span style={{ color: accent }}>{seats[picks[1]]}</span>
                            </p>
                        ) : (
                            <p className="text-2xl font-serif font-bold text-ink leading-tight">
                                🍾 <span style={{ color: accent }}>{seats[winnerIdx]}</span>
                                {mode === 'pair' ? ' asks…' : "'s turn"}
                            </p>
                        )}
                        {mode === 'pair' && picks.length < 2 && (
                            <p className="text-xs text-muted mt-1">Now spin for who they're asking.</p>
                        )}
                    </div>
                )}
            </div>

            {/* Controls */}
            <div className="w-full max-w-[320px] flex flex-col gap-2">
                <button
                    onClick={handleSpin}
                    disabled={spinning || seats.length < MIN_SEATS}
                    className="w-full py-4 rounded-xl font-bold text-base transition-all active:scale-[0.98] disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                        background: spinning ? 'var(--c-surface-alt)' : `${accent}1A`,
                        border: `2px solid ${spinning ? 'var(--c-border)' : accent}`,
                        color: spinning ? 'var(--c-muted)' : accent,
                    }}
                >
                    <RotateCw size={18} className={spinning ? 'animate-spin' : ''} />
                    {buttonLabel}
                </button>

                {complete && ctaLabel && onCta && (
                    <button
                        onClick={() => onCta({ names: picks.map(i => seats[i]), indices: picks })}
                        className="w-full py-3 rounded-xl font-bold text-sm bg-gold text-slate-900 hover:brightness-110 transition-all active:scale-[0.98]"
                    >
                        {ctaLabel}
                    </button>
                )}

                {seats.length >= 3 && (
                    <button
                        onClick={() => { setNoRepeat(v => !v); hapticLight(); }}
                        disabled={spinning}
                        className="self-center flex items-center gap-1.5 py-1.5 text-[11px] font-semibold text-muted hover:text-ink-soft transition-colors disabled:opacity-40"
                    >
                        <Repeat size={12} />
                        {noRepeat ? "Never lands on the same person twice in a row" : 'Repeats allowed'}
                    </button>
                )}
            </div>
        </div>
    );
};

export default SpinTheBottle;
