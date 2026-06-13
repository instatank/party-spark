import React, { useState, useRef, useEffect } from 'react';
import { Lock, ShieldX, X } from 'lucide-react';

// Frontend-only PIN gate (sessionStorage, stateless). DO NOT refactor to a
// backend. The default adult PIN stays 0438. The component is parameterised so
// a SEPARATE gate (own PIN + own sessionStorage key + own 5-attempt lockout)
// can be layered on extra-sensitive content without touching the adult default.
const ADULT_PIN = '0438';
const ADULT_KEY = 'partyspark_adult_unlocked';
const MAX_ATTEMPTS = 5;

// Generic unlock check for any gate key. isAdultUnlocked = the default gate.
export const isUnlocked = (key: string = ADULT_KEY): boolean =>
    sessionStorage.getItem(key) === 'true';
export const isAdultUnlocked = (): boolean => isUnlocked(ADULT_KEY);

interface PinGateProps {
    onSuccess: () => void;
    onCancel: () => void;
    pin?: string;          // default 0438
    storageKey?: string;   // default adult key
    title?: string;
    subtitle?: string;
}

export const PinGateModal: React.FC<PinGateProps> = ({
    onSuccess,
    onCancel,
    pin = ADULT_PIN,
    storageKey = ADULT_KEY,
    title = 'Adults Only',
    subtitle = 'Enter the 4-digit PIN to access this content',
}) => {
    // Per-gate lockout + attempt counters so different gates don't interfere.
    const LOCKOUT_KEY = `${storageKey}__locked`;
    const ATTEMPTS_KEY = `${storageKey}__attempts`;
    const readLocked = (): boolean => sessionStorage.getItem(LOCKOUT_KEY) === 'true';
    const getAttempts = (): number => parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0', 10);
    const incrementAttempts = (): number => {
        const next = getAttempts() + 1;
        sessionStorage.setItem(ATTEMPTS_KEY, String(next));
        if (next >= MAX_ATTEMPTS) sessionStorage.setItem(LOCKOUT_KEY, 'true');
        return next;
    };
    const unlock = (): void => {
        sessionStorage.setItem(storageKey, 'true');
        sessionStorage.removeItem(ATTEMPTS_KEY);
        sessionStorage.removeItem(LOCKOUT_KEY);
    };

    const [digits, setDigits] = useState(['', '', '', '']);
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [locked, setLocked] = useState(readLocked());
    const [attempts, setAttempts] = useState(getAttempts());
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    useEffect(() => {
        if (!locked) inputRefs.current[0]?.focus();
    }, [locked]);

    const handleChange = (index: number, value: string) => {
        if (locked) return;
        if (!/^\d*$/.test(value)) return;

        const newDigits = [...digits];
        newDigits[index] = value.slice(-1);
        setDigits(newDigits);
        setError(false);

        if (value && index < 3) {
            inputRefs.current[index + 1]?.focus();
        }

        if (index === 3 && value) {
            const entered = newDigits.join('');
            if (entered === pin) {
                unlock();
                onSuccess();
            } else {
                const newCount = incrementAttempts();
                setAttempts(newCount);
                if (newCount >= MAX_ATTEMPTS) {
                    setLocked(true);
                } else {
                    setError(true);
                    setShake(true);
                    setTimeout(() => {
                        setShake(false);
                        setDigits(['', '', '', '']);
                        inputRefs.current[0]?.focus();
                    }, 600);
                }
            }
        }
    };

    const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
        if (locked) return;
        if (e.key === 'Backspace' && !digits[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    // Locked out screen
    if (locked) {
        return (
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                <div className="bg-surface border border-red-500/40 rounded-2xl p-8 w-full max-w-sm relative" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <button onClick={onCancel} className="absolute top-4 right-4 text-muted hover:text-ink transition-colors">
                        <X size={20} />
                    </button>

                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-lg">
                            <ShieldX size={28} className="text-white" />
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-red-500 text-center mb-2">Access Locked</h3>
                    <p className="text-sm text-ink-soft text-center mb-2">
                        Too many incorrect attempts.
                    </p>
                    <p className="text-xs text-muted text-center">
                        Close and reopen the app to try again.
                    </p>
                </div>
            </div>
        );
    }

    const remaining = MAX_ATTEMPTS - attempts;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className={`bg-surface border border-divider rounded-2xl p-8 w-full max-w-sm relative ${shake ? 'animate-shake' : ''}`} style={{ boxShadow: 'var(--shadow-card)' }}>
                <button onClick={onCancel} className="absolute top-4 right-4 text-muted hover:text-ink transition-colors">
                    <X size={20} />
                </button>

                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg">
                        <Lock size={28} className="text-white" />
                    </div>
                </div>

                <h3 className="text-xl font-bold text-ink text-center mb-1">{title}</h3>
                <p className="text-sm text-muted text-center mb-6">{subtitle}</p>

                <div className="flex justify-center gap-3 mb-4">
                    {digits.map((digit, i) => (
                        <input
                            key={i}
                            ref={el => { inputRefs.current[i] = el; }}
                            type="tel"
                            inputMode="numeric"
                            maxLength={1}
                            value={digit}
                            onChange={e => handleChange(i, e.target.value)}
                            onKeyDown={e => handleKeyDown(i, e)}
                            className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 outline-none transition-all
                                ${error
                                    ? 'border-red-500 bg-red-500/10 text-red-500'
                                    : 'border-divider bg-surface-alt text-ink focus:border-accent'
                                }`}
                        />
                    ))}
                </div>

                {error && (
                    <p className="text-red-500 text-sm text-center animate-in fade-in">
                        Wrong PIN. {remaining} {remaining === 1 ? 'attempt' : 'attempts'} remaining.
                    </p>
                )}
            </div>
        </div>
    );
};
