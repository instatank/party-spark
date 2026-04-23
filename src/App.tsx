import { useState, useEffect } from 'react';
import { GameType } from './types';
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
import { PinGateModal, isAdultUnlocked } from './components/ui/PinGate';
import { HomeMenu } from './components/home/HomeMenu';

const SplashScreen = () => (
  <div className="fixed inset-0 z-[100] bg-party-dark flex items-center justify-center overflow-hidden font-sans">
    <div className="absolute inset-0 z-0">
      <div className="absolute inset-0 bg-party-dark" />
      {/* Splash bg image — 25% opacity reads as atmospheric texture in both
          themes. The old mix-blend-overlay looked great at 40% in dark but
          disappeared against the Azure Mist light bg; this is the compromise. */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-25"
        style={{ backgroundImage: 'url("/splash-bg.jpg")' }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-party-dark via-transparent to-party-dark/50" />
    </div>

    <div className="relative z-10 text-center px-6 flex flex-col items-center animate-slide-up">
      {/* Title — matches HomeMenu's gold Playfair treatment, just scaled up */}
      <h1 className="text-6xl md:text-8xl font-bold tracking-tight text-party-secondary mb-2 font-serif flex items-center gap-3">
        PartySpark <span className="text-3xl md:text-5xl">✨</span>
      </h1>
      {/* "Always Invited" — same gold A/I + muted rest pattern as HomeMenu */}
      <p className="text-muted text-lg md:text-xl max-w-xs mx-auto mb-12">
        <span className="text-party-secondary font-bold">A</span>lways{' '}
        <span className="text-party-secondary font-bold">I</span>nvited
      </p>

      <div className="flex gap-3">
        <div className="w-3 h-3 bg-party-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-3 h-3 bg-party-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-3 h-3 bg-party-accent rounded-full animate-bounce" />
      </div>
    </div>
  </div>
);

// Games that require the adult PIN (0438) before entering.
const ADULT_GAME_IDS: GameType[] = [GameType.COMPATIBILITY_TEST, GameType.TRUTH_OR_DRINK];

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeGame, setActiveGame] = useState<GameType>(GameType.HOME);
  const [showPinGate, setShowPinGate] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<GameType | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 5000);
    return () => clearTimeout(timer);
  }, []);

  // Gated navigation — adult games show the PIN modal first.
  const handleSelectGame = (gameId: GameType) => {
    if (ADULT_GAME_IDS.includes(gameId) && !isAdultUnlocked()) {
      setPendingGameId(gameId);
      setShowPinGate(true);
      return;
    }
    setActiveGame(gameId);
  };

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
        return <HomeMenu onSelectGame={handleSelectGame} />;
    }
  };

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div className="min-h-screen bg-party-dark text-ink p-4 md:p-6 lg:max-w-md lg:mx-auto shadow-2xl overflow-hidden">
      {renderContent()}
      {showPinGate && (
        <PinGateModal
          onSuccess={() => {
            setShowPinGate(false);
            if (pendingGameId) setActiveGame(pendingGameId);
            setPendingGameId(null);
          }}
          onCancel={() => {
            setShowPinGate(false);
            setPendingGameId(null);
          }}
        />
      )}
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
