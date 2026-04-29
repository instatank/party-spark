import React, { useState } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
import { generateIcebreaker } from '../../services/geminiService';
import { Sparkles, MessageCircle } from 'lucide-react';

export const IcebreakerGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const [prompt, setPrompt] = useState("Press a button to generate!");
    const [loading, setLoading] = useState(false);

    const getPrompt = async (type: 'fun' | 'deep') => {
        setLoading(true);
        const text = await generateIcebreaker(type);
        setPrompt(text);
        setLoading(false);
    };

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Icebreakers" onBack={onExit} onHome={onExit} />

            <div className="flex-1 flex items-center justify-center my-8">
                <Card className="w-full min-h-[200px] flex items-center justify-center bg-surface border-divider-soft">
                    <p className="text-2xl md:text-3xl text-center font-bold px-4 leading-tight animate-slide-up text-ink font-serif">
                        {loading ? "Thinking..." : prompt}
                    </p>
                </Card>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <Button
                    onClick={() => getPrompt('fun')}
                    className="h-32 flex flex-col items-center justify-center gap-2 bg-surface hover:bg-surface-alt text-ink border border-divider-soft"
                >
                    <Sparkles size={32} className="text-pink-500" />
                    <span className="font-bold text-ink">Fun & Crazy</span>
                </Button>
                <Button
                    onClick={() => getPrompt('deep')}
                    className="h-32 flex flex-col items-center justify-center gap-2 bg-surface hover:bg-surface-alt text-ink border border-divider-soft"
                >
                    <MessageCircle size={32} className="text-indigo-500" />
                    <span className="font-bold text-ink">Deep Questions</span>
                </Button>
            </div>
        </div >
    );
};
