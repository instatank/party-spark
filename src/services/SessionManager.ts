
const SESSION_KEY = 'party_spark_session';
const SESSION_DURATION = 2 * 60 * 60 * 1000; // 2 Hours

interface SessionData {
    startTime: number;
    usedContent: {
        [gameId: string]: {
            [category: string]: string[]; // Array of used IDs or Content Hashes
        }
    }
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
                const data: SessionData = JSON.parse(raw);
                // Check expiry
                if (Date.now() - data.startTime < SESSION_DURATION) {
                    return data;
                }
            }
        } catch (e) {
            console.error("Failed to load session", e);
        }

        // Return fresh session if invalid/expired
        return {
            startTime: Date.now(),
            usedContent: {}
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
            this.saveSession();
        }
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
        this.session = {
            startTime: Date.now(),
            usedContent: {}
        };
        this.saveSession();
    }
}

export const sessionService = new SessionService();
