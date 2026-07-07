import React, { useEffect, useRef, useState } from 'react';
import { X, Share2, Download, RefreshCcw, Sparkles, Wand2 } from 'lucide-react';
import { Button } from '../../ui/Layout';
import { generateToonImage, cleanBase64 } from '../../../services/geminiService';
import { shareCanvasImage, downloadCanvasImage } from '../../../services/shareCard';
import { unlockAudio, playPangram, hapticTap, hapticSuccess } from '../../../services/audio';
import { TOON_STYLES, DAILY_TOON_LIMIT, toonsLeftToday, spendToon, refundToon } from '../roastShared';

// =============================================================================
// Toon Studio — Roast Me v2 Phase 4 (the T2 "climax" tier, rationed).
//
// A bottom-sheet style gallery: the user picks the style BEFORE generating, so
// a generation is never wasted on a surprise. Most styles run on the flash
// image model (cheap, a few seconds); the two ✨premium styles run on Pro
// (in-image text rendering — slower, and may exceed serverless limits on the
// Hobby plan, in which case the allowance is refunded). N generations per day
// (DAILY_TOON_LIMIT); failures refund. Used by Roast Central's deck and by
// Roast Battle's winner button.
// =============================================================================

interface ToonStudioProps {
    open: boolean;
    onClose: () => void;
    photo: string | null;   // already-downscaled dataURL
    /** false → hide the non-kid-safe styles (child detected in the photo). */
    allStyles?: boolean;
    /** Optional possessive heading, e.g. "Priya's trophy toon". */
    heading?: string;
}

const GEN_LINES = [
    'Warming up the ink…',
    'Exaggerating responsibly…',
    'Consulting the art department…',
    'Adding the final insult…',
];

const dataUrlToCanvas = (dataUrl: string): Promise<HTMLCanvasElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('canvas 2d unavailable')); return; }
            ctx.drawImage(img, 0, 0);
            resolve(canvas);
        };
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = dataUrl;
    });

export const ToonStudio: React.FC<ToonStudioProps> = ({ open, onClose, photo, allStyles = true, heading }) => {
    const [stage, setStage] = useState<'GALLERY' | 'GENERATING' | 'REVEAL'>('GALLERY');
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [activeStyle, setActiveStyle] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [left, setLeft] = useState(toonsLeftToday);
    const [genLine, setGenLine] = useState(0);
    // Guards setState after the sheet is closed mid-generation. A discarded
    // in-flight result stays spent — the cost was incurred either way.
    const openRef = useRef(open);
    openRef.current = open;

    useEffect(() => {
        if (open) {
            setStage('GALLERY');
            setResultUrl(null);
            setError(null);
            setLeft(toonsLeftToday());
        }
    }, [open, photo]);

    useEffect(() => {
        if (stage !== 'GENERATING') return;
        const t = setInterval(() => setGenLine(l => (l + 1) % GEN_LINES.length), 1600);
        return () => clearInterval(t);
    }, [stage]);

    if (!open || !photo) return null;

    const styles = TOON_STYLES.filter(s => allStyles || s.kidSafe);
    const style = TOON_STYLES.find(s => s.id === activeStyle);

    const generate = async (styleId: string) => {
        if (toonsLeftToday() <= 0) return;
        unlockAudio();
        hapticTap();
        setActiveStyle(styleId);
        setError(null);
        setStage('GENERATING');
        spendToon();
        setLeft(toonsLeftToday());
        const url = await generateToonImage(cleanBase64(photo), styleId);
        if (!openRef.current) return; // closed mid-flight — discard, stays spent
        if (url) {
            setResultUrl(url);
            setStage('REVEAL');
            playPangram();
            hapticSuccess();
        } else {
            // API down / timed out / refused — refund and never dead-end.
            refundToon();
            setLeft(toonsLeftToday());
            setError("The art department choked. Nothing was used up — try again, or grab the free poster instead.");
            setStage('GALLERY');
        }
    };

    const share = async () => { if (resultUrl) { try { await shareCanvasImage(await dataUrlToCanvas(resultUrl), 'roast_toon'); } catch { /* decode failed */ } } };
    const save = async () => { if (resultUrl) { try { await downloadCanvasImage(await dataUrlToCanvas(resultUrl), 'roast_toon'); } catch { /* decode failed */ } } };

    // --- REVEAL — full-screen, animated in ------------------------------------
    if (stage === 'REVEAL' && resultUrl) {
        return (
            <div className="fixed inset-0 z-[80] backdrop-blur-md flex items-center justify-center px-4 py-6" style={{ background: 'rgba(15, 30, 51, 0.94)' }}>
                <div className="w-full max-w-sm flex flex-col gap-3 max-h-full animate-slide-up">
                    <div className="text-center">
                        <div className="text-[10px] font-extrabold tracking-[0.18em] text-gold uppercase flex items-center justify-center gap-1.5">
                            <Sparkles size={12} /> {style?.label ?? 'Toon'} · fresh from the studio
                        </div>
                    </div>
                    <img src={resultUrl} alt="Your caricature" className="w-full max-h-[68vh] object-contain rounded-xl border border-gold/40" style={{ boxShadow: '0 0 40px rgba(239,192,80,0.25)' }} />
                    <div className="flex gap-2">
                        <Button className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={share}>
                            <Share2 size={15} /> Share
                        </Button>
                        <Button variant="secondary" className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={save}>
                            <Download size={15} /> Save
                        </Button>
                        <Button variant="secondary" className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={() => setStage('GALLERY')}>
                            <RefreshCcw size={15} /> Another
                        </Button>
                    </div>
                    <button onClick={onClose} className="text-xs text-muted hover:text-ink transition-colors py-1">Done</button>
                </div>
            </div>
        );
    }

    // --- GENERATING — brief hold (flash: seconds; premium: up to ~30s) --------
    if (stage === 'GENERATING') {
        return (
            <div className="fixed inset-0 z-[80] backdrop-blur-md flex items-center justify-center px-6" style={{ background: 'rgba(15, 30, 51, 0.94)' }}>
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="relative">
                        <img src={photo} alt="" className="w-28 h-28 rounded-2xl object-cover border border-gold/40 animate-pulse" />
                        <Wand2 size={22} className="absolute -bottom-2 -right-2 text-gold animate-bounce" />
                    </div>
                    <div className="text-base font-bold text-ink">{GEN_LINES[genLine]}</div>
                    <div className="text-xs text-muted">
                        {style?.emoji} {style?.label}{style?.tier === 'pro' ? ' · ✨ premium takes a bit longer' : ''}
                    </div>
                </div>
            </div>
        );
    }

    // --- GALLERY (bottom sheet) ------------------------------------------------
    return (
        <div className="fixed inset-0 z-[80] flex items-end backdrop-blur-sm" style={{ background: 'rgba(15, 30, 51, 0.5)' }} onClick={onClose}>
            <div
                className="w-full bg-surface border border-divider rounded-t-[24px] px-5 pt-3 pb-7 max-h-[82%] flex flex-col"
                style={{ boxShadow: '0 -16px 40px rgba(15, 30, 51, 0.18)' }}
                onClick={e => e.stopPropagation()}
            >
                <div className="w-11 h-[5px] rounded-full bg-divider-soft mx-auto mb-3.5" />
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                        <Wand2 size={16} className="text-gold" />
                        <span className="font-bold text-ink tracking-wide">{heading ?? 'TOON STUDIO'}</span>
                    </div>
                    <button onClick={onClose} aria-label="Close Toon Studio" className="w-7 h-7 rounded-full bg-surface-alt border border-divider text-muted flex items-center justify-center hover:text-ink">
                        <X size={14} />
                    </button>
                </div>
                <div className="text-xs text-muted mb-3">
                    {left > 0
                        ? <>Pick a style — the AI redraws your photo. <span className="text-gold font-semibold">{left} of {DAILY_TOON_LIMIT} left today.</span></>
                        : <>Today's {DAILY_TOON_LIMIT} caricatures are used up — back tomorrow. Posters stay free & unlimited.</>}
                </div>

                {error && (
                    <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2 mb-3">{error}</div>
                )}

                <div className="flex-1 overflow-y-auto grid grid-cols-2 gap-2 pr-1">
                    {styles.map(s => (
                        <button
                            key={s.id}
                            onClick={() => generate(s.id)}
                            disabled={left <= 0}
                            className="group text-left bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 border-l-gold rounded-xl py-2.5 px-3 transition-colors hover:bg-white/[0.08] hover:border-t-white/25 hover:border-r-white/25 disabled:opacity-40"
                        >
                            <div className="flex items-center gap-1.5">
                                <span className="text-base leading-none">{s.emoji}</span>
                                <span className="text-sm font-bold text-ink-soft group-hover:text-ink">{s.label}</span>
                                {s.tier === 'pro' && <span className="text-[9px] font-bold text-gold border border-gold/50 rounded-full px-1.5 py-px">✨ PRO</span>}
                            </div>
                            <div className="text-[11px] mt-0.5 truncate text-muted">{s.tagline}</div>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
