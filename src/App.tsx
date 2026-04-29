import React, { useState, useEffect, useMemo } from 'react';
import { Search } from 'lucide-react';
import { GameType } from './types';
import { GAMES, getIcon, GAME_RICH_META, HOME_FILTERS, gameMatchesFilter, type HomeFilter } from './constants';
import { Card } from './components/ui/Layout';
import { PinGateModal, isAdultUnlocked } from './components/ui/PinGate';
import { ThemeToggle } from './components/ui/ThemeToggle';
import { CharadesGame } from './components/games/CharadesGame';
import { TabooGame } from './components/games/TabooGame';
import { IcebreakerGame } from './components/games/IcebreakerGame';
import { ImposterGame } from './components/games/ImposterGame';
import { WouldYouRatherGame } from './components/games/WouldYouRatherGame';
import RoastGame from './components/games/RoastGame';
import { MostLikelyToGame } from './components/games/MostLikelyToGame';
import { WouldILieToYouGame } from './components/games/WouldILieToYouGame';
import { NeverHaveIEverGame } from './components/games/NeverHaveIEverGame';
import { MiniMafiaGame } from './components/games/MiniMafiaGame';
import { FactOrFictionGame } from './components/games/FactOrFictionGame';
import { CompatibilityTestGame } from './components/games/CompatibilityTestGame';
import { TruthOrDrinkGame } from './components/games/TruthOrDrinkGame';

const SplashScreen = () => (
  <div className="fixed inset-0 z-[100] bg-app flex items-center justify-center overflow-hidden font-sans">
    {/* Background layer — bg image is dark-tuned, so we drop its opacity in
        light mode via the .splash-bg helper to keep things airy. */}
    <div className="absolute inset-0 z-0">
      <div className="absolute inset-0 bg-app" />
      <div
        className="splash-bg absolute inset-0 bg-cover bg-center mix-blend-overlay"
        style={{ backgroundImage: 'url("/splash-bg.jpg")' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-app via-transparent to-app/50" />
    </div>

    <div className="relative z-10 text-center px-6 flex flex-col items-center animate-slide-up">
      <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-gold mb-2 font-serif flex items-center gap-3">
        PartySpark <span className="text-3xl md:text-5xl">✨</span>
      </h1>
      <p className="text-muted text-lg md:text-xl max-w-xs mx-auto mb-12">
        <span className="text-gold font-bold">A</span>lways{' '}
        <span className="text-gold font-bold">I</span>nvited
      </p>

      <div className="flex gap-3">
        <div className="w-3 h-3 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-3 h-3 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-3 h-3 bg-accent rounded-full animate-bounce" />
      </div>
    </div>
  </div>
);

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeGame, setActiveGame] = useState<GameType>(GameType.HOME);

  useEffect(() => {
    // Show splash screen for 5 seconds then transition to home
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  // Simple Router Switch
  const renderContent = () => {
    switch (activeGame) {
      case GameType.ROAST:
        return <RoastGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.IMPOSTER:
        return <ImposterGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.CHARADES:
        return <CharadesGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.TABOO:
        return <TabooGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.WOULD_YOU_RATHER:
        return <WouldYouRatherGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.MOST_LIKELY_TO:
        return <MostLikelyToGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.WOULD_I_LIE_TO_YOU:
        return <WouldILieToYouGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.NEVER_HAVE_I_EVER:
        return <NeverHaveIEverGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.MINI_MAFIA:
        return <MiniMafiaGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.ICEBREAKERS:
        return <IcebreakerGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.FACT_OR_FICTION:
        return <FactOrFictionGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.COMPATIBILITY_TEST:
        return <CompatibilityTestGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.TRUTH_OR_DRINK:
        return <TruthOrDrinkGame onExit={() => setActiveGame(GameType.HOME)} />;
      default:
        return <HomeMenu onSelectGame={setActiveGame} />;
    }
  };

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div className="min-h-screen bg-app text-ink p-4 md:p-6 lg:max-w-md lg:mx-auto shadow-2xl overflow-hidden">
      {renderContent()}
    </div>
  );
};

const HomeMenu: React.FC<{ onSelectGame: (id: GameType) => void }> = ({ onSelectGame }) => {
  const [activeTab, setActiveTab] = useState<'active' | 'comingSoon'>('active');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HomeFilter>('all');

  // Coming-soon list. Order here drives display order in the Coming Soon
  // tab (the filter below preserves it via comingSoonGameIds.map).
  const comingSoonGameIds = [
    GameType.WOULD_I_LIE_TO_YOU,
    GameType.ICEBREAKERS,
    GameType.MINI_MAFIA,
    GameType.WOULD_YOU_RATHER,
    GameType.NEVER_HAVE_I_EVER,
  ];

  // Adult-gated games — require PIN before entering
  const ADULT_GAME_IDS = [GameType.COMPATIBILITY_TEST, GameType.TRUTH_OR_DRINK];
  const [showPinGate, setShowPinGate] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<GameType | null>(null);

  const handleSelectGame = (gameId: GameType) => {
    if (ADULT_GAME_IDS.includes(gameId) && !isAdultUnlocked()) {
      setPendingGameId(gameId);
      setShowPinGate(true);
      return;
    }
    onSelectGame(gameId);
  };

  // Filter chain: tab → chip → search query.
  // Search matches title, description, vibe, and tags.
  const displayGames = useMemo(() => {
    const inTab = activeTab === 'active'
      ? GAMES.filter(g => !comingSoonGameIds.includes(g.id))
      : comingSoonGameIds
          .map(id => GAMES.find(g => g.id === id))
          .filter((g): g is typeof GAMES[number] => Boolean(g));
    const q = query.trim().toLowerCase();
    return inTab
      .filter(g => gameMatchesFilter(g.id, filter))
      .filter(g => {
        if (!q) return true;
        const meta = GAME_RICH_META[g.id];
        const haystack = [
          g.title, g.description, meta?.vibe || '', ...(meta?.tags || []),
        ].join(' ').toLowerCase();
        return haystack.includes(q);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, query, filter]);

  return (
    <div className="flex flex-col gap-4 animate-slide-up min-h-[80vh]">
      <header className="pt-1 pb-1 text-center relative">
        <ThemeToggle className="absolute top-1 right-0" />
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gold mb-1 font-serif flex items-center justify-center gap-2">
          PartySpark <span className="text-2xl sm:text-3xl">✨</span>
        </h1>
        <p className="text-muted text-sm sm:text-base mb-4">
          <span className="text-gold font-bold">A</span>lways <span className="text-gold font-bold">I</span>nvited
        </p>

        {/* Tab Navigation */}
        <div className="grid grid-cols-3 border-b border-divider pb-0">
          <button
            onClick={() => setActiveTab('active')}
            className={`col-span-2 text-center pb-3 px-2 text-lg font-medium transition-colors relative ${
              activeTab === 'active'
                ? 'text-ink'
                : 'text-muted hover:text-ink-soft'
            }`}
          >
            Play Now
            {activeTab === 'active' && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gold rounded-t-sm" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('comingSoon')}
            className={`col-span-1 text-center pb-3 px-2 text-sm sm:text-base font-medium transition-colors relative flex items-center justify-center ${
              activeTab === 'comingSoon'
                ? 'text-ink'
                : 'text-muted hover:text-ink-soft'
            }`}
          >
            <span className="truncate w-full pr-1">Coming Soon</span>
            {activeTab === 'comingSoon' && (
              <span className="absolute bottom-0 left-0 w-full h-0.5 bg-gold rounded-t-sm" />
            )}
          </button>
        </div>
      </header>

      {/* Adult content PIN gate */}
      {showPinGate && (
        <PinGateModal
          onSuccess={() => {
            setShowPinGate(false);
            if (pendingGameId) onSelectGame(pendingGameId);
            setPendingGameId(null);
          }}
          onCancel={() => {
            setShowPinGate(false);
            setPendingGameId(null);
          }}
        />
      )}

      {/* Search bar + filter chips — narrow the games shown in the active tab */}
      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-2.5 bg-surface-alt border border-divider rounded-xl px-3.5 py-2.5">
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
                    ? 'bg-gold text-app border-gold'
                    : 'bg-transparent text-muted border-divider hover:border-ink-soft hover:text-ink-soft'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2.5 pb-6">
        {displayGames.length === 0 && (
          <div className="text-center text-muted text-sm py-8">
            No games match. Try a different filter or search.
          </div>
        )}
        {displayGames.map((game) => (
          <Card
            key={game.id}
            onClick={() => handleSelectGame(game.id)}
            className="!p-4 group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95"
          >
            {/* Background Gradient Blob */}
            <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 rounded-full blur-3xl -mr-10 -mt-10 ${game.color}`} />

            <div className="flex items-center gap-3 relative z-10">
              <div className={`p-3 rounded-2xl ${game.color} shadow-sm text-white`}>
                {getIcon(game.icon, 24)}
              </div>
              <div className="flex-1 w-full overflow-hidden">
                <div className="flex items-center justify-between mb-0.5 mt-0.5">
                  <h3 className="text-lg font-bold leading-none text-ink">{game.title}</h3>
                  <span className="bg-accent-soft px-2 py-0.5 rounded text-[10px] font-medium text-accent uppercase tracking-wider shrink-0 ml-2">
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

      <footer className="text-center text-xs text-muted mt-auto pb-4">
        Powered by Google Gemini 3 Suite
      </footer>
    </div>
  );
};

import { ContentProvider } from './contexts/ContentContext';

const AppWithProvider = () => (
  <ContentProvider>
    <App />
  </ContentProvider>
);

export default AppWithProvider;
