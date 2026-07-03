// ---------------------------------------------------------------------------
// First-play rules reveal. Each game's landing screen already has a
// collapsible "How To Play" — this decides whether it should start OPEN.
// The first time a game is opened on this device the rules auto-expand
// (and the flag is set immediately, so they start collapsed forever after —
// even if the player backs out without reading).
//
// Usage (in the game component):
//   const [showHowToPlay, setShowHowToPlay] = useState(() => shouldAutoExpandRules('taboo'));
// ---------------------------------------------------------------------------

const PREFIX = 'partyspark_rules_seen_';

export function shouldAutoExpandRules(gameKey: string): boolean {
    try {
        const key = PREFIX + gameKey;
        if (localStorage.getItem(key)) return false;
        localStorage.setItem(key, '1');
        return true;
    } catch {
        return false; // privacy mode — behave like a returning player
    }
}
