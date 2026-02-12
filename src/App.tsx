import React, { useState, useEffect } from 'react';
import { GameType } from './types';
import { GAMES, getIcon } from './constants';
import { Card } from './components/ui/Layout';
import { CharadesGame } from './components/games/CharadesGame';
import { TabooGame } from './components/games/TabooGame';
import { TriviaGame } from './components/games/TriviaGame';
import { IcebreakerGame } from './components/games/IcebreakerGame';
import { SimpleSelfieGame } from './components/games/SimpleSelfieGame';
import RoastGame from './components/games/RoastGame';
import { ImposterGame } from './components/games/ImposterGame';
import { WouldYouRatherGame } from './components/games/WouldYouRatherGame';

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
      case GameType.CHARADES:
        return <CharadesGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.TABOO:
        return <TabooGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.TRIVIA:
        return <TriviaGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.ICEBREAKERS:
        return <IcebreakerGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.SIMPLE_SELFIE:
        return <SimpleSelfieGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.ROAST:
        return <RoastGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.IMPOSTER:
        return <ImposterGame onExit={() => setActiveGame(GameType.HOME)} />;
      case GameType.WOULD_YOU_RATHER:
        return <WouldYouRatherGame onExit={() => setActiveGame(GameType.HOME)} />;
      default:
        return <HomeMenu onSelectGame={setActiveGame} />;
    }
  };

  if (showSplash) {
    return <SplashScreen />;
  }

  return (
    <div className="min-h-screen bg-party-dark text-white p-4 md:p-6 lg:max-w-md lg:mx-auto shadow-2xl overflow-hidden">
      {renderContent()}
    </div>
  );
};

const HomeMenu: React.FC<{ onSelectGame: (id: GameType) => void }> = ({ onSelectGame }) => (
  <div className="flex flex-col gap-6 animate-slide-up">
    <header className="pt-8 pb-4 text-center">
      <h1 className="text-5xl font-bold tracking-tight text-party-secondary mb-2 font-serif flex items-center justify-center gap-2">
        PartySpark <span className="text-2xl">✨</span>
      </h1>
      <p className="text-gray-400 text-lg">
        <span className="text-party-secondary font-bold">A</span>lways <span className="text-party-secondary font-bold">I</span>nvited
      </p>
    </header>

    <div className="grid gap-4 pb-12">
      {GAMES.map((game) => (
        <Card
          key={game.id}
          onClick={() => onSelectGame(game.id)}
          className="group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95"
        >
          {/* Background Gradient Blob */}
          <div className={`absolute top-0 right-0 w-32 h-32 opacity-20 rounded-full blur-3xl -mr-10 -mt-10 ${game.color}`} />

          <div className="flex items-start gap-4 relative z-10">
            <div className={`p-4 rounded-2xl ${game.color} shadow-lg text-white`}>
              {getIcon(game.icon, 28)}
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold mb-1">{game.title}</h3>
              <p className="text-sm text-gray-400 leading-snug">{game.description}</p>
              <div className="mt-3 flex items-center gap-2 text-xs font-medium text-party-accent uppercase tracking-wider">
                <span className="bg-white/5 px-2 py-1 rounded">
                  {game.minPlayers}+ Players
                </span>
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>

    <footer className="text-center text-xs text-gray-600 mt-auto pb-4">
      Powered by Google Gemini 2.5
    </footer>
  </div>
);

import { ContentProvider } from './contexts/ContentContext';

const AppWithProvider = () => (
  <ContentProvider>
    <App />
  </ContentProvider>
);

export default AppWithProvider;
