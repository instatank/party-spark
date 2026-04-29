
import React, { useState } from 'react';
import ImageUpload from './roast/ImageUpload';
import RoastResult from './roast/RoastResult';
import LoadingOverlay from './roast/LoadingOverlay';
import { cleanBase64, generateRoast, editImage, getCaricaturePrompt, type RoastTheme } from '../../services/geminiService';
import { sessionService } from '../../services/SessionManager';
import { AppState } from '../../types';

interface Props {
    onExit: () => void;
}

const RoastGame: React.FC<Props> = ({ onExit }) => {
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [roastText, setRoastText] = useState<string>('');
    const [loadingMessage, setLoadingMessage] = useState('Firing up the grill...');
    const [theme, setTheme] = useState<RoastTheme>('animate');

    const handleImageSelected = async (base64: string) => {
        // RATE LIMIT CHECK
        const currentRoasts = import.meta.env.VITE_ROAST_LIMIT ? parseInt(import.meta.env.VITE_ROAST_LIMIT) : 100; // Default 100
        const usedCount = sessionService.getUsageCount('ROAST');

        if (usedCount >= currentRoasts) {
            alert(`🔥 WHOA THERE! The kitchen is closed.\n\nYou've reached the limit of ${currentRoasts} roasts. Come back later!`);
            return;
        }

        setOriginalImage(base64);
        setAppState(AppState.PROCESSING);

        try {
            const rawBase64 = cleanBase64(base64);

            let loadingText = "Analyzing your flaws...";
            if (theme === 'animate') loadingText = "Drawing caricature...";
            if (theme === 'tabloid') loadingText = "Printing front page...";
            if (theme === 'movie') loadingText = "Directing action scene...";
            if (theme === 'disco') loadingText = "Hanging the disco ball...";
            if (theme === 'agra') loadingText = "Building the Taj Mahal...";

            setLoadingMessage(loadingText);

            const roastPromise = generateRoast(rawBase64, theme);
            const caricaturePrompt = getCaricaturePrompt(theme);
            const caricaturePromise = editImage(rawBase64, caricaturePrompt);

            const [roast, caricature] = await Promise.all([roastPromise, caricaturePromise]);

            // Track usage
            sessionService.markAsUsed('ROAST', 'default', Date.now().toString());

            setRoastText(roast);
            setResultImage(caricature || base64);
            setAppState(AppState.COMPLETE);

        } catch (error) {
            console.error("Game error:", error);
            setAppState(AppState.ERROR);
            alert("Something went wrong. Make sure you are connected to the internet and your API key is valid.");
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
        <div className="w-full min-h-full bg-app text-ink flex flex-col rounded-xl overflow-hidden border border-divider-soft" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="p-4 border-b border-divider-soft bg-surface-alt flex items-center justify-between">
                <div className="flex items-center space-x-2" onClick={handleReset} role="button">
                    <div className="text-3xl">🔥</div>
                    <h2 className="text-2xl font-comic text-transparent bg-clip-text bg-gradient-to-r from-yellow-500 to-red-600 tracking-wide">
                        RoastMyPic
                    </h2>
                </div>
                <div className="flex gap-2">
                    {appState === AppState.COMPLETE && (
                        <button
                            onClick={handleReset}
                            className="px-3 py-1 rounded-full border border-divider hover:bg-app-tint text-xs font-semibold transition-all text-ink-soft hover:text-ink"
                        >
                            Start Over
                        </button>
                    )}
                    <button
                        onClick={onExit}
                        className="px-3 py-1 rounded-full border border-divider hover:bg-app-tint text-xs font-semibold transition-all text-ink-soft hover:text-ink"
                    >
                        Exit
                    </button>
                </div>
            </div>

            <div className="flex-1 w-full max-w-7xl mx-auto p-4 md:p-6 flex flex-col items-center justify-center relative min-h-[500px]">
                {appState === AppState.PROCESSING && <LoadingOverlay message={loadingMessage} />}
                {appState === AppState.ERROR && (
                    <div className="text-center space-y-4">
                        <div className="text-6xl">🤕</div>
                        <h3 className="text-xl font-bold text-ink">The grill malfunctioned.</h3>
                        <button onClick={handleReset} className="text-yellow-500 underline">Try Again</button>
                    </div>
                )}

                {appState === AppState.IDLE && (
                    <div className="w-full max-w-2xl text-center space-y-8 animate-fade-in-down">
                        <div className="space-y-4 mb-8">
                            <h3 className="text-4xl md:text-5xl font-bold tracking-tighter text-ink">
                                Get <span className="text-red-500 underline decoration-wavy decoration-yellow-500">Roasted</span>
                            </h3>
                            <p className="text-lg text-muted max-w-lg mx-auto">
                                Upload a photo. We'll turn you into a cartoon and destroy your ego using <span className="text-ink font-bold">Gemini 3 Pro</span>.
                            </p>
                        </div>

                        <div className="flex flex-col items-center justify-center space-y-2 mb-8">
                            <span className="text-muted text-xs font-bold uppercase tracking-widest">Select Roast Theme</span>
                            <div className="flex flex-wrap justify-center gap-3 w-full max-w-2xl mb-8">
                                {(['animate', 'tabloid', 'movie', 'disco', 'agra'] as RoastTheme[]).map((t) => (
                                    <button
                                        key={t}
                                        onClick={() => setTheme(t)}
                                        className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 flex items-center gap-2 border ${
                                            theme === t
                                                ? 'bg-ink text-app border-ink shadow-md'
                                                : 'bg-surface-alt text-ink-soft border-divider hover:bg-app-tint hover:text-ink'
                                        }`}
                                    >
                                        <span>
                                            {t === 'animate' && "🎨"}
                                            {t === 'tabloid' && "📰"}
                                            {t === 'movie' && "🎬"}
                                            {t === 'disco' && "🕺"}
                                            {t === 'agra' && "🕌"}
                                        </span>
                                        <span className="capitalize">
                                            {t === 'disco' ? '80s Disco' : t === 'agra' ? 'Agra Royal' : t}
                                        </span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <ImageUpload onImageSelected={handleImageSelected} />
                    </div>
                )}

                {appState === AppState.COMPLETE && originalImage && resultImage && (
                    <RoastResult
                        originalImage={originalImage}
                        resultImage={resultImage}
                        roastText={roastText}
                        onUpdateImage={handleUpdateImage}
                    />
                )}
            </div>

            <div className="p-4 text-center text-muted text-xs">
                <p>Powered by Gemini 3 Pro & 3 Flash</p>
            </div>
        </div>
    );
};

export default RoastGame;
