// ---------------------------------------------------------------------------
// Game Night — a playlist of games played in sequence by one crew, with a
// running party leaderboard. Deliberately lightweight and ADDITIVE:
// - State lives in localStorage under one key.
// - Games do NOT get refactored: a scored game's end screen calls
//   reportResult() with its existing per-player scores if a night is active;
//   games without scoring are marked played by the hub itself.
// - App.tsx routes a game's exit back to the hub while a night is active.
//
// Scoring: within each reported game, the top scorer(s) earn 3 night-points,
// every other listed participant earns 1 (showing up counts). The night
// leaderboard aggregates points across games; wins tracks games topped.
// ---------------------------------------------------------------------------

const KEY = 'partyspark_gamenight';

export interface GameNightEntry {
    name: string;
    score: number;
}

export interface GameNightRecord {
    gameId: string;
    played: boolean;
    entries?: GameNightEntry[];
    winners?: string[];
}

export interface GameNightState {
    crew: string[];
    playlist: string[];           // GameType values, in play order
    index: number;                // pointer to the current playlist slot
    records: Record<string, GameNightRecord>;
    startedAt: number;
    finished: boolean;
}

export interface NightStanding {
    name: string;
    points: number;
    wins: number;
}

function load(): GameNightState | null {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const d = JSON.parse(raw) as GameNightState;
        if (!Array.isArray(d.playlist) || !Array.isArray(d.crew)) return null;
        return d;
    } catch {
        return null;
    }
}

function save(state: GameNightState | null): void {
    try {
        if (state) localStorage.setItem(KEY, JSON.stringify(state));
        else localStorage.removeItem(KEY);
    } catch { /* ignore */ }
}

class GameNightService {
    private state: GameNightState | null;

    constructor() {
        this.state = load();
    }

    public start(crew: string[], playlist: string[]): void {
        this.state = {
            crew: crew.map(n => n.trim()).filter(Boolean),
            playlist,
            index: 0,
            records: {},
            startedAt: Date.now(),
            finished: false,
        };
        save(this.state);
    }

    public get(): GameNightState | null {
        return this.state;
    }

    // Active = a night exists and hasn't been finished/abandoned. Games use
    // this to decide whether to report scores; App uses it to reroute exits.
    public isActive(): boolean {
        return !!this.state && !this.state.finished;
    }

    public currentGame(): string | null {
        if (!this.isActive() || !this.state) return null;
        return this.state.playlist[this.state.index] ?? null;
    }

    // Called by a scored game's end screen (no-op unless a night is active
    // and the game is on tonight's playlist). Top score wins; ties share it.
    public reportResult(gameId: string, entries: GameNightEntry[]): void {
        if (!this.isActive() || !this.state) return;
        if (!this.state.playlist.includes(gameId)) return;
        const clean = entries
            .map(e => ({ name: e.name.trim(), score: e.score }))
            .filter(e => e.name);
        const top = clean.length ? Math.max(...clean.map(e => e.score)) : 0;
        this.state.records[gameId] = {
            gameId,
            played: true,
            entries: clean,
            winners: clean.filter(e => e.score === top && clean.length > 0).map(e => e.name),
        };
        save(this.state);
    }

    // Hub marks a game played on return (covers games with no scoring).
    public markPlayed(gameId: string): void {
        if (!this.isActive() || !this.state) return;
        if (this.state.records[gameId]?.played) return;
        this.state.records[gameId] = { ...this.state.records[gameId], gameId, played: true };
        save(this.state);
    }

    public isPlayed(gameId: string): boolean {
        return !!this.state?.records[gameId]?.played;
    }

    // Advance the pointer to the next unplayed playlist slot.
    // Returns its gameId, or null when the playlist is exhausted.
    public advance(): string | null {
        if (!this.isActive() || !this.state) return null;
        for (let i = 0; i < this.state.playlist.length; i++) {
            const gid = this.state.playlist[i];
            if (!this.records()[gid]?.played) {
                this.state.index = i;
                save(this.state);
                return gid;
            }
        }
        return null;
    }

    public records(): Record<string, GameNightRecord> {
        return this.state?.records ?? {};
    }

    // Party leaderboard: 3 points for topping a game, 1 for playing in it.
    public leaderboard(): NightStanding[] {
        const standings = new Map<string, NightStanding>();
        const crew = this.state?.crew ?? [];
        for (const name of crew) standings.set(name, { name, points: 0, wins: 0 });
        for (const rec of Object.values(this.records())) {
            if (!rec.entries) continue;
            for (const e of rec.entries) {
                const s = standings.get(e.name) ?? { name: e.name, points: 0, wins: 0 };
                const won = rec.winners?.includes(e.name);
                s.points += won ? 3 : 1;
                if (won) s.wins += 1;
                standings.set(e.name, s);
            }
        }
        return Array.from(standings.values())
            .sort((a, b) => b.points - a.points || b.wins - a.wins || a.name.localeCompare(b.name));
    }

    public finish(): void {
        if (!this.state) return;
        this.state.finished = true;
        save(this.state);
    }

    // Fully discard the night (finished recaps too).
    public clear(): void {
        this.state = null;
        save(null);
    }
}

export const gameNightService = new GameNightService();
