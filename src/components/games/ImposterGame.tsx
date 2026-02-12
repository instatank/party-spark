
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
    const [category, setCategory] = useState(IMPOSTER_CATEGORIES[0]);
    const [secretWord, setSecretWord] = useState('');
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
    const [isRevealing, setIsRevealing] = useState(false);
    const [winner, setWinner] = useState<'CIVILIANS' | 'IMPOSTER' | null>(null);
    const [imposterName, setImposterName] = useState('');

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
        const newPlayers = validPlayers.map((p, idx) => ({
            ...p,
            isImposter: idx === imposterIndex
        }));

        setPlayers(newPlayers);
        setImposterName(newPlayers[imposterIndex].name);
        setCurrentPlayerIndex(0);
        setGameState('REVEAL');
    };

    const nextPlayer = () => {
        if (currentPlayerIndex < players.length - 1) {
            setCurrentPlayerIndex(prev => prev + 1);
            setIsRevealing(false);
        } else {
            setGameState('PLAY');
        }
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
                    <div className="space-y-3 mb-8">
                        <label className="block text-sm font-medium text-gray-400">Players ({players.length})</label>
                        {players.map((player, idx) => (
                            <div key={player.id} className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder={`Player ${idx + 1}`}
                                    value={player.name}
                                    onChange={(e) => updateName(player.id, e.target.value)}
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-party-accent focus:ring-1 focus:ring-party-accent"
                                />
                                {players.length > 3 && (
                                    <button
                                        onClick={() => handleRemovePlayer(player.id)}
                                        className="px-3 text-gray-500 hover:text-red-400"
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
        const currentPlayer = players[currentPlayerIndex];
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Secret Role" onBack={() => setGameState('SETUP')} onHome={onExit} />
                <Card className="p-6 text-center flex-1 flex flex-col justify-center">
                    {!isRevealing ? (
                        <div className="animate-fade-in">
                            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
                                <User size={40} className="text-party-accent" />
                            </div>
                            <h2 className="text-3xl font-bold mb-2">Pass to {currentPlayer.name}</h2>
                            <p className="text-gray-400 mb-8">Keep the screen hidden from others!</p>
                            <Button onClick={() => setIsRevealing(true)} className="w-full py-4 text-xl">
                                Reveal Role
                            </Button>
                        </div>
                    ) : (
                        <div className="animate-flip-up">
                            <div className="mb-8">
                                <div className="uppercase tracking-widest text-sm text-gray-500 mb-2">Your Secret Word</div>
                                {currentPlayer.isImposter ? (
                                    <div className="text-red-500">
                                        <VenetianMask size={64} className="mx-auto mb-4" />
                                        <h2 className="text-4xl font-black tracking-tight">YOU ARE THE IMPOSTER</h2>
                                        <p className="text-gray-400 mt-4 text-sm">Blend in. Don't let them know you don't know the word.</p>
                                        <p className="text-gray-500 mt-2 text-xs uppercase tracking-wider">Category: {category.label}</p>
                                    </div>
                                ) : (
                                    <div className="text-emerald-400">
                                        <div className="text-5xl font-black mb-2 tracking-tight">{secretWord}</div>
                                        <p className="text-gray-400 mt-4 text-sm">Valid for category: {category.label}</p>
                                    </div>
                                )}
                            </div>
                            <Button onClick={nextPlayer} className="w-full py-4 bg-white/10 hover:bg-white/20 text-white">
                                Hide & Pass Next
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
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-blue-400">
                        <Eye size={32} />
                    </div>
                    <h2 className="text-2xl font-bold mb-4">Discuss & Deduce!</h2>
                    <div className="bg-white/5 rounded-xl p-6 mb-8 text-left space-y-3">
                        <p className="text-gray-300">1. Take turns giving a one-word clue related to <strong>{category.label}</strong>.</p>
                        <p className="text-gray-300">2. The Imposter must lie and pretend to know the word.</p>
                        <p className="text-gray-300">3. Discuss who seems suspicious.</p>
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
                                className="bg-white/5 hover:bg-white/10 p-4 rounded-xl flex items-center justify-between group transition-all"
                            >
                                <span className="font-medium text-lg">{p.name}</span>
                                <div className="w-6 h-6 rounded-full border-2 border-white/20 group-hover:border-red-500" />
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

                    <p className="text-xl text-gray-300 mb-8">
                        The Imposter was <span className="font-bold text-white">{imposterName}</span>
                        <br />
                        The word was <span className="font-bold text-white">{secretWord}</span>
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

