
import React, { useState } from 'react';
import { Card, Button, ScreenHeader } from '../ui/Layout';
import { VenetianMask, Check, User, Eye, ArrowRight, RotateCcw, Loader2 } from 'lucide-react';
import { IMPOSTER_CATEGORIES } from '../../constants';
import { sessionService } from '../../services/SessionManager';
import { generateImposterContent } from '../../services/geminiService';
import { GameType } from '../../types';

interface Player {
    id: string;
    name: string;
    isImposter: boolean;
    isVoted?: boolean;
}

type GameState = 'SETUP' | 'LOADING' | 'REVEAL' | 'PLAY' | 'VOTE' | 'RESULT';

interface ImposterGameProps {
    onExit: () => void;
}

export const ImposterGame: React.FC<ImposterGameProps> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('SETUP');
    const [players, setPlayers] = useState<Player[]>([
        { id: '1', name: '', isImposter: false },
        { id: '2', name: '', isImposter: false },
        { id: '3', name: '', isImposter: false }
    ]);
    const [savedGroups, setSavedGroups] = useState<Record<string, string[]>>({});
    const [showHowToPlay, setShowHowToPlay] = useState(false);

    React.useEffect(() => {
        const loaded = localStorage.getItem('imposterGroups');
        if (loaded) {
            try { setSavedGroups(JSON.parse(loaded)); } catch(e) {}
        }
    }, []);
    const [category, setCategory] = useState(IMPOSTER_CATEGORIES[0]);
    const [secretWord, setSecretWord] = useState('');
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
    const [isRevealing, setIsRevealing] = useState(false);
    const [winner, setWinner] = useState<'CIVILIANS' | 'IMPOSTER' | null>(null);
    const [imposterName, setImposterName] = useState('');
    const [isHardMode, setIsHardMode] = useState(false);

    const handleAddPlayer = () => {
        setPlayers([...players, { id: Date.now().toString(), name: '', isImposter: false }]);
    };

    const handleRemovePlayer = (id: string) => {
        if (players.length > 3) {
            setPlayers(players.filter(p => p.id !== id));
        }
    };

    const updateName = (id: string, name: string) => {
        setPlayers(players.map(p => p.id === id ? { ...p, name } : p));
    };

    const saveCurrentGroup = () => {
        const validPlayers = players.filter(p => p.name.trim() !== '');
        if (validPlayers.length < 3) return;
        const name = prompt("Enter a name for this group (e.g., 'Squad'):");
        if (!name) return;
        const updated = { ...savedGroups, [name]: validPlayers.map(p => p.name.trim()) };
        setSavedGroups(updated);
        localStorage.setItem('imposterGroups', JSON.stringify(updated));
    };

    const loadGroup = (names: string[]) => {
        setPlayers(names.map((name, i) => ({ id: `saved-${i}-${Date.now()}`, name, isImposter: false })));
    };

    const startGame = async () => {
        const validPlayers = players.filter(p => p.name.trim() !== '');
        if (validPlayers.length < 3) return;

        setGameState('LOADING');

        // Logic to pick a word
        let selectedCategory = IMPOSTER_CATEGORIES[0];
        let selectedWord = "";

        // 1. Flatten all available words
        const allOptions = IMPOSTER_CATEGORIES.flatMap(c =>
            c.words.map(w => ({ category: c, word: w }))
        );

        // 2. Filter out used ones
        const availableOptions = allOptions.filter(opt =>
            !sessionService.isUsed(GameType.IMPOSTER, opt.category.id, opt.word)
        );

        if (availableOptions.length > 0) {
            // Pick from local
            const randomOpt = availableOptions[Math.floor(Math.random() * availableOptions.length)];
            selectedCategory = randomOpt.category;
            selectedWord = randomOpt.word;
        } else {
            // Generate new
            try {
                const generated = await generateImposterContent();
                if (generated) {
                    selectedCategory = {
                        id: 'generated',
                        label: generated.category,
                        color: 'bg-purple-500',
                        words: [generated.word]
                    };
                    selectedWord = generated.word;
                } else {
                    // Fallback to random local (repeat)
                    const fallback = allOptions[Math.floor(Math.random() * allOptions.length)];
                    selectedCategory = fallback.category;
                    selectedWord = fallback.word;
                }
            } catch (e) {
                console.error("Imposter generation failed", e);
                const fallback = allOptions[Math.floor(Math.random() * allOptions.length)];
                selectedCategory = fallback.category;
                selectedWord = fallback.word;
            }
        }

        // Set state
        setCategory(selectedCategory);
        setSecretWord(selectedWord);

        // Mark as used
        sessionService.markAsUsed(GameType.IMPOSTER, selectedCategory.id, selectedWord);

        // Assign Imposter
        const imposterIndex = Math.floor(Math.random() * validPlayers.length);
        const assignedPlayers = validPlayers.map((p, idx) => ({
            ...p,
            isImposter: idx === imposterIndex
        }));

        // Shuffle reveal order so it's different every game
        const newPlayers = [...assignedPlayers].sort(() => Math.random() - 0.5);

        setPlayers(newPlayers);
        setImposterName(newPlayers.find(p => p.isImposter)!.name);
        setCurrentPlayerIndex(0);
        setGameState('REVEAL');
    };

    const handleVote = (playerId: string) => {
        const votedPlayer = players.find(p => p.id === playerId);
        if (votedPlayer?.isImposter) {
            setWinner('CIVILIANS');
        } else {
            setWinner('IMPOSTER');
        }
        setGameState('RESULT');
    };

    const resetGame = () => {
        setGameState('SETUP');
        setPlayers([
            { id: '1', name: '', isImposter: false },
            { id: '2', name: '', isImposter: false },
            { id: '3', name: '', isImposter: false }
        ]);
        setWinner(null);
        setCurrentPlayerIndex(0);
        setIsRevealing(false);
    };

    if (gameState === 'SETUP') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Setup Game" onBack={onExit} onHome={onExit} />
                <Card className="p-6 flex-1 overflow-y-auto">
                    <div className="text-center mb-6">
                        <button onClick={() => setShowHowToPlay(!showHowToPlay)} className="text-xs font-bold text-party-accent border border-party-accent/30 px-3 py-1 bg-surface-alt hover:bg-app-tint transition relative z-10 mx-auto block mb-2 rounded shadow-lg uppercase">
                             {showHowToPlay ? 'Hide Rules' : 'How To Play'}
                        </button>
                        
                        {showHowToPlay && (
                            <div className="text-left text-xs text-ink-soft bg-black/20 border border-divider p-4 mt-2 mb-4 relative z-10 space-y-3 font-medium rounded animate-fade-in shadow-inner">
                                <p><strong className="text-ink">1. SETUP:</strong> All players join. A category and secret word are chosen automatically.</p>
                                <p><strong className="text-red-500">2. THE SECRET:</strong> Everyone learns the secret word EXCEPT ONE person (the Imposter). The Imposter {isHardMode ? 'gets absolutely NO clues!' : 'only gets the category'}.</p>
                                <p><strong className="text-emerald-500">3. DISCUSS:</strong> Take turns saying exactly one word related to the secret word to prove you know it. The Imposter must bluff!</p>
                                <p><strong className="text-blue-500">4. VOTE:</strong> After everyone gives a word, vote on who the Imposter is. If the group guesses right, Civilians win!</p>
                            </div>
                        )}
                    </div>
                    {Object.keys(savedGroups).length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide">
                            {Object.entries(savedGroups).map(([gName, gPlayers]) => (
                                <button key={gName} onClick={() => loadGroup(gPlayers)} className="whitespace-nowrap px-4 py-2 bg-surface-alt text-ink-soft hover:text-ink hover:bg-app-tint border border-divider rounded-full text-xs font-bold transition">
                                    Load: {gName} ({gPlayers.length})
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="mb-6 p-4 bg-surface-alt border border-divider rounded-xl flex items-center justify-between shadow-inner">
                        <div>
                            <div className="font-bold text-sm text-party-accent mb-0.5">Hard Mode</div>
                            <div className="text-xs text-muted">Hide category from the Imposter</div>
                        </div>
                        <div 
                            className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors shadow-inner ${isHardMode ? 'bg-red-500' : 'bg-app-tint'}`}
                            onClick={() => setIsHardMode(!isHardMode)}
                        >
                            <div className={`w-4 h-4 bg-white rounded-full transition-transform shadow-md ${isHardMode ? 'translate-x-6' : ''}`} />
                        </div>
                    </div>
                    <div className="flex justify-between items-end mb-3">
                        <label className="block text-sm font-medium text-muted">Players ({players.length})</label>
                        {players.filter(p => p.name.trim() !== '').length >= 3 && (
                            <button onClick={saveCurrentGroup} className="text-xs text-party-accent hover:opacity-80 font-bold">
                                Save Current Group
                            </button>
                        )}
                    </div>
                    <div className="space-y-3 mb-8">
                        {players.map((player, idx) => (
                            <div key={player.id} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder={`Player ${idx + 1}`}
                                    value={player.name}
                                    onChange={(e) => updateName(player.id, e.target.value)}
                                    className="flex-1 bg-surface-alt border border-divider rounded-xl px-4 py-3 text-ink placeholder:text-muted focus:outline-none focus:border-party-accent focus:ring-1 focus:ring-party-accent"
                                />
                                {players.length > 3 && (
                                    <button
                                        onClick={() => handleRemovePlayer(player.id)}
                                        className="px-3 text-muted hover:text-red-500"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                        <button
                            onClick={handleAddPlayer}
                            className="text-sm text-party-accent hover:underline pl-1"
                        >
                            + Add Player
                        </button>
                    </div>

                    <Button
                        onClick={startGame}
                        className="w-full py-4 text-lg font-bold bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-400 hover:to-orange-500 shadow-xl"
                        disabled={players.filter(p => p.name.trim()).length < 3}
                    >
                        Start Game <ArrowRight className="ml-2 inline" size={20} />
                    </Button>
                </Card>
            </div>
        );
    }

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col items-center justify-center">
                <Loader2 className="w-12 h-12 text-party-accent animate-spin mb-4" />
                <p className="text-xl font-bold animate-pulse">Generating Mission...</p>
            </div>
        );
    }

    if (gameState === 'REVEAL') {
        // If a specific player is currently viewing their role
        if (isRevealing) {
            const currentPlayer = players[currentPlayerIndex];
            return (
                <div className="h-full flex flex-col">
                    <ScreenHeader title="Your Role" onBack={() => setGameState('SETUP')} onHome={onExit} />
                    <Card className="p-6 text-center flex-1 flex flex-col justify-center animate-fade-in">
                        <div className="mb-8">
                            <div className="uppercase tracking-widest text-sm text-muted mb-2">Your Secret Word</div>
                            {currentPlayer.isImposter ? (
                                <div className="text-red-500">
                                    <VenetianMask size={64} className="mx-auto mb-4" />
                                    <h2 className="text-4xl font-black tracking-tight">YOU ARE THE IMPOSTER</h2>
                                    <p className="text-muted mt-4 text-sm">Blend in. Don't let them know you don't know the word.</p>
                                    {!isHardMode ? (
                                        <p className="text-muted mt-2 text-xs uppercase tracking-wider font-bold">Category: {category.label}</p>
                                    ) : (
                                        <p className="text-red-500 mt-2 text-xs uppercase tracking-wider font-bold animate-pulse">Category: HIDDEN</p>
                                    )}
                                </div>
                            ) : (
                                <div className="text-emerald-500">
                                    <div className="text-5xl font-black mb-2 tracking-tight">{secretWord}</div>
                                    <p className="text-muted mt-4 text-sm">Category: {category.label}</p>
                                </div>
                            )}
                        </div>
                        <Button
                            onClick={() => {
                                setIsRevealing(false);
                                setCurrentPlayerIndex(-1);
                                // Mark this player as revealed
                                setPlayers(prev => prev.map(p =>
                                    p.id === currentPlayer.id ? { ...p, hasRevealed: true } as any : p
                                ));
                            }}
                            className="w-full py-4 bg-app-tint hover:bg-surface-alt text-ink"
                        >
                            Got it — Hide & Pass Back
                        </Button>
                    </Card>
                </div>
            );
        }

        // Grid picker — all names visible, pick your own
        const allRevealed = players.every(p => (p as any).hasRevealed);

        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Find Your Name" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <Card className="p-6 flex-1 flex flex-col">
                    <div className="text-center mb-6">
                        <p className="text-ink-soft text-sm leading-relaxed">
                            Pass the phone around. <strong className="text-ink">Each person taps their own name</strong> to see their secret role privately, then hides the screen and passes it back.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 flex-1 content-start">
                        {players.map((p, idx) => {
                            const hasRevealed = (p as any).hasRevealed;
                            return (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        if (!hasRevealed) {
                                            setCurrentPlayerIndex(idx);
                                            setIsRevealing(true);
                                        }
                                    }}
                                    disabled={hasRevealed}
                                    className={`relative flex flex-col items-center justify-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95 min-h-[80px] font-bold text-lg
                                        ${hasRevealed
                                            ? 'bg-surface-alt border-divider text-muted cursor-default opacity-60'
                                            : 'bg-surface-alt border-divider hover:border-party-accent hover:bg-app-tint text-ink shadow-md active:shadow-none'
                                        }`}
                                >
                                    {hasRevealed ? (
                                        <Check size={22} className="text-emerald-500" />
                                    ) : (
                                        <User size={22} className="text-party-accent" />
                                    )}
                                    <span className={hasRevealed ? 'line-through text-muted' : ''}>{p.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {allRevealed && (
                        <div className="mt-6 animate-fade-in">
                            <Button
                                onClick={() => setGameState('PLAY')}
                                className="w-full py-4 text-lg font-bold bg-gradient-to-r from-red-500 to-orange-600"
                            >
                                Everyone's Ready — Start Game! <ArrowRight className="inline ml-2" size={20} />
                            </Button>
                        </div>
                    )}
                </Card>
            </div>
        );
    }


    if (gameState === 'PLAY') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Discussion" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <Card className="p-6 text-center flex-1">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-500">
                        <Eye size={32} />
                    </div>
                    <h2 className="text-2xl font-bold mb-4">Discuss & Deduce!</h2>
                    <div className="bg-surface-alt rounded-xl p-6 mb-8 text-left space-y-3">
                        <p className="text-ink-soft">1. Take turns giving a one-word clue related to <strong>{category.label}</strong>.</p>
                        <p className="text-ink-soft">2. The Imposter must lie and pretend to know the word.</p>
                        <p className="text-ink-soft">3. Discuss who seems suspicious.</p>
                    </div>
                    <Button onClick={() => setGameState('VOTE')} className="w-full py-4 bg-red-500 hover:bg-red-600 text-white font-bold">
                        Vote Out Imposter
                    </Button>
                </Card>
            </div>
        );
    }

    if (gameState === 'VOTE') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Vote" onBack={() => setGameState('PLAY')} onHome={onExit} />
                <Card className="p-6 flex-1">
                    <h2 className="text-2xl font-bold mb-6 text-center">Who is the Imposter?</h2>
                    <div className="grid gap-3">
                        {players.map(p => (
                            <button
                                key={p.id}
                                onClick={() => handleVote(p.id)}
                                className="bg-surface-alt hover:bg-app-tint p-4 rounded-xl flex items-center justify-between group transition-all"
                            >
                                <span className="font-medium text-lg">{p.name}</span>
                                <div className="w-6 h-6 rounded-full border-2 border-divider group-hover:border-red-500" />
                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    if (gameState === 'RESULT') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Game Over" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <Card className="p-6 text-center flex-1 flex flex-col items-center justify-center">
                    <div className="mb-6 animate-scale-in">
                        {winner === 'CIVILIANS' ? (
                            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center mb-4 mx-auto shadow-lg shadow-green-500/50">
                                <Check size={48} className="text-white" />
                            </div>
                        ) : (
                            <div className="w-24 h-24 bg-red-500 rounded-full flex items-center justify-center mb-4 mx-auto shadow-lg shadow-red-500/50">
                                <VenetianMask size={48} className="text-white" />
                            </div>
                        )}
                    </div>

                    <h2 className="text-4xl font-black mb-2 font-serif">
                        {winner === 'CIVILIANS' ? 'Civilians Win!' : 'Imposter Wins!'}
                    </h2>

                    <p className="text-xl text-ink-soft mb-8">
                        The Imposter was <span className="font-bold text-ink">{imposterName}</span>
                        <br />
                        The word was <span className="font-bold text-ink">{secretWord}</span>
                    </p>

                    <div className="flex gap-4 w-full">
                        <Button onClick={onExit} variant="secondary" className="flex-1">Exit</Button>
                        <Button onClick={resetGame} className="flex-1">
                            <RotateCcw className="mr-2 inline" size={18} />
                            Play Again
                        </Button>
                    </div>
                </Card>
            </div>
        );
    }

    return null;
};

