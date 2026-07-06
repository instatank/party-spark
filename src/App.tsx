import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Users, Trophy, Volume2, VolumeX, PartyPopper, CalendarCheck2, Dices, History } from 'lucide-react';
import { sessionService } from './services/SessionManager';
import { statsStore } from './services/statsStore';
import { gameNightService } from './services/gameNightService';
import { dailyStore } from './services/dailyChallenge';
import { isMuted, toggleMuted } from './services/audio';
import { GameType } from './types';
import { GAMES, getIcon, GAME_RICH_META, HOME_FILTERS, gameMatchesFilter, getSubcategoryMatches, type HomeFilter } from './constants';
import { Card } from './components/ui/Layout';
import { PinGateModal, isAdultUnlocked } from './components/ui/PinGate';
import { ThemeToggle } from './components/ui/ThemeToggle';

// Every game is lazy-loaded so the initial bundle only carries the home
// screen. Each game (and its JSON data) becomes its own chunk, fetched on
// first tap-in and cached by the service worker after that. Most games use
// named exports, hence the .then() re-mapping to a default export.
const CharadesGame = lazy(() => import('./components/games/CharadesGame').then(m => ({ default: m.CharadesGame })));
const TabooGame = lazy(() => import('./components/games/TabooGame').then(m => ({ default: m.TabooGame })));
const IcebreakerGame = lazy(() => import('./components/games/IcebreakerGame').then(m => ({ default: m.IcebreakerGame })));
const ImposterGame = lazy(() => import('./components/games/ImposterGame').then(m => ({ default: m.ImposterGame })));
const WouldYouRatherGame = lazy(() => import('./components/games/WouldYouRatherGame').then(m => ({ default: m.WouldYouRatherGame })));
const RoastGame = lazy(() => import('./components/games/RoastGame'));
const MostLikelyToGame = lazy(() => import('./components/games/MostLikelyToGame').then(m => ({ default: m.MostLikelyToGame })));
const WouldILieToYouGame = lazy(() => import('./components/games/WouldILieToYouGame').then(m => ({ default: m.WouldILieToYouGame })));
const NeverHaveIEverGame = lazy(() => import('./components/games/NeverHaveIEverGame').then(m => ({ default: m.NeverHaveIEverGame })));
const MiniMafiaGame = lazy(() => import('./components/games/MiniMafiaGame').then(m => ({ default: m.MiniMafiaGame })));
const FactOrFictionGame = lazy(() => import('./components/games/FactOrFictionGame').then(m => ({ default: m.FactOrFictionGame })));
const CompatibilityTestGame = lazy(() => import('./components/games/CompatibilityTestGame').then(m => ({ default: m.CompatibilityTestGame })));
const TruthOrDrinkGame = lazy(() => import('./components/games/TruthOrDrinkGame').then(m => ({ default: m.TruthOrDrinkGame })));
const FiveAliveGame = lazy(() => import('./components/games/FiveAliveGame').then(m => ({ default: m.FiveAliveGame })));
const LinkedGame = lazy(() => import('./components/games/LinkedGame').then(m => ({ default: m.LinkedGame })));
const JumbleGame = lazy(() => import('./components/games/JumbleGame').then(m => ({ default: m.JumbleGame })));
const GameNightScreen = lazy(() => import('./components/GameNightScreen').then(m => ({ default: m.GameNightScreen })));
const StatsScreen = lazy(() => import('./components/StatsScreen').then(m => ({ default: m.StatsScreen })));

// Suspense fallback while a game chunk loads — same bouncing dots as the
// splash screen so the transition reads as intentional, not a blank flash.
const GameLoading = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <div className="flex gap-3">
      <div className="w-3 h-3 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
      <div className="w-3 h-3 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
      <div className="w-3 h-3 bg-accent rounded-full animate-bounce" />
    </div>
  </div>
);

const SplashScreen = ({ onSkip }: { onSkip: () => void }) => (
  <div
    onClick={onSkip}
    className="fixed inset-0 z-[100] bg-app flex items-center justify-center overflow-hidden font-sans cursor-pointer"
  >
    {/* Background layer — bg image is dark-tuned. Dark mode uses an
        overlay blend at 40%; light mode swaps to a multiply blend at
        25% (handled in .splash-bg CSS) so the image reads as a soft
        watermark on the airy bg without fighting the gold title. */}
    <div className="absolute inset-0 z-0">
      <div className="absolute inset-0 bg-app" />
      <div
        className="splash-bg absolute inset-0 bg-cover bg-center"
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

// Front-end toggle for the "Play Now / Coming Soon" tab bar. Set to `true`
// to bring the tabs back (useful while building/testing the Coming Soon
// roster). When `false`, the tabs are hidden and only the Play Now games
// show — but all the Coming Soon games + tab logic stay intact in code.
const SHOW_TABS = false;

const App = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [activeGame, setActiveGame] = useState<GameType>(GameType.HOME);

  useEffect(() => {
    // Brief splash, then home. Kept short (and tap-skippable) — it runs on
    // every cold start, so it must never feel like a wait.
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 1500);

    return () => clearTimeout(timer);
  }, []);

  // Leaving a game returns to Home — unless a Game Night is running, in
  // which case the hub reclaims the player so the playlist keeps moving.
  const exitGame = () => {
    setActiveGame(gameNightService.isActive() ? GameType.GAME_NIGHT : GameType.HOME);
  };

  // Simple Router Switch
  const renderContent = () => {
    switch (activeGame) {
      case GameType.ROAST:
        return <RoastGame onExit={exitGame} />;
      case GameType.IMPOSTER:
        return <ImposterGame onExit={exitGame} />;
      case GameType.CHARADES:
        return <CharadesGame onExit={exitGame} />;
      case GameType.TABOO:
        return <TabooGame onExit={exitGame} />;
      case GameType.WOULD_YOU_RATHER:
        return <WouldYouRatherGame onExit={exitGame} />;
      case GameType.MOST_LIKELY_TO:
        return <MostLikelyToGame onExit={exitGame} />;
      case GameType.WOULD_I_LIE_TO_YOU:
        return <WouldILieToYouGame onExit={exitGame} />;
      case GameType.NEVER_HAVE_I_EVER:
        return <NeverHaveIEverGame onExit={exitGame} />;
      case GameType.MINI_MAFIA:
        return <MiniMafiaGame onExit={exitGame} />;
      case GameType.ICEBREAKERS:
        return <IcebreakerGame onExit={exitGame} />;
      case GameType.FACT_OR_FICTION:
        return <FactOrFictionGame onExit={exitGame} />;
      case GameType.COMPATIBILITY_TEST:
        return <CompatibilityTestGame onExit={exitGame} />;
      case GameType.TRUTH_OR_DRINK:
        return <TruthOrDrinkGame onExit={exitGame} />;
      case GameType.FIVE_ALIVE:
        return <FiveAliveGame onExit={exitGame} />;
      case GameType.LINKED:
        return <LinkedGame onExit={exitGame} />;
      case GameType.JUMBLE:
        return <JumbleGame onExit={exitGame} />;
      case GameType.GAME_NIGHT:
        return (
          <GameNightScreen
            onExit={() => setActiveGame(GameType.HOME)}
            onLaunchGame={setActiveGame}
          />
        );
      case GameType.STATS:
        return <StatsScreen onExit={() => setActiveGame(GameType.HOME)} />;
      default:
        return <HomeMenu onSelectGame={setActiveGame} />;
    }
  };

  if (showSplash) {
    return <SplashScreen onSkip={() => setShowSplash(false)} />;
  }

  return (
    <div className="min-h-screen bg-app text-ink p-4 md:p-6 lg:max-w-md lg:mx-auto shadow-2xl overflow-hidden">
      <Suspense fallback={<GameLoading />}>
        {renderContent()}
      </Suspense>
    </div>
  );
};

const HomeMenu: React.FC<{ onSelectGame: (id: GameType) => void }> = ({ onSelectGame }) => {
  const [activeTab, setActiveTab] = useState<'active' | 'comingSoon'>('active');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<HomeFilter>('all');

  // Tap-to-expand search. The input is always rendered (overlaying the
  // chips row) but visually hidden when closed — that way the user's
  // tap on the icon can synchronously focus a real DOM node, which
  // is what iOS/Android need to bring up the soft keyboard on first
  // tap. Deferring the focus into a setTimeout/raf would suppress it.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const openSearch = () => {
    searchInputRef.current?.focus();
    setSearchOpen(true);
  };
  const closeSearch = () => {
    setQuery('');
    setSearchOpen(false);
    searchInputRef.current?.blur();
  };

  // Outside-click closes the overlay. Two key tricks:
  // 1. setTimeout(0) before attaching, so the SAME tap that opened
  //    the overlay doesn't immediately bubble up and close it.
  // 2. capture phase + an exempt-class check, so taps on game cards
  //    or filter pills can do their work without collapsing search.
  useEffect(() => {
    if (!searchOpen) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.search-overlay, .game-card, .filter-pill')) return;
      setSearchOpen(false);
    };
    const tid = setTimeout(() => {
      document.addEventListener('click', onClick, true);
    }, 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('click', onClick, true);
    };
  }, [searchOpen]);

  // Coming-soon list. Order here drives display order in the Coming Soon
  // tab (the filter below preserves it via comingSoonGameIds.map).
  const comingSoonGameIds = [
    GameType.WOULD_I_LIE_TO_YOU,
    GameType.ICEBREAKERS,
    GameType.MINI_MAFIA,
    GameType.WOULD_YOU_RATHER,
  ];

  // Adult-gated games — require PIN before entering. Roast Me is also
  // temporarily gated here while AI prompts/output are still being tuned
  // in production. REMOVE Roast from this list once those flows are
  // signed off. (The Create-Your-Vibe custom decks inside MLT/NHIE are
  // no longer PIN-gated — tone chips are the safety layer there.)
  const ADULT_GAME_IDS = [GameType.COMPATIBILITY_TEST, GameType.TRUTH_OR_DRINK, GameType.ROAST];

  // Shared session crew (set via any game's TeamRosterRow / player setup).
  // Surfacing it here tells users the one thing they can't otherwise
  // discover: names carry across every game for the rest of the night.
  const [crew, setCrew] = useState<string[]>(() => sessionService.getTeams());
  const clearCrew = () => {
    sessionService.clearTeams();
    setCrew([]);
  };

  // Crew-scoped social proof: the current crew member with the most
  // lifetime wins gets a crown on the banner. Case-insensitive name match
  // so "priya" in the roster still claims Priya's trophies.
  const crewChampion = useMemo(() => {
    if (crew.length === 0) return null;
    const lower = crew.map(n => n.trim().toLowerCase());
    const top = statsStore.topPlayers(50).find(p => lower.includes(p.name.trim().toLowerCase()));
    return top && top.wins > 0 ? top : null;
  }, [crew]);

  // App-wide mute (silences shared-audio sounds AND haptics).
  const [muted, setMutedUi] = useState<boolean>(() => isMuted());

  // Game Night + Daily Scramble surface state — read fresh on every Home
  // mount (the switch remounts HomeMenu whenever a game exits).
  const nightActive = gameNightService.isActive();
  const nextNightGame = nightActive
    ? GAMES.find(g => g.id === gameNightService.currentGame())?.title ?? null
    : null;
  const dailyPlayed = dailyStore.hasPlayedToday();
  const dailyStreak = dailyStore.getStreak();
  const openDaily = () => {
    // Deep link consumed by Scramble on mount — drops straight into Daily.
    try { sessionStorage.setItem('partyspark_open_daily', '1'); } catch { /* ignore */ }
    onSelectGame(GameType.JUMBLE);
  };
  const [showPinGate, setShowPinGate] = useState(false);
  const [pendingGameId, setPendingGameId] = useState<GameType | null>(null);

  // "Jump back in" — the 3 most recently played games, straight from the
  // lifetime stats store (every scored game stamps lastPlayed on finish).
  // Empty for brand-new users, so the row simply doesn't render.
  const recentGames = useMemo(() => {
    const played = statsStore.getAll().games;
    return GAMES
      .filter(g => !comingSoonGameIds.includes(g.id))
      .map(g => ({ game: g, last: played[g.id]?.lastPlayed ?? 0 }))
      .filter(e => e.last > 0)
      .sort((a, b) => b.last - a.last)
      .slice(0, 3)
      .map(e => e.game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Pick For Us" — dice roll over whatever the current filter/search shows.
  // A short slot-machine shuffle builds the reveal, then the sheet offers
  // Play / Roll again. Launch goes through handleSelectGame so the adult
  // PIN gate still applies.
  const [pick, setPick] = useState<GameType | null>(null);
  const [rolling, setRolling] = useState(false);

  const startRoll = () => {
    setRolling(true);
    let ticks = 0;
    const spin = () => {
      const pool = displayGames.length > 0 ? displayGames : GAMES.filter(g => !comingSoonGameIds.includes(g.id));
      setPick(pool[Math.floor(Math.random() * pool.length)].id);
      ticks += 1;
      if (ticks < 10) {
        setTimeout(spin, 60 + ticks * 12); // decelerating slot-machine ticks
      } else {
        setRolling(false);
      }
    };
    spin();
  };
  const closePick = () => { setPick(null); setRolling(false); };

  const handleSelectGame = (gameId: GameType) => {
    if (ADULT_GAME_IDS.includes(gameId) && !isAdultUnlocked()) {
      setPendingGameId(gameId);
      setShowPinGate(true);
      return;
    }
    onSelectGame(gameId);
  };

  // Crew-size fit: with 2+ names in the roster we know how many are playing,
  // so games needing more players can be de-prioritised instead of letting
  // the user discover the mismatch two screens deep.
  const crewSize = crew.length;
  const fitsCrew = (g: typeof GAMES[number]) => crewSize < 2 || g.minPlayers <= crewSize;

  // Filter chain: tab → chip → search query → crew-fit ranking.
  // Search matches title, description, vibe, and tags.
  const displayGames = useMemo(() => {
    // When the tabs are hidden, always show the Play Now set (Coming Soon
    // games stay in code but never surface on the front end).
    const effectiveTab = SHOW_TABS ? activeTab : 'active';
    const inTab = effectiveTab === 'active'
      ? GAMES.filter(g => !comingSoonGameIds.includes(g.id))
      : comingSoonGameIds
          .map(id => GAMES.find(g => g.id === id))
          .filter((g): g is typeof GAMES[number] => Boolean(g));
    const q = query.trim().toLowerCase();
    const matched = inTab
      .filter(g => gameMatchesFilter(g.id, filter))
      .filter(g => {
        if (!q) return true;
        const meta = GAME_RICH_META[g.id];
        const haystack = [
          g.title, g.description, meta?.vibe || '', ...(meta?.tags || []),
        ].join(' ').toLowerCase();
        if (haystack.includes(q)) return true;
        // Fallback: match against the game's sub-categories (e.g. searching
        // "saucy" should pick up TOD because its Spicy deck matches).
        return getSubcategoryMatches(g.id, query).length > 0;
      });
    // Stable sort: games the current crew can actually play float above
    // ones that need more people (original ranking preserved within groups).
    return [...matched].sort((a, b) => Number(fitsCrew(b)) - Number(fitsCrew(a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, query, filter, crewSize]);

  // "Tonight's pick" hero — one confident default above the full list.
  // Deterministic per day (no reroll on re-render): score every non-gated
  // game on crew fit + occasion (weekend nights lean crowd, weekdays lean
  // quick) + familiarity, then rotate through the top 3 by day-of-epoch.
  // Hidden while the user is filtering/searching — they're deciding
  // themselves at that point.
  const heroPick = useMemo(() => {
    const played = statsStore.getAll().games;
    const isBigNight = [0, 5, 6].includes(new Date().getDay()); // Fri/Sat/Sun
    const scored = GAMES
      .filter(g => !comingSoonGameIds.includes(g.id) && !ADULT_GAME_IDS.includes(g.id))
      .map(g => {
        const meta = GAME_RICH_META[g.id];
        let score = 0;
        if (crewSize >= 2) score += fitsCrew(g) ? 4 : -4;
        if (crewSize >= 4 && meta.tags.includes('crowd')) score += 2;
        if (isBigNight ? meta.tags.includes('crowd') : meta.tags.includes('quick')) score += 2;
        if (played[g.id]?.plays) score += 1; // a known crowd-pleaser beats a stranger
        return { g, score };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
    if (scored.length === 0) return null;
    return scored[Math.floor(Date.now() / 86_400_000) % scored.length].g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crewSize]);

  return (
    <div className="relative flex flex-col gap-2.5 animate-slide-up min-h-[80vh]">
      {/* Ambient depth orbs — decorative only (see .home-orb in index.css) */}
      <div className="home-orb home-orb-a" aria-hidden="true" />
      <div className="home-orb home-orb-b" aria-hidden="true" />
      <header className="pt-1 pb-0 text-center relative">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-gold mb-1 font-serif flex items-center justify-center gap-2">
          PartySpark <span className="text-2xl sm:text-3xl">✨</span>
        </h1>
        <div className="relative mb-1">
          {/* Trophy tucked in the left corner, volume + theme toggle tucked
              in the right corner — same row as the tagline, absolutely
              positioned so they add no extra height. */}
          <button
            onClick={() => onSelectGame(GameType.STATS)}
            aria-label="Trophies and stats"
            className="absolute left-0 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-surface-alt border border-divider text-ink-soft hover:text-ink transition-colors flex items-center justify-center"
          >
            <Trophy size={16} />
          </button>
          <p className="text-muted text-sm sm:text-base">
            <span className="text-gold font-bold">A</span>lways <span className="text-gold font-bold">I</span>nvited
          </p>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 flex gap-1.5">
            <button
              onClick={() => setMutedUi(toggleMuted())}
              aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
              className="w-9 h-9 rounded-full bg-surface-alt border border-divider text-ink-soft hover:text-ink transition-colors flex items-center justify-center"
            >
              {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            </button>
            <ThemeToggle />
          </div>
        </div>

        {/* Tab Navigation — hidden on the front end via SHOW_TABS; flip the
            flag to bring Play Now / Coming Soon back for testing. */}
        {SHOW_TABS && (
        <div className="grid grid-cols-3 border-b border-divider pb-0">
          <button
            onClick={() => setActiveTab('active')}
            className={`col-span-2 text-center pb-2.5 px-2 text-lg font-medium transition-colors relative ${
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
            className={`col-span-1 text-center pb-2.5 px-2 text-sm sm:text-base font-medium transition-colors relative flex items-center justify-center ${
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
        )}
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

      {/* Game Night + Daily Scramble quick actions — the two engagement
          anchors live above the fold, styled as slim accent tiles. */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onSelectGame(GameType.GAME_NIGHT)}
          className="game-card group text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-l-violet-500 hover:bg-app-tint rounded-xl py-2.5 px-3 transition-colors"
        >
          <div className="flex items-center gap-2">
            <PartyPopper size={16} className="text-violet-400 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink leading-tight truncate">
                {nightActive ? 'Game Night · live' : 'Game Night'}
              </p>
              <p className="text-[11px] text-muted leading-snug truncate">
                {nightActive
                  ? (nextNightGame ? `Next up: ${nextNightGame}` : 'See the recap')
                  : 'Pick games, crown a champ'}
              </p>
            </div>
          </div>
        </button>
        <button
          onClick={openDaily}
          className="game-card group text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-l-gold hover:bg-app-tint rounded-xl py-2.5 px-3 transition-colors"
        >
          <div className="flex items-center gap-2">
            <CalendarCheck2 size={16} className="text-gold flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-ink leading-tight truncate">Daily Scramble</p>
              <p className="text-[11px] text-muted leading-snug truncate">
                {dailyPlayed
                  ? (dailyStreak > 1 ? `Done · 🔥 ${dailyStreak}-day streak` : 'Done for today ✓')
                  : (dailyStreak > 1 ? `🔥 ${dailyStreak}-day streak` : 'One puzzle, every day')}
              </p>
            </div>
          </div>
        </button>
      </div>

      {/* Jump back in — the last few games this device actually played.
          One horizontal row of slim chips; invisible until there's history. */}
      {recentGames.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="flex-shrink-0 flex items-center gap-1 text-[11px] font-semibold text-muted uppercase tracking-wider pr-0.5">
            <History size={12} /> Recent
          </span>
          {recentGames.map(game => (
            <button
              key={game.id}
              onClick={() => handleSelectGame(game.id)}
              className="game-card flex-shrink-0 flex items-center gap-1.5 bg-surface-alt hover:bg-app-tint border border-divider rounded-full pl-1.5 pr-3 py-1 transition-colors"
            >
              <span className={`w-5 h-5 rounded-full ${game.color} text-white flex items-center justify-center`}>
                {getIcon(game.icon, 11)}
              </span>
              <span className="text-xs font-semibold text-ink whitespace-nowrap">{game.title}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tonight's crew — visible whenever a shared roster exists so users
          learn that names entered in one game follow them into the next. */}
      {crew.length > 0 && (
        <div className="flex items-center gap-2 bg-gold/10 border border-gold/30 rounded-xl px-3 py-2 animate-fade-in">
          <Users size={14} className="text-gold flex-shrink-0" />
          <p className="flex-1 text-xs text-ink-soft truncate min-w-0">
            <span className="font-bold text-gold">Tonight's crew:</span>{' '}
            {crew.join(', ')}
            {crewChampion ? (
              <span className="text-muted"> — 👑 {crewChampion.name} leads with {crewChampion.wins} {crewChampion.wins === 1 ? 'win' : 'wins'}</span>
            ) : (
              <span className="text-muted"> — names carry into every game</span>
            )}
          </p>
          <button
            onClick={clearCrew}
            aria-label="Clear saved players"
            className="flex-shrink-0 p-1 rounded-full text-muted hover:text-ink transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Filter chips + tap-to-expand search.
          Single row at h-11 so the icon button (collapsed) and the
          overlay input (expanded) are the same height — no layout
          shift between states. The input is always in the DOM but
          opacity-0 + pointer-events-none when closed, which lets us
          focus() it inside the same tap that opens it (required for
          the mobile soft keyboard to appear on first tap). */}
      <div className="relative h-11">
        <div className="absolute inset-0 flex items-center gap-2">
          <button
            onClick={openSearch}
            aria-label="Search games"
            className="flex-shrink-0 h-11 w-11 rounded-xl bg-surface-alt hover:bg-app-tint border border-divider text-ink-soft hover:text-ink transition-colors flex items-center justify-center"
          >
            <Search size={18} />
          </button>
          <button
            onClick={startRoll}
            aria-label="Can't decide? Pick a game for us"
            className="flex-shrink-0 h-11 w-11 rounded-xl bg-gold/10 hover:bg-gold/20 border border-gold/40 text-gold transition-colors flex items-center justify-center"
          >
            <Dices size={18} />
          </button>
          <div className="flex-1 flex gap-1.5 overflow-x-auto px-1 no-scrollbar items-center h-full">
            {HOME_FILTERS.map(f => {
              const active = filter === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id)}
                  className={`filter-pill flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
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

        <div
          className={`search-overlay absolute inset-0 flex items-center gap-2 bg-surface border border-divider rounded-xl px-3 transition-opacity ${
            searchOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
          }`}
        >
          <Search size={16} className="text-muted flex-shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search games, vibes, or players…"
            className="flex-1 bg-transparent text-sm text-ink placeholder:text-muted outline-none min-w-0"
          />
          <button
            onClick={closeSearch}
            aria-label="Close search"
            className="flex-shrink-0 p-1 rounded-full text-muted hover:text-ink transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Tonight's pick — one smart default so nobody has to scan 12 cards
          under social pressure. A single hero (never a carousel), gone the
          moment the user starts filtering or searching. */}
      {heroPick && filter === 'all' && !query.trim() && (
        <button
          onClick={() => handleSelectGame(heroPick.id)}
          className="game-card group relative overflow-hidden text-left bg-surface border border-gold/40 rounded-2xl px-4 py-3.5 transition-all duration-300 hover:scale-[1.02] active:scale-95"
          style={{ boxShadow: 'var(--shadow-card)' }}
        >
          <div className={`absolute top-0 right-0 w-40 h-40 opacity-25 rounded-full blur-3xl -mr-12 -mt-12 ${heroPick.color}`} />
          <p className="text-[10px] font-semibold text-gold uppercase tracking-[0.2em] mb-2 relative z-10">
            ✨ Tonight's pick
          </p>
          <div className="flex items-center gap-3 relative z-10">
            <div className={`p-3.5 rounded-2xl ${heroPick.color} shadow-md text-white`}>
              {getIcon(heroPick.icon, 28)}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-xl font-bold text-ink leading-tight">{heroPick.title}</h3>
              <p className="text-[13px] text-muted leading-snug truncate">{heroPick.description}</p>
              <p className="text-[11px] text-accent font-medium mt-0.5">
                {GAME_RICH_META[heroPick.id]?.players} players · {GAME_RICH_META[heroPick.id]?.duration}
                {GAME_RICH_META[heroPick.id]?.vibe ? ` · ${GAME_RICH_META[heroPick.id].vibe}` : ''}
              </p>
            </div>
            <span className="flex-shrink-0 bg-gold text-slate-900 text-sm font-bold px-4 py-2 rounded-xl group-hover:brightness-110 transition-all">
              Play
            </span>
          </div>
        </button>
      )}

      <div className="grid gap-2.5 pb-6">
        {displayGames.length === 0 && (
          <div className="text-center text-muted text-sm py-8">
            No games match. Try a different filter or search.
          </div>
        )}
        {displayGames.map((game) => {
          // Decks within this game that match the active query — drives
          // the "Matches: …" hint line below the description so the user
          // knows which deck to pick on tap-in.
          const subcatHits = query.trim() ? getSubcategoryMatches(game.id, query) : [];
          const visibleHits = subcatHits.slice(0, 2);
          const extra = subcatHits.length - visibleHits.length;
          // Needs more players than tonight's crew has — still playable
          // (someone can grab a friend), so it dims rather than disappears.
          const undersized = !fitsCrew(game);
          return (
            <Card
              key={game.id}
              onClick={() => handleSelectGame(game.id)}
              className={`game-card !px-4 !py-2.5 group relative overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95 ${undersized ? 'opacity-55' : ''}`}
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
                    {undersized ? (
                      <span className="bg-rose-500/15 px-2 py-0.5 rounded text-[10px] font-medium text-rose-400 uppercase tracking-wider shrink-0 ml-2">
                        Needs {game.minPlayers}+
                      </span>
                    ) : (
                      <span className="bg-accent-soft px-2 py-0.5 rounded text-[10px] font-medium text-accent uppercase tracking-wider shrink-0 ml-2">
                        {GAME_RICH_META[game.id]?.players || `${game.minPlayers}+`}
                        {GAME_RICH_META[game.id]?.duration ? ` · ${GAME_RICH_META[game.id].duration}` : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-muted leading-snug truncate whitespace-nowrap overflow-hidden pr-2">
                     {game.description}
                  </p>
                  {visibleHits.length > 0 && (
                    <p className="text-[11px] text-accent mt-1 font-medium truncate pr-2">
                      Matches: {visibleHits.join(', ')}{extra > 0 ? ` +${extra}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Pick For Us reveal sheet — bottom sheet so the choice needs one
          more deliberate tap (also keeps PIN-gated picks from launching
          unannounced). Roll again re-runs the slot-machine shuffle. */}
      {pick && (() => {
        const game = GAMES.find(g => g.id === pick);
        if (!game) return null;
        const meta = GAME_RICH_META[game.id];
        // Portal to <body>: the home root's slide-up animation leaves a
        // `transform` behind (fill-mode: forwards), which would otherwise
        // capture this fixed overlay and position it off-screen.
        return createPortal(
          <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" onClick={closePick} />
            <div className="relative w-full max-w-md bg-surface border border-divider rounded-t-3xl lg:rounded-3xl p-6 pb-8 animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
              <button
                onClick={closePick}
                aria-label="Close"
                className="absolute right-4 top-4 p-1.5 rounded-full text-muted hover:text-ink hover:bg-surface-alt transition-colors"
              >
                <X size={18} />
              </button>
              <p className="text-[11px] font-semibold text-gold uppercase tracking-[0.2em] text-center mb-4">
                {rolling ? 'Rolling…' : "Tonight's pick"}
              </p>
              <div className="flex flex-col items-center gap-3 mb-6">
                <div className={`p-4 rounded-2xl ${game.color} text-white shadow-lg ${rolling ? 'animate-pulse' : ''}`}>
                  {getIcon(game.icon, 32)}
                </div>
                <h3 className="text-2xl font-bold text-ink font-serif text-center leading-tight">{game.title}</h3>
                {!rolling && (
                  <p className="text-sm text-muted text-center max-w-[260px]">
                    {game.description}
                    {meta?.players && (
                      <span className="block mt-1 text-xs text-accent font-medium">
                        {meta.players} players · {meta.duration}{meta.vibe ? ` · ${meta.vibe}` : ''}
                      </span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={startRoll}
                  disabled={rolling}
                  className="flex-1 py-3 rounded-xl bg-transparent border-2 border-divider text-ink-soft hover:border-ink-soft font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Dices size={16} /> Roll again
                </button>
                <button
                  onClick={() => { const id = game.id; closePick(); handleSelectGame(id); }}
                  disabled={rolling}
                  className="flex-1 py-3 rounded-xl bg-gold text-slate-900 font-bold text-sm hover:brightness-110 transition-all disabled:opacity-50"
                >
                  Let's play →
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      <footer className="text-center text-xs text-muted mt-auto pb-4">
        Crafted for unforgettable game nights ✨
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
