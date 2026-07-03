// Smoke test: render the real app (default export of src/App.tsx) through the
// real module graph — constants, Layout, PinGate, ThemeToggle, ContentContext.
// Asserts the splash screen shows, then (after the 5s splash timer) that the
// home menu lists real game titles pulled from GAMES in src/constants.tsx.
//
// Note: games are React.lazy, so the home screen never loads game chunks —
// nothing async to wait on beyond the splash timer.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import AppWithProvider from '../src/App';
import { ThemeProvider } from '../src/contexts/ThemeContext';
import { GAMES } from '../src/constants';
import { GameType } from '../src/types';

// main.tsx wraps the app in ThemeProvider (ThemeToggle on the home screen
// throws without it), so the test mirrors the real mount tree.
const renderApp = () =>
  render(
    <ThemeProvider>
      <AppWithProvider />
    </ThemeProvider>
  );

const titleOf = (id: GameType): string => {
  const game = GAMES.find((g) => g.id === id);
  if (!game) throw new Error(`GameType ${id} missing from GAMES in constants.tsx`);
  return game.title;
};

describe('App smoke test', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the splash screen, then the home menu with real game titles', () => {
    renderApp();

    // Splash screen first.
    expect(screen.getByText('PartySpark')).toBeInTheDocument();

    // Home-menu game cards are not rendered yet.
    const charades = titleOf(GameType.CHARADES);
    const taboo = titleOf(GameType.TABOO);
    const nhie = titleOf(GameType.NEVER_HAVE_I_EVER);
    expect(screen.queryByText(charades)).not.toBeInTheDocument();

    // Advance past the 5s splash timer.
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Home menu now shows real titles from the GAMES roster.
    expect(screen.getByText(charades)).toBeInTheDocument();
    expect(screen.getByText(taboo)).toBeInTheDocument();
    expect(screen.getByText(nhie)).toBeInTheDocument();

    // Sanity: a healthy roster of game cards rendered (Play Now set).
    const cards = document.querySelectorAll('.game-card');
    expect(cards.length).toBeGreaterThanOrEqual(2);
  });
});
