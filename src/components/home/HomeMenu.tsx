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
// HomeMenu — the restored original tile-grid design with two Phase-2 additions:
//   • Search bar (filters by title, vibe, tags)
//   • Filter chips (All / Quick / Couples / Crowd / Spicy)
//
// The "Play Now / Coming Soon" tab split stays; search + chips narrow the
// currently-active tab. Tile visual language (colored icon chip + gradient
// blob + title + min-players pill + description) is unchanged from the
// production home.
// =============================================================================

// Games treated as "coming soon" — surfaced under the second tab.
// Keep this list curated by the product owner; don't derive from state.
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
                className="absolute top-3 right-3 z-20 w-10 h-10 rounded-full bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center shadow-sm"
            >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Header (title + Play Now / Coming Soon tabs) — unchanged from original */}
            <header className="pt-1 pb-1 text-center">
                <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-party-secondary mb-1 font-serif flex items-center justify-center gap-2">
                    PartySpark <span className="text-2xl sm:text-3xl">✨</span>
                </h1>
                <p className="text-gray-400 text-sm sm:text-base mb-4">
                    <span className="text-party-secondary font-bold">A</span>lways{' '}
                    <span className="text-party-secondary font-bold">I</span>nvited
                </p>

                <div className="grid grid-cols-3 border-b border-white/10 pb-0">
                    <button
                        onClick={() => setActiveTab('active')}
                        className={`col-span-2 text-center pb-3 px-2 text-lg font-medium transition-colors relative ${
                            activeTab === 'active' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
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
                            activeTab === 'comingSoon' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        <span className="truncate w-full pr-1">Coming Soon</span>
                        {activeTab === 'comingSoon' && (
                            <span className="absolute bottom-0 left-0 w-full h-0.5 bg-party-secondary rounded-t-sm" />
                        )}
                    </button>
                </div>
            </header>

            {/* Search bar + filter chips — NEW in Phase 2 (narrow the active tab) */}
            <div className="flex flex-col gap-2.5">
                <div className="flex items-center gap-2.5 bg-white/5 border border-white/10 rounded-xl px-3.5 py-2.5">
                    <Search size={16} className="text-gray-400 flex-shrink-0" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search games, vibes, or players…"
                        className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-w-0"
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
                                        : 'bg-transparent text-gray-400 border-white/15 hover:border-white/30 hover:text-gray-200'
                                }`}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Games grid — original Card-based tiles */}
            <div className="grid gap-2.5 pb-6">
                {filteredGames.length === 0 && (
                    <div className="text-center text-gray-500 text-sm py-8">
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
                            <div className={`p-3 rounded-2xl ${game.color} shadow-sm text-white`}>
                                {getIcon(game.icon, 24)}
                            </div>
                            <div className="flex-1 w-full overflow-hidden">
                                <div className="flex items-center justify-between mb-0.5 mt-0.5">
                                    <h3 className="text-lg font-bold leading-none">{game.title}</h3>
                                    <span className="bg-white/5 px-2 py-0.5 rounded text-[10px] font-medium text-party-accent uppercase tracking-wider shrink-0 ml-2">
                                        {game.minPlayers}+ Players
                                    </span>
                                </div>
                                <p className="text-[13px] text-gray-400 leading-snug truncate whitespace-nowrap overflow-hidden pr-2">
                                    {game.description}
                                </p>
                            </div>
                        </div>
                    </Card>
                ))}
            </div>

            <footer className="text-center text-xs text-gray-600 mt-auto pb-4">
                Powered by Google Gemini 3 Suite
            </footer>
        </div>
    );
};
