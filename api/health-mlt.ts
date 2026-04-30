// Live MLT-path probe — GET /api/health-mlt
//
// Runs the actual Custom MLT Claude path with a small fixed input, then
// returns:
//   - the raw text Claude returned (so we can see exactly what shape it
//     produced — bare JSON, markdown-fenced, prose-wrapped, empty, etc)
//   - what parseClaudeJson extracted from it (the array we'd actually
//     send to the user)
//   - any thrown error, with name and message
//
// This bypasses the orchestrator's Gemini fallback so we know the
// answer comes from Claude alone — useful while Gemini is still quota-
// locked.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

// Minimal fixed input — same shape the real handler uses, but a tiny
// 5-card request so we don't burn tokens.
const TEST_GROUP = 'friends';
const TEST_CONTEXT = 'Three college friends — Aman (always late), Priya (the planner), Karan (just got a new job in Bangalore).';
const TEST_TONE = 'cheeky';
const TEST_COUNT = 5;

const MLT_SYSTEM_PROMPT = `You are a party game writer for "Most Likely To" — a game where one person reads a card aloud and the group instantly points at whoever fits.

VOICE: 6-18 words per card. Specific over generic. Warmth and teasing in equal measure.
COVERAGE: Spread references across all named people. Mix personal callouts, group-wide observations, and absurd hypotheticals.
HALLUCINATION GUARD: Only use names and details the players gave you. Do NOT invent specifics.
OUTPUT: Every card starts with "Who is most likely to" and ends with "?". Return a JSON array of strings. No numbering. No commentary.`;

const TEST_USER_PROMPT = `GROUP TYPE: ${TEST_GROUP} — a peer group.

TONE: ${TEST_TONE}
PG-13. Light innuendo, drinking, dating, mild embarrassment OK.

CONTEXT FROM THE PLAYERS:
"""
${TEST_CONTEXT}
"""

Generate exactly ${TEST_COUNT} "Most Likely To" cards for this group. Return as a JSON array of ${TEST_COUNT} strings.`;

// Same parser as the real handler — local copy so this file stays
// independent of handlers-custom.ts.
const parseArrayLenient = (text: string): string[] => {
    const tryParse = (raw: string): string[] | null => {
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            return parsed.filter((q): q is string => typeof q === 'string' && q.trim().length > 0);
        } catch { return null; }
    };
    const direct = tryParse(text.trim());
    if (direct) return direct;
    const fenced = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const fromFence = tryParse(fenced.trim());
    if (fromFence) return fromFence;
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start !== -1 && end > start) {
        const span = text.slice(start, end + 1);
        const fromSpan = tryParse(span);
        if (fromSpan) return fromSpan;
    }
    return [];
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
        return res.status(200).json({ ok: false, stage: 'no-key' });
    }

    const out: Record<string, unknown> = {
        ok: true,
        stage: 'init',
        node: process.version,
    };

    try {
        const client = new Anthropic({ apiKey: key });
        out.stage = 'client-created';

        const message = await client.messages.create({
            model: 'claude-haiku-4-5',
            max_tokens: 2048,
            system: MLT_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: TEST_USER_PROMPT }],
        });
        out.stage = 'response-received';
        out.stop_reason = message.stop_reason;
        out.usage = message.usage;
        out.content_block_count = message.content.length;
        out.content_types = message.content.map(b => b.type);

        // Concatenate ALL text blocks (in case Claude returns more than one).
        const text = message.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map(b => b.text)
            .join('');
        out.raw_text = text;
        out.raw_text_length = text.length;
        out.parsed = parseArrayLenient(text);
        out.parsed_count = (out.parsed as string[]).length;
    } catch (err) {
        const e = err as Error & { status?: number; error?: unknown };
        out.ok = false;
        out.error_name = e.name;
        out.error_message = e.message;
        out.error_status = e.status;
        out.error_body = e.error;
    }

    return res.status(200).json(out);
}
