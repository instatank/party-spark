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

// Per-category palette shared by the SELECT screen tile accents and the PLAY
// screen card body (decorative blob, header pill, italic PartySpark footer).
// Hex stays as solid; rgba 18% gives the tint variant.
const CATEGORY_PALETTE: Record<string, { Icon: LucideIcon; solid: string; tint: string }> = {
    rehaan:           { Icon: MessageCircle, solid: '#06B6D4', tint: 'rgba(6, 182, 212, 0.18)' },   // cyan-500
    rehaan_asks:      { Icon: Flame,         solid: '#F97316', tint: 'rgba(249, 115, 22, 0.18)' },  // orange-500
    agra:             { Icon: Landmark,      solid: '#D97706', tint: 'rgba(217, 119, 6, 0.18)' },   // amber-600
    bbf:              { Icon: Users,         solid: '#9333EA', tint: 'rgba(147, 51, 234, 0.18)' },  // purple-600
    classic:          { Icon: Hand,          solid: '#10B981', tint: 'rgba(16, 185, 129, 0.18)' },  // emerald-500
    guilty_pleasures: { Icon: Lock,          solid: '#EC4899', tint: 'rgba(236, 72, 153, 0.18)' },  // pink-500
};

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
        return (
            <div className="flex flex-col h-full animate-fade-in relative">
                <ScreenHeader title="Never Have I Ever" onBack={onExit} onHome={onExit} />

                <div className="flex-1 overflow-y-auto pb-8">
                    <p className="text-gray-400 mb-4 text-sm text-center">
                        Pick a category. Stand up if you've done it. Last one sitting wins.
                    </p>

                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {NEVER_HAVE_I_EVER_CATEGORIES.map((cat) => {
                            const meta = CATEGORY_PALETTE[cat.id];
                            const Icon = meta?.Icon || Sparkles;
                            const color = meta?.solid || '#94A3B8';
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

                {/* Card body — same MLT play-screen styling as Charades / Taboo /
                    MLT itself. Portrait 3:4, surface bg, decorative tinted blob,
                    header pill in the category color, Playfair prompt centered,
                    counter + italic PartySpark footer (replaces the old floating
                    number badge). */}
                {(() => {
                    const palette = CATEGORY_PALETTE[category] || { solid: '#94A3B8', tint: 'rgba(148, 163, 184, 0.18)' };
                    return (
                        <div className="w-full max-w-sm relative z-10 perspective-1000">
                            <div
                                className="w-full aspect-[3/4] max-h-[460px] bg-party-surface border border-white/10 rounded-[22px] p-7 flex flex-col relative overflow-hidden"
                                style={{ boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                            >
                                <div
                                    className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none"
                                    style={{ background: palette.tint }}
                                />
                                <div
                                    className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10"
                                    style={{ background: palette.tint, color: palette.solid }}
                                >
                                    Never Have I Ever
                                </div>
                                <div className="flex-1 flex items-center justify-center relative z-10">
                                    <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-white text-center whitespace-pre-wrap">
                                        {cards[currentIndex]}
                                    </p>
                                </div>
                                <div className="text-[11px] text-gray-400 flex items-center justify-between relative z-10">
                                    <span>Card {currentIndex + 1} of {cards.length}</span>
                                    <span className="font-serif italic text-[12px]" style={{ color: palette.solid }}>PartySpark</span>
                                </div>
                            </div>
                        </div>
                    );
                })()}

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
