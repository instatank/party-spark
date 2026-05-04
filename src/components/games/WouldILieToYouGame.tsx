import React, { useState, useEffect } from 'react';
import { ChevronLeft, Drama, User, Eye, Users, HelpCircle, CheckCircle2, XCircle, Sparkles, Loader2 } from 'lucide-react';
import gameData from '../../data/would_i_lie_to_you.json';
import { generateContextualLies } from '../../services/geminiService';
import { sessionService } from '../../services/SessionManager';
import { GameType } from '../../types';

// Pick a random index from the data, skipping topics already used this session.
// Falls back to the full pool if every topic has been seen (so the game never
// ends due to dedupe). Returns -1 only if gameData is empty (defensive).
const pickFreshTopicIndex = (): number => {
    if (gameData.length === 0) return -1;
    const available: number[] = [];
    for (let i = 0; i < gameData.length; i++) {
        if (!sessionService.isUsed(GameType.WOULD_I_LIE_TO_YOU, 'topic', gameData[i].topic)) {
            available.push(i);
        }
    }
    const pool = available.length > 0
        ? available
        : Array.from({ length: gameData.length }, (_, i) => i);
    return pool[Math.floor(Math.random() * pool.length)];
};

type GameState = 'truth-input' | 'generating' | 'strategy-selection' | 'interrogation' | 'voting' | 'reveal';
type SelectionType = 'truth' | 'lie1' | 'lie2' | null;

interface WouldILieToYouGameProps {
    onExit: () => void;
}

export const WouldILieToYouGame: React.FC<WouldILieToYouGameProps> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('truth-input');
    const [currentPlayer, setCurrentPlayer] = useState('');
    const [currentCardIndex, setCurrentCardIndex] = useState(0);

    const [truthText, setTruthText] = useState('');
    const [generatedLies, setGeneratedLies] = useState<[string, string] | null>(null);
    const [selectedOption, setSelectedOption] = useState<SelectionType>(null);

    const [errorMsg, setErrorMsg] = useState('');

    useEffect(() => {
        // Pick a topic right on load — skipping any already used this session.
        setCurrentCardIndex(pickFreshTopicIndex());
    }, []);

    const currentCard = gameData[currentCardIndex];

    const handleGenerateLies = async () => {
        if (!truthText.trim()) return;

        setGameState('generating');
        setErrorMsg('');
        try {
            const lies = await generateContextualLies(currentCard.topic, truthText);
            setGeneratedLies(lies);
            setGameState('strategy-selection');
        } catch (error) {
            console.error(error);
            setErrorMsg("We couldn't generate lies right now. Please try again or skip your turn.");
            setGameState('truth-input');
        }
    };

    const handleSelection = (option: SelectionType) => {
        setSelectedOption(option);
    };

    const nextTurn = () => {
        // Mark the topic that was just played as used so the next pick avoids it.
        if (currentCard?.topic) {
            sessionService.markAsUsed(GameType.WOULD_I_LIE_TO_YOU, 'topic', currentCard.topic);
        }
        setCurrentPlayer('');
        setTruthText('');
        setGeneratedLies(null);
        setSelectedOption(null);
        setErrorMsg('');
        setCurrentCardIndex(pickFreshTopicIndex());
        setGameState('truth-input');
    };

    return (
        <div className="flex flex-col h-full min-h-[calc(100vh-2rem)]">
            {/* Header */}
            <header className="flex items-center justify-between mb-6">
                <button
                    onClick={onExit}
                    className="p-2 -ml-2 text-muted hover:text-ink transition-colors"
                >
                    <ChevronLeft size={28} />
                </button>
                <div className="flex items-center gap-2">
                    <Drama className="text-teal-500" size={24} />
                    <h2 className="text-xl font-bold font-serif text-teal-500">Would I Lie To You?</h2>
                </div>
                <div className="w-8" />
            </header>

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col justify-center max-w-md w-full mx-auto">

                {/* State 1: Truth Input (Immediate Load) */}
                {gameState === 'truth-input' && (
                    <div className="space-y-6 animate-fade-in">

                        <div className="bg-gradient-to-br from-teal-900/50 to-party-dark border border-teal-500/30 p-6 rounded-2xl text-center shadow-[0_0_30px_rgba(20,184,166,0.1)]">
                            <span className="text-xs font-bold tracking-widest text-teal-500 uppercase">Your Topic Category: {currentCard.category}</span>
                            <h3 className="text-2xl font-bold text-ink mt-1">{currentCard.topic}</h3>
                        </div>

                        <div className="bg-surface-alt border border-divider p-6 rounded-2xl space-y-4">
                            <div className="flex items-center gap-3 bg-app-tint rounded-xl px-4 py-2 border border-divider-soft focus-within:border-teal-400/50 transition-colors">
                                <User className="text-muted" size={16} />
                                <input
                                    type="text"
                                    value={currentPlayer}
                                    onChange={(e) => setCurrentPlayer(e.target.value)}
                                    placeholder="Storyteller Name (Optional)"
                                    className="bg-transparent border-none text-sm text-ink focus:outline-none w-full placeholder:text-muted"
                                />
                            </div>

                            <p className="text-ink-soft font-medium text-center">Think of a <span className="text-ink font-bold border-b border-teal-500">TRUE STORY</span> from your life related to "{currentCard.topic}".</p>
                            <textarea
                                value={truthText}
                                onChange={(e) => setTruthText(e.target.value)}
                                placeholder="Briefly type exactly what happened. Include specific details like names or pets (e.g., 'My dog Fonzie stole my steak') for better AI lies!"
                                className="w-full bg-surface-alt border border-divider rounded-xl p-4 text-ink focus:outline-none focus:border-teal-500/50 resize-none h-32 text-sm leading-relaxed"
                            />
                            {errorMsg && <p className="text-red-500 text-sm text-center">{errorMsg}</p>}

                            <button
                                onClick={handleGenerateLies}
                                disabled={!truthText.trim()}
                                className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300 flex items-center justify-center gap-2
                      ${truthText.trim()
                                        ? 'bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_20px_rgba(20,184,166,0.3)]'
                                        : 'bg-surface-alt text-muted cursor-not-allowed'}`}
                            >
                                Generate AI Lies <Sparkles size={20} />
                            </button>
                        </div>
                    </div>
                )}

                {/* State 2: Generating */}
                {gameState === 'generating' && (
                    <div className="flex flex-col items-center justify-center space-y-6 h-64 animate-fade-in">
                        <Loader2 size={48} className="text-teal-500 animate-spin" />
                        <div className="text-center space-y-2">
                            <h3 className="text-xl font-bold text-ink">AI is crafting your lies...</h3>
                            <p className="text-muted text-sm max-w-[250px]">Analyzing your true story to weave those details into perfectly plausible decoys.</p>
                        </div>
                    </div>
                )}

                {/* State 3: Strategy Selection */}
                {gameState === 'strategy-selection' && generatedLies && (
                    <div className="space-y-6 animate-fade-in">
                        <div className="text-center space-y-2 mb-4">
                            <h1 className="text-2xl font-bold text-ink">Choose Your Story</h1>
                            <p className="text-sm text-muted">Select which story you actually want to tell the group out loud.</p>
                        </div>

                        <div className="space-y-4">
                            {/* Truth Option (Anonymous to group later) */}
                            <div
                                onClick={() => handleSelection('truth')}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedOption === 'truth' ? 'border-green-500 bg-green-500/10' : 'border-divider bg-surface-alt hover:border-ink-soft'}`}
                            >
                                <label className="flex items-center gap-3 font-semibold text-ink mb-2 pointer-events-none">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedOption === 'truth' ? 'border-green-500' : 'border-gray-500'}`}>
                                        {selectedOption === 'truth' && <div className="w-2.5 h-2.5 bg-green-500 rounded-full" />}
                                    </div>
                                    <span className="text-green-400">The Truth</span>
                                </label>
                                <p className="text-sm text-ink-soft pl-8 pointer-events-none">"{truthText}"</p>
                            </div>

                            {/* Lie Option 1 */}
                            <div
                                onClick={() => handleSelection('lie1')}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedOption === 'lie1' ? 'border-red-500 bg-red-500/10' : 'border-divider bg-surface-alt hover:border-ink-soft'}`}
                            >
                                <label className="flex items-center gap-3 font-semibold text-ink mb-2 pointer-events-none">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedOption === 'lie1' ? 'border-red-500' : 'border-gray-500'}`}>
                                        {selectedOption === 'lie1' && <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />}
                                    </div>
                                    <span className="text-red-500">AI Generated Lie #1</span>
                                </label>
                                <p className="text-sm text-ink-soft pl-8 pointer-events-none">"{generatedLies[0]}"</p>
                            </div>

                            {/* Lie Option 2 */}
                            <div
                                onClick={() => handleSelection('lie2')}
                                className={`p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedOption === 'lie2' ? 'border-red-500 bg-red-500/10' : 'border-divider bg-surface-alt hover:border-ink-soft'}`}
                            >
                                <label className="flex items-center gap-3 font-semibold text-ink mb-2 pointer-events-none">
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${selectedOption === 'lie2' ? 'border-red-500' : 'border-gray-500'}`}>
                                        {selectedOption === 'lie2' && <div className="w-2.5 h-2.5 bg-red-500 rounded-full" />}
                                    </div>
                                    <span className="text-red-500">AI Generated Lie #2</span>
                                </label>
                                <p className="text-sm text-ink-soft pl-8 pointer-events-none">"{generatedLies[1]}"</p>
                            </div>
                        </div>

                        <div className="pt-4 pb-8">
                            <button
                                onClick={() => setGameState('interrogation')}
                                disabled={!selectedOption}
                                className={`w-full py-4 rounded-xl font-bold text-lg transition-all duration-300
                     ${!selectedOption
                                        ? 'bg-surface-alt text-muted cursor-not-allowed'
                                        : 'bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_20px_rgba(20,184,166,0.3)]'}`}
                            >
                                Ready? Hide Screen & Start Interrogation
                            </button>
                        </div>
                    </div>
                )}

                {/* State 4: Interrogation (Group Focus) */}
                {gameState === 'interrogation' && (
                    <div className="space-y-8 animate-slide-up text-center">
                        <div className="bg-teal-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 animate-pulse">
                            <HelpCircle className="text-teal-500" size={48} />
                        </div>

                        <div className="space-y-4">
                            <h2 className="text-3xl font-bold text-ink">Interrogation Time!</h2>
                            <p className="text-ink-soft text-lg">
                                <span className="font-bold text-teal-500">{currentPlayer || 'The Storyteller'}</span> is telling a story about <span className="text-ink font-bold">"{currentCard.topic}"</span>.
                            </p>
                        </div>

                        <div className="bg-surface-alt border border-divider p-6 rounded-2xl text-left space-y-3">
                            <h4 className="font-bold text-ink flex items-center gap-2">
                                <Users size={18} className="text-teal-500" /> Group Instructions:
                            </h4>
                            <ul className="text-muted text-sm space-y-2 list-disc pl-5">
                                <li>Ask specific questions about small details.</li>
                                <li>Liars often stumble on follow-up questions!</li>
                                <li>When you've heard enough, proceed to vote.</li>
                            </ul>
                        </div>

                        <button
                            onClick={() => setGameState('voting')}
                            className="w-full py-4 rounded-xl font-bold text-lg bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all mt-4"
                        >
                            Interrogation Over. Time to Vote!
                        </button>
                    </div>
                )}

                {/* State 5: Voting */}
                {gameState === 'voting' && (
                    <div className="space-y-8 animate-slide-up text-center">
                        <div className="space-y-4">
                            <h2 className="text-3xl font-bold text-ink">The Verdict</h2>
                            <p className="text-ink-soft text-lg">
                                Group, what is your official guess? Is <span className="font-bold text-teal-500">{currentPlayer || 'The Storyteller'}</span> telling the truth, or a bold-faced lie?
                            </p>
                        </div>

                        <div className="bg-surface-alt border border-divider p-8 rounded-2xl flex flex-col items-center justify-center gap-6">
                            <p className="text-muted font-medium">Discuss, then tap below to view the answer.</p>
                            <button
                                onClick={() => setGameState('reveal')}
                                className="w-full py-4 rounded-xl font-bold text-lg bg-indigo-600 hover:bg-indigo-500 text-white shadow-[0_0_20px_rgba(79,70,229,0.3)] transition-all flex items-center justify-center gap-2"
                            >
                                Reveal the Answer <Eye size={20} />
                            </button>
                        </div>
                    </div>
                )}

                {/* State 6: Reveal */}
                {gameState === 'reveal' && (
                    <div className="space-y-8 animate-scale-in text-center">

                        {selectedOption === 'truth' ? (
                            <div className="space-y-6">
                                <div className="inline-flex bg-green-500/20 p-6 rounded-full">
                                    <CheckCircle2 className="text-green-500" size={64} />
                                </div>
                                <div>
                                    <h2 className="text-4xl font-black text-green-400 mb-2 uppercase tracking-wider">It's the Truth!</h2>
                                    <p className="text-ink-soft text-lg mb-6">You can't make this stuff up.</p>
                                </div>
                                <div className="bg-surface-alt border border-divider p-6 rounded-2xl text-left">
                                    <p className="text-sm text-green-400 font-bold mb-2 uppercase tracking-wide">What really happened:</p>
                                    <p className="text-ink text-lg">"{truthText}"</p>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                <div className="inline-flex bg-red-500/20 p-6 rounded-full">
                                    <XCircle className="text-red-500" size={64} />
                                </div>
                                <div>
                                    <h2 className="text-4xl font-black text-red-500 mb-2 uppercase tracking-wider">It's a Lie!</h2>
                                    <p className="text-ink-soft text-lg mb-6"><span className="font-bold text-ink">{currentPlayer || 'The Storyteller'}</span> spun a web of deceit.</p>
                                </div>
                                <div className="bg-surface-alt border border-divider p-6 rounded-2xl text-left">
                                    <p className="text-sm text-red-500 font-bold mb-2 uppercase tracking-wide">The chosen lie:</p>
                                    <p className="text-ink text-lg italic">
                                        "{selectedOption === 'lie1' && generatedLies ? generatedLies[0] : (generatedLies ? generatedLies[1] : '')}"
                                    </p>
                                </div>
                                <div className="bg-surface-alt border border-divider p-4 rounded-xl text-left mt-2 opacity-70">
                                    <p className="text-xs text-green-400 font-bold mb-1 uppercase tracking-wide">The actual truth was:</p>
                                    <p className="text-ink-soft text-sm">"{truthText}"</p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={nextTurn}
                            className="w-full py-4 rounded-xl font-bold text-lg bg-teal-500 hover:bg-teal-400 text-white shadow-[0_0_20px_rgba(20,184,166,0.3)] transition-all mt-4"
                        >
                            Play Another Round
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};
