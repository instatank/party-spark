import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Camera as CameraIcon, Image as PhotoIcon, Sparkles, Home } from 'lucide-react';
import type { RoastTheme } from '../../../services/geminiService';
import { availableThemes } from '../../../data/roastThemes';

interface ImageUploadProps {
    theme: RoastTheme;
    onThemeChange: (t: RoastTheme) => void;
    onImageSelected: (base64: string) => void;
    onClose: () => void;
}

// Theme tiles come from src/data/roastThemes.ts, filtered by season — the
// picker only ever shows what is currently offered, so retiring a theme (as
// FIFA 2026 was, once the tournament ended) is a data edit rather than a change
// here. Rotations are per-index decoration and wrap with % so the grid keeps
// working at any theme count as seasonal themes come and go.
const TILE_ROTATIONS = [-2, 1.5, -1, 2, -1.5, 1, -1.2, 1.8];

const ImageUpload: React.FC<ImageUploadProps> = ({ theme, onThemeChange, onImageSelected, onClose }) => {
    // Evaluated once per mount: seasonal windows turn over at midnight, and a
    // grid that reshuffled mid-session would be worse than one a few hours stale.
    const themes = useMemo(() => availableThemes(), []);
    const [isCameraOpen, setIsCameraOpen] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => onImageSelected(reader.result as string);
            reader.readAsDataURL(file);
        }
    }, [onImageSelected]);

    const startCamera = async (mode: 'user' | 'environment' = 'user') => {
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
            streamRef.current = stream;
            setFacingMode(mode);
            setIsCameraOpen(true);
            setTimeout(() => {
                if (videoRef.current) videoRef.current.srcObject = stream;
            }, 100);
        } catch (err) {
            console.error('Error accessing camera:', err);
            alert('Could not access camera. Please allow permissions.');
        }
    };

    const switchCamera = () => startCamera(facingMode === 'user' ? 'environment' : 'user');

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setIsCameraOpen(false);
    };

    const capturePhoto = () => {
        if (!videoRef.current) return;
        const canvas = document.createElement('canvas');
        canvas.width = videoRef.current.videoWidth;
        canvas.height = videoRef.current.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Mirror the front-camera capture so the saved photo matches what the
        // user saw on screen.
        if (facingMode === 'user') {
            ctx.translate(canvas.width, 0);
            ctx.scale(-1, 1);
        }
        ctx.drawImage(videoRef.current, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg');
        stopCamera();
        onImageSelected(dataUrl);
    };

    // Camera-capture overlay — preserved from previous implementation, just
    // restyled to match the new design language.
    if (isCameraOpen) {
        return (
            <div className="w-full min-h-[600px] flex items-center justify-center bg-app px-4 py-6">
                <div className="relative w-full max-w-md rounded-2xl overflow-hidden bg-black border-2 border-ink shadow-[5px_5px_0_var(--c-ink)]">
                    <div className="absolute top-3 right-3 z-10 flex gap-2">
                        <button
                            onClick={switchCamera}
                            className="w-10 h-10 rounded-full bg-black/60 text-white text-lg flex items-center justify-center hover:bg-black/80 transition"
                            title="Flip camera"
                        >
                            🔄
                        </button>
                    </div>
                    <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`w-full h-72 object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                    />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                        <button
                            onClick={stopCamera}
                            className="px-4 py-2 bg-black/60 text-white rounded-full text-sm font-semibold hover:bg-black/80 transition"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={capturePhoto}
                            className="px-6 py-2 bg-roast-red text-white rounded-full font-display tracking-wide text-base shadow-lg animate-pulse"
                        >
                            SNAP IT 📸
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full flex flex-col font-sans relative">
            {/* Home button — top-right floating, replaces the old title band */}
            <button
                onClick={onClose}
                aria-label="Home"
                className="absolute top-4 right-4 z-20 w-[50px] h-[50px] rounded-full bg-surface border border-divider text-muted hover:text-ink hover:bg-surface-alt transition flex items-center justify-center"
            >
                <Home size={24} />
            </button>

            <div className="flex-1 flex flex-col gap-4 px-5 pt-7 pb-6 overflow-hidden">
                {/* Hero title — ROAST/ME!! is now the page title; the gold BRUTAL
                    tag rides on ME!!'s upper-right edge so the home icon can take
                    the page's top-right corner without a chrome band. */}
                <div>
                    <h1 className="font-display text-[72px] leading-[0.85] tracking-wide text-ink m-0">
                        ROAST
                        <br />
                        <span
                            className="inline-block text-roast-red relative"
                            style={{
                                WebkitTextStroke: '2px var(--c-ink)',
                                transform: 'rotate(-2deg)',
                            }}
                        >
                            ME!!
                            <span
                                className="absolute bg-gold text-slate-900 font-display text-[14px] tracking-[0.08em] px-2.5 py-1 rounded-md border-2 border-slate-900 whitespace-nowrap"
                                style={{
                                    bottom: '4px',
                                    left: 'calc(100% + 10px)',
                                    transform: 'rotate(8deg)',
                                    boxShadow: '2px 2px 0 #0F172A',
                                    WebkitTextStroke: '0',
                                }}
                            >
                                BRUTAL!
                            </span>
                        </span>
                    </h1>
                    <p className="mt-2 text-xs font-medium text-ink-soft">
                        Pick a sticker, drop a pic, get destroyed.
                    </p>
                </div>

                {/* Theme picker — 3-col sticker tile grid */}
                <div>
                    <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">
                        ★ Pick your sticker
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                        {themes.map((t, i) => {
                            const active = t.key === theme;
                            const baseRot = TILE_ROTATIONS[i % TILE_ROTATIONS.length];
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => onThemeChange(t.key)}
                                    className="aspect-square rounded-xl border-2 border-ink flex flex-col items-center justify-center gap-0.5 transition-all"
                                    style={{
                                        background: active ? t.color : 'var(--c-surface)',
                                        color: active ? '#FFFFFF' : 'var(--c-ink)',
                                        boxShadow: active ? '3px 3px 0 var(--c-ink)' : '1.5px 1.5px 0 var(--c-ink)',
                                        transform: active ? `rotate(${baseRot}deg) scale(1.04)` : `rotate(${baseRot * 0.4}deg)`,
                                    }}
                                >
                                    <span
                                        className="text-[30px] leading-none"
                                        style={{ filter: active ? 'drop-shadow(0 2px 0 rgba(0,0,0,0.25))' : 'none' }}
                                    >
                                        {t.emoji}
                                    </span>
                                    <span className="font-display text-[10px] tracking-[0.02em] leading-none">
                                        {t.label}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* Hero upload card — ember-filled sticker with sparkles */}
                <div className="flex-1 min-h-0 flex flex-col justify-end">
                    <div
                        className="relative bg-roast-ember border-[2.5px] border-slate-900 rounded-[18px] p-[18px_18px_16px] overflow-hidden"
                        style={{ boxShadow: '5px 5px 0 #0F172A' }}
                    >
                        {/* sparkle decorations */}
                        <div className="absolute top-2 left-3" style={{ transform: 'rotate(-15deg)' }}>
                            <Sparkles size={14} className="text-white" fill="currentColor" />
                        </div>
                        <div className="absolute top-[18px] right-[18px]" style={{ transform: 'rotate(20deg)' }}>
                            <Sparkles size={10} className="text-white" fill="currentColor" />
                        </div>
                        <div className="absolute bottom-3 right-9">
                            <Sparkles size={12} className="text-white" fill="currentColor" />
                        </div>

                        <div
                            className="font-display text-[26px] tracking-wider text-white leading-[0.95] mb-0.5"
                            style={{ textShadow: '2px 2px 0 #1A0F00' }}
                        >
                            DROP YOUR FACE
                        </div>
                        <div className="text-[11px] font-bold text-[#3A1A00] mb-3">
                            We'll do the worst.
                        </div>

                        {/* Buttons sit on the fixed-orange ember card, so their colors
                            are fixed-dark navy + white in BOTH modes — not theme-flipping ink. */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 py-[11px] rounded-[10px] bg-slate-900 text-white text-xs font-extrabold tracking-wide border-2 border-slate-900 flex items-center justify-center gap-1.5"
                            >
                                <PhotoIcon size={14} />
                                <span>UPLOAD</span>
                            </button>
                            <button
                                onClick={() => startCamera('user')}
                                className="flex-1 py-[11px] rounded-[10px] bg-white text-slate-900 text-xs font-extrabold tracking-wide border-2 border-slate-900 flex items-center justify-center gap-1.5"
                            >
                                <CameraIcon size={14} />
                                <span>CAMERA</span>
                            </button>
                        </div>

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png, image/jpeg, image/jpg"
                            onChange={handleFileChange}
                            className="hidden"
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ImageUpload;
