import React, { useEffect, useState } from 'react';
import { Download, Share2, RefreshCcw, X, Home, Loader2 } from 'lucide-react';
import { cropQuadrants } from '../../../services/imageQuadrants';
import type { RoastThemeMeta } from '../../../data/roastThemes';

interface CollageResultProps {
    /** The raw 2x2 composite exactly as the model returned it. */
    composite: string;
    /** The four themes, in quadrant order: top-left, top-right, bottom-left, bottom-right. */
    themes: RoastThemeMeta[];
    /** One roast caption per theme, same order. May contain empty strings if a caption failed. */
    captions: string[];
    onReset: () => void;
    onClose: () => void;
}

// How far to trim each pane inward when slicing, as a fraction of a half-
// dimension. Image models do not honour "no borders, no gutters" perfectly and
// a pane cut at exactly 50% can carry a seam or a sliver of its neighbour.
// 1.5% costs a little framing and removes that whole class of artefact. The
// Roast Lab has a slider for tuning this; the product ships one value.
const PANE_INSET = 0.015;

/**
 * COLLAGE result — four themes from ONE generated image.
 *
 * The sheet is the hero: four looks at once is the thing worth showing people,
 * and it is a single billed image rather than four. Tapping a pane opens it
 * full-bleed with its own caption, which is pure client-side cropping — no
 * second generation, no API call, no cost.
 */
const CollageResult: React.FC<CollageResultProps> = ({ composite, themes, captions, onReset, onClose }) => {
    const [panes, setPanes] = useState<string[] | null>(null);
    const [sliceFailed, setSliceFailed] = useState(false);
    const [openPane, setOpenPane] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;
        cropQuadrants(composite, PANE_INSET)
            .then((p) => { if (!cancelled) setPanes(p); })
            .catch((err) => {
                // The generation is already paid for by this point, so a decode
                // failure must not cost the user the image — fall back to
                // showing the whole sheet undivided.
                console.error('[collage] slice failed:', err);
                if (!cancelled) setSliceFailed(true);
            });
        return () => { cancelled = true; };
    }, [composite]);

    const handleSave = (src: string, label: string) => {
        try {
            const link = document.createElement('a');
            link.href = src;
            link.download = `partyspark_${label}_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Error saving image:', err);
            alert('Failed to save image.');
        }
    };

    const handleShare = async (src: string, text: string) => {
        try {
            const blob = await (await fetch(src)).blob();
            const file = new File([blob], 'partyspark_collage.jpg', { type: 'image/jpeg' });
            if (navigator.share) {
                await navigator.share({
                    title: 'My PartySpark Collage',
                    text: text ? `Four roasts, one photo.\n\n"${text}"` : 'Four roasts, one photo.',
                    files: [file],
                });
            } else {
                alert('Sharing is not supported on this device/browser. Please use Save instead.');
            }
        } catch (err) {
            console.error('Error sharing image:', err);
            if ((err as { name?: string }).name !== 'AbortError') {
                alert('Sharing failed. Please try saving instead.');
            }
        }
    };

    const paneSrc = (i: number) => (panes ? panes[i] : null);

    return (
        <div className="w-full flex flex-col font-sans relative">
            <button
                onClick={onClose}
                aria-label="Home"
                className="absolute top-4 right-4 z-20 w-[50px] h-[50px] rounded-full bg-surface border border-divider text-muted hover:text-ink hover:bg-surface-alt transition flex items-center justify-center"
            >
                <Home size={24} />
            </button>

            <div className="flex-1 flex flex-col gap-3 px-4 pt-14 pb-4">
                <div>
                    <h2 className="font-display text-[34px] leading-[0.9] tracking-wide text-ink">
                        THE <span className="text-roast-red" style={{ WebkitTextStroke: '1.5px var(--c-ink)' }}>COLLAGE</span>
                    </h2>
                    <p className="text-[11px] font-medium text-ink-soft mt-1">
                        Four looks, one photo. Tap any panel to blow it up.
                    </p>
                </div>

                {/* The sheet — a polaroid frame around the 2x2, matching the
                    single-roast result's treatment so both feel like the same app. */}
                <div
                    className="bg-polaroid border-[2.5px] border-ink rounded-[10px] mx-1 p-2.5"
                    style={{ boxShadow: '5px 5px 0 var(--c-ink)', transform: 'rotate(-1deg)' }}
                >
                    {sliceFailed || !panes ? (
                        <div className="relative rounded-[4px] overflow-hidden bg-black">
                            <img src={composite} alt="Roast collage" className="w-full block" />
                            {!panes && !sliceFailed && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                                    <Loader2 size={26} className="text-white animate-spin" />
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 gap-1.5">
                            {themes.map((t, i) => (
                                <button
                                    key={t.key}
                                    type="button"
                                    onClick={() => setOpenPane(i)}
                                    aria-label={`Enlarge ${t.label}`}
                                    className="relative aspect-square rounded-[4px] overflow-hidden bg-black block"
                                >
                                    {paneSrc(i) ? (
                                        <img src={paneSrc(i)!} alt={t.label} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[10px] text-white/60">
                                            no panel
                                        </div>
                                    )}
                                    <span
                                        className="absolute left-1 bottom-1 font-display text-[10px] tracking-[0.06em] px-1.5 py-0.5 rounded text-white"
                                        style={{ background: t.color, boxShadow: '1px 1px 0 rgba(0,0,0,0.5)' }}
                                    >
                                        {t.label}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex items-center justify-between gap-2 px-1 pt-2">
                        <span className="italic text-[10px] text-[#1F1F1F]" style={{ fontFamily: "'Brush Script MT', cursive" }}>
                            — four ways, one sitting
                        </span>
                        <span className="font-display text-[9px] tracking-[0.08em] text-[#3A3A3A]">GEMINI 3 PRO</span>
                    </div>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={() => handleSave(composite, 'collage')}
                        className="flex-1 px-3 py-3 rounded-xl bg-surface text-ink border border-divider font-display text-sm tracking-wider flex items-center justify-center gap-1.5"
                    >
                        <Download size={14} />
                        <span>SAVE</span>
                    </button>
                    <button
                        onClick={() => handleShare(composite, captions.find(Boolean) || '')}
                        className="flex-1 px-3 py-3 rounded-xl bg-roast-ember text-slate-900 font-display text-sm tracking-wider flex items-center justify-center gap-1.5 border border-roast-ember"
                        style={{ boxShadow: '0 4px 16px rgba(240,139,58,0.35)' }}
                    >
                        <Share2 size={14} />
                        <span>SHARE</span>
                    </button>
                    <button
                        onClick={onReset}
                        className="flex-1 px-3 py-3 rounded-xl bg-transparent text-roast-red border border-roast-red font-display text-sm tracking-wider flex items-center justify-center gap-1.5"
                    >
                        <RefreshCcw size={14} />
                        <span>REDO</span>
                    </button>
                </div>

                {/* Captions list — one per panel, so the jokes are readable
                    without opening each panel in turn. */}
                <div className="bg-surface rounded-2xl border border-divider p-3 flex flex-col gap-2.5">
                    {themes.map((t, i) => (
                        <div key={t.key} className="flex gap-2">
                            <span className="text-base leading-none mt-0.5">{t.emoji}</span>
                            <div className="min-w-0">
                                <div className="font-display text-[11px] tracking-[0.06em]" style={{ color: t.color }}>
                                    {t.label}
                                </div>
                                <p className="text-[12px] leading-[1.35] text-ink-soft" style={{ textWrap: 'pretty' }}>
                                    {captions[i] || '—'}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Full-bleed single panel. Pure crop of an image already paid for. */}
            {openPane !== null && panes && (
                <div
                    className="fixed inset-0 z-[70] backdrop-blur-md flex items-center justify-center px-4 py-6"
                    style={{ background: 'rgba(15, 30, 51, 0.94)' }}
                    onClick={() => setOpenPane(null)}
                >
                    <button
                        onClick={(e) => { e.stopPropagation(); setOpenPane(null); }}
                        aria-label="Close enlarged panel"
                        className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-white/20 transition"
                    >
                        <X size={18} />
                    </button>
                    <div className="w-full max-w-md flex flex-col gap-3 max-h-full" onClick={(e) => e.stopPropagation()}>
                        <img
                            src={panes[openPane]}
                            alt={themes[openPane]?.label}
                            className="w-full max-h-[60vh] object-contain rounded-xl border-2 border-white/20 bg-black"
                        />
                        <div className="bg-surface text-ink rounded-2xl p-4 border border-divider max-h-[26vh] overflow-y-auto">
                            <div className="font-display text-[12px] tracking-[0.08em] mb-1" style={{ color: themes[openPane]?.color }}>
                                {themes[openPane]?.label}
                            </div>
                            <p className="text-sm leading-[1.5] font-medium" style={{ textWrap: 'pretty' }}>
                                {captions[openPane] || '—'}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => handleSave(panes[openPane], themes[openPane]?.key || 'panel')}
                                className="flex-1 px-3 py-2.5 rounded-xl bg-surface text-ink border border-divider font-display text-xs tracking-wider flex items-center justify-center gap-1.5"
                            >
                                <Download size={13} />
                                <span>SAVE PANEL</span>
                            </button>
                            <button
                                onClick={() => handleShare(panes[openPane], captions[openPane] || '')}
                                className="flex-1 px-3 py-2.5 rounded-xl bg-roast-ember text-slate-900 border border-roast-ember font-display text-xs tracking-wider flex items-center justify-center gap-1.5"
                            >
                                <Share2 size={13} />
                                <span>SHARE PANEL</span>
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CollageResult;
