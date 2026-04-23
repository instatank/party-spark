import React, { useMemo, useState } from 'react';
import { Search, Sun, Moon } from 'lucide-react';
import { GAMES, GAME_RICH_META, HOME_FILTERS, gameMatchesFilter, getIcon, type HomeFilter } from '../../constants';
import { GameType } from '../../types';
import { Card } from '../ui/Layout';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
    onSelectGame: (id: GameType) => void;
}

// =============================================================================
// HomeMenu — original tile-grid design with two Phase-2 additions (search bar
// and filter chips). Restored after Phase 2's editorial-list experiment was
// reverted per user feedback.
//
// Color tokens in use:
//   text-ink         — primary text (switches with theme)
//   text-ink-soft    — secondary text / active tabs hover
//   text-muted       — inactive labels, descriptions, placeholder
//   text-muted-deep  — footer fine print
//   bg-party-secondary / text-party-accent — aliased accents
//
// Hardcoded color classes are intentional in exactly three places:
//   1. Game icon tiles (text-white on the game.color bubble) — the bubble is
//      always a saturated color in both themes, so white icons read either way.
//   2. bg-white/5, border-white/10 — semi-transparent overlays behave well in
//      both dark (add highlight) and light (add subtle contrast) modes.
//   3. bg-party-secondary (gold) on the active filter chip — contrast is
//      intentionally fixed; gold + slate-900 text reads in every mode.
// =============================================================================

const COMING_SOON_GAME_IDS: GameType[] = [
    GameType.WOULD_I_LIE_TO_YOU,
    GameType.ICEBREAKERS,
    GameType.WOULD_YOU_RATHER,
    GameType.NEVER_HAVE_I_EVER,
];

export const HomeMenu: React.FC<Props> = ({ onSelectGame }) => {
    const { theme, toggleTheme } = useTheme();
    const [activeTab, setActiveTab] = useState<'active' | 'comingSoon'>('active');
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState<HomeFilter>('all');

    const baseList = activeTab === 'active'
        ? GAMES.filter(g => !COMING_SOON_GAME_IDS.includes(g.id))
        : GAMES.filter(g => COMING_SOON_GAME_IDS.includes(g.id));

    const filteredGames = useMemo(() => {
        const q = query.trim().toLowerCase();
        return baseList
            .filter(g => gameMatchesFilter(g.id, filter))
            .filter(g => {
                if (!q) return true;
                const meta = GAME_RICH_META[g.id];
                const haystack = [
                    g.title, g.description, meta?.vibe || '', ...(meta?.tags || []),
                ].join(' ').toLowerCase();
                return haystack.includes(q);
            });
    }, [baseList, query, filter]);

    return (
        <div className="flex flex-col gap-4 animate-slide-up min-h-[80vh] relative">
            {/* Theme toggle — sits above the title, top-right corner */}
            <button
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-white/5 border border-white/10 text-ink-soft hover:text-ink hover:bg-white/10 transition-colors flex items-center justify-center shadow-sm"
            >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Header (title + Play Now / Coming Soon tabs) */}
            <header className="pt-1 pb-1 text-center">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-party-secondary mb-1 font-serif flex items-center justify-center gap-2">
                    PartySpark <span className="text-2xl sm:text-3xl">✨</span>
                </h1>
                <p className="text-muted text-sm sm:text-base mb-4">
                    <span className="text-party-secondary font-bold">A</span>lways{' '}
                    <span className="text-party-secondary font-bold">I</span>nvited
                </p>

                <div className="grid grid-cols-3 border-b border-white/10 pb-0">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`col-span-2 text-center pb-3 px-2 text-lg font-medium transition-colors relative ${
                            activeTab === 'active' ? 'text-ink' : 'text-muted hover:text-ink-soft'
                        }`}
                    >
                        Play Now
                        {activeTab === 'active' && (
                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-party-secondary rounded-t-sm" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('comingSoon')}
                        className={`col-span-1 text-center pb-3 px-2 text-sm sm:text-base font-medium transition-colors relative flex items-center justify-center ${
                            activeTab === 'comingSoon' ? 'text-ink' : 'text-muted hover:text-ink-soft'
                        }`}
                    >
                        <span className="truncate w-full pr-1">Coming Soon</span>
                        {activeTab === 'comingSoon' && (
                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-party-secondary rounded-t-sm" />
                        )}
                    </button>
                </div>
            </header>

            {/* Search bar + filter chips */}
            <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 bg-white/5 border border-border rounded-xl px-3.5 py-2.5">
                    <Search size={16} className="text-muted flex-shrink-0" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search games, vibes, or players…"
                        className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted outline-none min-w-0"
                    />
                </div>

                <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
                    {HOME_FILTERS.map(f => {
                        const active = filter === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                                    active
                                        ? 'bg-party-secondary text-slate-900 border-party-secondary'
                                        : 'bg-transparent text-muted border-border hover:border-ink-soft hover:text-ink-soft'
                                }`}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Games grid */}
            <div className="grid gap-2.5 pb-6">
                {filteredGames.length === 0 && (
                    <div className="text-center text-muted text-sm py-8">
                        No games match. Try a different filter or search.
                    </div>
                )}
                {filteredGames.map((game) => (
                    <Card
                        key={game.id}
                        onClick={() => onSelectGame(game.id)}
                        className="!p-4 group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95"
                    >
                        <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 rounded-full blur-3xl -mr-10 -mt-10 ${game.color}`} />

                        <div className="flex items-center gap-3 relative z-10">
                            {/* Icon bubble: intentionally text-white — rides on a saturated
                                game-color bg that stays saturated in both themes. */}
                            <div className={`p-3 rounded-2xl ${game.color} shadow-sm text-white`}>
                                {getIcon(game.icon, 24)}
                            </div>
                            <div className="flex-1 w-full overflow-hidden">
                                <div className="flex items-center justify-between mb-0.5 mt-0.5">
                                    <h3 className="text-lg font-bold leading-none text-ink">{game.title}</h3>
                                    <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] font-medium text-party-accent uppercase tracking-wider shrink-0 ml-2">
                                        {game.minPlayers}+ Players
                                    </span>
                                </div>
                                <p className="text-[13px] text-muted leading-snug truncate whitespace-nowrap overflow-hidden pr-2">
                                    {game.description}
                                </p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <footer className="text-center text-xs text-muted-deep mt-auto pb-4">
                Powered by Google Gemini 3 Suite
            </footer>
        </div>
    );
};
