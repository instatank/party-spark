import React, { useState } from 'react';
import ImageUpload from './roast/ImageUpload';
import RoastResult from './roast/RoastResult';
import RoastLoading from './roast/RoastLoading';
import { cleanBase64, generateRoast, editImage, getCaricaturePrompt, type RoastTheme } from '../../services/geminiService';
import { sessionService } from '../../services/SessionManager';
import { AppState } from '../../types';

interface Props {
    onExit: () => void;
}

// State machine, copy strings, and API call orchestration are unchanged from
// the previous implementation — only the visual layer was redesigned. The
// theme picker, header, and footer that used to live here have moved into
// the child screens (ImageUpload and RoastResult) so each screen is now
// self-contained.
const RoastGame: React.FC<Props> = ({ onExit }) => {
    const [appState, setAppState] = useState<AppState>(AppState.IDLE);
    const [originalImage, setOriginalImage] = useState<string | null>(null);
    const [resultImage, setResultImage] = useState<string | null>(null);
    const [roastText, setRoastText] = useState<string>('');
    const [theme, setTheme] = useState<RoastTheme>('animate');

    const handleImageSelected = async (base64: string) => {
        // RATE LIMIT CHECK
        const currentRoasts = import.meta.env.VITE_ROAST_LIMIT ? parseInt(import.meta.env.VITE_ROAST_LIMIT) : 100;
        const usedCount = sessionService.getUsageCount('ROAST');

        if (usedCount >= currentRoasts) {
            alert(`🔥 WHOA THERE! The kitchen is closed.\n\nYou've reached the limit of ${currentRoasts} roasts. Come back later!`);
            return;
        }

        setOriginalImage(base64);
        setAppState(AppState.PROCESSING);

        try {
            const rawBase64 = cleanBase64(base64);

            const roastPromise = generateRoast(rawBase64, theme);
            const caricaturePrompt = getCaricaturePrompt(theme);
            const caricaturePromise = editImage(rawBase64, caricaturePrompt);

            const [roast, caricature] = await Promise.all([roastPromise, caricaturePromise]);

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
        <div className="w-full min-h-full bg-app text-ink relative overflow-hidden rounded-xl border border-divider-soft" style={{ boxShadow: 'var(--shadow-card)' }}>
            {appState === AppState.IDLE && (
                <ImageUpload
                    theme={theme}
                    onThemeChange={setTheme}
                    onImageSelected={handleImageSelected}
                    onClose={onExit}
                />
            )}

            {appState === AppState.PROCESSING && <RoastLoading onClose={onExit} />}

            {appState === AppState.ERROR && (
                <div className="w-full min-h-[600px] flex flex-col items-center justify-center px-6 text-center gap-3">
                    <div className="text-6xl mb-2">🤕</div>
                    <h3 className="font-display text-3xl tracking-wide text-ink">THE GRILL MALFUNCTIONED</h3>
                    <p className="text-sm text-muted max-w-xs">Couldn't reach the AI. Check your connection and try again.</p>
                    <div className="flex gap-3 mt-2">
                        <button onClick={handleReset} className="px-5 py-2.5 rounded-xl bg-roast-red text-white font-display text-sm tracking-wide">
                            TRY AGAIN
                        </button>
                        <button onClick={onExit} className="px-5 py-2.5 rounded-xl bg-surface-alt text-ink-soft font-display text-sm tracking-wide border border-divider">
                            EXIT
                        </button>
                    </div>
                </div>
            )}

            {appState === AppState.COMPLETE && originalImage && resultImage && (
                <RoastResult
                    originalImage={originalImage}
                    resultImage={resultImage}
                    roastText={roastText}
                    theme={theme}
                    onUpdateImage={handleUpdateImage}
                    onReset={handleReset}
                    onClose={onExit}
                />
            )}
        </div>
    );
};

export default RoastGame;
