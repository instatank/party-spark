import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, Heart, Share2, Copy, Trash2, X, ChevronLeft, ChevronRight, Sparkles, Flame, Book, RefreshCcw, Download, Dices } from 'lucide-react';
import { ScreenHeader, Button } from '../ui/Layout';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';
import { observeRoastPhoto, generateRoastBatch, cleanBase64, type RoastObservations } from '../../services/geminiService';
import { sessionService } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { unlockAudio, playPop, playDingSoft, hapticTap, hapticSuccess } from '../../services/audio';
import { renderRoastCardWithImage, ROAST_CARD_TEMPLATES, type RoastCardTemplate } from '../../services/roastCards';
import { shareCanvasImage, downloadCanvasImage, shareResultCard } from '../../services/shareCard';

interface Props {
    onExit: () => void;
}

// =============================================================================
// Roast Central — the persona-driven roast deck (Roast Me v2 Phases 1 + 2).
//
// Architecture ("look once, riff forever"): the photo is downscaled client-side
// to ≤1024px, sent ONCE to /api/ai roast_observe for a structured observation
// JSON (cached in sessionStorage by photo hash), and every roast batch after
// that is text-only generation from those observations. If the API is
// unreachable (offline, quota) the bundled fallback deck takes over — the
// game never dead-ends.
//
// Every roast auto-renders into a designed poster (the player's photo + the
// burn, composited on canvas — $0, offline) as the DEFAULT visual; a random
// frame is assigned per card, and the frame strip / dice re-roll it. Full
// design: docs/ROAST_ME_V2_PLAN.md.
// =============================================================================

// Personas/formats/spice mirror the server-side library in
// api/_lib/roast-prompts.ts — ids must stay in sync.
// Accent classes are STATIC strings (Tailwind v4 JIT — no template literals).
const PERSONAS: { id: string; label: string; emoji: string; tagline: string; text: string; borderL: string }[] = [
    { id: 'roastmaster',     label: 'The Roastmaster', emoji: '🎤', tagline: 'Comedy-club savage',      text: 'text-red-400',     borderL: 'border-l-red-500' },
    { id: 'posh_judge',      label: 'Posh Judge',      emoji: '🧐', tagline: 'Dry. Devastating.',       text: 'text-indigo-400',  borderL: 'border-l-indigo-500' },
    { id: 'grandma',         label: 'Sweet Grandma',   emoji: '🍪', tagline: 'Love with a knife in it', text: 'text-amber-400',   borderL: 'border-l-amber-500' },
    { id: 'bollywood_aunty', label: 'Bollywood Aunty', emoji: '💅', tagline: 'Society will talk',       text: 'text-pink-400',    borderL: 'border-l-pink-500' },
    { id: 'hr_rep',          label: 'Corporate HR',    emoji: '📎', tagline: 'Your vibe: under review', text: 'text-cyan-400',    borderL: 'border-l-cyan-500' },
    { id: 'hype_man',        label: 'Hype Man',        emoji: '📣', tagline: 'Zero roast. Pure gas.',   text: 'text-emerald-400', borderL: 'border-l-emerald-500' },
];

const FORMATS: { id: string; label: string; emoji: string }[] = [
    { id: 'zinger',         label: 'Zingers',   emoji: '⚡' },
    { id: 'tabloid',        label: 'Tabloid',   emoji: '📰' },
    { id: 'yearbook',       label: 'Yearbook',  emoji: '🎓' },
    { id: 'dating_profile', label: 'Swipe',     emoji: '💘' },
    { id: 'award',          label: 'Awards',    emoji: '🏆' },
];

const SPICES: { id: string; label: string; emoji: string; adult: boolean }[] = [
    { id: 'mild',   label: 'Mild',   emoji: '🥛', adult: false },
    { id: 'medium', label: 'Medium', emoji: '🌶️', adult: false },
    { id: 'extra',  label: 'Extra',  emoji: '🔥', adult: true },
];

const personaById = (id: string) => PERSONAS.find(p => p.id === id) ?? PERSONAS[0];

// Client-side batch cap per 2h session window (SessionManager) — text batches
// are cheap (~$0.003) but unbounded loops shouldn't be free.
const MAX_BATCHES_PER_SESSION = 60;
const BATCH_SIZE = 5;
const BURN_BOOK_KEY = 'roast_central_burnbook';

interface RoastCard {
    id: string;
    text: string;
    persona: string;
    offline: boolean;
    template: RoastCardTemplate; // the poster frame auto-assigned to this card
}

const TEMPLATE_IDS = ROAST_CARD_TEMPLATES.map(t => t.id);
const randomTemplate = (exclude?: RoastCardTemplate): RoastCardTemplate => {
    const pool = TEMPLATE_IDS.filter(id => id !== exclude);
    return pool[Math.floor(Math.random() * pool.length)] ?? TEMPLATE_IDS[0];
};

interface BurnBookEntry {
    id: string;
    text: string;
    persona: string;
    savedAt: number;
}

// --- photo utilities ---------------------------------------------------------

// Downscale + re-encode to JPEG. Caps the long edge at 1024px: cuts a phone
// photo from ~4-6MB base64 to ~150-250KB (vision cost + Vercel's 4.5MB body
// cap both care), with no visible quality loss at chat-app sizes.
const downscaleDataUrl = (dataUrl: string, maxDim = 1024, quality = 0.85): Promise<string> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            const w = Math.max(1, Math.round(img.width * scale));
            const h = Math.max(1, Math.round(img.height * scale));
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) { reject(new Error('canvas 2d unavailable')); return; }
            ctx.drawImage(img, 0, 0, w, h);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('image decode failed'));
        img.src = dataUrl;
    });

const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('file read failed'));
        reader.readAsDataURL(file);
    });

// Fast sampled FNV-1a over the base64 — only used as a sessionStorage cache
// key for observations, so collisions are harmless.
const hashDataUrl = (s: string): string => {
    let h = 2166136261;
    const step = Math.max(1, Math.floor(s.length / 2048));
    for (let i = 0; i < s.length; i += step) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36) + '-' + s.length.toString(36);
};

// --- offline fallback deck (dynamic import — stays out of the main chunk) ----

let fallbackPromise: Promise<Record<string, string[]>> | null = null;
const loadFallbackDeck = (): Promise<Record<string, string[]>> =>
    (fallbackPromise ??= import('../../data/roast_central_fallback.json').then(m => m.default as Record<string, string[]>));

// --- burn book (localStorage) -------------------------------------------------

const readBurnBook = (): BurnBookEntry[] => {
    try {
        return JSON.parse(localStorage.getItem(BURN_BOOK_KEY) || '[]') as BurnBookEntry[];
    } catch { return []; }
};
const writeBurnBook = (entries: BurnBookEntry[]) => {
    try { localStorage.setItem(BURN_BOOK_KEY, JSON.stringify(entries)); } catch { /* storage full/blocked */ }
};

// Rotating status lines while the first batch cooks.
const LOADING_LINES = [
    'Studying your photo…',
    'Consulting the panel…',
    'Sharpening one-liners…',
    'Rating the fit…',
    'Preparing the verdict…',
];

export const RoastCentralGame: React.FC<Props> = ({ onExit }) => {
    const [screen, setScreen] = useState<'SETUP' | 'DECK'>('SETUP');

    // Setup choices
    const [photo, setPhoto] = useState<string | null>(null);
    const [persona, setPersona] = useState<string>('roastmaster');
    const [format, setFormat] = useState<string>('zinger');
    const [spice, setSpice] = useState<string>('medium');
    const [pinOpen, setPinOpen] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(() => shouldAutoExpandRules('roast_central'));

    // Deck state
    const [cards, setCards] = useState<RoastCard[]>([]);
    const [index, setIndex] = useState(0);
    const [loadingBatch, setLoadingBatch] = useState(false);
    const [loadingLine, setLoadingLine] = useState(0);
    const [kidMode, setKidMode] = useState(false);
    const [copied, setCopied] = useState(false);

    // Burn Book
    const [burnBook, setBurnBook] = useState<BurnBookEntry[]>(readBurnBook);
    const [bookOpen, setBookOpen] = useState(false);

    // Poster (Phase 2 — auto-rendered, the default deck visual)
    const [posterUrl, setPosterUrl] = useState<string | null>(null);
    const [posterRendering, setPosterRendering] = useState(false);
    const [lightboxOpen, setLightboxOpen] = useState(false);
    const [recapBusy, setRecapBusy] = useState(false);
    const posterCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const posterKeyRef = useRef<string>('');
    // key `${cardId}:${template}` → rendered {url, canvas}. Navigating back to a
    // card shows its poster instantly instead of re-drawing.
    const posterCacheRef = useRef<Map<string, { url: string; canvas: HTMLCanvasElement }>>(new Map());

    // Camera overlay
    const [cameraOpen, setCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Observation promise for the current photo — kicked off the moment the
    // photo lands so it resolves while the user is still picking a persona.
    const obsRef = useRef<Promise<RoastObservations | null> | null>(null);
    // Resolved observations, mirrored into state so the poster renderer (sync)
    // can seed trading-card stats without awaiting.
    const [obsResolved, setObsResolved] = useState<RoastObservations | null>(null);
    // Photo decoded once into an <img> so poster draws are synchronous.
    const imgElRef = useRef<HTMLImageElement | null>(null);
    const [imgReady, setImgReady] = useState(false);
    // Fallback lines already dealt this session, so REDO never repeats.
    const usedFallbackRef = useRef<Set<string>>(new Set());
    const touchStartX = useRef<number | null>(null);

    const current: RoastCard | undefined = cards[index];

    // Auto-render the poster for the current roast whenever the card, its
    // frame, the photo, or the resolved observations change. The draw itself is
    // synchronous (photo decode + observation fetch are already settled via
    // refs), deferred one frame so the shimmer can paint, and cached by key.
    useEffect(() => {
        const card = cards[index];
        if (!card || !photo || !imgReady || !imgElRef.current) { setPosterUrl(null); return; }
        const key = `${card.id}:${card.template}`;
        const cached = posterCacheRef.current.get(key);
        if (cached) {
            posterCanvasRef.current = cached.canvas;
            posterKeyRef.current = key;
            setPosterUrl(cached.url);
            return;
        }
        setPosterRendering(true);
        const raf = requestAnimationFrame(() => {
            try {
                const p = personaById(card.persona);
                const canvas = renderRoastCardWithImage(imgElRef.current!, {
                    template: card.template,
                    photo,
                    roast: card.text,
                    personaLabel: p.label,
                    personaEmoji: p.emoji,
                    observations: obsResolved,
                });
                const url = canvas.toDataURL('image/jpeg', 0.9);
                const cache = posterCacheRef.current;
                if (cache.size >= 30) {
                    const oldest = cache.keys().next().value;
                    if (oldest) cache.delete(oldest);
                }
                cache.set(key, { url, canvas });
                posterCanvasRef.current = canvas;
                posterKeyRef.current = key;
                setPosterUrl(url);
            } catch (err) {
                console.error('[roast-central] poster render failed:', err);
            } finally {
                setPosterRendering(false);
            }
        });
        return () => cancelAnimationFrame(raf);
    }, [cards, index, photo, imgReady, obsResolved]);

    // --- photo intake ---------------------------------------------------------

    const resetForNewPhoto = () => {
        setCards([]);
        setIndex(0);
        setKidMode(false);
        setObsResolved(null);
        setPosterUrl(null);
        setImgReady(false);
        imgElRef.current = null;
        posterCacheRef.current.clear();
        posterCanvasRef.current = null;
        posterKeyRef.current = '';
    };

    const acceptPhoto = async (rawDataUrl: string) => {
        try {
            const scaled = await downscaleDataUrl(rawDataUrl);
            const hash = hashDataUrl(scaled);
            resetForNewPhoto();
            setPhoto(scaled);
            // Decode once for synchronous poster draws.
            const el = new Image();
            el.onload = () => { imgElRef.current = el; setImgReady(true); };
            el.onerror = () => console.error('[roast-central] poster image decode failed');
            el.src = scaled;
            startObservation(scaled, hash);
        } catch (err) {
            console.error('[roast-central] photo processing failed:', err);
            alert("Couldn't read that image. Try a different photo (JPG or PNG).");
        }
    };

    const startObservation = (dataUrl: string, hash: string) => {
        const cacheKey = `rc_obs_${hash}`;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                const parsed = JSON.parse(cached) as RoastObservations;
                obsRef.current = Promise.resolve(parsed);
                setObsResolved(parsed);
                return;
            }
        } catch { /* fall through to a fresh call */ }
        obsRef.current = observeRoastPhoto(cleanBase64(dataUrl)).then(obs => {
            if (obs) {
                try { sessionStorage.setItem(cacheKey, JSON.stringify(obs)); } catch { /* quota */ }
            }
            setObsResolved(obs);
            return obs;
        });
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) fileToDataUrl(file).then(acceptPhoto).catch(err => console.error('[roast-central] file read failed:', err));
        e.target.value = ''; // allow re-picking the same file
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            streamRef.current = stream;
            setCameraOpen(true);
            setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
        } catch (err) {
            console.error('[roast-central] camera error:', err);
            alert('Could not access the camera. Please allow permissions or upload a photo instead.');
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraOpen(false);
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        // Mirror the front camera so the capture matches the on-screen preview.
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        stopCamera();
        acceptPhoto(dataUrl);
    };

    // --- roast batches ----------------------------------------------------------

    const sampleFallback = async (personaId: string): Promise<string[]> => {
        const deck = await loadFallbackDeck();
        const pool = (deck[personaId] ?? deck['roastmaster'] ?? []).filter(l => !usedFallbackRef.current.has(l));
        const source = pool.length >= BATCH_SIZE ? pool : (deck[personaId] ?? deck['roastmaster'] ?? []);
        const picked: string[] = [];
        const working = [...source];
        while (picked.length < BATCH_SIZE && working.length) {
            const i = Math.floor(Math.random() * working.length);
            picked.push(working.splice(i, 1)[0]);
        }
        picked.forEach(l => usedFallbackRef.current.add(l));
        return picked;
    };

    const fetchBatch = async (personaId: string) => {
        if (loadingBatch) return;
        unlockAudio();
        setLoadingBatch(true);
        const lineTimer = setInterval(() => setLoadingLine(l => (l + 1) % LOADING_LINES.length), 1400);
        const startIndex = cards.length;
        try {
            const obs = obsRef.current ? await obsRef.current : null;

            // Wholesome override: kid in frame → hype only, no heat. The server
            // enforces this too; here it also fixes the visible UI state.
            let effPersona = personaId;
            let effSpice = spice;
            if (obs && (obs.hasChild || (obs.contextTags || []).includes('baby'))) {
                effPersona = 'hype_man';
                effSpice = 'mild';
                if (!kidMode) {
                    setKidMode(true);
                    setPersona('hype_man');
                    setSpice('mild');
                }
            }

            let lines: string[] = [];
            let offline = false;
            const underCap = sessionService.getUsageCount('ROAST_CENTRAL') < MAX_BATCHES_PER_SESSION;
            if (obs && underCap) {
                lines = await generateRoastBatch(obs, effPersona, format, effSpice, BATCH_SIZE);
                if (lines.length) sessionService.markAsUsed('ROAST_CENTRAL', 'default', Date.now().toString());
            }
            if (!lines.length) {
                lines = await sampleFallback(effPersona);
                offline = true;
            }

            const stamp = Date.now();
            let prevTemplate: RoastCardTemplate | undefined;
            const newCards: RoastCard[] = lines.map((text, i) => {
                const template = randomTemplate(prevTemplate);
                prevTemplate = template;
                return { id: `${stamp}-${i}`, text, persona: effPersona, offline, template };
            });
            setCards(prev => [...prev, ...newCards]);
            setIndex(startIndex);
            playPop();
            hapticSuccess();
        } finally {
            clearInterval(lineTimer);
            setLoadingBatch(false);
        }
    };

    const startRoasting = () => {
        if (!photo) return;
        setScreen('DECK');
        fetchBatch(persona);
    };

    const switchPersona = (personaId: string) => {
        if (personaId === persona && cards.some(c => c.persona === personaId)) return;
        setPersona(personaId);
        fetchBatch(personaId);
    };

    // --- deck interactions --------------------------------------------------------

    const go = (delta: number) => {
        setIndex(i => Math.min(cards.length - 1, Math.max(0, i + delta)));
        hapticTap();
    };

    const onTouchStart = (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX; };
    const onTouchEnd = (e: React.TouchEvent) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        touchStartX.current = null;
        if (Math.abs(dx) < 48) return;
        go(dx < 0 ? 1 : -1);
    };

    const isSaved = (card: RoastCard) => burnBook.some(b => b.text === card.text);

    const toggleSave = (card: RoastCard) => {
        let next: BurnBookEntry[];
        if (isSaved(card)) {
            next = burnBook.filter(b => b.text !== card.text);
        } else {
            next = [{ id: card.id, text: card.text, persona: card.persona, savedAt: Date.now() }, ...burnBook];
            playDingSoft();
            hapticTap();
        }
        setBurnBook(next);
        writeBurnBook(next);
    };

    const deleteSaved = (id: string) => {
        const next = burnBook.filter(b => b.id !== id);
        setBurnBook(next);
        writeBurnBook(next);
    };

    const shareText = async (text: string) => {
        const payload = `${text}\n\n🔥 Roast Central — PartySpark`;
        try {
            if (navigator.share) {
                await navigator.share({ text: payload });
                return;
            }
        } catch (err) {
            if ((err as { name?: string }).name === 'AbortError') return;
        }
        copyText(text);
    };

    const copyText = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch (err) {
            console.error('[roast-central] copy failed:', err);
        }
    };

    // --- poster (Phase 2 — the default deck visual) -----------------------------

    // Change the current card's frame (frame strip / dice). The auto-render
    // effect picks the new poster up from the state change.
    const setCardTemplate = (templateId: RoastCardTemplate) => {
        const card = cards[index];
        if (!card || card.template === templateId) return;
        setCards(prev => prev.map((c, i) => (i === index ? { ...c, template: templateId } : c)));
        hapticTap();
    };

    const reshufflePoster = () => {
        const card = cards[index];
        if (!card) return;
        setCards(prev => prev.map((c, i) => (i === index ? { ...c, template: randomTemplate(c.template) } : c)));
        playDingSoft();
        hapticTap();
    };

    // The canvas that matches the currently-displayed poster. Normally the
    // effect keeps posterCanvasRef in sync; this guards the rare case where a
    // share fires mid-render by rendering a fresh matching canvas.
    const currentPosterCanvas = (): HTMLCanvasElement | null => {
        const card = cards[index];
        if (!card || !photo || !imgElRef.current) return posterCanvasRef.current;
        const key = `${card.id}:${card.template}`;
        if (posterKeyRef.current === key && posterCanvasRef.current) return posterCanvasRef.current;
        const cached = posterCacheRef.current.get(key);
        if (cached) return cached.canvas;
        try {
            const p = personaById(card.persona);
            return renderRoastCardWithImage(imgElRef.current, {
                template: card.template, photo, roast: card.text,
                personaLabel: p.label, personaEmoji: p.emoji, observations: obsResolved,
            });
        } catch { return posterCanvasRef.current; }
    };

    const sharePoster = () => { const c = currentPosterCanvas(); if (c) shareCanvasImage(c, 'roast_central_card'); };
    const savePoster = () => { const c = currentPosterCanvas(); if (c) downloadCanvasImage(c, 'roast_central_card'); };

    // Session recap rides the house share-card engine directly (navy/gold).
    const shareRecap = async () => {
        if (recapBusy || cards.length === 0) return;
        setRecapBusy(true);
        try {
            const personasUsed = [...new Set(cards.map(c => c.persona))];
            await shareResultCard({
                gameTitle: 'Roast Central',
                accent: '#E15B5B',
                emoji: '🔥',
                heading: `Survived ${cards.length} roasts`,
                sub: `${personasUsed.length} comedian${personasUsed.length === 1 ? '' : 's'} · ${SPICES.find(s => s.id === spice)?.label ?? 'Medium'} heat`,
                rows: personasUsed.map(id => {
                    const p = personaById(id);
                    return {
                        label: `${p.emoji} ${p.label}`,
                        value: `${cards.filter(c => c.persona === id).length} burns`,
                        highlight: id === persona,
                    };
                }),
                footer: 'Roast Central — bring a photo, leave a legend',
            });
        } finally {
            setRecapBusy(false);
        }
    };

    const selectSpice = (id: string, adult: boolean) => {
        if (kidMode) return;
        if (adult && !isAdultUnlocked()) {
            setPinOpen(true);
            return;
        }
        setSpice(id);
        hapticTap();
    };

    // --- camera overlay -------------------------------------------------------------

    if (cameraOpen) {
        return (
            <div className="w-full min-h-[600px] flex items-center justify-center px-4 py-6">
                <div className="relative w-full max-w-md rounded-2xl overflow-hidden bg-black border border-divider" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-80 object-cover scale-x-[-1]" />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                        <button onClick={stopCamera} className="px-4 py-2 bg-black/60 text-white rounded-full text-sm font-semibold hover:bg-black/80 transition">
                            Cancel
                        </button>
                        <button onClick={capturePhoto} className="px-6 py-2 bg-gold text-slate-900 rounded-full font-bold text-base shadow-lg">
                            SNAP 📸
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // --- SETUP screen ----------------------------------------------------------------

    if (screen === 'SETUP') {
        return (
            <div className="w-full">
                <ScreenHeader title="Roast Central" onBack={onExit} onHome={onExit} />

                {pinOpen && (
                    <PinGateModal
                        onSuccess={() => { setPinOpen(false); setSpice('extra'); }}
                        onCancel={() => setPinOpen(false)}
                    />
                )}

                <div className="flex flex-col gap-4 max-w-[380px] mx-auto w-full pb-6">
                    <p className="text-sm text-ink-soft -mt-2">
                        Drop a photo. Six AI comics take turns destroying it — five fresh burns at a time, as many rounds as you can take.
                    </p>

                    {/* How to play — auto-expands on first ever open */}
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
                        <button
                            onClick={() => setRulesOpen(o => !o)}
                            className="w-full flex items-center justify-between px-4 py-2.5 text-left"
                        >
                            <span className="text-xs font-bold tracking-wider text-muted uppercase">How to play</span>
                            <span className="text-muted text-xs">{rulesOpen ? '▴' : '▾'}</span>
                        </button>
                        {rulesOpen && (
                            <div className="px-4 pb-3 text-xs text-ink-soft leading-relaxed">
                                1. Add a photo of yourself (or a willing victim).<br />
                                2. Pick who roasts you, the style, and the heat.<br />
                                3. Swipe through the burns — ❤️ saves the best ones to your Burn Book, and "5 more" deals a fresh round.<br />
                                <span className="text-muted">Photos are analyzed once and never stored on a server.</span>
                            </div>
                        )}
                    </div>

                    {/* Photo intake */}
                    {!photo ? (
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 border-l-gold rounded-xl p-4">
                            <div className="font-bold text-ink mb-0.5">Drop your face</div>
                            <div className="text-xs text-muted mb-3">We'll do the worst. Photo stays on your device.</div>
                            <div className="flex gap-2">
                                <Button variant="secondary" className="flex-1 !py-2.5 flex items-center justify-center gap-1.5 text-sm" onClick={() => fileInputRef.current?.click()}>
                                    <ImageIcon size={16} /> Upload
                                </Button>
                                <Button variant="secondary" className="flex-1 !py-2.5 flex items-center justify-center gap-1.5 text-sm" onClick={startCamera}>
                                    <Camera size={16} /> Camera
                                </Button>
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/jpg" onChange={handleFileChange} className="hidden" />
                        </div>
                    ) : (
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-3 flex items-center gap-3">
                            <img src={photo} alt="Your upload" className="w-16 h-16 rounded-lg object-cover border border-divider" />
                            <div className="flex-1 min-w-0">
                                <div className="text-sm font-semibold text-ink">Victim acquired</div>
                                <div className="text-xs text-muted truncate">Analyzed once, roasted forever.</div>
                            </div>
                            <button
                                onClick={() => { setPhoto(null); obsRef.current = null; resetForNewPhoto(); }}
                                aria-label="Remove photo"
                                className="p-2 rounded-full bg-surface-alt border border-divider text-muted hover:text-ink"
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* Persona picker */}
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">★ Who's roasting you</div>
                        <div className="grid grid-cols-2 gap-2">
                            {PERSONAS.map(p => {
                                const active = p.id === persona;
                                const disabled = kidMode && p.id !== 'hype_man';
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => { if (!disabled) { setPersona(p.id); hapticTap(); } }}
                                        disabled={disabled}
                                        className={`group text-left bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 ${p.borderL} rounded-xl py-2.5 px-3 transition-colors disabled:opacity-40
                                            ${active ? 'bg-white/[0.12] border-t-white/25 border-r-white/25 border-b-white/25' : 'hover:bg-white/[0.08]'}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-base leading-none">{p.emoji}</span>
                                            <span className={`text-sm font-bold ${active ? 'text-ink' : 'text-ink-soft'}`}>{p.label}</span>
                                        </div>
                                        <div className={`text-[11px] mt-0.5 truncate ${p.text}`}>{p.tagline}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Format picker */}
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">✍️ Style</div>
                        <div className="flex gap-1.5 flex-wrap">
                            {FORMATS.map(f => {
                                const active = f.id === format;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => { setFormat(f.id); hapticTap(); }}
                                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors
                                            ${active ? 'bg-gold text-slate-900 border-gold' : 'bg-white/5 text-ink-soft border-white/10 hover:border-white/25'}`}
                                    >
                                        {f.emoji} {f.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Spice picker */}
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">🌡 Heat</div>
                        <div className="flex gap-1.5">
                            {SPICES.map(s => {
                                const active = s.id === spice;
                                const locked = s.adult && !isAdultUnlocked();
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => selectSpice(s.id, s.adult)}
                                        disabled={kidMode && s.id !== 'mild'}
                                        className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors disabled:opacity-40
                                            ${active ? 'bg-gold text-slate-900 border-gold' : 'bg-white/5 text-ink-soft border-white/10 hover:border-white/25'}`}
                                    >
                                        {s.emoji} {s.label}{locked ? ' 🔒' : ''}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {kidMode && (
                        <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">
                            We spotted a kiddo in the photo, so tonight is strictly hype and wholesome. 💛
                        </div>
                    )}

                    <Button fullWidth className="!py-3.5 text-base flex items-center justify-center gap-2" disabled={!photo} onClick={startRoasting}>
                        <Flame size={18} /> ROAST {kidMode ? '(GENTLY)' : 'ME'}
                    </Button>

                    {burnBook.length > 0 && (
                        <button onClick={() => setBookOpen(true)} className="flex items-center justify-center gap-1.5 text-xs text-muted hover:text-ink transition-colors">
                            <Book size={14} /> Burn Book ({burnBook.length})
                        </button>
                    )}
                </div>

                {bookOpen && renderBurnBook()}
            </div>
        );
    }

    // --- DECK screen -------------------------------------------------------------------

    const activePersona = personaById(current?.persona ?? persona);

    return (
        <div className="w-full">
            <ScreenHeader title="Roast Central" onBack={() => setScreen('SETUP')} onHome={onExit} />

            <div className="flex flex-col gap-3 max-w-[380px] mx-auto w-full pb-6">
                {/* Persona switcher chips */}
                <div className="flex gap-1.5 justify-center flex-wrap">
                    {PERSONAS.map(p => {
                        const active = p.id === persona;
                        const disabled = loadingBatch || (kidMode && p.id !== 'hype_man');
                        return (
                            <button
                                key={p.id}
                                onClick={() => switchPersona(p.id)}
                                disabled={disabled}
                                title={p.label}
                                className={`w-9 h-9 rounded-full border text-base flex items-center justify-center transition-all disabled:opacity-40
                                    ${active ? 'bg-gold/20 border-gold scale-110' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
                            >
                                {p.emoji}
                            </button>
                        );
                    })}
                </div>

                {/* Poster hero — the roast, auto-framed. Tap to enlarge. */}
                <div
                    className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20"
                    style={{ boxShadow: 'var(--shadow-card)', aspectRatio: '4 / 5' }}
                    onTouchStart={onTouchStart}
                    onTouchEnd={onTouchEnd}
                >
                    {loadingBatch && cards.length === 0 ? (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                            <Sparkles className="text-gold animate-pulse" size={28} />
                            <div className="text-sm text-ink-soft animate-pulse">{LOADING_LINES[loadingLine]}</div>
                        </div>
                    ) : current ? (
                        <>
                            {posterUrl ? (
                                <button type="button" onClick={() => setLightboxOpen(true)} aria-label="Enlarge poster" className="block w-full h-full">
                                    <img src={posterUrl} alt={current.text} className="w-full h-full object-cover" />
                                </button>
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <Sparkles className="text-gold animate-pulse" size={24} />
                                </div>
                            )}

                            {/* Nav — tap zones + swipe */}
                            <button onClick={() => go(-1)} disabled={index === 0} aria-label="Previous roast"
                                className="absolute left-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/65 transition disabled:opacity-0">
                                <ChevronLeft size={20} />
                            </button>
                            <button onClick={() => go(1)} disabled={index >= cards.length - 1} aria-label="Next roast"
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-black/45 text-white flex items-center justify-center hover:bg-black/65 transition disabled:opacity-0">
                                <ChevronRight size={20} />
                            </button>

                            {/* Overlays */}
                            <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/50 text-white flex items-center gap-1">
                                {activePersona.emoji} {activePersona.label}
                            </span>
                            {current.offline && (
                                <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-white/90">classic deck</span>
                            )}
                            {posterRendering && (
                                <span className="absolute bottom-2 right-2"><Sparkles className="text-gold animate-pulse" size={16} /></span>
                            )}
                            <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-white/90">
                                {index + 1} / {cards.length}
                            </span>
                        </>
                    ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                            <div className="text-4xl">🤕</div>
                            <div className="text-sm text-ink-soft">The panel is speechless. Try another round.</div>
                        </div>
                    )}
                </div>

                {/* Frame strip + actions + more */}
                {/* Frame strip — dice re-roll + pick a specific frame */}
                {current && (
                    <div className="flex items-center gap-1.5">
                        <button onClick={reshufflePoster} title="Shuffle frame" aria-label="Shuffle frame"
                            className="w-9 h-9 shrink-0 rounded-lg border border-gold/50 bg-gold/10 text-gold flex items-center justify-center hover:bg-gold/20 transition">
                            <Dices size={16} />
                        </button>
                        <div className="flex gap-1.5 overflow-x-auto">
                            {ROAST_CARD_TEMPLATES.map(t => {
                                const active = current.template === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setCardTemplate(t.id)}
                                        title={t.label}
                                        className={`w-9 h-9 shrink-0 rounded-lg border text-base flex items-center justify-center transition-all
                                            ${active ? 'bg-gold/20 border-gold scale-105' : 'bg-white/5 border-white/10 hover:border-white/30'}`}
                                    >
                                        {t.emoji}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Actions — share the poster, save the burn, copy the text */}
                {current && (
                    <div className="relative flex items-center justify-center gap-2">
                        <button onClick={() => toggleSave(current)} aria-label="Save to Burn Book"
                            className={`p-2.5 rounded-xl border transition-colors ${isSaved(current) ? 'bg-rose-500/15 border-rose-500/60 text-rose-400' : 'bg-white/5 border-white/10 text-muted hover:text-rose-400'}`}>
                            <Heart size={18} fill={isSaved(current) ? 'currentColor' : 'none'} />
                        </button>
                        <button onClick={sharePoster} aria-label="Share poster"
                            className="flex-1 py-2.5 rounded-xl bg-gold text-slate-900 font-bold text-sm flex items-center justify-center gap-1.5">
                            <Share2 size={16} /> Share
                        </button>
                        <button onClick={() => copyText(current.text)} aria-label="Copy roast text"
                            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-ink transition-colors">
                            <Copy size={18} />
                        </button>
                        <button onClick={savePoster} aria-label="Save poster"
                            className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-muted hover:text-ink transition-colors">
                            <Download size={18} />
                        </button>
                        {copied && (
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[11px] bg-surface border border-divider text-ink rounded-full px-3 py-1 shadow">
                                Copied!
                            </div>
                        )}
                    </div>
                )}

                <Button fullWidth className="!py-3 flex items-center justify-center gap-2" disabled={loadingBatch} onClick={() => fetchBatch(persona)}>
                    {loadingBatch && cards.length > 0
                        ? <span className="animate-pulse">Cooking…</span>
                        : <><Flame size={16} /> 5 MORE</>}
                </Button>

                <div className="flex gap-2">
                    <Button variant="secondary" className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={() => setBookOpen(true)}>
                        <Book size={15} /> Burn Book{burnBook.length ? ` (${burnBook.length})` : ''}
                    </Button>
                    <Button variant="secondary" className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" disabled={recapBusy || cards.length === 0} onClick={shareRecap}>
                        <Flame size={15} /> {recapBusy ? 'Building…' : 'Recap'}
                    </Button>
                    <Button variant="secondary" className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={() => setScreen('SETUP')}>
                        <RefreshCcw size={15} /> New
                    </Button>
                </div>
            </div>

            {bookOpen && renderBurnBook()}
            {lightboxOpen && current && renderLightbox()}
        </div>
    );

    // --- Poster lightbox (enlarged view + share/save) -----------------------------------

    function renderLightbox() {
        return (
            <div
                className="fixed inset-0 z-[70] backdrop-blur-md flex items-center justify-center px-4 py-6"
                style={{ background: 'rgba(15, 30, 51, 0.92)' }}
                onClick={() => setLightboxOpen(false)}
            >
                <button
                    onClick={(e) => { e.stopPropagation(); setLightboxOpen(false); }}
                    aria-label="Close enlarged view"
                    className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 border border-white/25 text-white flex items-center justify-center hover:bg-white/20 transition"
                >
                    <X size={18} />
                </button>
                <div className="w-full max-w-sm flex flex-col gap-3 max-h-full" onClick={e => e.stopPropagation()}>
                    {posterUrl && (
                        <img src={posterUrl} alt="Roast poster" className="w-full max-h-[74vh] object-contain rounded-xl border border-white/20" />
                    )}
                    <div className="flex gap-2">
                        <Button className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={sharePoster}>
                            <Share2 size={15} /> Share
                        </Button>
                        <Button variant="secondary" className="flex-1 !py-2.5 text-sm flex items-center justify-center gap-1.5" onClick={savePoster}>
                            <Download size={15} /> Save
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // --- Burn Book bottom sheet ---------------------------------------------------------

    function renderBurnBook() {
        return (
            <div
                className="fixed inset-0 z-[60] flex items-end backdrop-blur-sm"
                style={{ background: 'rgba(15, 30, 51, 0.5)' }}
                onClick={() => setBookOpen(false)}
            >
                <div
                    className="w-full bg-surface border border-divider rounded-t-[24px] px-5 pt-3 pb-7 max-h-[78%] flex flex-col"
                    style={{ boxShadow: '0 -16px 40px rgba(15, 30, 51, 0.18)' }}
                    onClick={e => e.stopPropagation()}
                >
                    <div className="w-11 h-[5px] rounded-full bg-divider-soft mx-auto mb-3.5" />
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Book size={16} className="text-gold" />
                            <span className="font-bold text-ink tracking-wide">BURN BOOK</span>
                        </div>
                        <button onClick={() => setBookOpen(false)} aria-label="Close Burn Book" className="w-7 h-7 rounded-full bg-surface-alt border border-divider text-muted flex items-center justify-center hover:text-ink">
                            <X size={14} />
                        </button>
                    </div>
                    <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1">
                        {burnBook.length === 0 ? (
                            <div className="text-sm text-muted text-center py-8">No saved burns yet. Tap the ❤️ on a roast to keep it forever.</div>
                        ) : burnBook.map(entry => {
                            const p = personaById(entry.persona);
                            return (
                                <div key={entry.id} className="bg-white/5 border border-white/10 rounded-xl px-3 py-2.5">
                                    <div className="text-sm text-ink leading-snug">{entry.text}</div>
                                    <div className="flex items-center justify-between mt-1.5">
                                        <span className={`text-[10px] font-semibold ${p.text}`}>{p.emoji} {p.label}</span>
                                        <div className="flex items-center gap-1">
                                            <button onClick={() => shareText(entry.text)} aria-label="Share saved roast" className="p-1.5 text-muted hover:text-ink"><Share2 size={14} /></button>
                                            <button onClick={() => deleteSaved(entry.id)} aria-label="Delete saved roast" className="p-1.5 text-muted hover:text-rose-400"><Trash2 size={14} /></button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }
};
