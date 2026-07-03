// ---------------------------------------------------------------------------
// Daily Scramble — the between-parties habit loop. Everyone in the world gets
// the same letter set on a given date (date-seeded deterministic pick from
// the bundled set pool — no server), one attempt per day, and a streak with
// ONE freeze forgiveness per calendar week (rigid streaks cause quit-churn:
// missing a single day shouldn't erase a month).
//
// All persistence is localStorage. The Scramble component owns gameplay;
// this module owns the calendar math, the streak rules, and the spoiler-free
// emoji share text.
// ---------------------------------------------------------------------------

const KEY = 'partyspark_daily_scramble';

export interface DailyResult {
    score: number;
    words: number;
    pangram: boolean;
}

interface DailyState {
    lastPlayedDay?: string;                  // 'YYYY-MM-DD' local
    streak: number;
    freezeWeek?: string;                     // week key when the freeze was spent
    history: Record<string, DailyResult>;    // day -> result
}

// --- calendar helpers (all LOCAL time — a daily ritual follows the player) --

export function dayKey(d: Date = new Date()): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
}

export function dayLabel(d: Date = new Date()): string {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[d.getMonth()]} ${d.getDate()}`;
}

function daysBetween(fromDay: string, toDay: string): number {
    const [fy, fm, fd] = fromDay.split('-').map(Number);
    const [ty, tm, td] = toDay.split('-').map(Number);
    const from = new Date(fy, fm - 1, fd);
    const to = new Date(ty, tm - 1, td);
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

// ISO-8601 week key like '2026-W27' (weeks run Mon-Sun; Thursday decides year).
export function weekKey(d: Date = new Date()): string {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dayNum = (date.getDay() + 6) % 7; // Mon=0..Sun=6
    date.setDate(date.getDate() - dayNum + 3); // this week's Thursday
    const isoYear = date.getFullYear();
    const jan4 = new Date(isoYear, 0, 4);
    const jan4DayNum = (jan4.getDay() + 6) % 7;
    const week1Thursday = new Date(isoYear, 0, 4 - jan4DayNum + 3);
    const week = 1 + Math.round((date.getTime() - week1Thursday.getTime()) / (7 * 86_400_000));
    return `${isoYear}-W${String(week).padStart(2, '0')}`;
}

// Deterministic per-date index into a pool of `poolSize` sets. FNV-1a over
// the day key so consecutive dates land far apart in the pool.
export function dailySetIndex(poolSize: number, d: Date = new Date()): number {
    const s = dayKey(d);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return Math.abs(h) % Math.max(1, poolSize);
}

// --- store -------------------------------------------------------------------

function load(): DailyState {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const d = JSON.parse(raw) as Partial<DailyState>;
            return {
                lastPlayedDay: d.lastPlayedDay,
                streak: d.streak ?? 0,
                freezeWeek: d.freezeWeek,
                history: d.history ?? {},
            };
        }
    } catch { /* fresh start */ }
    return { streak: 0, history: {} };
}

function save(s: DailyState): void {
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

class DailyStore {
    private s: DailyState;

    constructor() {
        this.s = load();
    }

    public hasPlayedToday(): boolean {
        return this.s.lastPlayedDay === dayKey();
    }

    public getTodayResult(): DailyResult | null {
        return this.s.history[dayKey()] ?? null;
    }

    // The streak as it stands right now. A streak survives overnight until
    // the day AFTER tomorrow: played yesterday = alive (play today to extend);
    // one missed day can still be frozen at next play; two+ missed days = 0.
    public getStreak(): number {
        if (!this.s.lastPlayedDay || this.s.streak === 0) return 0;
        const gap = daysBetween(this.s.lastPlayedDay, dayKey());
        if (gap <= 1) return this.s.streak;
        if (gap === 2 && this.freezeAvailable()) return this.s.streak; // rescuable
        return 0;
    }

    public freezeAvailable(): boolean {
        return this.s.freezeWeek !== weekKey();
    }

    // Record today's result and roll the streak. One result per day — repeat
    // calls on the same day keep the first (the daily is one attempt).
    public recordResult(result: DailyResult): { streak: number; usedFreeze: boolean } {
        const today = dayKey();
        if (this.s.lastPlayedDay === today) {
            return { streak: this.s.streak, usedFreeze: false };
        }

        let usedFreeze = false;
        if (!this.s.lastPlayedDay) {
            this.s.streak = 1;
        } else {
            const gap = daysBetween(this.s.lastPlayedDay, today);
            if (gap === 1) {
                this.s.streak += 1;
            } else if (gap === 2 && this.freezeAvailable()) {
                // One missed day, forgiven — the streak keeps counting.
                this.s.streak += 1;
                this.s.freezeWeek = weekKey();
                usedFreeze = true;
            } else {
                this.s.streak = 1;
            }
        }

        this.s.lastPlayedDay = today;
        this.s.history[today] = result;
        save(this.s);
        return { streak: this.s.streak, usedFreeze };
    }

    public getHistory(): Record<string, DailyResult> {
        return this.s.history;
    }
}

export const dailyStore = new DailyStore();

// --- share text ---------------------------------------------------------------
// Spoiler-free: green squares for found words against the common-word target,
// no letters or answers revealed. Reads like a Wordle grid in a group chat.

export function buildDailyShareText(opts: {
    words: number;
    score: number;
    pangram: boolean;
    streak: number;
    maxWords: number;   // common-word count for the day's set
    date?: Date;
}): string {
    const { words, score, pangram, streak, maxWords } = opts;
    const cells = 10;
    const target = Math.max(1, maxWords);
    const filled = Math.max(0, Math.min(cells, Math.round((words / target) * cells)));
    const grid = '🟩'.repeat(filled) + '⬜'.repeat(cells - filled);
    const lines = [
        `PartySpark Daily Scramble — ${dayLabel(opts.date)}`,
        `${grid} ${words}/${target} words · ${score} pts${pangram ? ' ⭐' : ''}`,
    ];
    if (streak > 1) lines.push(`🔥 ${streak}-day streak`);
    return lines.join('\n');
}
