import { useLayoutEffect, useRef, useState } from 'react';

export interface CountdownOptions {
    /** Whether the countdown is live, e.g. `gameState === 'PLAYING'`. */
    running: boolean;
    /** Full length of one run, in milliseconds. */
    durationMs: number;
    /** Changing this while `running` restarts the countdown from the top. */
    restartKey?: unknown;
    /**
     * Fires once per displayed-second change, including on the first frame of
     * a run (so a 2s round reports 2, then 1) and with 0 on the expiry frame.
     * Games use it for tick sounds in their own second-windows.
     */
    onSecond?: (secLeft: number) => void;
    /** Fires exactly once per run, the frame the deadline passes. */
    onExpire?: () => void;
}

/**
 * Shared round-countdown driver — rAF against a `performance.now()` deadline,
 * so it drains smoothly for progress rings and stays correct under
 * background-tab throttling (no setInterval drift).
 *
 * While not running, `remainingMs` freezes at its last value (games read it
 * post-round, e.g. Fact or Fiction's "TIME'S UP" vs "INCORRECT" reveal). Each
 * new run snaps back to the full duration before paint (useLayoutEffect), so
 * the first visible frame of a round never shows the previous round's value.
 */
export function useCountdown({ running, durationMs, restartKey, onSecond, onExpire }: CountdownOptions): {
    remainingMs: number;
    secondsLeft: number;
} {
    const [remainingMs, setRemainingMs] = useState(durationMs);

    // Callbacks live in refs so a fresh identity each render doesn't restart
    // the run; the loop always sees the latest closures. Synced in a no-deps
    // layout effect (after every commit, before any rAF frame can fire).
    const onSecondRef = useRef(onSecond);
    const onExpireRef = useRef(onExpire);
    useLayoutEffect(() => {
        onSecondRef.current = onSecond;
        onExpireRef.current = onExpire;
    });

    useLayoutEffect(() => {
        if (!running) return;
        const deadline = performance.now() + durationMs;
        let lastSec = -1;   // impossible value → the first frame always reports its second
        let fired = false;  // guards against a double onExpire
        // Deliberate pre-paint snap to the full duration (this is a layout
        // effect): without it, the first visible frame of a new run would
        // briefly show the previous run's frozen value (e.g. "0").
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRemainingMs(durationMs);

        let raf = 0;
        const frame = () => {
            const left = Math.max(0, deadline - performance.now());
            setRemainingMs(left);
            const sec = Math.ceil(left / 1000);
            if (sec !== lastSec) {
                lastSec = sec;
                onSecondRef.current?.(sec);
            }
            if (left <= 0) {
                if (!fired) {
                    fired = true;
                    onExpireRef.current?.();
                }
                return;
            }
            raf = requestAnimationFrame(frame);
        };
        raf = requestAnimationFrame(frame);
        return () => cancelAnimationFrame(raf);
    }, [running, durationMs, restartKey]);

    return { remainingMs, secondsLeft: Math.ceil(remainingMs / 1000) };
}
