import React, { useState, useEffect } from 'react';
import { NEVER_HAVE_I_EVER_CATEGORIES } from '../../constants';
import { ScreenHeader } from '../ui/Layout';
import neverHaveIEverData from '../../data/never_have_i_ever.json';
import { generateNeverHaveIEver } from '../../services/geminiService';
import { Sparkles, Lock, ChevronRight, Hand } from 'lucide-react';

interface GameProps {
    onExit: () => void;
}

export const NeverHaveIEverGame: React.FC<GameProps> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'SELECT' | 'PLAY'>('SELECT');
    const [category, setCategory] = useState<string>('');
    const [cards, setCards] = useState<string[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoading, setIsLoading] = useState(false);

    // Initialize with local data depending on category
    useEffect(() => {
        if (gameState === 'PLAY' && category) {
            const localCards = (neverHaveIEverData as Record<string, string[]>)[category] || [];
            
            // Randomize array
            const shuffled = [...localCards].sort(() => 0.5 - Math.random());
            
            setCards(shuffled);
            setCurrentIndex(0);
        }
    }, [gameState, category]);

    const handleNextCard = async () => {
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            // Need more cards
            setIsLoading(true);
            try {
                // Determine how many to fetch based on difficulty/mode, typically 10
                const newCards = await generateNeverHaveIEver(category, 5);
                setCards(prev => [...prev, ...newCards]);
                setCurrentIndex(prev => prev + 1);
            } catch (error) {
                console.error("Failed to generate Never Have I Ever cards:", error);
                // Optional: Show error to user
            } finally {
                setIsLoading(false);
            }
        }
    };

    if (gameState === 'SELECT') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative">
                <ScreenHeader title="Never Have I Ever" onBack={onExit} onHome={onExit} />
                
                <div className="flex-1 overflow-y-auto pb-8">
                    <p className="text-gray-400 mb-6 text-sm text-center">
                        Select a category. We'll show a statement. If you've done it, stand up or raise your hand! Last one sitting wins.
                    </p>

                    <div className="grid gap-4">
                        {NEVER_HAVE_I_EVER_CATEGORIES.map((cat) => (
                            <button
                                key={cat.id}
                                onClick={() => {
                                    setCategory(cat.id);
                                    setGameState('PLAY');
                                }}
                                className="group relative w-full text-left transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                            >
                                <div className={`absolute inset-0 rounded-2xl ${cat.color} opacity-0 group-hover:opacity-10 transition-opacity blur-xl`} />
                                <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl shadow-xl hover:border-neutral-700 transition-colors relative overflow-hidden">
                                    <div className="relative z-10 flex items-center justify-between p-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                {cat.id === 'rehaan' && <Sparkles className="text-cyan-400" size={20} />}
                                                {cat.id === 'classic' && <Hand className="text-emerald-400" size={20} />}
                                                {cat.id === 'guilty_pleasures' && <Lock className="text-pink-400" size={20} />}
                                                <h3 className="text-xl font-bold text-white">{cat.label}</h3>
                                            </div>
                                            <p className="text-sm text-neutral-400">{cat.description}</p>
                                        </div>
                                        <div className={`w-10 h-10 rounded-full ${cat.color} flex items-center justify-center shadow-lg group-hover:shadow-xl transition-shadow`}>
                                            <ChevronRight className="text-white" size={20} />
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    if (cards.length === 0) {
        return (
            <div className="flex flex-col h-full">
                <ScreenHeader title="Never Have I Ever" onBack={() => setGameState('SELECT')} onHome={onExit} />
                <div className="flex-1 flex items-center justify-center">
                    <div className="animate-pulse flex items-center gap-2 text-cyan-500">
                        <Sparkles className="animate-spin" />
                        <span className="font-bold tracking-widest uppercase">Shuffling Cards...</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-fade-in">
            <ScreenHeader 
                title={NEVER_HAVE_I_EVER_CATEGORIES.find(c => c.id === category)?.label || "Never Have I Ever"} 
                onBack={() => setGameState('SELECT')} 
                onHome={onExit}
            />

            <div className="flex-1 flex flex-col items-center justify-center px-4 relative">
                {/* Decorative background shapes for flavor */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
                    <div className="absolute top-10 left-10 w-32 h-32 bg-cyan-600 rounded-full blur-3xl mix-blend-screen" />
                    <div className="absolute bottom-10 right-10 w-40 h-40 bg-pink-600 rounded-full blur-3xl mix-blend-screen" />
                </div>

                <div className="w-full max-w-sm relative z-10 perspective-1000">
                    <div className={`w-full bg-neutral-900 border-2 ${category === 'rehaan' ? 'border-cyan-500/50' : category === 'guilty_pleasures' ? 'border-pink-500/50' : 'border-emerald-500/50'} rounded-3xl p-8 shadow-2xl transform transition-all duration-500 min-h-[300px] flex flex-col justify-center`}>
                        <div className="absolute -top-4 -right-4 bg-neutral-800 border border-neutral-700 w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-neutral-400">
                            {currentIndex + 1}
                        </div>
                        
                        <p className="text-2xl md:text-3xl font-black text-center text-white leading-tight font-serif whitespace-pre-wrap">
                            {cards[currentIndex]}
                        </p>
                    </div>
                </div>

                <div className="w-full max-w-sm mt-12 grid grid-cols-1 gap-4">
                    <button
                        onClick={handleNextCard}
                        disabled={isLoading}
                        className={`w-full py-4 rounded-xl font-bold tracking-wider text-white shadow-lg transition-all active:scale-[0.98] ${category === 'rehaan' ? 'bg-cyan-600 hover:bg-cyan-500' : category === 'guilty_pleasures' ? 'bg-pink-600 hover:bg-pink-500' : 'bg-emerald-600 hover:bg-emerald-500'} ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <Sparkles className="animate-spin" size={20} /> Generating via AI...
                            </span>
                        ) : (
                            "NEXT STATEMENT"
                        )}
                    </button>
                    <p className="text-center text-xs text-neutral-500 font-medium">Stand up if you've done it!</p>
                </div>
            </div>
        </div>
    );
};
