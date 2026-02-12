import React, { useState, useRef, useCallback } from 'react';
import { Button, Card, ScreenHeader } from '../ui/Layout';
import { generateRoastOrToast } from '../../services/geminiService';
import { Camera, Flame, Wine, RefreshCw } from 'lucide-react';

interface Props {
    onExit: () => void;
}

export const SimpleSelfieGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<'CAMERA' | 'PREVIEW' | 'LOADING' | 'RESULT'>('CAMERA');
    const [image, setImage] = useState<string | null>(null);
    const [result, setResult] = useState<string>("");
    const [mode, setMode] = useState<'roast' | 'toast' | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);

    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Camera access denied:", err);
            // Fallback or error handling could go here
        }
    }, []);

    // Initialize camera on mount
    React.useEffect(() => {
        if (gameState === 'CAMERA') {
            startCamera();
        }
        return () => {
            // Cleanup stream
            if (videoRef.current?.srcObject) {
                const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
                tracks.forEach(track => track.stop());
            }
        };
    }, [gameState, startCamera]);

    const capturePhoto = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Horizontally flip for mirror effect if using front camera
                ctx.translate(canvas.width, 0);
                ctx.scale(-1, 1);
                ctx.drawImage(videoRef.current, 0, 0);
                const dataUrl = canvas.toDataURL('image/jpeg');
                setImage(dataUrl);
                setGameState('PREVIEW');
            }
        }
    };

    const handleGenerate = async (selectedMode: 'roast' | 'toast') => {
        if (!image) return;
        setMode(selectedMode);
        setGameState('LOADING');
        const text = await generateRoastOrToast(image, selectedMode);
        setResult(text);
        setGameState('RESULT');
    };

    const retake = () => {
        setImage(null);
        setResult("");
        setMode(null);
        setGameState('CAMERA');
    };

    if (gameState === 'CAMERA') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Simple Selfie" onBack={onExit} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-6 relative">
                    <div className="relative w-full aspect-[4/5] max-h-[60vh] bg-black rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10">
                        <video
                            ref={videoRef}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover transform -scale-x-100" // Mirror effect
                            onLoadedMetadata={() => videoRef.current?.play()}
                        />
                    </div>

                    <button
                        onClick={capturePhoto}
                        className="w-20 h-20 rounded-full bg-white border-4 border-party-surface shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all"
                    >
                        <Camera size={32} className="text-party-dark" />
                    </button>
                    <p className="text-sm text-gray-400">Tap to snap</p>
                </div>
            </div>
        );
    }

    if (gameState === 'PREVIEW') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Roast or Toast?" onBack={retake} onHome={onExit} />

                <div className="flex-1 flex flex-col items-center gap-6">
                    <div className="relative w-2/3 aspect-square rounded-2xl overflow-hidden shadow-2xl border-2 border-white/10 mt-4">
                        {image && <img src={image} alt="Selfie" className="w-full h-full object-cover" />}
                    </div>

                    <div className="grid grid-cols-2 gap-4 w-full px-4">
                        <Button
                            onClick={() => handleGenerate('roast')}
                            className="h-32 flex flex-col items-center justify-center gap-2 !bg-zinc-800/50 !border-rose-900/30 hover:!bg-rose-900/10 hover:!border-rose-800/50 transition-all"
                        >
                            <Flame size={32} className="text-rose-400/80" />
                            <span className="text-lg font-bold text-rose-100">Roast Me</span>
                            <span className="text-xs text-rose-300/50 font-medium">Savage Mode</span>
                        </Button>

                        <Button
                            onClick={() => handleGenerate('toast')}
                            className="h-32 flex flex-col items-center justify-center gap-2 !bg-zinc-800/50 !border-amber-900/30 hover:!bg-amber-900/10 hover:!border-amber-800/50 transition-all"
                        >
                            <Wine size={32} className="text-amber-300/80" />
                            <span className="text-lg font-bold text-amber-100">Toast Me</span>
                            <span className="text-xs text-amber-300/50 font-medium">Kind Mode</span>
                        </Button>
                    </div>

                    <button onClick={retake} className="text-gray-400 text-sm underline mt-2 hover:text-white">
                        Retake Photo
                    </button>
                </div>
            </div>
        );
    }

    if (gameState === 'LOADING') {
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Thinking..." onBack={() => { }} onHome={onExit} />
                <div className="flex-1 flex flex-col items-center justify-center gap-8">
                    <div className="w-32 h-32 relative">
                        {mode === 'roast' ? (
                            <Flame size={128} className="text-rose-500 animate-pulse" />
                        ) : (
                            <Wine size={128} className="text-amber-400 animate-bounce" />
                        )}
                    </div>
                    <p className="text-2xl font-bold animate-pulse text-center">
                        {mode === 'roast' ? "Sharpening claws..." : "Drafting poetry..."}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title={mode === 'roast' ? "You Got Roasted!" : "A Toast to You!"} onBack={onExit} onHome={onExit} />

            <div className="flex-1 flex flex-col items-center justify-center gap-8 animate-slide-up px-4">

                <Card className={`relative w-full p-8 text-center flex flex-col items-center gap-6 shadow-2xl border ${mode === 'roast' ? 'bg-zinc-900/90 border-rose-900/30' : 'bg-zinc-900/90 border-amber-900/30'
                    }`}>
                    <div className="absolute -top-10 bg-party-surface p-4 rounded-full border-4 border-party-dark shadow-xl">
                        {mode === 'roast' ? <Flame size={48} className="text-orange-500" /> : <Wine size={48} className="text-amber-400" />}
                    </div>

                    <div className="mt-8 flex flex-col items-center gap-4">
                        {image && (
                            <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-white/10 shadow-lg rotate-3 transition-transform hover:rotate-0">
                                <img src={image} alt="You" className="w-full h-full object-cover" />
                            </div>
                        )}
                        <p className="text-2xl md:text-3xl font-serif leading-relaxed italic text-white/90">
                            "{result}"
                        </p>
                    </div>

                    <div className="w-full h-[1px] bg-white/10 my-2"></div>

                    <div className="flex gap-4 w-full">
                        <Button onClick={retake} fullWidth variant="secondary">
                            <RefreshCw size={18} className="mr-2" />
                            Another One
                        </Button>
                        <Button onClick={onExit} fullWidth variant="primary">
                            Done
                        </Button>
                    </div>
                </Card>
            </div>
        </div>
    );
};
