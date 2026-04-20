import React, { useState, useRef, useEffect } from 'react';
import { Lock, ShieldX, X } from 'lucide-react';

const ADULT_PIN = '0438';
const STORAGE_KEY = 'partyspark_adult_unlocked';
const LOCKOUT_KEY = 'partyspark_pin_locked';
const ATTEMPTS_KEY = 'partyspark_pin_attempts';
const MAX_ATTEMPTS = 5;

export const isAdultUnlocked = (): boolean => {
    return sessionStorage.getItem(STORAGE_KEY) === 'true';
};

export const unlockAdult = (): void => {
    sessionStorage.setItem(STORAGE_KEY, 'true');
    sessionStorage.removeItem(ATTEMPTS_KEY);
    sessionStorage.removeItem(LOCKOUT_KEY);
};

export const isLocked = (): boolean => {
    return sessionStorage.getItem(LOCKOUT_KEY) === 'true';
};

const getAttempts = (): number => {
    return parseInt(sessionStorage.getItem(ATTEMPTS_KEY) || '0', 10);
};

const incrementAttempts = (): number => {
    const next = getAttempts() + 1;
    sessionStorage.setItem(ATTEMPTS_KEY, String(next));
    if (next >= MAX_ATTEMPTS) {
        sessionStorage.setItem(LOCKOUT_KEY, 'true');
    }
    return next;
};

interface PinGateProps {
    onSuccess: () => void;
    onCancel: () => void;
}

export const PinGateModal: React.FC<PinGateProps> = ({ onSuccess, onCancel }) => {
    const [digits, setDigits] = useState(['', '', '', '']);
    const [error, setError] = useState(false);
    const [shake, setShake] = useState(false);
    const [locked, setLocked] = useState(isLocked());
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
            const pin = newDigits.join('');
            if (pin === ADULT_PIN) {
                unlockAdult();
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
            <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
                <div className="bg-neutral-900 border border-red-800/50 rounded-2xl p-8 w-full max-w-sm shadow-2xl relative">
                    <button onClick={onCancel} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                        <X size={20} />
                    </button>

                    <div className="flex justify-center mb-4">
                        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-700 to-red-900 flex items-center justify-center shadow-lg shadow-red-900/50">
                            <ShieldX size={28} className="text-red-300" />
                        </div>
                    </div>

                    <h3 className="text-xl font-bold text-red-400 text-center mb-2">Access Locked</h3>
                    <p className="text-sm text-gray-400 text-center mb-2">
                        Too many incorrect attempts.
                    </p>
                    <p className="text-xs text-gray-500 text-center">
                        Close and reopen the app to try again.
                    </p>
                </div>
            </div>
        );
    }

    const remaining = MAX_ATTEMPTS - attempts;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 p-4">
            <div className={`bg-neutral-900 border border-neutral-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl relative ${shake ? 'animate-shake' : ''}`}>
                <button onClick={onCancel} className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors">
                    <X size={20} />
                </button>

                <div className="flex justify-center mb-4">
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center shadow-lg shadow-red-900/30">
                        <Lock size={28} className="text-white" />
                    </div>
                </div>

                <h3 className="text-xl font-bold text-white text-center mb-1">Adults Only</h3>
                <p className="text-sm text-gray-400 text-center mb-6">Enter the 4-digit PIN to access this content</p>

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
                                    ? 'border-red-500 bg-red-950/30 text-red-400'
                                    : 'border-neutral-600 bg-neutral-800 text-white focus:border-pink-500 focus:bg-neutral-800'
                                }`}
                        />
                    ))}
                </div>

                {error && (
                    <p className="text-red-400 text-sm text-center animate-in fade-in">
                        Wrong PIN. {remaining} {remaining === 1 ? 'attempt' : 'attempts'} remaining.
                    </p>
                )}
            </div>
        </div>
    );
};
