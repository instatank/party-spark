import React, { useState } from 'react';
import { Timer, Pencil, X } from 'lucide-react';

// Editable round-timer chip, shared across games (Jumble / Charades / Taboo).
// Shows the current length with a pencil; tapping opens a small bottom-sheet of
// presets + a custom field. No dedicated setup step. Persistence is the
// parent's job (via onPick + the load/save helpers below).

export const TIMER_PRESETS = [30, 60, 90, 120];
export const TIMER_MIN = 15;
export const TIMER_MAX = 300;
const DEFAULT_ACCENT = '#14B8A6';

// localStorage helpers so every game persists its last-used choice the same way.
export const loadTimerPref = (key: string, def = 60): number => {
    const s = Number(localStorage.getItem(key));
    return TIMER_PRESETS.includes(s) || (s >= TIMER_MIN && s <= TIMER_MAX) ? s : def;
};
export const saveTimerPref = (key: string, secs: number): void => {
    try { localStorage.setItem(key, String(secs)); } catch { /* ignore */ }
};

interface Props {
    duration: number;
    onPick: (secs: number) => void;
    accent?: string;   // hex; tints the icon + active preset. Defaults to teal.
}

const TimerSetting: React.FC<Props> = ({ duration, onPick, accent = DEFAULT_ACCENT }) => {
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState('');
    const choose = (s: number) => { onPick(s); setCustom(''); setOpen(false); };
    const applyCustom = () => { const n = Math.round(Number(custom)); if (n >= TIMER_MIN && n <= TIMER_MAX) choose(n); };
    return (
        <>
            <button onClick={() => setOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-alt border border-divider hover:border-ink-soft/40 text-ink text-sm font-bold transition-colors">
                <Timer size={14} style={{ color: accent }} />
                {duration}s round
                <Pencil size={12} className="text-muted" />
            </button>
            {open && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 animate-fade-in" onClick={() => setOpen(false)}>
                    <div className="w-full max-w-md bg-surface border-t border-divider rounded-t-2xl p-5 pb-7 animate-slide-up" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <p className="text-sm font-bold text-ink">Round length</p>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-ink"><X size={18} /></button>
                        </div>
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
                            <input type="number" inputMode="numeric" min={TIMER_MIN} max={TIMER_MAX} placeholder={`Custom (${TIMER_MIN}–${TIMER_MAX}s)`}
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
