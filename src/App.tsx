import React, { useState, useEffect } from 'react';
import { GameType } from './types';
import { PinGateModal, isAdultUnlocked } from './components/ui/PinGate';
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
import { HomeShell } from './components/home/HomeShell';

const SplashScreen = () => (
  <div className="fixed inset-0 z-[100] bg-party-dark flex items-center justify-center overflow-hidden font-sans">
    {/* Background Gradient Layer (No Image) */}
    <div className="absolute inset-0 z-0">
      <div className="absolute inset-0 bg-party-dark" />
      <div
        className="absolute inset-0 bg-cover bg-center opacity-40 mix-blend-overlay"
        style={{ backgroundImage: 'url("/splash-bg.jpg")' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-party-dark via-transparent to-party-dark/50" />
    </div>

    {/* Content Layer */}
    <div className="relative z-10 text-center px-6 flex flex-col items-center animate-slide-up">
      <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-white mb-2 font-serif text-party-secondary flex items-center gap-3">
        PartySpark <span className="text-3xl md:text-5xl">✨</span>
      </h1>
      <p className="text-gray-300 text-lg md:text-xl font-medium tracking-wide max-w-xs mx-auto mb-12">
        <span className="text-party-secondary font-bold">A</span>lways <span className="text-party-secondary font-bold">I</span>nvited
      </p>

      {/* Loading Dots */}
      <div className="flex gap-3">
        <div className="w-3 h-3 bg-party-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-3 h-3 bg-party-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-3 h-3 bg-party-accent rounded-full animate-bounce" />
      </div>
    </div>
  </div>
);

// Adult-gated games — require PIN before entering
const ADULT_GAME_IDS = [GameType.COMPATIBILITY_TEST, GameType.TRUTH_OR_DRINK];

// HomeShellContainer wraps the new editorial-list home with the adult PIN gate.
// Kept small and colocated with App.tsx so the routing logic stays in one place.
const HomeShellContainer: React.FC<{ onSelectGame: (id: GameType) => void }> = ({ onSelectGame }) => {
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

  return (
    <>
      <HomeShell onSelectGame={handleSelectGame} />
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
    </>
  );
};

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

  if (showSplash) {
    return <SplashScreen />;
  }

  // HomeShell manages its own full-width layout (edge-to-edge masthead,
  // bottom tab bar). Games render inside a constrained, padded container.
  if (activeGame === GameType.HOME) {
    return (
      <div className="lg:max-w-md lg:mx-auto shadow-2xl overflow-hidden">
        <HomeShellContainer onSelectGame={setActiveGame} />
      </div>
    );
  }

  // Per-game router. Games keep the existing padded container.
  const renderGame = () => {
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
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-party-dark text-white p-4 md:p-6 lg:max-w-md lg:mx-auto shadow-2xl overflow-hidden">
      {renderGame()}
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
