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
                <Card className="w-full min-h-[200px] flex items-center justify-center bg-party-surface border-white/5 shadow-xl">
                    <p className="text-2xl md:text-3xl text-center font-bold px-4 leading-tight animate-slide-up text-white font-serif">
                        {loading ? "Thinking..." : prompt}
                    </p>
                </Card>
            </div>



            <div className="grid grid-cols-2 gap-4">
                <Button
                    onClick={() => getPrompt('fun')}
                    className="h-32 flex flex-col items-center justify-center gap-2 bg-party-surface hover:bg-slate-600 border border-white/5"
                >
                    <Sparkles size={32} className="text-pink-400" />
                    <span className="font-bold text-white">Fun & Crazy</span>
                </Button>
                <Button
                    onClick={() => getPrompt('deep')}
                    className="h-32 flex flex-col items-center justify-center gap-2 bg-party-surface hover:bg-slate-600 border border-white/5"
                >
                    <MessageCircle size={32} className="text-indigo-400" />
                    <span className="font-bold text-white">Deep Questions</span>
                </Button>
            </div>
        </div >
    );
};
