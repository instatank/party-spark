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
    rows?: ShareRow[];     // leaderboard rows (first 7 drawn)
    emoji?: string;        // hero emoji above the heading
    footer?: string;       // defaults to the brand tagline
}

export type ShareOutcome = 'shared' | 'downloaded' | 'aborted' | 'failed';

const W = 1080;
const H = 1350;

const SERIF = "Georgia, 'Playfair Display', 'Times New Roman', serif";
const SANS = "-apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

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

export function renderShareCard(data: ShareCardData): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    const accent = data.accent || '#F2B544';

    // --- Ground: navy vertical gradient + accent glow top-right ------------
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

    // Accent baseline bar
    ctx.fillStyle = accent;
    ctx.fillRect(0, H - 14, W, 14);

    // --- Brand ---------------------------------------------------------------
    ctx.textAlign = 'center';
    ctx.fillStyle = '#F2B544';
    ctx.font = `bold 64px ${SERIF}`;
    ctx.fillText('PartySpark ✨', W / 2, 122);
    ctx.fillStyle = '#8FA0B8';
    ctx.font = `600 30px ${SANS}`;
    ctx.fillText('A L W A Y S   I N V I T E D', W / 2, 172);

    // --- Game pill -------------------------------------------------------------
    const pillText = data.gameTitle.toUpperCase();
    ctx.font = `bold 34px ${SANS}`;
    const pillW = ctx.measureText(pillText).width + 76;
    const pillX = (W - pillW) / 2;
    const pillY = 232;
    ctx.fillStyle = hexToRgba(accent, 0.16);
    roundRect(ctx, pillX, pillY, pillW, 66, 33);
    ctx.fill();
    ctx.strokeStyle = hexToRgba(accent, 0.55);
    ctx.lineWidth = 3;
    roundRect(ctx, pillX, pillY, pillW, 66, 33);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.fillText(pillText, W / 2, pillY + 46);

    // --- Hero: emoji + heading + sub ------------------------------------------
    let y = 430;
    if (data.emoji) {
        ctx.font = `150px ${SANS}`;
        ctx.fillText(data.emoji, W / 2, y);
        y += 118;
    } else {
        y += 20;
    }

    ctx.fillStyle = '#E8EEF9';
    ctx.font = `bold 82px ${SERIF}`;
    const headingLines = wrapLines(ctx, data.heading, W - 160, 2);
    for (const line of headingLines) {
        ctx.fillText(line, W / 2, y);
        y += 96;
    }

    if (data.sub) {
        ctx.fillStyle = '#8FA0B8';
        ctx.font = `500 40px ${SANS}`;
        ctx.fillText(data.sub, W / 2, y + 6);
        y += 66;
    }

    // --- Leaderboard rows -------------------------------------------------------
    const rows = (data.rows || []).slice(0, 7);
    if (rows.length > 0) {
        y += 30;
        const rowH = 96;
        const gap = 20;
        const rowX = 90;
        const rowW = W - 180;
        // Shrink rows slightly if they'd collide with the footer.
        const available = H - 130 - y;
        const scale = Math.min(1, available / (rows.length * (rowH + gap)));
        const rh = Math.max(72, rowH * scale);
        const rg = Math.max(12, gap * scale);

        rows.forEach((row, i) => {
            const ry = y + i * (rh + rg);
            ctx.fillStyle = row.highlight ? hexToRgba(accent, 0.14) : 'rgba(255,255,255,0.05)';
            roundRect(ctx, rowX, ry, rowW, rh, 22);
            ctx.fill();
            ctx.strokeStyle = row.highlight ? hexToRgba(accent, 0.8) : 'rgba(255,255,255,0.10)';
            ctx.lineWidth = row.highlight ? 4 : 2;
            roundRect(ctx, rowX, ry, rowW, rh, 22);
            ctx.stroke();

            const midY = ry + rh / 2 + 14;
            ctx.textAlign = 'left';
            ctx.fillStyle = row.highlight ? accent : '#5D6C84';
            ctx.font = `bold 38px ${SANS}`;
            ctx.fillText(String(i + 1), rowX + 40, midY);
            ctx.fillStyle = '#E8EEF9';
            ctx.font = `600 42px ${SANS}`;
            let label = row.label;
            while (label.length > 1 && ctx.measureText(label).width > rowW - 380) label = label.slice(0, -1);
            ctx.fillText(label === row.label ? label : `${label}…`, rowX + 110, midY);
            ctx.textAlign = 'right';
            ctx.fillStyle = row.highlight ? accent : '#B7C4D8';
            ctx.font = `bold 42px ${SANS}`;
            ctx.fillText(row.value, rowX + rowW - 40, midY);
            ctx.textAlign = 'center';
        });
    }

    // --- Footer -------------------------------------------------------------------
    ctx.fillStyle = '#5D6C84';
    ctx.font = `600 28px ${SANS}`;
    ctx.fillText(data.footer || 'partyspark — bring the games, keep the friends', W / 2, H - 62);

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
                await navigator.share({ title: 'PartySpark', files: [file] });
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
