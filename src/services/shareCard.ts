// ---------------------------------------------------------------------------
// Shareable result cards — the "reveal artifact" for every scored game.
// Renders an end-of-game result to a canvas in PartySpark's visual identity
// (navy ground, gold brand, per-game accent) and shares it as an image via
// navigator.share, falling back to a download. Mirrors the pattern proven in
// roast/RoastResult.tsx. Fully offline: canvas + Web APIs only.
//
// Usage from a game's end screen:
//   const outcome = await shareResultCard({
//     gameTitle: '5 ALIVE', accent: '#10B981', emoji: '🏆',
//     heading: 'Priya wins!', sub: 'Easy · 5 rounds',
//     tagline: 'Name 5 in 5 seconds — beat the bell',
//     context: 'Points = answers beaten out of the bell',
//     challenge: 'Think your crew can beat this?',
//     rows: scores.map((s, i) => ({ label: s.name, value: `${s.total} pts`, highlight: i === 0 })),
//   });
// ---------------------------------------------------------------------------

export interface ShareRow {
    label: string;
    value: string;
    highlight?: boolean;
}

export interface ShareCardData {
    gameTitle: string;     // pill text, uppercased when drawn (e.g. "5 Alive")
    accent: string;        // game accent hex, e.g. '#10B981'
    heading: string;       // the big line: "Priya wins!" / "84 points"
    sub?: string;          // context line: "Easy · 5 rounds · Jul 3"
    tagline?: string;      // one-line "what this game is" under the pill
    context?: string;      // what the numbers mean ("3 pts = topped a game")
    challenge?: string;    // CTA band line; defaults to "Think you can beat this?"
    rows?: ShareRow[];     // leaderboard rows (first 7 drawn)
    plainRows?: boolean;   // rows are stats, not ranks — no medals/crown
    emoji?: string;        // hero emoji above the heading
    footer?: string;       // defaults to the brand tagline
}

export type ShareOutcome = 'shared' | 'downloaded' | 'aborted' | 'failed';

const W = 1080;
const H = 1350;

const SERIF = "Georgia, 'Playfair Display', 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const GOLD = '#F2B544';
const INK = '#E8EEF9';
const MUTED = '#8FA0B8';
const FAINT = '#5D6C84';

// Where the reader can play. Resolved at share time from the running app so
// dev/preview/prod cards each point at themselves — nothing hardcoded.
const appUrl = (): string => {
    try {
        const { origin, hostname } = window.location;
        return hostname ? origin : '';
    } catch {
        return '';
    }
};
const appHost = (): string => appUrl().replace(/^https?:\/\//, '');

const hexToRgba = (hex: string, alpha: number): string => {
    const h = hex.replace('#', '');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// Deterministic PRNG so a game's card always scatters its confetti the same
// way (a re-share shouldn't produce a visibly different card).
function seededRandom(seed: string): () => number {
    let h = 0x811c9dc5;
    for (let i = 0; i < seed.length; i++) {
        h ^= seed.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 15), h | 1);
        h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
        return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
    };
}

// Wrap `text` to at most `maxLines` lines of width `maxWidth`; the last line
// gets an ellipsis if it overflows.
function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        const probe = line ? `${line} ${word}` : word;
        if (ctx.measureText(probe).width <= maxWidth || !line) {
            line = probe;
        } else {
            lines.push(line);
            line = word;
            if (lines.length === maxLines - 1) break;
        }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) lines.length = maxLines;
    // Ellipsize the final line if the source text didn't fully fit.
    const joined = lines.join(' ');
    if (joined.length < text.trim().length && lines.length > 0) {
        let last = lines[lines.length - 1];
        while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) {
            last = last.slice(0, -1);
        }
        lines[lines.length - 1] = `${last}…`;
    }
    return lines;
}

// Fit a single line into maxWidth by shaving the font size (min 60% of start).
function fitLine(ctx: CanvasRenderingContext2D, text: string, weightAndFamily: (size: number) => string, startSize: number, maxWidth: number): number {
    let size = startSize;
    ctx.font = weightAndFamily(size);
    while (size > startSize * 0.6 && ctx.measureText(text).width > maxWidth) {
        size -= 2;
        ctx.font = weightAndFamily(size);
    }
    return size;
}

export function renderShareCard(data: ShareCardData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const accent = data.accent || GOLD;

    // --- Ground: navy vertical gradient + accent glows -----------------------
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0D1526');
    bg.addColorStop(1, '#0A101D');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const glow = ctx.createRadialGradient(W - 140, 100, 40, W - 140, 100, 620);
    glow.addColorStop(0, hexToRgba(accent, 0.22));
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    const glow2 = ctx.createRadialGradient(80, H - 120, 30, 80, H - 120, 480);
    glow2.addColorStop(0, 'rgba(242, 181, 68, 0.10)');
    glow2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow2;
    ctx.fillRect(0, 0, W, H);

    // --- Confetti: sparse, deterministic, kept out of the content column ----
    const rnd = seededRandom(data.gameTitle + accent);
    const confettiColors = [accent, GOLD, '#8FA0B8'];
    for (let i = 0; i < 34; i++) {
        const x = rnd() * W;
        const y = rnd() * H;
        // Only decorate the margins and the top/bottom bands so text stays clean.
        const inMargin = x < 170 || x > W - 170 || y < 260 || y > H - 300;
        if (!inMargin) continue;
        const size = 5 + rnd() * 9;
        const color = confettiColors[Math.floor(rnd() * confettiColors.length)];
        ctx.save();
        ctx.globalAlpha = 0.06 + rnd() * 0.1;
        ctx.fillStyle = color;
        if (rnd() > 0.5) {
            ctx.beginPath();
            ctx.arc(x, y, size / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.translate(x, y);
            ctx.rotate(rnd() * Math.PI);
            ctx.fillRect(-size / 2, -size / 3, size, size / 1.5);
        }
        ctx.restore();
    }

    // --- Ticket frame + accent baseline bar ----------------------------------
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    roundRect(ctx, 26, 26, W - 52, H - 52, 34);
    ctx.stroke();

    ctx.fillStyle = accent;
    ctx.fillRect(0, H - 12, W, 12);

    // --- Brand ---------------------------------------------------------------
    ctx.textAlign = 'center';
    ctx.fillStyle = GOLD;
    ctx.font = `bold 62px ${SERIF}`;
    ctx.fillText('PartySpark ✨', W / 2, 118);
    ctx.fillStyle = MUTED;
    ctx.font = `600 28px ${SANS}`;
    const brandSub = 'A L W A Y S   I N V I T E D';
    ctx.fillText(brandSub, W / 2, 166);
    // Thin gold rules flanking the brand subtitle.
    const subW = ctx.measureText(brandSub).width;
    ctx.fillStyle = 'rgba(242, 181, 68, 0.35)';
    ctx.fillRect(W / 2 - subW / 2 - 130, 156, 92, 2);
    ctx.fillRect(W / 2 + subW / 2 + 38, 156, 92, 2);

    // --- Game pill -------------------------------------------------------------
    const pillText = data.gameTitle.toUpperCase();
    ctx.font = `bold 34px ${SANS}`;
    const pillW = ctx.measureText(pillText).width + 76;
    const pillX = (W - pillW) / 2;
    const pillY = 216;
    const pillFill = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
    pillFill.addColorStop(0, hexToRgba(accent, 0.24));
    pillFill.addColorStop(1, hexToRgba(accent, 0.1));
    ctx.fillStyle = pillFill;
    roundRect(ctx, pillX, pillY, pillW, 64, 32);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.6);
    ctx.lineWidth = 3;
    roundRect(ctx, pillX, pillY, pillW, 64, 32);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillText(pillText, W / 2, pillY + 45);

    // --- "What is this game" tagline ------------------------------------------
    if (data.tagline) {
        ctx.fillStyle = MUTED;
        ctx.font = `italic 500 31px ${SANS}`;
        ctx.fillText(wrapLines(ctx, data.tagline, W - 200, 1)[0] ?? '', W / 2, pillY + 112);
    }

    // --- Hero: glowing emoji + heading + sub -----------------------------------
    // The hero shrinks as the leaderboard grows (and disappears at 6+ rows)
    // so the rows never get squeezed into the bottom fixtures.
    const rowCount = Math.min(data.rows?.length ?? 0, 7);
    const compactHero = rowCount >= 4;
    const showEmoji = !!data.emoji && rowCount < 6;
    let y = data.tagline ? 392 : 356;
    // No leaderboard → the hero owns the middle of the card. Nudge it down
    // so the whitespace splits evenly instead of pooling above the CTA.
    if (rowCount === 0) y += 96;
    if (showEmoji && data.emoji) {
        const discR = compactHero ? 118 : 150;
        const ringR = compactHero ? 84 : 108;
        const emojiPx = compactHero ? 100 : 130;
        const cy = y + (compactHero ? 50 : 62);
        const disc = ctx.createRadialGradient(W / 2, cy, 20, W / 2, cy, discR);
        disc.addColorStop(0, hexToRgba(accent, 0.28));
        disc.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = disc;
        ctx.beginPath();
        ctx.arc(W / 2, cy, discR, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(accent, 0.3);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(W / 2, cy, ringR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = `${emojiPx}px ${SANS}`;
        ctx.fillText(data.emoji, W / 2, cy + Math.round(emojiPx * 0.36));
        y = cy + (compactHero ? 136 : 172);
    } else {
        y += 44;
    }

    ctx.fillStyle = INK;
    // Long headings step down a size and gain a line rather than ellipsizing —
    // a truncated punchline kills the joke.
    const big = data.heading.length <= 30;
    const headPx = big ? (compactHero ? 72 : 82) : 64;
    ctx.font = `bold ${headPx}px ${SERIF}`;
    const headingLines = wrapLines(ctx, data.heading, W - 160, big ? 2 : 3);
    for (const line of headingLines) {
        ctx.fillText(line, W / 2, y);
        y += Math.round(headPx * 1.17);
    }
    // Short accent flourish under the heading.
    ctx.fillStyle = hexToRgba(accent, 0.85);
    roundRect(ctx, W / 2 - 46, y - 58, 92, 7, 4);
    ctx.fill();
    y += 4;

    if (data.sub) {
        ctx.fillStyle = MUTED;
        ctx.font = `500 ${compactHero ? 36 : 40}px ${SANS}`;
        ctx.fillText(data.sub, W / 2, y + 14);
        y += compactHero ? 62 : 74;
    }

    // --- Bottom fixtures (drawn later, but their space is reserved now) --------
    const bandH = 136;
    const bandY = H - 90 - bandH;                       // CTA band
    const contextY = bandY - 30;                        // context line baseline
    const rowsBottom = data.context ? contextY - 44 : bandY - 36;

    // --- Leaderboard rows -------------------------------------------------------
    let rows = (data.rows || []).slice(0, 7);
    if (rows.length > 0) {
        y += compactHero ? 16 : 26;
        const rowX = 90;
        const rowW = W - 180;
        const rg = rows.length >= 5 ? 12 : 16;
        // Fit rows into whatever vertical space is left above the bottom
        // fixtures. Rows shrink to a floor of 48px (fonts scale with them);
        // anything that still can't fit is summarized as "+N more".
        const totalRows = data.rows?.length ?? 0;
        const available = rowsBottom - y;
        const MIN_RH = 48;
        if (rows.length * MIN_RH + (rows.length - 1) * rg > available) {
            const fit = Math.max(1, Math.floor((available - 44 + rg) / (MIN_RH + rg)));
            if (fit < rows.length) rows = rows.slice(0, fit);
        }
        const dropped = totalRows - rows.length;
        const usable = dropped > 0 ? available - 44 : available;
        const rh = Math.min(92, (usable - (rows.length - 1) * rg) / rows.length);
        const small = rh < 64;
        const medal = ['#F5C242', '#C6CEDB', '#CD9A6B']; // gold / silver / bronze

        rows.forEach((row, i) => {
            const ry = y + i * (rh + rg);
            const rowFill = ctx.createLinearGradient(rowX, ry, rowX + rowW, ry);
            if (row.highlight) {
                rowFill.addColorStop(0, hexToRgba(accent, 0.2));
                rowFill.addColorStop(1, hexToRgba(accent, 0.07));
            } else {
                rowFill.addColorStop(0, 'rgba(255,255,255,0.06)');
                rowFill.addColorStop(1, 'rgba(255,255,255,0.03)');
            }
            ctx.fillStyle = rowFill;
            roundRect(ctx, rowX, ry, rowW, rh, 20);
            ctx.fill();
            ctx.strokeStyle = row.highlight ? hexToRgba(accent, 0.8) : 'rgba(255,255,255,0.10)';
            ctx.lineWidth = row.highlight ? 4 : 2;
            roundRect(ctx, rowX, ry, rowW, rh, 20);
            ctx.stroke();

            if (!data.plainRows) {
                // Rank chip — medal tints for the podium, neutral below it.
                const chipC = i < 3 ? medal[i] : '#5D6C84';
                const chipR = Math.min(small ? 20 : 25, rh / 2 - 8);
                const chipX = rowX + (small ? 44 : 52);
                const chipY = ry + rh / 2;
                ctx.fillStyle = hexToRgba(chipC, i < 3 ? 0.2 : 0.12);
                ctx.beginPath();
                ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
                ctx.fill();
                ctx.strokeStyle = hexToRgba(chipC, i < 3 ? 0.75 : 0.35);
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.arc(chipX, chipY, chipR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = i < 3 ? chipC : MUTED;
                ctx.font = `bold ${small ? 26 : 32}px ${SANS}`;
                ctx.fillText(String(i + 1), chipX, chipY + (small ? 9 : 11));
            }

            const namePx = small ? 34 : 42;
            const midY = ry + rh / 2 + Math.round(namePx / 3);
            ctx.textAlign = 'left';
            ctx.fillStyle = INK;
            ctx.font = `600 ${namePx}px ${SANS}`;
            let label = row.label;
            while (label.length > 1 && ctx.measureText(label).width > rowW - 400) label = label.slice(0, -1);
            ctx.fillText(label === row.label ? label : `${label}…`, rowX + (data.plainRows ? 44 : (small ? 84 : 100)), midY);
            ctx.textAlign = 'right';
            ctx.fillStyle = row.highlight ? accent : '#B7C4D8';
            ctx.font = `bold ${namePx}px ${SANS}`;
            ctx.fillText((row.highlight && !data.plainRows ? '👑 ' : '') + row.value, rowX + rowW - 36, midY);
            ctx.textAlign = 'center';
        });

        // Anyone who didn't make the cut still gets counted.
        if (dropped > 0) {
            ctx.fillStyle = FAINT;
            ctx.font = `600 26px ${SANS}`;
            ctx.fillText(`+ ${dropped} more player${dropped === 1 ? '' : 's'}`, W / 2, y + rows.length * (rh + rg) + 4);
        }
    }

    // --- "What the points mean" context line -----------------------------------
    if (data.context) {
        ctx.fillStyle = FAINT;
        const size = fitLine(ctx, data.context, s => `italic 500 ${s}px ${SANS}`, 28, W - 200);
        ctx.font = `italic 500 ${size}px ${SANS}`;
        ctx.fillText(data.context, W / 2, contextY);
    }

    // --- Challenge CTA band -------------------------------------------------------
    const bandX = 90;
    const bandW = W - 180;
    const bandFill = ctx.createLinearGradient(bandX, bandY, bandX + bandW, bandY);
    bandFill.addColorStop(0, hexToRgba(accent, 0.16));
    bandFill.addColorStop(0.5, 'rgba(242, 181, 68, 0.10)');
    bandFill.addColorStop(1, hexToRgba(accent, 0.16));
    ctx.fillStyle = bandFill;
    roundRect(ctx, bandX, bandY, bandW, bandH, 26);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.45);
    ctx.lineWidth = 2.5;
    roundRect(ctx, bandX, bandY, bandW, bandH, 26);
    ctx.stroke();

    const challenge = `⚡ ${data.challenge || 'Think you can beat this?'}`;
    ctx.fillStyle = INK;
    const chSize = fitLine(ctx, challenge, s => `bold ${s}px ${SANS}`, 42, bandW - 80);
    ctx.font = `bold ${chSize}px ${SANS}`;
    ctx.fillText(challenge, W / 2, bandY + 58);
    const host = appHost();
    ctx.fillStyle = GOLD;
    ctx.font = `bold 33px ${SANS}`;
    ctx.fillText(host ? `Play free  →  ${host}` : 'Play free on PartySpark', W / 2, bandY + 106);

    // --- Footer -------------------------------------------------------------------
    ctx.fillStyle = FAINT;
    ctx.font = `600 24px ${SANS}`;
    ctx.fillText(data.footer || 'partyspark — bring the games, keep the friends', W / 2, H - 40);

    return canvas;
}

const canvasToBlob = (canvas: HTMLCanvasElement): Promise<Blob | null> =>
    new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));

// Render + share (or download when Web Share is unavailable). Never throws.
export async function shareResultCard(data: ShareCardData): Promise<ShareOutcome> {
    try {
        const canvas = renderShareCard(data);
        const blob = await canvasToBlob(canvas);
        if (!blob) return 'failed';
        const file = new File([blob], 'partyspark_result.png', { type: 'image/png' });

        if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
            try {
                // The text rides along as the caption on targets that support
                // it (WhatsApp etc.) — that's where the challenge link lives.
                const url = appUrl();
                const text = `${data.challenge || 'Think you can beat this?'}${url ? ` Play free: ${url}` : ''}`;
                await navigator.share({ title: 'PartySpark', text, files: [file] });
                return 'shared';
            } catch (e) {
                if ((e as { name?: string }).name === 'AbortError') return 'aborted';
                // fall through to download
            }
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `partyspark_${data.gameTitle.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        return 'downloaded';
    } catch (e) {
        console.error('Share card failed:', e);
        return 'failed';
    }
}

// Text-only share (spoiler-free emoji grids). Falls back to the clipboard.
export async function shareText(text: string): Promise<'shared' | 'copied' | 'aborted' | 'failed'> {
    try {
        if (navigator.share) {
            try {
                await navigator.share({ text });
                return 'shared';
            } catch (e) {
                if ((e as { name?: string }).name === 'AbortError') return 'aborted';
            }
        }
        await navigator.clipboard.writeText(text);
        return 'copied';
    } catch (e) {
        console.error('Text share failed:', e);
        return 'failed';
    }
}
