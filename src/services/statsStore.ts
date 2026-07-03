// ---------------------------------------------------------------------------
// Persistent lifetime stats — localStorage only, NO accounts, ever.
// Every scored game writes here from its end screen: a play count, an
// optional best score, and win credits per player name. The Trophies screen
// reads it all back. Distinct from SessionManager (2h sliding session);
// this store never expires.
//
// Scramble's pre-existing jumble_best_{easy|hard} keys are backfilled into
// the store on first load and left untouched (they remain the in-game
// source of truth for per-difficulty bests).
// ---------------------------------------------------------------------------

const KEY = 'partyspark_stats_v1';

export interface GameStats {
    plays: number;
    best?: number;
    bestLabel?: string;   // human framing for the best, e.g. "112 pts · Hard"
    lastPlayed: number;   // epoch ms
}

export interface StatsData {
    games: Record<string, GameStats>;
    wins: Record<string, number>;   // player name -> total wins across games
    totalPlays: number;
}

function load(): StatsData {
    try {
        const raw = localStorage.getItem(KEY);
        if (raw) {
            const d = JSON.parse(raw) as Partial<StatsData>;
            return {
                games: d.games ?? {},
                wins: d.wins ?? {},
                totalPlays: d.totalPlays ?? 0,
            };
        }
    } catch { /* corrupted / unavailable — start fresh */ }
    return { games: {}, wins: {}, totalPlays: 0 };
}

function save(data: StatsData): void {
    try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
}

// One-time backfill of Scramble's existing solo bests so upgrading users
// keep their history. Runs lazily on first store access.
function backfillJumble(data: StatsData): void {
    if (data.games['JUMBLE']?.best !== undefined) return;
    try {
        const easy = parseInt(localStorage.getItem('jumble_best_easy') || '0', 10) || 0;
        const hard = parseInt(localStorage.getItem('jumble_best_hard') || '0', 10) || 0;
        const best = Math.max(easy, hard);
        if (best > 0) {
            const g = data.games['JUMBLE'] ?? { plays: 0, lastPlayed: 0 };
            g.best = best;
            g.bestLabel = `${best} pts · ${hard >= easy ? 'Hard' : 'Easy'}`;
            data.games['JUMBLE'] = g;
        }
    } catch { /* ignore */ }
}

class StatsStore {
    private data: StatsData;

    constructor() {
        this.data = load();
        backfillJumble(this.data);
    }

    public recordPlay(gameId: string): void {
        const g = this.data.games[gameId] ?? { plays: 0, lastPlayed: 0 };
        g.plays += 1;
        g.lastPlayed = Date.now();
        this.data.games[gameId] = g;
        this.data.totalPlays += 1;
        save(this.data);
    }

    // Keeps the max. Returns true when `score` sets a new best.
    public recordBest(gameId: string, score: number, label?: string): boolean {
        const g = this.data.games[gameId] ?? { plays: 0, lastPlayed: Date.now() };
        const isNew = g.best === undefined || score > g.best;
        if (isNew) {
            g.best = score;
            g.bestLabel = label ?? `${score}`;
            this.data.games[gameId] = g;
            save(this.data);
        }
        return isNew;
    }

    // Credit a win to each named winner (ties allowed). Blank names ignored.
    public recordWins(_gameId: string, winners: string[]): void {
        let dirty = false;
        for (const raw of winners) {
            const name = raw.trim();
            if (!name) continue;
            this.data.wins[name] = (this.data.wins[name] ?? 0) + 1;
            dirty = true;
        }
        if (dirty) save(this.data);
    }

    public getGame(gameId: string): GameStats | undefined {
        return this.data.games[gameId];
    }

    public getAll(): StatsData {
        return this.data;
    }

    // Player leaderboard sorted by wins, then name.
    public topPlayers(limit = 10): { name: string; wins: number }[] {
        return Object.entries(this.data.wins)
            .map(([name, wins]) => ({ name, wins }))
            .sort((a, b) => b.wins - a.wins || a.name.localeCompare(b.name))
            .slice(0, limit);
    }

    public reset(): void {
        this.data = { games: {}, wins: {}, totalPlays: 0 };
        save(this.data);
    }
}

export const statsStore = new StatsStore();
