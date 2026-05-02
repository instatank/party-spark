// Live REAL-handler probe — GET /api/health-mlt-real
//
// Imports the actual handleCustomMostLikelyTo from handlers-custom.ts and
// runs it with realistic production inputs (count=15, the real long system
// prompt). Returns the result + any thrown error so we can spot the
// difference between "Claude path works on a small test prompt" (which
// /api/health-mlt confirmed) and "Claude path fails for the real call".
//
// Also accepts ?count= and ?tone= query params so we can sweep quickly.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleCustomMostLikelyTo } from './_lib/handlers-custom.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const count = Number(req.query.count) || 15;
    const tone = String(req.query.tone || 'cheeky');
    const groupType = String(req.query.group || 'friends');

    const out: Record<string, unknown> = {
        ok: true,
        node: process.version,
        params: { groupType, count, tone },
    };

    try {
        const start = Date.now();
        const cards = await handleCustomMostLikelyTo({
            groupType,
            customContext: 'Three college friends — Aman (always late), Priya (the planner), Karan (just got a new job in Bangalore).',
            count,
            tone,
        });
        out.elapsed_ms = Date.now() - start;
        out.cards_returned = cards.length;
        out.cards = cards;
        out.first_card = cards[0] ?? null;
    } catch (err) {
        const e = err as Error & { status?: number; error?: unknown };
        out.ok = false;
        out.error_name = e.name;
        out.error_message = e.message;
        out.error_status = e.status;
        out.error_body = e.error;
        out.error_stack = e.stack?.split('\n').slice(0, 8).join('\n');
    }

    return res.status(200).json(out);
}
