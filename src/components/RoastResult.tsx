import React, { useState } from 'react';
import { editImage, cleanBase64, getCaricaturePrompt, type RoastIntensity } from '../services/geminiService';

interface RoastResultProps {
    originalImage: string;
    resultImage: string;
    roastText: string;
    onUpdateImage: (newImage: string) => void;
}

const RoastResult: React.FC<RoastResultProps> = ({ originalImage, resultImage, roastText, onUpdateImage }) => {
    const [prompt, setPrompt] = useState('');
    const [isEditing, setIsEditing] = useState(false);

    const handleCustomEdit = async (customPrompt?: string) => {
        const promptToUse = customPrompt || prompt;
        if (!promptToUse.trim()) return;

        setIsEditing(true);
        try {
            // We edit the ORIGINAL image with the new prompt to preserve quality
            const imageToEdit = originalImage;
            const rawBase64 = cleanBase64(imageToEdit);
            const newImage = await editImage(rawBase64, promptToUse);

            if (newImage) {
                onUpdateImage(newImage);
                if (!customPrompt) setPrompt(''); // Clear input if it was a manual text entry
            }
        } catch (e) {
            console.error(e);
            alert("Failed to edit image. Try a different prompt.");
        } finally {
            setIsEditing(false);
        }
    };

    const handleIntensityClick = (level: RoastIntensity) => {
        handleCustomEdit(getCaricaturePrompt(level));
    };

    return (
        <div className="w-full max-w-4xl mx-auto flex flex-col md:flex-row gap-8 animate-fade-in-up">
            {/* Visuals */}
            <div className="flex-1 space-y-4">
                <div className="relative group rounded-xl overflow-hidden shadow-2xl shadow-yellow-900/20 border-2 border-neutral-800">
                    {isEditing && (
                        <div className="absolute inset-0 bg-black/70 z-10 flex items-center justify-center">
                            <span className="text-yellow-400 font-comic animate-pulse text-xl">Applying Magic...</span>
                        </div>
                    )}
                    <img
                        src={resultImage}
                        alt="Roast Result"
                        className="w-full h-auto object-cover transform transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                        Generated Caricature
                    </div>
                </div>

                {/* Edit Controls */}
                <div className="bg-neutral-900 p-4 rounded-xl border border-neutral-800 space-y-4">

                    {/* Quick Presets */}
                    <div>
                        <h3 className="text-neutral-400 text-xs font-bold mb-2 uppercase tracking-wider">Change Intensity</h3>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleIntensityClick('subtle')}
                                disabled={isEditing}
                                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white text-sm font-medium py-2 rounded-lg border border-neutral-700 transition-all"
                            >
                                Subtle
                            </button>
                            <button
                                onClick={() => handleIntensityClick('medium')}
                                disabled={isEditing}
                                className="flex-1 bg-neutral-800 hover:bg-neutral-700 text-yellow-500 text-sm font-medium py-2 rounded-lg border border-neutral-700 transition-all"
                            >
                                Medium
                            </button>
                            <button
                                onClick={() => handleIntensityClick('extreme')}
                                disabled={isEditing}
                                className="flex-1 bg-neutral-800 hover:bg-red-900/30 text-red-500 text-sm font-medium py-2 rounded-lg border border-neutral-700 border-red-900/30 transition-all"
                            >
                                EXTREME
                            </button>
                        </div>
                    </div>

                    {/* Custom Prompt */}
                    <div>
                        <h3 className="text-neutral-400 text-xs font-bold mb-2 uppercase tracking-wider">Custom Refinement</h3>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder="e.g., Make it a zombie..."
                                className="flex-1 bg-neutral-800 border border-neutral-700 text-white px-3 py-2 text-sm rounded-lg focus:outline-none focus:border-yellow-500 focus:ring-1 focus:ring-yellow-500"
                                onKeyDown={(e) => e.key === 'Enter' && handleCustomEdit()}
                            />
                            <button
                                onClick={() => handleCustomEdit()}
                                disabled={isEditing || !prompt}
                                className="bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-3 py-2 text-sm rounded-lg transition-colors"
                            >
                                Go
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Roast Card */}
            <div className="flex-1 flex flex-col justify-center">
                <div className="bg-gradient-to-br from-red-900/40 to-black p-8 rounded-2xl border border-red-900/50 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4 opacity-20">
                        <svg className="w-24 h-24 text-red-500" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6z" /></svg>
                    </div>

                    <h2 className="text-3xl font-comic text-red-500 mb-6 drop-shadow-md transform -rotate-2">
                        THE VERDICT 💀
                    </h2>

                    <p className="text-xl md:text-2xl text-white font-medium leading-relaxed italic drop-shadow-lg">
                        "{roastText}"
                    </p>

                    <div className="mt-8 flex items-center justify-between border-t border-red-900/30 pt-4">
                        <div className="flex items-center space-x-2">
                            <span className="text-neutral-400 text-sm">Roasted by</span>
                            <span className="text-yellow-500 font-bold">Gemini 2.5</span>
                        </div>
                        <div className="flex space-x-1 text-yellow-500">
                            {'★★★★★'.split('').map((star, i) => (
                                <span key={i} className="animate-pulse" style={{ animationDelay: `${i * 100}ms` }}>{star}</span>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoastResult;
