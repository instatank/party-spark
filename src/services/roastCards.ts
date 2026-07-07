// ---------------------------------------------------------------------------
// Roast Central share cards (Roast Me v2 Phase 2) — the "templated visuals"
// tier: the player's REAL photo + an AI roast composited into designed frames
// on a canvas. Zero AI cost, instant, fully offline; composes the primitives
// exported by shareCard.ts (dimensions, fonts, roundRect, wrapLines, the
// share/download plumbing).
//
// Five templates: WANTED poster, tabloid front page, yearbook page, trading
// card (with observation-seeded stat bars), certificate of roast. The session
// recap card reuses renderShareCard/shareResultCard directly from the game.
// ---------------------------------------------------------------------------

import {
    CARD_W as W,
    CARD_H as H,
    SERIF,
    SANS,
    roundRect,
    wrapLines,
    hexToRgba,
} from './shareCard';
import type { RoastObservations } from './geminiService';

export type RoastCardTemplate = 'wanted' | 'tabloid' | 'yearbook' | 'trading' | 'certificate';

export interface RoastCardInput {
    template: RoastCardTemplate;
    photo: string;               // dataURL of the (already downscaled) photo
    roast: string;
    personaLabel: string;
    personaEmoji: string;
    observations?: RoastObservations | null; // seeds the trading-card stats
}

// Picker metadata for the template sheet in RoastCentralGame.
export const ROAST_CARD_TEMPLATES: { id: RoastCardTemplate; label: string; emoji: string; tagline: string }[] = [
    { id: 'wanted',      label: 'WANTED Poster',  emoji: '🤠', tagline: 'Old-west outlaw energy' },
    { id: 'tabloid',     label: 'Front Page',     emoji: '📰', tagline: 'Breaking: you' },
    { id: 'yearbook',    label: 'Yearbook',       emoji: '🎓', tagline: 'Class of never-lived-it-down' },
    { id: 'trading',     label: 'Trading Card',   emoji: '🃏', tagline: 'Legendary. Allegedly.' },
    { id: 'certificate', label: 'Certificate',    emoji: '📜', tagline: 'Officially roasted' },
];

const CURSIVE = "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', cursive";

const loadImage = (src: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('photo decode failed'));
        img.src = src;
    });

// Cover-fit crop with a slight upward bias (faces live in the upper part of
// most photos).
const drawPhotoCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number): void => {
    const scale = Math.max(w / img.width, h / img.height);
    const sw = w / scale;
    const sh = h / scale;
    const sx = (img.width - sw) / 2;
    const sy = (img.height - sh) * 0.35;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

// Deterministic 0-99 from (seed, salt) — same photo/roast always gets the
// same trading-card stats, which makes them feel "measured", not random.
const seededStat = (seed: string, salt: string, min = 0, max = 99): number => {
    let hsh = 2166136261;
    const s = salt + seed;
    const step = Math.max(1, Math.floor(s.length / 512));
    for (let i = 0; i < s.length; i += step) {
        hsh ^= s.charCodeAt(i);
        hsh = Math.imul(hsh, 16777619);
    }
    return min + ((hsh >>> 0) % (max - min + 1));
};

const setLetterSpacing = (ctx: CanvasRenderingContext2D, px: number): void => {
    // Supported in all modern engines; harmless no-op elsewhere.
    try { ctx.letterSpacing = `${px}px`; } catch { /* older engine */ }
};

const todayLine = (): string => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const d = new Date();
    return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
};

// =============================================================================
// WANTED poster — parchment, sepia mugshot, charges, bounty
// =============================================================================

const drawWanted = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, input: RoastCardInput): void => {
    // Parchment ground + edge vignette
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#EBDCAF');
    bg.addColorStop(1, '#D9BE85');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const vig = ctx.createRadialGradient(W / 2, H / 2, H / 3, W / 2, H / 2, H * 0.78);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(84, 52, 12, 0.35)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Double border + corner rivets
    ctx.strokeStyle = '#4A2F14';
    ctx.lineWidth = 14;
    ctx.strokeRect(36, 36, W - 72, H - 72);
    ctx.lineWidth = 4;
    ctx.strokeRect(62, 62, W - 124, H - 124);
    ctx.fillStyle = '#4A2F14';
    for (const [cx, cy] of [[86, 86], [W - 86, 86], [86, H - 86], [W - 86, H - 86]] as const) {
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#3E2810';
    setLetterSpacing(ctx, 14);
    ctx.font = `bold 168px ${SERIF}`;
    ctx.fillText('WANTED', W / 2, 268);
    setLetterSpacing(ctx, 8);
    ctx.fillStyle = '#6B4A22';
    ctx.font = `bold 32px ${SANS}`;
    ctx.fillText('DEAD TIRED OR ALIVE', W / 2, 330);
    setLetterSpacing(ctx, 0);

    // Sepia mugshot in a heavy frame (photo overdrawn 2px so no source-edge
    // sliver peeks inside the frame)
    const pw = 560;
    const px = (W - pw) / 2;
    const py = 386;
    ctx.fillStyle = '#3E2810';
    ctx.fillRect(px - 16, py - 16, pw + 32, pw + 32);
    try { ctx.filter = 'sepia(0.75) contrast(1.05) brightness(0.98)'; } catch { /* older engine */ }
    drawPhotoCover(ctx, img, px - 2, py - 2, pw + 4, pw + 4);
    try { ctx.filter = 'none'; } catch { /* older engine */ }
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = 'rgba(196, 154, 86, 0.28)';
    ctx.fillRect(px, py, pw, pw);
    ctx.globalCompositeOperation = 'source-over';

    // Charges
    let y = py + pw + 64;
    ctx.fillStyle = '#6B4A22';
    setLetterSpacing(ctx, 6);
    ctx.font = `bold 30px ${SANS}`;
    ctx.fillText('FOR THE FOLLOWING OFFENSES', W / 2, y);
    setLetterSpacing(ctx, 0);
    y += 56;
    ctx.fillStyle = '#3E2810';
    ctx.font = `italic 42px ${SERIF}`;
    for (const line of wrapLines(ctx, input.roast, W - 240, 3)) {
        ctx.fillText(line, W / 2, y);
        y += 52;
    }

    // Bounty + brand (fixed slots, clear of a 3-line roast above and the
    // inner border below)
    const bounty = seededStat(input.roast, 'bounty', 2, 9);
    ctx.fillStyle = '#7A1F12';
    ctx.font = `bold 46px ${SERIF}`;
    ctx.fillText(`REWARD: ${bounty},00,000 SPARKS`, W / 2, H - 118);
    ctx.fillStyle = '#6B4A22';
    ctx.font = `600 25px ${SANS}`;
    ctx.fillText(`issued by ${input.personaLabel} · Roast Central × PartySpark`, W / 2, H - 74);
};

// =============================================================================
// Tabloid front page — masthead, screaming headline, exclusive pics
// =============================================================================

const drawTabloid = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, input: RoastCardInput): void => {
    ctx.fillStyle = '#F6F4EF';
    ctx.fillRect(0, 0, W, H);

    // Masthead
    ctx.fillStyle = '#C21F1F';
    ctx.fillRect(0, 0, W, 152);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 84px ${SERIF}`;
    ctx.fillText('THE DAILY ROAST', W / 2, 106);
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 152, W, 6);
    ctx.fillStyle = '#444444';
    ctx.font = `600 26px ${SANS}`;
    ctx.fillText(`PRICE: YOUR DIGNITY   ·   ${todayLine().toUpperCase()}   ·   SOURCES: TRUST US`, W / 2, 204);

    // Headline — the roast itself, tabloid-sized
    const headline = input.roast.toUpperCase();
    const big = headline.length <= 70;
    const size = big ? 84 : 66;
    ctx.fillStyle = '#111111';
    ctx.font = `900 ${size}px ${SANS}`;
    const lines = wrapLines(ctx, headline, W - 130, big ? 4 : 5);
    let y = 300;
    for (const line of lines) {
        ctx.fillText(line, W / 2, y);
        y += size * 1.06;
    }
    y += 12;

    // Photo with caption bar
    const ph = Math.max(320, Math.min(640, H - 120 - y));
    const pw2 = W - 160;
    const px = 80;
    ctx.fillStyle = '#111111';
    ctx.fillRect(px - 6, y - 6, pw2 + 12, ph + 12);
    drawPhotoCover(ctx, img, px, y, pw2, ph);
    ctx.fillStyle = '#111111';
    ctx.fillRect(px, y + ph - 56, pw2, 56);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold 28px ${SANS}`;
    ctx.fillText(`EXCLUSIVE PICS — ${input.personaLabel.toUpperCase()} TELLS ALL`, W / 2, y + ph - 17);

    // "100% TRUE*" sticker
    ctx.save();
    ctx.translate(W - 185, y + 40);
    ctx.rotate(-0.21);
    ctx.beginPath();
    ctx.arc(0, 0, 106, 0, Math.PI * 2);
    ctx.fillStyle = '#F7D032';
    ctx.fill();
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#111111';
    ctx.stroke();
    ctx.fillStyle = '#111111';
    ctx.font = `900 40px ${SANS}`;
    ctx.fillText('100%', 0, -6);
    ctx.fillText('TRUE*', 0, 40);
    ctx.restore();

    ctx.fillStyle = '#777777';
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText('*absolutely none of this is true · Roast Central × PartySpark', W / 2, H - 40);
};

// =============================================================================
// Yearbook page — oval portrait, quote, scribbled signatures
// =============================================================================

const drawYearbook = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, input: RoastCardInput): void => {
    ctx.fillStyle = '#F5EFDF';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#1F2A44';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.lineWidth = 2;
    ctx.strokeRect(52, 52, W - 104, H - 104);

    ctx.textAlign = 'center';
    ctx.fillStyle = '#1F2A44';
    ctx.font = `bold 56px ${SERIF}`;
    ctx.fillText('PARTYSPARK HIGH', W / 2, 138);
    ctx.fillStyle = '#7A6C4F';
    setLetterSpacing(ctx, 6);
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText('CLASS OF 2026 · MOST MEMORABLE', W / 2, 188);
    setLetterSpacing(ctx, 0);

    // Oval portrait with gold ring
    const cx = W / 2;
    const cy = 560;
    const rx = 292;
    const ry = 340;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.clip();
    drawPhotoCover(ctx, img, cx - rx, cy - ry, rx * 2, ry * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#B8922F';
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx + 14, ry + 14, 0, 0, Math.PI * 2);
    ctx.strokeStyle = '#1F2A44';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Quote
    let y = 1010;
    ctx.fillStyle = '#B8922F';
    ctx.font = `bold 80px ${SERIF}`;
    ctx.fillText('“', W / 2 - 380, y - 4);
    ctx.fillStyle = '#33302A';
    ctx.font = `italic 42px ${SERIF}`;
    for (const line of wrapLines(ctx, input.roast, W - 300, 3)) {
        ctx.fillText(line, W / 2, y);
        y += 56;
    }
    ctx.fillStyle = '#7A6C4F';
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(`— ${input.personaLabel}, Yearbook Committee`, W / 2, y + 16);

    // Signature scribbles
    const scribble = (text: string, x: number, sy: number, rot: number, color: string) => {
        ctx.save();
        ctx.translate(x, sy);
        ctx.rotate(rot);
        ctx.fillStyle = color;
        ctx.font = `44px ${CURSIVE}`;
        ctx.fillText(text, 0, 0);
        ctx.restore();
    };
    scribble('never change lol', 260, H - 144, -0.10, '#3E5BA9');
    scribble('so brave xoxo', W / 2 + 40, H - 112, 0.06, '#7A1F52');
    scribble('HAGS 💀', W - 240, H - 132, 0.12, '#1F6B3A');

    ctx.fillStyle = '#7A6C4F';
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText('Roast Central × PartySpark', W / 2, H - 64);
};

// =============================================================================
// Trading card — holo-navy frame, stat bars seeded from the observations
// =============================================================================

const drawTrading = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, input: RoastCardInput): void => {
    const gold = '#F2B544';
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0D1526');
    bg.addColorStop(1, '#0A101D');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W - 160, 140, 40, W - 160, 140, 700);
    glow.addColorStop(0, hexToRgba(gold, 0.22));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Card frame
    ctx.strokeStyle = gold;
    ctx.lineWidth = 10;
    roundRect(ctx, 40, 40, W - 80, H - 80, 36);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    roundRect(ctx, 54, 54, W - 108, H - 108, 28);
    ctx.fill();

    // Top bar
    ctx.textAlign = 'left';
    ctx.fillStyle = gold;
    setLetterSpacing(ctx, 4);
    ctx.font = `bold 34px ${SANS}`;
    ctx.fillText('ROAST CENTRAL', 96, 134);
    ctx.textAlign = 'right';
    ctx.fillText('★ LEGENDARY', W - 96, 134);
    setLetterSpacing(ctx, 0);

    // Photo window
    ctx.save();
    roundRect(ctx, 96, 172, W - 192, 470, 22);
    ctx.clip();
    drawPhotoCover(ctx, img, 94, 170, W - 188, 474);
    ctx.restore();
    ctx.strokeStyle = hexToRgba(gold, 0.7);
    ctx.lineWidth = 4;
    roundRect(ctx, 96, 172, W - 192, 470, 22);
    ctx.stroke();

    // Nameplate
    ctx.textAlign = 'center';
    ctx.fillStyle = '#E8EEF9';
    ctx.font = `bold 62px ${SERIF}`;
    ctx.fillText('THE SPECIMEN', W / 2, 730);
    ctx.fillStyle = '#8FA0B8';
    ctx.font = `500 30px ${SANS}`;
    ctx.fillText(`${input.personaEmoji} certified by ${input.personaLabel} · ${todayLine()}`, W / 2, 778);

    // Stat bars (deterministic per photo/roast — Humility is always tragic)
    const seed = input.observations ? JSON.stringify(input.observations) : input.roast;
    const stats: [string, number][] = [
        ['DRIP', seededStat(seed, 'drip', 15, 98)],
        ['RIZZ', seededStat(seed, 'rizz', 8, 96)],
        ['CHAOS', seededStat(seed, 'chaos', 35, 99)],
        ['MAIN CHARACTER', seededStat(seed, 'mc', 40, 99)],
        ['AUDACITY', seededStat(seed, 'audacity', 55, 99)],
        ['HUMILITY', seededStat(seed, 'humility', 3, 19)],
    ];
    let y = 836;
    for (const [label, val] of stats) {
        ctx.textAlign = 'left';
        ctx.fillStyle = '#B7C4D8';
        ctx.font = `bold 28px ${SANS}`;
        ctx.fillText(label, 110, y + 22);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        roundRect(ctx, 470, y, 400, 26, 13);
        ctx.fill();
        const barGrad = ctx.createLinearGradient(470, 0, 870, 0);
        barGrad.addColorStop(0, gold);
        barGrad.addColorStop(1, '#E15B5B');
        ctx.fillStyle = barGrad;
        roundRect(ctx, 470, y, Math.max(26, 400 * (val / 100)), 26, 13);
        ctx.fill();
        ctx.textAlign = 'right';
        ctx.fillStyle = gold;
        ctx.font = `bold 30px ${SANS}`;
        ctx.fillText(String(val), W - 110, y + 24);
        y += 58;
    }

    // Flavor text — kept clear of the bottom accent bar
    ctx.textAlign = 'center';
    ctx.fillStyle = '#8FA0B8';
    ctx.font = `italic 30px ${SERIF}`;
    let fy = y + 36;
    for (const line of wrapLines(ctx, `“${input.roast}”`, W - 220, 2)) {
        ctx.fillText(line, W / 2, fy);
        fy += 40;
    }

    ctx.fillStyle = gold;
    ctx.fillRect(0, H - 14, W, 14);
};

// =============================================================================
// Certificate of Roast — ivory, gold seal, official citation
// =============================================================================

const drawCertificate = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, input: RoastCardInput): void => {
    ctx.fillStyle = '#F8F3E6';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#B8922F';
    ctx.lineWidth = 10;
    ctx.strokeRect(34, 34, W - 68, H - 68);
    ctx.lineWidth = 3;
    ctx.strokeRect(58, 58, W - 116, H - 116);
    // Corner diamonds
    ctx.fillStyle = '#B8922F';
    for (const [cx, cy] of [[58, 58], [W - 58, 58], [58, H - 58], [W - 58, H - 58]] as const) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.fillRect(-13, -13, 26, 26);
        ctx.restore();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#3A2E1A';
    ctx.font = `bold 78px ${SERIF}`;
    ctx.fillText('Certificate of Roast', W / 2, 178);
    ctx.strokeStyle = '#B8922F';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 260, 210);
    ctx.lineTo(W / 2 + 260, 210);
    ctx.stroke();

    ctx.fillStyle = '#6B5D3F';
    ctx.font = `500 30px ${SANS}`;
    ctx.fillText('This certifies that the subject of the attached photograph', W / 2, 268);

    // Round portrait
    const cx = W / 2;
    const cy = 470;
    const r = 175;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    drawPhotoCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = '#B8922F';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = '#6B5D3F';
    ctx.font = `500 30px ${SANS}`;
    ctx.fillText(`has been officially and irreversibly roasted by ${input.personaLabel},`, W / 2, 712);
    ctx.fillText('with the full authority of the Panel, as follows:', W / 2, 756);

    // Citation
    let y = 836;
    ctx.fillStyle = '#3A2E1A';
    ctx.font = `italic 44px ${SERIF}`;
    for (const line of wrapLines(ctx, `“${input.roast}”`, W - 260, 3)) {
        ctx.fillText(line, W / 2, y);
        y += 58;
    }

    // Signature row — date top-left, seal below it, signature right
    const rowY = 1064;
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6B5D3F';
    ctx.font = `500 28px ${SANS}`;
    ctx.fillText(`Dated: ${todayLine()}`, 120, rowY);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#3A2E1A';
    ctx.font = `52px ${CURSIVE}`;
    ctx.fillText('The Roastmaster General', W - 110, rowY - 6);
    ctx.strokeStyle = '#6B5D3F';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W - 470, rowY + 14);
    ctx.lineTo(W - 110, rowY + 14);
    ctx.stroke();
    ctx.fillStyle = '#6B5D3F';
    ctx.font = `500 24px ${SANS}`;
    ctx.fillText('Roast Central', W - 110, rowY + 48);

    // Gold rosette seal
    const sx = 235;
    const sy = 1188;
    ctx.fillStyle = '#C9A227';
    for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        ctx.beginPath();
        ctx.arc(sx + Math.cos(a) * 62, sy + Math.sin(a) * 62, 22, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, 66, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sx, sy, 52, 0, Math.PI * 2);
    ctx.strokeStyle = '#8F6E14';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = '#5C4708';
    ctx.font = `bold 22px ${SANS}`;
    ctx.fillText('OFFICIAL', sx, sy - 2);
    ctx.font = `bold 26px ${SANS}`;
    ctx.fillText('🔥', sx, sy + 30);

    ctx.fillStyle = '#6B5D3F';
    ctx.font = `600 22px ${SANS}`;
    ctx.fillText('Roast Central × PartySpark', W / 2, H - 48);
};

// =============================================================================
// Facade
// =============================================================================

// Synchronous draw from an already-decoded image. The game pre-decodes the
// photo once and calls this per card/template so swiping doesn't re-decode or
// await — the whole draw is a few ms.
export function renderRoastCardWithImage(img: HTMLImageElement, input: RoastCardInput): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    switch (input.template) {
        case 'wanted':      drawWanted(ctx, img, input); break;
        case 'tabloid':     drawTabloid(ctx, img, input); break;
        case 'yearbook':    drawYearbook(ctx, img, input); break;
        case 'trading':     drawTrading(ctx, img, input); break;
        case 'certificate': drawCertificate(ctx, img, input); break;
    }
    return canvas;
}

// Convenience wrapper that decodes the photo first (for one-off renders).
export async function renderRoastCard(input: RoastCardInput): Promise<HTMLCanvasElement> {
    const img = await loadImage(input.photo);
    return renderRoastCardWithImage(img, input);
}
