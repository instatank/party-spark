import React, { useState } from 'react';
import { Timer, TimerOff, Pencil, X } from 'lucide-react';

// Editable round-timer chip, shared across games. Shows the current length
// with a pencil; tapping opens a small bottom-sheet of presets + a custom
// field. No dedicated setup step. Persistence is the parent's job (via onPick
// + the load/save helpers below).
//
// `allowOff` adds a "No timer" choice, which reports 0 — for the games where
// the clock is OPTIONAL pressure (Ballpark, The Line, Shortlist) rather than
// the mechanic itself. It is deliberately opt-in: turning the timer off in
// Charades, Taboo, Scramble, 5 Alive, Echo or Target would not relax those
// games, it would remove the thing being played. A game that passes
// `allowOff` must handle 0 everywhere it starts a countdown.

export const TIMER_PRESETS = [30, 60, 90, 120];
export const TIMER_MIN = 15;
export const TIMER_MAX = 300;
const DEFAULT_ACCENT = '#14B8A6';

// localStorage helpers so every game persists its last-used choice the same way.
export const TIMER_OFF = 0;

/** `allowOff` also accepts a stored 0 ("no timer"); without it a 0 in storage
 *  falls back to `def`, so a game that later drops the option cannot come back
 *  up with a clock that never starts. */
export const loadTimerPref = (key: string, def = 60, allowOff = false): number => {
    // Read the RAW value first. `Number(null)` is 0, which is exactly the
    // value that now means "no timer" — so a key that was never written would
    // otherwise come back as a deliberate choice to turn the clock off, and a
    // game that ships with its timer ON would ship with it off.
    const raw = localStorage.getItem(key);
    if (raw === null || raw === '') return def;
    const s = Number(raw);
    if (allowOff && s === TIMER_OFF) return TIMER_OFF;
    return TIMER_PRESETS.includes(s) || (s >= TIMER_MIN && s <= TIMER_MAX) ? s : def;
};
export const saveTimerPref = (key: string, secs: number): void => {
    try { localStorage.setItem(key, String(secs)); } catch { /* ignore */ }
};

interface Props {
    duration: number;
    onPick: (secs: number) => void;
    accent?: string;   // hex; tints the icon + active preset. Defaults to teal.
    /** Offer "No timer" (reports 0). Only for games where the clock is optional. */
    allowOff?: boolean;
    /** Chip label when the timer is on. "round" by default; games with a
     *  per-player clock say "turn", Shortlist says "per clue". */
    unit?: string;
}

const TimerSetting: React.FC<Props> = ({ duration, onPick, accent = DEFAULT_ACCENT, allowOff = false, unit = 'round' }) => {
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState('');
    const choose = (s: number) => { onPick(s); setCustom(''); setOpen(false); };
    const off = duration === TIMER_OFF;
    const applyCustom = () => { const n = Math.round(Number(custom)); if (n >= TIMER_MIN && n <= TIMER_MAX) choose(n); };
    return (
        <>
            <button onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt border border-divider hover:border-ink-soft/40 text-ink text-sm font-bold transition-colors">
                {off ? <TimerOff size={14} className="text-muted" /> : <Timer size={14} style={{ color: accent }} />}
                {off ? 'No timer' : `${duration}s ${unit}`}
                <Pencil size={12} className="text-muted" />
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-fade-in" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-md bg-surface border-t border-divider rounded-t-2xl p-5 pb-7 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-bold text-ink">{allowOff ? 'Timer' : 'Round length'}</p>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink"><X size={18} /></button>
                        </div>
                        {allowOff && (
                            <button onClick={() => choose(TIMER_OFF)}
                                className="w-full rounded-xl py-3 mb-2 font-black text-base border-2 transition-colors flex items-center justify-center gap-2"
                                style={off
                                    ? { background: accent + '22', borderColor: accent, color: accent }
                                    : { borderColor: 'var(--color-divider)', color: 'var(--color-ink)' }}>
                                <TimerOff size={16} /> No timer
                            </button>
                        )}
                        <div className="grid grid-cols-4 gap-2">
                            {TIMER_PRESETS.map(s => {
                                const active = duration === s;
                                return (
                                    <button key={s} onClick={() => choose(s)}
                                        className="rounded-xl py-3 font-black text-lg tabular-nums border-2 transition-colors"
                                        style={active
                                            ? { background: accent + '22', borderColor: accent, color: accent }
                                            : { borderColor: 'var(--color-divider)', color: 'var(--color-ink)' }}>
                                        {s}<span className="text-xs font-bold">s</span>
                                    </button>
                                );
                            })}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                            {/* A current length that is not one of the presets (Ballpark's
                                45s default, or anything typed) has no tile to light up, so
                                the custom field says where you are instead of reading as
                                empty. */}
                            <input type="number" inputMode="numeric" min={TIMER_MIN} max={TIMER_MAX}
                                placeholder={!off && !TIMER_PRESETS.includes(duration)
                                    ? `${duration}s — now set`
                                    : `Custom (${TIMER_MIN}–${TIMER_MAX}s)`}
                                value={custom} onChange={e => setCustom(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') applyCustom(); }}
                                className="flex-1 bg-surface-alt border border-divider focus:border-ink-soft rounded-xl p-3 text-ink placeholder:text-muted outline-none transition-colors text-sm" />
                            <button onClick={applyCustom} className="px-4 py-3 rounded-xl bg-surface-alt border border-divider text-ink-soft hover:text-ink text-sm font-bold">Set</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default TimerSetting;
