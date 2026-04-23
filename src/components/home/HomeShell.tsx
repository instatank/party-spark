import React, { useMemo, useState } from 'react';
import { Sparkles, Heart, Search, ChevronRight, Home, Clock, Star, User, Sun, Moon } from 'lucide-react';
import { GAMES, GAME_RICH_META, HOME_FILTERS, gameMatchesFilter, type HomeFilter } from '../../constants';
import { GameType } from '../../types';
import { useTheme } from '../../contexts/ThemeContext';

interface Props {
    onSelectGame: (id: GameType) => void;
}

// =============================================================================
// HomeShell — Direction 05 · Hybrid (search chrome over editorial list)
//
// Replaces the old tile-grid HomeMenu on the design-refresh branch. Structure:
//   • Masthead: wordmark + sparkle + favorites button
//   • Hero: "What are we playing tonight?" (Playfair serif)
//   • Search bar (filters the list by title + vibe + tags)
//   • Filter chips: All / Quick / Couples / Crowd / Spicy
//   • Editorial list: numbered rows with colored dot + metadata + chevron
//   • Bottom tab bar (Home is active; Played/Favorites/Profile are stubs)
//
// The bottom tabs for Played/Favorites/Profile are intentionally non-functional
// — they're placeholders matching the design spec. Wiring them to real screens
// is a later phase.
// =============================================================================

export const HomeShell: React.FC<Props> = ({ onSelectGame }) => {
    const { theme, toggleTheme } = useTheme();
    const [filter, setFilter] = useState<HomeFilter>('all');
    const [query, setQuery] = useState('');

    const filteredGames = useMemo(() => {
        const q = query.trim().toLowerCase();
        return GAMES.filter(g => gameMatchesFilter(g.id, filter)).filter(g => {
            if (!q) return true;
            const meta = GAME_RICH_META[g.id];
            const haystack = [
                g.title, g.description, meta?.vibe || '', ...(meta?.tags || []),
            ].join(' ').toLowerCase();
            return haystack.includes(q);
        });
    }, [filter, query]);

    return (
        <div className="flex flex-col min-h-[100dvh] -m-4 md:-m-6 bg-bg text-ink">
            {/* ============ MASTHEAD ============ */}
            <header className="flex items-center justify-between px-5 pt-5 pb-1">
                <div className="flex items-baseline gap-1.5">
                    <h1 className="font-serif font-extrabold text-[22px] leading-none tracking-[-0.02em] text-ink">
                        PartySpark
                    </h1>
                    <Sparkles size={14} className="text-accent -translate-y-0.5" />
                </div>
                <div className="flex items-center gap-2">
                    {/* Temporary theme toggle — moves to Profile later */}
                    <button
                        onClick={toggleTheme}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        className="w-9 h-9 rounded-[10px] bg-surface-alt border border-border text-ink-soft hover:bg-surface transition-colors flex items-center justify-center"
                    >
                        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                    </button>
                    <button
                        aria-label="Favorites"
                        className="w-9 h-9 rounded-[10px] bg-surface-alt border border-border text-ink-soft hover:bg-surface transition-colors flex items-center justify-center"
                    >
                        <Heart size={16} />
                    </button>
                </div>
            </header>

            {/* ============ HERO + SEARCH + FILTERS ============ */}
            <section className="px-5 pb-4">
                <h2 className="font-serif font-bold text-[30px] leading-[1.05] tracking-[-0.025em] text-ink mt-2 mb-3.5">
                    What are we<br />playing tonight?
                </h2>

                {/* Search bar */}
                <div className="flex items-center gap-2.5 bg-surface border border-border rounded-[14px] px-3.5 py-2.5 mb-3.5">
                    <Search size={17} className="text-muted flex-shrink-0" />
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search games, vibes, or players…"
                        className="flex-1 bg-transparent text-[14px] text-ink placeholder-muted outline-none font-inherit min-w-0"
                    />
                    <span className="text-[10px] font-bold text-muted bg-bg-inset px-1.5 py-0.5 rounded tracking-wider">
                        ⌘K
                    </span>
                </div>

                {/* Filter chips — horizontally scrollable on small screens */}
                <div className="flex gap-1.5 overflow-x-auto -mx-5 px-5 pb-1 no-scrollbar">
                    {HOME_FILTERS.map(f => {
                        const active = filter === f.id;
                        return (
                            <button
                                key={f.id}
                                onClick={() => setFilter(f.id)}
                                className={`flex-shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                                    active
                                        ? 'bg-ink text-bg border-ink'
                                        : 'bg-transparent text-ink-soft border-border hover:bg-surface-alt'
                                }`}
                            >
                                {f.label}
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* ============ EDITORIAL LIST ============ */}
            <div className="flex-1 overflow-y-auto pb-24">
                {filteredGames.length === 0 && (
                    <div className="px-6 py-10 text-center text-muted text-[13px]">
                        No games match that filter. Try another.
                    </div>
                )}
                {filteredGames.map((g, i) => {
                    const meta = GAME_RICH_META[g.id];
                    const isLast = i === filteredGames.length - 1;
                    return (
                        <button
                            key={g.id}
                            onClick={() => onSelectGame(g.id)}
                            className={`w-full flex items-center gap-3.5 px-6 py-4 text-left transition-colors hover:bg-surface-alt active:bg-surface ${
                                isLast ? '' : 'border-b border-border-soft'
                            }`}
                        >
                            {/* 2-digit italic index in Playfair */}
                            <span className="w-[26px] font-serif italic font-semibold text-[14px] tracking-wide text-ink-soft flex-shrink-0">
                                {String(i + 1).padStart(2, '0')}
                            </span>

                            {/* Colored dot with soft halo */}
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{
                                    background: theme === 'light' && meta?.tileColorLight ? meta.tileColorLight : meta?.tileColor,
                                    boxShadow: `0 0 0 3px ${(theme === 'light' && meta?.tileColorLight ? meta.tileColorLight : meta?.tileColor) || '#94A3B8'}25`,
                                }}
                            />

                            {/* Title + metadata */}
                            <div className="flex-1 min-w-0">
                                <h3 className="font-serif font-bold text-[17px] leading-tight tracking-[-0.01em] text-ink truncate">
                                    {g.title}
                                </h3>
                                <p className="mt-0.5 text-[12px] text-muted leading-snug flex items-center gap-2 flex-wrap">
                                    <span>{meta?.vibe || '—'}</span>
                                    <span className="w-[3px] h-[3px] rounded-full bg-muted-deep inline-block" />
                                    <span>{meta?.duration || '—'}</span>
                                    <span className="w-[3px] h-[3px] rounded-full bg-muted-deep inline-block" />
                                    <span>{meta?.players || '—'}</span>
                                </p>
                            </div>

                            <ChevronRight size={16} className="text-muted-deep flex-shrink-0" />
                        </button>
                    );
                })}
            </div>

            {/* ============ BOTTOM TAB BAR ============ */}
            <nav className="fixed bottom-0 left-0 right-0 lg:max-w-md lg:mx-auto h-[74px] bg-bg-elev border-t border-border-soft flex items-stretch shadow-[0_-4px_16px_rgba(0,0,0,0.15)] z-10">
                <TabButton icon={Home} label="Home" active onClick={() => { }} />
                <TabButton icon={Clock} label="Played" active={false} onClick={() => { }} />
                <TabButton icon={Star} label="Favorites" active={false} onClick={() => { }} />
                <TabButton icon={User} label="Profile" active={false} onClick={() => { }} />
            </nav>
        </div>
    );
};

// -----------------------------------------------------------------------------
// Bottom tab button — Home is the only functional tab in this phase.
// -----------------------------------------------------------------------------
interface TabButtonProps {
    icon: React.ComponentType<{ size?: number; className?: string }>;
    label: string;
    active: boolean;
    onClick: () => void;
}

const TabButton: React.FC<TabButtonProps> = ({ icon: Icon, label, active, onClick }) => (
    <button
        onClick={onClick}
        className={`flex-1 flex flex-col items-center justify-center gap-1 transition-colors ${
            active ? 'text-accent' : 'text-muted hover:text-ink-soft'
        }`}
    >
        <Icon size={22} />
        <span className="text-[10px] font-semibold tracking-wide">{label}</span>
    </button>
);
