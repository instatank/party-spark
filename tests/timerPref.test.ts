import { describe, it, expect, beforeEach } from 'vitest';
import { loadTimerPref, saveTimerPref, TIMER_OFF, TIMER_MIN, TIMER_MAX } from '../src/components/ui/TimerSetting';

// The stored round length is three-valued in a way that is easy to get wrong:
// "never chosen", "chosen: N seconds" and "chosen: no timer" — and the last
// one is 0, which is also what an unset key parses to (`Number(null) === 0`).
// A game whose clock ships ON therefore ships OFF if the two are confused,
// silently and only for players who have never opened the timer sheet.
describe('the stored timer preference', () => {
    beforeEach(() => localStorage.clear());

    it('an unset key is NOT "no timer" — it is the game default', () => {
        expect(loadTimerPref('nothing_here', 45, true)).toBe(45);
        expect(loadTimerPref('nothing_here', 60)).toBe(60);
    });

    it('an explicit "no timer" survives a reload, but only where the game allows one', () => {
        saveTimerPref('k', TIMER_OFF);
        expect(loadTimerPref('k', 45, true)).toBe(TIMER_OFF);
        // A game that later drops `allowOff` must not come back up with a
        // clock that never starts.
        expect(loadTimerPref('k', 45)).toBe(45);
    });

    it('keeps a real choice and rejects a nonsense one', () => {
        saveTimerPref('k', 90);
        expect(loadTimerPref('k', 45, true)).toBe(90);
        localStorage.setItem('k', 'banana');
        expect(loadTimerPref('k', 45, true)).toBe(45);
        localStorage.setItem('k', String(TIMER_MAX + 1));
        expect(loadTimerPref('k', 45, true)).toBe(45);
        localStorage.setItem('k', String(TIMER_MIN - 1));
        expect(loadTimerPref('k', 45, true)).toBe(45);
        localStorage.setItem('k', '');
        expect(loadTimerPref('k', 45, true)).toBe(45);
    });
});
