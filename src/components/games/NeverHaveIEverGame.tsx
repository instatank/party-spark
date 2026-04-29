import React, { useState, useEffect } from 'react';
import { NEVER_HAVE_I_EVER_CATEGORIES } from '../../constants';
import { ScreenHeader } from '../ui/Layout';
import neverHaveIEverData from '../../data/never_have_i_ever.json';
import { generateNeverHaveIEver } from '../../services/geminiService';
import type { LucideIcon } from 'lucide-react';
import { Sparkles, Lock, ChevronRight, Hand, MessageCircle, Flame, Landmark, Users } from 'lucide-react';

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
        // Same design pattern as MLT/TOD: 3px inset left bar + 33% center
        // bottom line. NHIE has no AI custom-vibe deck so no ring/glow tile.
        const TILES: Record<string, { Icon: LucideIcon; color: string }> = {
            rehaan:           { Icon: MessageCircle, color: '#06B6D4' }, // cyan-500
            rehaan_asks:      { Icon: Flame,         color: '#F97316' }, // orange-500
            agra:             { Icon: Landmark,      color: '#D97706' }, // amber-600
            bbf:              { Icon: Users,         color: '#9333EA' }, // purple-600
            classic:          { Icon: Hand,          color: '#10B981' }, // emerald-500
            guilty_pleasures: { Icon: Lock,          color: '#EC4899' }, // pink-500
        };

        return (
            <div className="flex flex-col h-full animate-fade-in relative">
                <ScreenHeader title="Never Have I Ever" onBack={onExit} onHome={onExit} />

                <div className="flex-1 overflow-y-auto pb-8">
                    <p className="text-gray-400 mb-4 text-sm text-center">
                        Pick a category. Stand up if you've done it. Last one sitting wins.
                    </p>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {NEVER_HAVE_I_EVER_CATEGORIES.map((cat) => {
                            const meta = TILES[cat.id];
                            const Icon = meta?.Icon || Sparkles;
                            const color = meta?.color || '#94A3B8';
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => {
                                        setCategory(cat.id);
                                        setGameState('PLAY');
                                    }}
                                    className="group relative w-full text-left transition-all duration-200 active:scale-[0.99] cursor-pointer"
                                >
                                    <div className="relative bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/[0.08] hover:border-white/20 rounded-xl py-3 px-4 transition-colors overflow-hidden">
                                        <span
                                            className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]"
                                            style={{ background: color }}
                                        />
                                        <span
                                            className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-[2px]"
                                            style={{ background: color }}
                                        />
                                        <div className="flex items-center gap-3">
                                            <span className="flex-shrink-0" style={{ color }}>
                                                <Icon size={16} />
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-base font-bold text-white leading-tight truncate">{cat.label}</h3>
                                                <p className="text-xs text-gray-400 leading-snug truncate">{cat.description}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-gray-500 group-hover:text-white transition-colors flex-shrink-0" />
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
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
