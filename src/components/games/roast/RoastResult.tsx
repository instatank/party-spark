import React, { useState } from 'react';
import { Download, Share2, RefreshCcw, Wand2, X, Skull, Home } from 'lucide-react';
import { editImage, cleanBase64, type RoastTheme } from '../../../services/geminiService';

interface RoastResultProps {
    originalImage: string;
    resultImage: string;
    roastText: string;
    theme: RoastTheme;
    onUpdateImage: (newImage: string) => void;
    onReset: () => void;
    onClose: () => void;
}

const THEME_LABEL: Record<RoastTheme, string> = {
    animate: 'ANIMATE',
    tabloid: 'TABLOID',
    movie:   'MOVIE',
    disco:   '80S DISCO',
    agra:    'AGRA ROYAL',
};

// Refinement chips — preset stylistic modifiers fired through the same
// editImage() backend the custom input uses. Order tracked so we can show
// an active state on the last-clicked chip.
const REFINE_CHIPS: { label: string; prompt: string }[] = [
    { label: 'ZOMBIE',       prompt: 'Re-render the person as an undead zombie — pale rotting skin, sunken eyes, torn clothes — keep facial identity intact.' },
    { label: 'ANIME',        prompt: 'Re-render in vibrant anime style — large expressive eyes, cel-shaded color, dynamic background — keep facial identity intact.' },
    { label: '80S',          prompt: 'Re-render the person in over-the-top 1980s style — neon, big hair, bold makeup, synthwave background — keep facial identity intact.' },
    { label: 'NOIR',         prompt: 'Re-render in black-and-white film noir — dramatic shadows, smoky lighting, fedora-and-trenchcoat aesthetic — keep facial identity intact.' },
    { label: 'CLASSIC',      prompt: 'Re-render as a Renaissance oil painting — chiaroscuro lighting, formal pose, period-appropriate clothing — keep facial identity intact.' },
];

const formatRoastedDate = (): string => {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const d = new Date();
    return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`;
};

const CLAMP_LIMIT = 80;
const clampRoast = (text: string): { display: string; isClamped: boolean } => {
    if (text.length <= CLAMP_LIMIT) return { display: text, isClamped: false };
    return { display: text.slice(0, CLAMP_LIMIT - 2).trim() + '…', isClamped: true };
};

const RoastResult: React.FC<RoastResultProps> = ({ originalImage, resultImage, roastText, theme, onUpdateImage, onReset, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [isEditing, setIsEditing] = useState(false);
    const [activeChip, setActiveChip] = useState<string | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);

    const handleCustomEdit = async (customPrompt?: string) => {
        const promptToUse = customPrompt || prompt;
        if (!promptToUse.trim()) return;
        setIsEditing(true);
        try {
            const rawBase64 = cleanBase64(originalImage);
            const newImage = await editImage(rawBase64, promptToUse);
            if (newImage) {
                onUpdateImage(newImage);
                if (!customPrompt) setPrompt('');
            }
        } catch (e) {
            console.error(e);
            alert('Failed to edit image. Try a different prompt.');
        } finally {
            setIsEditing(false);
        }
    };

    const handleChipClick = (label: string, presetPrompt: string) => {
        setActiveChip(label);
        handleCustomEdit(presetPrompt);
    };

    const handleSave = () => {
        try {
            const link = document.createElement('a');
            link.href = resultImage;
            link.download = `partyspark_roast_${Date.now()}.jpg`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Error saving image:', error);
            alert('Failed to save image.');
        }
    };

    const handleShare = async (text?: string) => {
        try {
            const shareText = text || roastText;
            const response = await fetch(resultImage);
            const blob = await response.blob();
            const file = new File([blob], 'partyspark_roast.jpg', { type: 'image/jpeg' });
            if (navigator.share) {
                await navigator.share({
                    title: 'My PartySpark Roast',
                    text: `Check out my roast from PartySpark!\n\n"${shareText}"`,
                    files: [file],
                });
            } else {
                alert('Sharing is not supported on this device/browser. Please use the Save button instead.');
            }
        } catch (error) {
            console.error('Error sharing image:', error);
            if ((error as { name?: string }).name !== 'AbortError') {
                alert('Sharing failed. Please try saving the image instead.');
            }
        }
    };

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(roastText);
        } catch (e) {
            console.error('Copy failed:', e);
        }
    };

    const { display: clampedText, isClamped } = clampRoast(roastText);

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

            <div className="flex-1 flex flex-col gap-3 px-4 pt-14 pb-4 overflow-hidden">
                {/* Polaroid card — sticker treatment in BOTH modes (it's the hero) */}
                <div
                    className="bg-polaroid border-[2.5px] border-ink rounded-[10px] mx-1.5 px-2.5 pt-2.5 pb-0"
                    style={{
                        boxShadow: '5px 5px 0 var(--c-ink)',
                        transform: 'rotate(-1.4deg)',
                    }}
                >
                    <div className="relative rounded-[4px] overflow-hidden" style={{ aspectRatio: '4 / 4.2' }}>
                        {isEditing && (
                            <div className="absolute inset-0 z-20 bg-black/70 flex items-center justify-center">
                                <span className="font-display text-yellow-400 text-xl tracking-wide animate-pulse">APPLYING MAGIC…</span>
                            </div>
                        )}
                        <img src={resultImage} alt="Roast result" className="w-full h-full object-cover" />

                        {/* No image overlays here — the AI-generated poster/tabloid
                            often carries its own title or cover art, so the theme
                            sticker + skull rating that used to sit at top-left and
                            top-right would clash. Both moved to the full-verdict
                            sheet's meta strip where they don't fight the image. */}

                        {/* Meme caption + READ FULL ROAST */}
                        <div
                            className="absolute left-0 right-0 bottom-0 px-3 pt-12 pb-3"
                            style={{ background: 'linear-gradient(180deg, transparent 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.92) 95%)' }}
                        >
                            <div
                                className="font-display text-white text-center uppercase text-[22px] leading-[0.98] tracking-[0.02em]"
                                style={{
                                    textShadow: '2px 2px 0 #000, -1px -1px 0 #000',
                                    textWrap: 'balance',
                                }}
                            >
                                {clampedText}
                            </div>
                            {isClamped && (
                                <button
                                    onClick={() => setSheetOpen(true)}
                                    className="block mx-auto mt-2 bg-roast-ember text-slate-900 px-4 py-1.5 rounded-full border-2 border-slate-900 font-display text-[15px] tracking-[0.06em] font-bold"
                                    style={{ boxShadow: '2px 2px 0 #0F172A' }}
                                >
                                    ▾ READ FULL ROAST
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Polaroid caption strip — sub-text size so the photo above
                        gets more vertical real estate. */}
                    <div className="flex items-center justify-between px-1 py-1.5">
                        <span className="italic text-[10px] text-[#1F1F1F]" style={{ fontFamily: "'Brush Script MT', cursive" }}>
                            — roasted, {formatRoastedDate()}
                        </span>
                        <span className="font-display text-[9px] tracking-[0.08em] text-[#3A3A3A]">
                            GEMINI 3 PRO
                        </span>
                    </div>
                </div>

                {/* Action row — sleek chrome */}
                <div className="flex gap-2">
                    <button
                        onClick={handleSave}
                        className="flex-1 px-3 py-3 rounded-xl bg-surface text-ink border border-divider font-display text-sm tracking-wider flex items-center justify-center gap-1.5"
                    >
                        <Download size={14} />
                        <span>SAVE</span>
                    </button>
                    <button
                        onClick={() => handleShare()}
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

                {/* Refine card — sleek chrome */}
                <div className="bg-surface rounded-2xl border border-divider p-3.5">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                            <Wand2 size={14} className="text-roast-red" />
                            <span className="font-display text-sm tracking-[0.06em] text-ink">REFINE THE VERDICT</span>
                        </div>
                        <span className="text-[10px] font-semibold text-muted">or pick a chip</span>
                    </div>
                    {/* All 5 chips fit in one row via flex-1 equal share + tight
                        padding. RENAISSANCE was renamed to CLASSIC to fit the
                        budget; the prompt below still drives the oil-painting
                        style so output is unchanged. */}
                    <div className="flex gap-1 mb-3">
                        {REFINE_CHIPS.map(c => {
                            const active = activeChip === c.label;
                            return (
                                <button
                                    key={c.label}
                                    onClick={() => handleChipClick(c.label, c.prompt)}
                                    disabled={isEditing}
                                    className={`flex-1 font-display text-[10px] tracking-[0.04em] px-2 py-1.5 rounded-full border transition-colors disabled:opacity-50
                                        ${active
                                            ? 'bg-gold text-slate-900 border-gold'
                                            : 'bg-surface-alt text-ink-soft border-divider hover:border-ink-soft'}`}
                                >
                                    {c.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-1.5 px-2.5 py-2 rounded-[10px] bg-app border border-divider">
                        <input
                            type="text"
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            placeholder="Custom: make it a 1920s gangster…"
                            onKeyDown={(e) => e.key === 'Enter' && handleCustomEdit()}
                            className="flex-1 bg-transparent border-none outline-none text-xs font-medium text-ink placeholder:text-muted"
                        />
                        <button
                            onClick={() => handleCustomEdit()}
                            disabled={isEditing || !prompt.trim()}
                            className="px-3 py-1.5 rounded-lg bg-roast-red text-white font-display text-xs tracking-widest border-none disabled:opacity-50"
                        >
                            GO
                        </button>
                    </div>
                </div>
            </div>

            {/* Bottom sheet — full verdict */}
            {sheetOpen && (
                <div
                    className="fixed inset-0 z-[60] flex items-end backdrop-blur-sm"
                    style={{ background: 'rgba(15, 30, 51, 0.5)' }}
                    onClick={() => setSheetOpen(false)}
                >
                    <div
                        className="w-full bg-surface border border-divider rounded-t-[24px] px-5 pt-3 pb-7 max-h-[78%] flex flex-col"
                        style={{ boxShadow: '0 -16px 40px rgba(15, 30, 51, 0.18)' }}
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Drag handle */}
                        <div className="w-11 h-[5px] rounded-full bg-divider-soft mx-auto mb-3.5" />

                        {/* Header */}
                        <div className="flex items-center justify-between mb-3.5">
                            <div className="flex items-center gap-2">
                                <Skull size={16} className="text-roast-red" fill="currentColor" />
                                <span className="font-display text-lg tracking-[0.08em] text-ink">THE FULL VERDICT</span>
                            </div>
                            <button
                                onClick={() => setSheetOpen(false)}
                                aria-label="Close sheet"
                                className="w-7 h-7 rounded-full bg-surface-alt border border-divider text-muted flex items-center justify-center hover:text-ink"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        {/* Meta strip */}
                        <div className="flex items-center gap-1.5 mb-3.5">
                            <span className="font-display text-[11px] tracking-[0.06em] px-2 py-1 rounded-md bg-gold text-slate-900 border border-gold">
                                {THEME_LABEL[theme]}
                            </span>
                            <span
                                className="px-2 py-1 rounded-md border border-roast-red flex items-center gap-0.5"
                                style={{ background: 'rgba(216,58,58,0.10)' }}
                            >
                                {[1, 2, 3, 4, 5].map(i => <Skull key={i} size={9} className="text-roast-red" fill="currentColor" />)}
                            </span>
                            <div className="flex-1" />
                            <span className="font-display text-[11px] tracking-[0.08em] text-muted">GEMINI 3 PRO</span>
                        </div>

                        {/* Full roast text with red Bebas quote marks */}
                        <div className="flex-1 overflow-y-auto py-1 pr-1 text-base leading-[1.42] text-ink font-medium" style={{ textWrap: 'pretty' }}>
                            <span className="font-display text-[38px] text-roast-red mr-1" style={{ verticalAlign: '-12px', lineHeight: 0 }}>"</span>
                            {roastText}
                            <span className="font-display text-[38px] text-roast-red ml-0.5" style={{ verticalAlign: '-12px', lineHeight: 0 }}>"</span>
                        </div>

                        {/* Sheet actions */}
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => handleShare(roastText)}
                                className="flex-1 px-3 py-3 rounded-xl bg-roast-ember text-slate-900 border border-roast-ember font-display text-sm tracking-wider flex items-center justify-center gap-1.5"
                                style={{ boxShadow: '0 4px 20px rgba(240,139,58,0.4)' }}
                            >
                                <Share2 size={14} />
                                <span>SHARE QUOTE</span>
                            </button>
                            <button
                                onClick={handleCopy}
                                className="flex-1 px-3 py-3 rounded-xl bg-surface-alt text-ink border border-divider font-display text-sm tracking-wider"
                            >
                                COPY
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default RoastResult;
