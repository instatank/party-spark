// ---------------------------------------------------------------------------
// Haptics — a thin, fail-silent wrapper over navigator.vibrate.
//
// Platform reality: iOS Safari has never implemented the Vibration API, so
// haptics are effectively Android/Chrome only. Everywhere else (iOS, desktop
// without hardware, SSR) these calls silently no-op — never a hard dependency,
// same philosophy as the optional AI spice.
//
// Four semantic levels, used sparingly at game moments (not on every button):
//   hapticLight   — minor taps (skip, tally +/-, dice-roll tap)
//   hapticSuccess — got it / correct (short double pulse)
//   hapticError   — wrong / rejected (single medium buzz)
//   hapticHeavy   — round expiry, pangram, big moments (long pulse)
// ---------------------------------------------------------------------------

function vibrate(pattern: number | number[]) {
    try {
        if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
        navigator.vibrate(pattern);
    } catch {
        // A haptic must never break gameplay.
    }
}

/** Minor taps — a barely-there acknowledgment (~10ms). */
export function hapticLight() { vibrate(10); }

/** Got it / correct — a crisp short double: tap, gap, tap. */
export function hapticSuccess() { vibrate([15, 60, 25]); }

/** Wrong / rejected — one medium buzz. */
export function hapticError() { vibrate(120); }

/** Round expiry / big moments — a single long, emphatic pulse. */
export function hapticHeavy() { vibrate(300); }
