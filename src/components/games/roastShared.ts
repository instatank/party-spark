// ---------------------------------------------------------------------------
// Roast Me v2 — shared building blocks for the roast games (Roast Central solo
// deck + Roast Battle party mode). Extracted verbatim from RoastCentralGame so
// both games speak the SAME persona/format/spice ids as the server library in
// api/_lib/roast-prompts.ts (ids must stay in sync across all three) and share
// one photo-intake + offline-fallback + poster-frame implementation.
//
// Nothing here is stateful — it's pure data + pure helpers, safe to import from
// any roast component. Accent classes are STATIC strings (Tailwind v4 JIT — no
// template literals; see CLAUDE.md).
// ---------------------------------------------------------------------------

import { ROAST_CARD_TEMPLATES, type RoastCardTemplate } from '../../services/roastCards';

// --- persona / format / spice library ---------------------------------------
// Mirrors the server-side library in api/_lib/roast-prompts.ts — ids must match.

export const PERSONAS: { id: string; label: string; emoji: string; tagline: string; text: string; borderL: string }[] = [
    { id: 'roastmaster',     label: 'The Roastmaster', emoji: '🎤', tagline: 'Comedy-club savage',      text: 'text-red-400',     borderL: 'border-l-red-500' },
    { id: 'posh_judge',      label: 'Posh Judge',      emoji: '🧐', tagline: 'Dry. Devastating.',       text: 'text-indigo-400',  borderL: 'border-l-indigo-500' },
    { id: 'grandma',         label: 'Sweet Grandma',   emoji: '🍪', tagline: 'Love with a knife in it', text: 'text-amber-400',   borderL: 'border-l-amber-500' },
    { id: 'bollywood_aunty', label: 'Bollywood Aunty', emoji: '💅', tagline: 'Society will talk',       text: 'text-pink-400',    borderL: 'border-l-pink-500' },
    { id: 'hr_rep',          label: 'Corporate HR',    emoji: '📎', tagline: 'Your vibe: under review', text: 'text-cyan-400',    borderL: 'border-l-cyan-500' },
    { id: 'hype_man',        label: 'Hype Man',        emoji: '📣', tagline: 'Zero roast. Pure gas.',   text: 'text-emerald-400', borderL: 'border-l-emerald-500' },
];

export const FORMATS: { id: string; label: string; emoji: string }[] = [
    { id: 'zinger',         label: 'Zingers',   emoji: '⚡' },
    { id: 'tabloid',        label: 'Tabloid',   emoji: '📰' },
    { id: 'yearbook',       label: 'Yearbook',  emoji: '🎓' },
    { id: 'dating_profile', label: 'Swipe',     emoji: '💘' },
    { id: 'award',          label: 'Awards',    emoji: '🏆' },
];

export const SPICES: { id: string; label: string; emoji: string; adult: boolean }[] = [
    { id: 'mild',   label: 'Mild',   emoji: '🥛', adult: false },
    { id: 'medium', label: 'Medium', emoji: '🌶️', adult: false },
    { id: 'extra',  label: 'Extra',  emoji: '🔥', adult: true },
];

export const personaById = (id: string) => PERSONAS.find(p => p.id === id) ?? PERSONAS[0];
export const formatById = (id: string) => FORMATS.find(f => f.id === id) ?? FORMATS[0];
export const spiceById = (id: string) => SPICES.find(s => s.id === id) ?? SPICES[1];

// Client-side batch cap per 2h session window (SessionManager). Text batches
// are cheap (~$0.003) but unbounded loops shouldn't be free. Battle counts each
// player's batch against the same 'ROAST_CENTRAL' bucket.
export const MAX_BATCHES_PER_SESSION = 60;
export const BATCH_SIZE = 5;

// --- poster frame picker -----------------------------------------------------

export const TEMPLATE_IDS = ROAST_CARD_TEMPLATES.map(t => t.id);

export const randomTemplate = (exclude?: RoastCardTemplate): RoastCardTemplate => {
    const pool = TEMPLATE_IDS.filter(id => id !== exclude);
    return pool[Math.floor(Math.random() * pool.length)] ?? TEMPLATE_IDS[0];
};

// --- photo utilities ---------------------------------------------------------

// Downscale + re-encode to JPEG. Caps the long edge at 1024px: cuts a phone
// photo from ~4-6MB base64 to ~150-250KB (vision cost + Vercel's 4.5MB body
// cap both care), with no visible quality loss at chat-app sizes.
export const downscaleDataUrl = (dataUrl: string, maxDim = 1024, quality = 0.85): Promise<string> =>
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

export const fileToDataUrl = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('file read failed'));
        reader.readAsDataURL(file);
    });

// Fast sampled FNV-1a over the base64 — only used as a sessionStorage cache
// key for observations, so collisions are harmless.
export const hashDataUrl = (s: string): string => {
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
export const loadFallbackDeck = (): Promise<Record<string, string[]>> =>
    (fallbackPromise ??= import('../../data/roast_central_fallback.json').then(m => m.default as Record<string, string[]>));

// --- Toon Studio (Phase 4) -----------------------------------------------------
// Style ids mirror the server's TOON_STYLES in api/_lib/handlers-image.ts —
// ids must stay in sync. `tier` here is display-only ("✨ takes longer");
// the server owns the actual model routing. `kidSafe: false` styles are hidden
// when a child was detected in the photo.

export const TOON_STYLES: { id: string; label: string; emoji: string; tagline: string; tier: 'flash' | 'pro'; kidSafe: boolean }[] = [
    { id: 'toon',         label: 'Caricature',   emoji: '✏️', tagline: 'Street-artist classic',  tier: 'flash', kidSafe: true },
    { id: 'anime',        label: 'Anime',        emoji: '🌸', tagline: '90s protagonist you',    tier: 'flash', kidSafe: true },
    { id: 'zombie',       label: 'Zombie',       emoji: '🧟', tagline: 'Undead. Still you.',     tier: 'flash', kidSafe: false },
    { id: 'retro',        label: '80s Glam',     emoji: '📼', tagline: 'Mall-portrait royalty',  tier: 'flash', kidSafe: true },
    { id: 'noir',         label: 'Film Noir',    emoji: '🕵️', tagline: 'Shadows & fedora',       tier: 'flash', kidSafe: true },
    { id: 'royal',        label: 'Royal Oil',    emoji: '👑', tagline: 'Museum-piece you',       tier: 'flash', kidSafe: true },
    { id: 'tabloid_cover', label: 'Tabloid Cover', emoji: '📰', tagline: 'Front-page scandal',   tier: 'pro',   kidSafe: false },
    { id: 'movie_poster',  label: 'Movie Poster', emoji: '🎬', tagline: 'Title & tagline in-shot', tier: 'pro', kidSafe: true },
];

// Daily caricature allowance (Phase 4 rationing — image gen is the one paid
// call users could hammer; text batches stay generous because they're ~free).
// localStorage {date, used}; a failed generation is refunded so an API outage
// never eats the day's allowance.
export const DAILY_TOON_LIMIT = 3;
const TOON_KEY = 'roast_central_toons';

const toonDayKey = (): string => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const readToonState = (): { date: string; used: number } => {
    try {
        const raw = JSON.parse(localStorage.getItem(TOON_KEY) || 'null') as { date: string; used: number } | null;
        if (raw && raw.date === toonDayKey() && typeof raw.used === 'number') return raw;
    } catch { /* corrupt/blocked — treat as fresh */ }
    return { date: toonDayKey(), used: 0 };
};

const writeToonState = (used: number): void => {
    try { localStorage.setItem(TOON_KEY, JSON.stringify({ date: toonDayKey(), used: Math.max(0, used) })); } catch { /* ignore */ }
};

export const toonsLeftToday = (): number => Math.max(0, DAILY_TOON_LIMIT - readToonState().used);
export const spendToon = (): void => writeToonState(readToonState().used + 1);
export const refundToon = (): void => writeToonState(readToonState().used - 1);
