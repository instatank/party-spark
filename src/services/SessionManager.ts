const SESSION_KEY = 'party_spark_session';
// Sliding window: a session expires after this much *inactivity*. Each call
// to markAsUsed bumps lastActivity. So a long party-game arc (e.g. 7pm to
// midnight) stays one session as long as cards keep getting played.
const SESSION_INACTIVITY_MS = 2 * 60 * 60 * 1000; // 2 hours of idle

interface SessionData {
    startTime: number;
    lastActivity: number;
    usedContent: {
        [gameId: string]: {
            [category: string]: string[]; // Array of used IDs or content hashes
        }
    };
    // Optional team names shared across team-supporting games (Charades,
    // Taboo, Fact or Fiction). Persisted under the same sliding window as
    // usedContent. Empty array (or absent) means "no teams set" — games fall
    // back to anonymous scoring.
    teams?: string[];
    // Optional individual player names shared across player-based games
    // (Forecast, Truth or Drink, Imposter, Mini Mafia). Same sliding-window
    // persistence as the team roster; absent/empty means "no players set"
    // and games fall back to their anonymous / per-game-input flow.
    players?: string[];
}

class SessionService {
    private session: SessionData;

    constructor() {
        this.session = this.loadSession();
    }

    private loadSession(): SessionData {
        try {
            const raw = localStorage.getItem(SESSION_KEY);
            if (raw) {
                const data = JSON.parse(raw) as Partial<SessionData>;
                // Backwards-compat: pre-sliding-window sessions only had startTime;
                // treat startTime as the de-facto lastActivity in that case.
                const lastActivity = data.lastActivity ?? data.startTime ?? 0;
                if (Date.now() - lastActivity < SESSION_INACTIVITY_MS) {
                    return {
                        startTime: data.startTime ?? Date.now(),
                        lastActivity,
                        usedContent: data.usedContent ?? {},
                        teams: data.teams,
                        players: data.players,
                    };
                }
            }
        } catch (e) {
            console.error("Failed to load session", e);
        }

        return {
            startTime: Date.now(),
            lastActivity: Date.now(),
            usedContent: {},
        };
    }

    private saveSession() {
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(this.session));
        } catch (e) {
            console.error("Failed to save session", e);
        }
    }

    public markAsUsed(gameId: string, category: string, idOrHash: string) {
        if (!this.session.usedContent[gameId]) {
            this.session.usedContent[gameId] = {};
        }
        if (!this.session.usedContent[gameId][category]) {
            this.session.usedContent[gameId][category] = [];
        }

        if (!this.session.usedContent[gameId][category].includes(idOrHash)) {
            this.session.usedContent[gameId][category].push(idOrHash);
        }
        // Bump the sliding-window timer on every play so an active party night
        // stays one session even if it runs past 2 hours from the start.
        this.session.lastActivity = Date.now();
        this.saveSession();
    }

    public getUsageCount(gameId: string): number {
        if (!this.session.usedContent[gameId]) return 0;
        return Object.values(this.session.usedContent[gameId]).reduce((acc, curr) => acc + curr.length, 0);
    }

    public getUsedItems(gameId: string, category: string): string[] {
        return this.session.usedContent[gameId]?.[category] || [];
    }

    public isUsed(gameId: string, category: string, idOrHash: string): boolean {
        return this.getUsedItems(gameId, category).includes(idOrHash);
    }

    public filterContent<T>(
        gameId: string,
        category: string,
        items: T[],
        idFn: (item: T) => string
    ): T[] {
        const used = this.getUsedItems(gameId, category);
        return items.filter(item => !used.includes(idFn(item)));
    }

    public resetSession() {
        const now = Date.now();
        this.session = {
            startTime: now,
            lastActivity: now,
            usedContent: {},
        };
        this.saveSession();
    }

    // -------- Team roster (shared across team-supporting games) --------
    // Returns the saved team names, or an empty array if none set.
    public getTeams(): string[] {
        return this.session.teams ?? [];
    }

    // Save a team roster. Pass an empty array (or call clearTeams) to revert
    // to the anonymous-score default. Bumps the sliding-window timer.
    public setTeams(names: string[]) {
        const cleaned = names.map(n => n.trim()).filter(Boolean);
        this.session.teams = cleaned.length > 0 ? cleaned : undefined;
        this.session.lastActivity = Date.now();
        this.saveSession();
    }

    public clearTeams() {
        this.session.teams = undefined;
        this.session.lastActivity = Date.now();
        this.saveSession();
    }

    // -------- Player roster (shared across player-based games) --------
    // Different concept from teams — these are individual humans whose names
    // are used for in-game roles (Forecast A/B, TOD turn rotation, Imposter
    // assignment, Mafia roles). Each game enforces its own min/max but they
    // all read/write to the same array so names auto-fill across games.
    public getPlayers(): string[] {
        return this.session.players ?? [];
    }

    // Save the player roster. Trims whitespace, filters empties. Pass an
    // empty array (or call clearPlayers) to revert to game-specific defaults.
    public setPlayers(names: string[]) {
        const cleaned = names.map(n => n.trim()).filter(Boolean);
        this.session.players = cleaned.length > 0 ? cleaned : undefined;
        this.session.lastActivity = Date.now();
        this.saveSession();
    }

    public clearPlayers() {
        this.session.players = undefined;
        this.session.lastActivity = Date.now();
        this.saveSession();
    }
}

export const sessionService = new SessionService();

// Fisher-Yates shuffle. Returns a new array — does NOT mutate the input.
// Replaces the biased `[...arr].sort(() => 0.5 - Math.random())` pattern
// that several games used; produces a uniform random permutation.
export function shuffle<T>(items: readonly T[]): T[] {
    const arr = items.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
