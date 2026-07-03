// ---------------------------------------------------------------------------
// Shared Web Audio synth + haptics for all games. No bundled assets — every
// sound is synthesized (sub-millisecond latency, no royalty-free-buzzer hunt).
// The context is created lazily and resumed on the first user gesture (mobile
// autoplay unlock) — call unlockAudio() from a tap handler before the first
// scheduled sound (e.g. when a round starts).
//
// The named sounds were extracted verbatim from FiveAlive (bell/tick),
// Linked (buzzer/ding/tick), and Scramble (soft ding/pangram/end-buzz/soft
// tick) so those games sound identical after switching to this module.
//
// App-wide mute: persisted in localStorage; silences BOTH sound and haptics
// (one quiet switch — a muted phone at a party shouldn't buzz either).
// Semantic haptic levels (light/success/error/heavy) live in haptics.ts and
// respect the same switch via isMuted().
// ---------------------------------------------------------------------------

const MUTE_KEY = 'partyspark_muted';

let muted = false;
try {
    muted = localStorage.getItem(MUTE_KEY) === '1';
} catch { /* SSR / privacy mode — default unmuted */ }

export const isMuted = (): boolean => muted;

export const setMuted = (m: boolean): void => {
    muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0'); } catch { /* ignore */ }
};

export const toggleMuted = (): boolean => {
    setMuted(!muted);
    return muted;
};

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
    try {
        if (!audioCtx) {
            const Ctor = window.AudioContext
                || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;
            audioCtx = new Ctor();
        }
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        return audioCtx;
    } catch {
        return null;
    }
}

// Call on a user gesture to prime the context before the first scheduled sound.
export function unlockAudio(): void { getCtx(); }

// Generic one-oscillator envelope blip. `at` is an offset (s) from now. Unlike
// the raw scheduling in the named sounds below, this waits for a suspended
// context to actually resume before scheduling — which matters on iOS when the
// first sound and the unlocking gesture land in the same tick.
export function beep(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18, at = 0): void {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const run = () => {
        const t = ctx.currentTime + 0.02 + at;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = type;
        osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.03);
    };
    if (ctx.state === 'suspended') ctx.resume().then(run).catch(() => {}); else run();
}

// --- Timers ----------------------------------------------------------------

// Sharp countdown tick (5 Alive / Linked / Taboo). Gain differs slightly per
// game (5 Alive passes 0.16, Linked 0.14; default matches the rest).
export function playTick(gain = 0.15): void {
    beep(880, 0.08, 'square', gain);
}

// Softer tick for fast cadences (Scramble's final-seconds tick).
export function playTickSoft(): void {
    beep(700, 0.05, 'square', 0.1);
}

// --- Round-end signals -------------------------------------------------------

// Bright bell "ding-ding" — 5 Alive's end-of-round signal. Each strike is a
// stack of sine partials (fundamental + inharmonic overtones) with a fast
// attack and a long exponential ring-out.
export function playBell(): void {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const strike = (t0: number, base: number) => {
        const partials: { ratio: number; gain: number; decay: number }[] = [
            { ratio: 1.0,  gain: 0.26, decay: 1.5 },
            { ratio: 2.0,  gain: 0.16, decay: 1.0 },
            { ratio: 2.97, gain: 0.10, decay: 0.7 },
            { ratio: 4.1,  gain: 0.06, decay: 0.45 },
        ];
        partials.forEach(({ ratio, gain, decay }) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = base * ratio;
            g.gain.setValueAtTime(0.0001, t0);
            g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
            osc.connect(g).connect(ctx.destination);
            osc.start(t0);
            osc.stop(t0 + decay + 0.05);
        });
    };
    const now = ctx.currentTime;
    strike(now, 880);          // first ding (~A5)
    strike(now + 0.17, 1175);  // second, brighter (~D6) — "ding-ding, time!"
}

// Harsh game-show buzzer — Linked's time's-up sound. Two detuned squares.
export function playBuzzer(): void {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const dur = 0.85;
    [110, 165].forEach((freq) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.3, now + 0.01);
        gain.gain.setValueAtTime(0.3, now + dur - 0.06);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now);
        osc.stop(now + dur);
    });
}

// Shorter, softer end-buzz — Scramble's timer-out sound.
export function playBuzzEnd(): void {
    beep(180, 0.5, 'sawtooth', 0.2);
}

// --- Positive feedback --------------------------------------------------------

// Two-note triangle "got it!" ding — Linked's correct-answer sound.
export function playDing(): void {
    if (muted) return;
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    [660, 990].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const t = now + i * 0.07;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.18, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.25);
    });
}

// Single soft ding — Scramble's valid-word blip.
export function playDingSoft(): void {
    beep(880, 0.12, 'sine', 0.16);
}

// Rising two-note celebration — Scramble's pangram fanfare.
export function playPangram(): void {
    beep(880, 0.18);
    beep(1320, 0.25, 'sine', 0.18, 0.12);
}

// Gentle two-note reveal chime (Forecast reveals, Imposter role reveal).
export function playReveal(): void {
    beep(523, 0.22, 'sine', 0.14);
    beep(784, 0.3, 'sine', 0.14, 0.1);
}

// Tiny neutral tap blip (button acknowledgements, e.g. NHIE verdict taps).
export function playPop(): void {
    beep(440, 0.06, 'triangle', 0.12);
}

// --- Haptics -----------------------------------------------------------------
// navigator.vibrate is Android/Chrome-only; everywhere else this is a no-op.
// Muted app = silent phone: haptics respect the same switch. These are the
// compact aliases; the semantic set (light/success/error/heavy) lives in
// haptics.ts and shares the mute switch.

export function vibrate(pattern: number | number[]): void {
    if (muted) return;
    try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export const hapticTap = (): void => vibrate(12);
export const hapticSuccess = (): void => vibrate([15, 40, 20]);
export const hapticBuzz = (): void => vibrate([60, 40, 60]);
