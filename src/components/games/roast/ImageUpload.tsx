import React, { useCallback, useRef, useState } from 'react';
import { Camera as CameraIcon, Image as PhotoIcon, Sparkles, Flame, X } from 'lucide-react';
import type { RoastTheme } from '../../../services/geminiService';

interface ImageUploadProps {
    theme: RoastTheme;
    onThemeChange: (t: RoastTheme) => void;
    onImageSelected: (base64: string) => void;
    onClose: () => void;
}

// Theme catalog mirrors roast-shared.jsx → ROAST_THEMES (key, label, emoji,
// color). The color is the active-tile fill in the picker grid; rotations
// are inline because they're per-index data, not utility classes.
type ThemeMeta = { key: RoastTheme; label: string; emoji: string; color: string };
const THEMES: ThemeMeta[] = [
    { key: 'animate', label: 'ANIMATE',    emoji: '🎨', color: '#E15B82' },
    { key: 'tabloid', label: 'TABLOID',    emoji: '📰', color: '#0F1E33' },
    { key: 'movie',   label: 'MOVIE',      emoji: '🎬', color: '#D83A3A' },
    { key: 'disco',   label: '80s DISCO',  emoji: '🕺', color: '#9266D2' },
    { key: 'agra',    label: 'AGRA ROYAL', emoji: '🕌', color: '#B8922F' },
];
const TILE_ROTATIONS = [-2, 1.5, -1, 2, -1.5];

const ImageUpload: React.FC<ImageUploadProps> = ({ theme, onThemeChange, onImageSelected, onClose }) => {
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
        <div className="w-full flex flex-col font-sans">
            {/* Header — flame + Roast Me wordmark left, circular close right */}
            <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-divider-soft">
                <div className="flex items-center gap-2">
                    <Flame size={18} className="text-roast-red" fill="currentColor" />
                    <span className="text-[15px] font-bold text-ink tracking-tight">Roast Me</span>
                </div>
                <button
                    onClick={onClose}
                    aria-label="Close"
                    className="w-[30px] h-[30px] rounded-full bg-surface border border-divider text-muted hover:text-ink hover:bg-surface-alt transition flex items-center justify-center"
                >
                    <X size={14} />
                </button>
            </div>

            <div className="flex-1 flex flex-col gap-4 px-5 pt-4 pb-6 overflow-hidden">
                {/* Hero title — Bebas ROAST/ME!! with gold BRUTAL sticker */}
                <div className="relative">
                    <h1 className="font-display text-[72px] leading-[0.85] tracking-wide text-ink m-0">
                        ROAST
                        <br />
                        <span
                            className="inline-block text-roast-red"
                            style={{
                                WebkitTextStroke: '2px var(--c-ink)',
                                transform: 'rotate(-2deg)',
                            }}
                        >
                            ME!!
                        </span>
                    </h1>
                    <div
                        className="absolute top-2 right-0 bg-gold text-ink font-display text-[13px] tracking-[0.1em] px-3 py-1.5 rounded-lg border-2 border-ink"
                        style={{
                            transform: 'rotate(6deg)',
                            boxShadow: '3px 3px 0 var(--c-ink)',
                        }}
                    >
                        BRUTAL!
                    </div>
                    <p className="mt-2 text-xs font-medium text-ink-soft">
                        Pick a sticker, drop a pic, get destroyed.
                    </p>
                </div>

                {/* Theme picker — 3-col sticker tile grid */}
                <div>
                    <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">
                        ★ Pick your sticker
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                        {THEMES.map((t, i) => {
                            const active = t.key === theme;
                            const baseRot = TILE_ROTATIONS[i];
                            return (
                                <button
                                    key={t.key}
                                    onClick={() => onThemeChange(t.key)}
                                    className="aspect-square rounded-xl border-2 border-ink flex flex-col items-center justify-center gap-1 transition-all"
                                    style={{
                                        background: active ? t.color : 'var(--c-surface)',
                                        color: active ? '#FFFFFF' : 'var(--c-ink)',
                                        boxShadow: active ? '4px 4px 0 var(--c-ink)' : '2px 2px 0 var(--c-ink)',
                                        transform: active ? `rotate(${baseRot}deg) scale(1.02)` : `rotate(${baseRot * 0.4}deg)`,
                                    }}
                                >
                                    <span
                                        className="text-[44px] leading-none"
                                        style={{ filter: active ? 'drop-shadow(0 2px 0 rgba(0,0,0,0.25))' : 'none' }}
                                    >
                                        {t.emoji}
                                    </span>
                                    <span className="font-display text-[18px] tracking-[0.04em] leading-none">
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
                        className="relative bg-roast-ember border-[2.5px] border-ink rounded-[18px] p-[18px_18px_16px] overflow-hidden"
                        style={{ boxShadow: '5px 5px 0 var(--c-ink)' }}
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
                            style={{ textShadow: '2px 2px 0 var(--c-ink)' }}
                        >
                            DROP YOUR FACE
                        </div>
                        <div className="text-[11px] font-bold text-[#3A1A00] mb-3">
                            We'll do the worst.
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 py-[11px] rounded-[10px] bg-ink text-white text-xs font-extrabold tracking-wide border-2 border-ink flex items-center justify-center gap-1.5"
                            >
                                <PhotoIcon size={14} />
                                <span>UPLOAD</span>
                            </button>
                            <button
                                onClick={() => startCamera('user')}
                                className="flex-1 py-[11px] rounded-[10px] bg-white text-ink text-xs font-extrabold tracking-wide border-2 border-ink flex items-center justify-center gap-1.5"
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
