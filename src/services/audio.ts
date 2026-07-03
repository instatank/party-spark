// ---------------------------------------------------------------------------
// Shared Web Audio synth kit — used by 5 Alive, Linked, and Scramble (Jumble).
// All sounds are synthesized (no bundled assets, sub-millisecond latency, and
// it dodges the royalty-free-buzzer hunt entirely). One module-level context
// is created lazily and resumed on the first user gesture (mobile autoplay
// unlock) — games call unlockAudio() from a tap handler before their first
// round.
// ---------------------------------------------------------------------------

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
    try {
        if (!audioCtx) {
            const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
            if (!Ctor) return null;
            audioCtx = new Ctor();
        }
        if (audioCtx.state === 'suspended') void audioCtx.resume();
        return audioCtx;
    } catch {
        return null;
    }
}

// Call on a user gesture to prime the context before the first round.
export function unlockAudio() { getAudioCtx(); }

// Generic one-oscillator blip. Unlike the named sounds below, this waits for a
// suspended context to actually resume before scheduling — which matters on
// iOS when the first sound and the unlocking gesture land in the same tick.
export function beep(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.18) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const run = () => {
        const t = ctx.currentTime + 0.02;
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.type = type; osc.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(g).connect(ctx.destination);
        osc.start(t); osc.stop(t + dur + 0.03);
    };
    if (ctx.state === 'suspended') ctx.resume().then(run).catch(() => {}); else run();
}

// End-of-round signal (5 Alive) — a bright bell "ding-ding" rather than a
// harsh buzzer. Each strike is a stack of sine partials (roughly modeled on a
// struck bell: fundamental + a few inharmonic overtones) with a fast attack
// and a long exponential ring-out.
export function playBell() {
    const ctx = getAudioCtx();
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

// End-of-round signal (Linked) — a classic harsh game-show buzzer.
export function playBuzzer() {
    const ctx = getAudioCtx();
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

// Countdown tick. Gain differs slightly per game (5 Alive 0.16, Linked 0.14).
export function playTick(gain = 0.16) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(gain, now + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);
}

// "Got it!" reward (Linked) — a soft two-note triangle chime.
export function playDing() {
    const ctx = getAudioCtx();
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
