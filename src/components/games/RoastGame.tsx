import React, { useState } from 'react';
import ImageUpload from '../ImageUpload';
import RoastResult from '../RoastResult';
import LoadingOverlay from '../LoadingOverlay';
import { cleanBase64, generateRoast, editImage, getCaricaturePrompt, type RoastIntensity } from '../../services/geminiService';
import { AppState } from '../../types';

interface Props {
    onExit: () => void;
}

import { ScreenHeader } from '../ui/Layout';

const RoastGame: React.FC<Props> = ({ onExit }) => {
    // ... (state remains same)
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [roastText, setRoastText] = useState<string>('');
    const [loadingMessage, setLoadingMessage] = useState('Firing up the grill...');
    const [intensity, setIntensity] = useState<RoastIntensity>('medium');

    const handleImageSelected = async (base64: string) => {
        setOriginalImage(base64);
        setAppState(AppState.PROCESSING);

        try {
            const rawBase64 = cleanBase64(base64);

            // 1. Generate Roast Text (Text Service)
            let loadingText = "Analyzing your flaws...";
            if (intensity === 'subtle') loadingText = "Teasing you gently...";
            if (intensity === 'extreme') loadingText = "Preparing emotional damage...";

            setLoadingMessage(loadingText);

            // Pass the selected intensity to the roast generator
            const roastPromise = generateRoast(rawBase64, intensity);

            // 2. Generate Caricature (Image Service)
            const caricaturePrompt = getCaricaturePrompt(intensity);
            const caricaturePromise = editImage(rawBase64, caricaturePrompt);

            // Run in parallel for speed
            const [roast, caricature] = await Promise.all([roastPromise, caricaturePromise]);

            setRoastText(roast);
            setResultImage(caricature || base64); // Fallback to original if image gen fails but roast works
            setAppState(AppState.COMPLETE);

        } catch (error) {
            console.error(error);
            setAppState(AppState.ERROR);
            alert("Something went wrong with the roast. Please try again.");
            setAppState(AppState.IDLE);
        }
    };

    const handleReset = () => {
        setOriginalImage(null);
        setResultImage(null);
        setRoastText('');
        setAppState(AppState.IDLE);
    };

    const handleUpdateImage = (newImage: string) => {
        setResultImage(newImage);
    };

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title="Roast Me" onBack={onExit} onHome={onExit} />

            {/* Game Content */}
            <div className="flex-1 w-full max-w-7xl mx-auto flex flex-col items-center justify-center relative overflow-y-auto">

                {appState === AppState.PROCESSING && (
                    <LoadingOverlay message={loadingMessage} />
                )}

                {appState === AppState.IDLE && (
                    <div className="w-full max-w-2xl text-center space-y-8 animate-fade-in-down py-4">
                        <div className="space-y-4 mb-4">
                            <h3 className="text-4xl md:text-5xl font-bold tracking-tighter text-white">
                                Get <span className="text-green-500">Ready! 🔥</span>
                            </h3>
                            <p className="text-lg text-neutral-400 max-w-lg mx-auto">
                                Upload a photo. And watch the magic.
                            </p>
                        </div>

                        {/* Intensity Selector */}
                        <div className="flex flex-col items-center justify-center space-y-2 mb-8">
                            <span className="text-neutral-500 text-xs font-bold uppercase tracking-widest">Select Roast Level</span>
                            <div className="bg-party-surface p-1 rounded-xl inline-flex border border-white/10">
                                {(['subtle', 'medium', 'extreme'] as RoastIntensity[]).map((level) => {
                                    // Determine button styles based on level
                                    let activeClass = '';
                                    if (level === 'subtle') activeClass = 'bg-yellow-400 text-black shadow-lg shadow-yellow-900/50';
                                    if (level === 'medium') activeClass = 'bg-orange-500 text-white shadow-lg shadow-orange-900/50';
                                    if (level === 'extreme') activeClass = 'bg-red-600 text-white shadow-lg shadow-red-900/50';

                                    return (
                                        <button
                                            key={level}
                                            onClick={() => setIntensity(level)}
                                            className={`px-4 py-2 rounded-lg text-xs md:text-sm font-bold transition-all capitalize ${intensity === level
                                                ? activeClass
                                                : 'text-neutral-400 hover:text-white hover:bg-white/5'
                                                }`}
                                        >
                                            {level} {level === 'extreme' ? '🌶️' : level === 'medium' ? '🔥' : '😐'}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <ImageUpload onImageSelected={handleImageSelected} />
                    </div>
                )}

                {appState === AppState.COMPLETE && originalImage && resultImage && (
                    <div className="w-full h-full flex flex-col">
                        <RoastResult
                            originalImage={originalImage}
                            resultImage={resultImage}
                            roastText={roastText}
                            onUpdateImage={handleUpdateImage}
                        />
                        <div className="flex justify-center mt-6 pb-6">
                            <button
                                onClick={handleReset}
                                className="px-6 py-3 rounded-full bg-party-surface border border-white/10 hover:bg-white/10 text-white font-semibold transition-all shadow-lg"
                            >
                                Start Over
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default RoastGame;
