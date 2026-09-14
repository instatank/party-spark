import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Image as PhotoIcon, Home, FlaskConical, AlertTriangle } from 'lucide-react';
import { cleanBase64, editImage, generateComposite } from '../../../services/geminiService';
import { cropQuadrants } from '../../../services/imageQuadrants';
import { ROAST_THEMES, isThemeAvailable, type RoastThemeMeta } from '../../../data/roastThemes';

/**
 * ROAST LAB — reachable only at #roast-lab, never linked from Home.
 *
 * It exists to settle one question that cannot be settled by argument: does a
 * theme generated as ONE QUARTER of a 2x2 composite hold a recognisable face
 * well enough to ship?
 *
 * The cost case for composites is not in doubt — output images bill per image,
 * so four themes in one composite is one billed image instead of four. The open
 * question is fidelity. Cropping a composite back apart recovers PIXELS, but it
 * cannot recover DETAIL the model never generated: a face occupying an eighth
 * of the frame gets less attention than one occupying half, whatever the output
 * resolution. Whether that gap is visible at PartySpark's bar — "that's clearly
 * them", not "that looks like a version of them" — is an empirical question.
 *
 * So: same photo, same themes, both paths, side by side at identical display
 * size. Look at it and decide.
 */

// List prices for gemini-3-pro-image at the time of writing. Shown so a run's
// cost is visible before it is spent, not to be authoritative — check current
// pricing before making a budget decision on these numbers.
const PRICE_4K = 0.24;
const PRICE_2K = 0.134;

const PANE_COUNT = 4;

interface ThemeResult {
    theme: RoastThemeMeta;
    solo: string | null;
    soloMs: number;
    pane: string | null;
}

const RoastLab: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const [image, setImage] = useState<string | null>(null);
    // Default spread is deliberate: a packaging shot (face tiny — the hardest
    // case), a poster with heavy type, a photoreal snapshot, and a soft-focus
    // portrait. Four different ways a pane can fail.
    const [selected, setSelected] = useState<string[]>(['figurine', 'movie', 'digicam', 'yearbook']);
    const [running, setRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [composite, setComposite] = useState<string | null>(null);
    const [compositeMs, setCompositeMs] = useState(0);
    const [results, setResults] = useState<ThemeResult[] | null>(null);
    const [inset, setInset] = useState(0.015);
    const [showComposite, setShowComposite] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Riskiest first — a pane that survives the low-fidelity themes will
    // survive the rest, so those are the ones worth spending a run on.
    const choosable = useMemo(() => {
        const order: Record<string, number> = { low: 0, medium: 1, high: 2 };
        return ROAST_THEMES.filter((t) => isThemeAvailable(t)).sort(
            (a, b) => order[a.fidelity] - order[b.fidelity],
        );
    }, []);

    const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onloadend = () => {
            setImage(reader.result as string);
            setResults(null);
            setComposite(null);
            setError(null);
        };
        reader.readAsDataURL(file);
    }, []);

    const toggleTheme = (key: string) => {
        setSelected((prev) => {
            if (prev.includes(key)) return prev.filter((k) => k !== key);
            if (prev.length >= PANE_COUNT) return prev;
            return [...prev, key];
        });
    };

    // Re-slicing is free and instant — no regeneration — so the inset slider
    // can be dragged until the seams look right.
    const recrop = useCallback(async (src: string, nextInset: number, themes: RoastThemeMeta[]) => {
        const panes = await cropQuadrants(src, nextInset);
        setResults((prev) =>
            prev
                ? prev.map((r, i) => ({ ...r, pane: panes[i] ?? null }))
                : themes.map((theme, i) => ({ theme, solo: null, soloMs: 0, pane: panes[i] ?? null })),
        );
    }, []);

    const onInsetChange = (next: number) => {
        setInset(next);
        if (composite && results) {
            void recrop(composite, next, results.map((r) => r.theme));
        }
    };

    const run = async () => {
        if (!image || selected.length !== PANE_COUNT) return;
        setRunning(true);
        setError(null);
        setResults(null);
        setComposite(null);

        const raw = cleanBase64(image);
        const themes = selected
            .map((k) => ROAST_THEMES.find((t) => t.key === k))
            .filter((t): t is RoastThemeMeta => Boolean(t));

        try {
            // Both paths fire together so wall-clock is comparable and the run
            // is as fast as the slowest single call rather than their sum.
            const compositeStart = performance.now();
            const compositePromise = generateComposite(raw, selected, '4K').then((img) => {
                setCompositeMs(performance.now() - compositeStart);
                return img;
            });

            const soloPromises = selected.map(async (key) => {
                const start = performance.now();
                const img = await editImage(raw, key, undefined, undefined, '2K');
                return { img, ms: performance.now() - start };
            });

            const [compositeImg, solos] = await Promise.all([
                compositePromise,
                Promise.all(soloPromises),
            ]);

            setComposite(compositeImg);

            const panes = compositeImg ? await cropQuadrants(compositeImg, inset) : [];
            setResults(
                themes.map((theme, i) => ({
                    theme,
                    solo: solos[i].img,
                    soloMs: solos[i].ms,
                    pane: panes[i] ?? null,
                })),
            );

            if (!compositeImg) {
                setError('The composite call returned no image. The solo results below are still valid.');
            }
        } catch (err) {
            console.error('[roast-lab] run failed:', err);
            setError(err instanceof Error ? err.message : 'Run failed. See console.');
        } finally {
            setRunning(false);
        }
    };

    const soloTotal = PRICE_2K * PANE_COUNT;

    return (
        <div className="w-full min-h-full bg-app text-ink rounded-xl border border-divider-soft p-4" style={{ boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-start justify-between mb-4">
                <div>
                    <h1 className="font-display text-3xl tracking-wide text-ink flex items-center gap-2">
                        <FlaskConical size={26} className="text-amber-500" />
                        ROAST LAB
                    </h1>
                    <p className="text-xs text-muted mt-1 max-w-[320px]">
                        One composite vs four solo generations, same photo, same themes, same display size.
                    </p>
                </div>
                <button
                    onClick={onExit}
                    aria-label="Home"
                    className="w-11 h-11 shrink-0 rounded-full bg-surface border border-divider text-muted hover:text-ink hover:bg-surface-alt transition flex items-center justify-center"
                >
                    <Home size={20} />
                </button>
            </div>

            {/* Step 1 — photo */}
            <section className="mb-4">
                <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">1 · Photo</div>
                {image ? (
                    <div className="flex items-center gap-3">
                        <img src={image} alt="Source" className="w-20 h-20 object-cover rounded-lg border-2 border-ink" />
                        <button onClick={() => fileInputRef.current?.click()} className="text-xs font-bold text-amber-600 underline">
                            Change photo
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-4 rounded-xl border-2 border-dashed border-divider text-sm font-bold text-ink-soft flex items-center justify-center gap-2 hover:bg-surface-alt transition"
                    >
                        <PhotoIcon size={16} />
                        Choose a face
                    </button>
                )}
                <input ref={fileInputRef} type="file" accept="image/png, image/jpeg" onChange={handleFile} className="hidden" />
            </section>

            {/* Step 2 — themes */}
            <section className="mb-4">
                <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">
                    2 · Pick {PANE_COUNT} · {selected.length}/{PANE_COUNT} chosen · riskiest first
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                    {choosable.map((t) => {
                        const active = selected.includes(t.key);
                        const idx = selected.indexOf(t.key);
                        return (
                            <button
                                key={t.key}
                                onClick={() => toggleTheme(t.key)}
                                className="relative rounded-lg border-2 border-ink py-2 px-1 flex flex-col items-center gap-0.5 transition-all"
                                style={{
                                    background: active ? t.color : 'var(--c-surface)',
                                    color: active ? '#FFFFFF' : 'var(--c-ink)',
                                    boxShadow: active ? '3px 3px 0 var(--c-ink)' : '1.5px 1.5px 0 var(--c-ink)',
                                }}
                            >
                                {active && (
                                    <span className="absolute top-0.5 left-1 text-[9px] font-black opacity-80">{idx + 1}</span>
                                )}
                                <span className="text-xl leading-none">{t.emoji}</span>
                                <span className="font-display text-[11px] tracking-[0.03em] leading-none">{t.label}</span>
                                <span className="text-[8px] uppercase tracking-wide opacity-70">{t.fidelity}</span>
                            </button>
                        );
                    })}
                </div>
            </section>

            {/* Step 3 — run */}
            <section className="mb-5">
                <button
                    onClick={run}
                    disabled={!image || selected.length !== PANE_COUNT || running}
                    className="w-full py-3.5 rounded-xl bg-roast-red text-white font-display text-lg tracking-wide border-2 border-ink disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ boxShadow: '4px 4px 0 var(--c-ink)' }}
                >
                    {running ? 'GENERATING…' : 'RUN COMPARISON'}
                </button>
                <p className="text-[10px] text-muted mt-1.5 text-center">
                    ~${(PRICE_4K + soloTotal).toFixed(2)} per run · ${PRICE_4K.toFixed(2)} composite (4K) + ${soloTotal.toFixed(2)} for {PANE_COUNT} solo (2K)
                </p>
            </section>

            {error && (
                <div className="mb-4 rounded-lg border-2 border-amber-500 bg-amber-500/10 p-3 flex gap-2">
                    <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-ink-soft">{error}</p>
                </div>
            )}

            {/* Results */}
            {results && (
                <section>
                    <div className="flex items-baseline justify-between mb-2">
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase">Results</div>
                        <div className="text-[10px] text-muted tabular-nums">
                            composite {(compositeMs / 1000).toFixed(1)}s
                        </div>
                    </div>

                    <div className="mb-4 rounded-lg border border-divider bg-surface-alt p-3">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-muted flex justify-between mb-1">
                            <span>Crop inset</span>
                            <span className="tabular-nums">{(inset * 100).toFixed(1)}%</span>
                        </label>
                        <input
                            type="range"
                            min={0}
                            max={6}
                            step={0.5}
                            value={inset * 100}
                            onChange={(e) => onInsetChange(Number(e.target.value) / 100)}
                            className="w-full accent-amber-500"
                        />
                        <p className="text-[10px] text-muted mt-1">
                            Trims each pane inward. Raise it if panes carry a seam or a sliver of their neighbour. Re-slicing is free — no regeneration.
                        </p>
                    </div>

                    {composite && (
                        <div className="mb-4">
                            <button
                                onClick={() => setShowComposite((v) => !v)}
                                className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-1.5"
                            >
                                {showComposite ? '▾' : '▸'} Raw composite (1 billed image)
                            </button>
                            {showComposite && (
                                <img src={composite} alt="Raw composite" className="w-full rounded-lg border-2 border-ink" />
                            )}
                        </div>
                    )}

                    <div className="grid grid-cols-[1fr_1fr] gap-x-2 gap-y-1 mb-1">
                        <div className="text-[9px] font-extrabold tracking-[0.12em] text-muted uppercase text-center">Composite pane</div>
                        <div className="text-[9px] font-extrabold tracking-[0.12em] text-muted uppercase text-center">Solo gen</div>
                    </div>

                    <div className="flex flex-col gap-4">
                        {results.map((r) => (
                            <div key={r.theme.key}>
                                <div className="flex items-baseline gap-2 mb-1">
                                    <span className="text-base leading-none">{r.theme.emoji}</span>
                                    <span className="font-display text-sm tracking-wide">{r.theme.label}</span>
                                    <span className="text-[9px] uppercase tracking-wide text-muted">{r.theme.fidelity} fidelity</span>
                                    <span className="text-[9px] text-muted ml-auto tabular-nums">{(r.soloMs / 1000).toFixed(1)}s solo</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {[r.pane, r.solo].map((src, i) => (
                                        <div
                                            key={i}
                                            className="aspect-square rounded-lg border-2 border-ink bg-black overflow-hidden flex items-center justify-center"
                                        >
                                            {src ? (
                                                <img src={src} alt={i === 0 ? 'Composite pane' : 'Solo generation'} className="w-full h-full object-contain" />
                                            ) : (
                                                <span className="text-[10px] text-muted px-2 text-center">no image returned</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <p className="text-[10px] text-muted mt-1">{r.theme.blurb}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
};

export default RoastLab;
