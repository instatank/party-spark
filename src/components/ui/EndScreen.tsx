import React, { useEffect, useState } from 'react';
import { Trophy, ChevronRight } from 'lucide-react';
import { Button, ScreenHeader } from './Layout';
import { hapticSuccess } from '../../services/haptics';

// Shared end-of-game leaderboard screen. Two layouts, both in real use:
//   - scroll (default): 🏆 hero + "X wins with N." — 5 Alive, Linked
//   - centered (heading set): bold text heading + "X takes it." — Charades,
//     Taboo (their team-mode summaries; solo summaries stay in each game)
// Rows are ranked descending; the winner row is tinted with the game's accent
// and gets a Trophy. An entry with `expand` renders as a tap-to-toggle row
// with a chevron and the panel below (5 Alive's per-round breakdown).

export interface EndScreenEntry {
    name: string;
    score: number;
    /** Optional panel rendered under the row when tapped. Rows without it are
     *  plain (no chevron). The node supplies its own padding/layout. */
    expand?: React.ReactNode;
}

export type EndScreenAccent = 'emerald' | 'indigo' | 'theme';

// Tailwind v4 JIT only picks up complete static strings — never assemble
// these with template literals (see CLAUDE.md). 'theme' is the app-wide
// --color-accent token pair used by Charades/Taboo.
const ACCENT: Record<EndScreenAccent, { winnerRow: string; row: string; trophy: string }> = {
    emerald: { winnerRow: 'bg-emerald-500/10 border-emerald-500/50 text-ink', row: 'bg-surface border-divider text-ink', trophy: 'text-emerald-500' },
    indigo: { winnerRow: 'bg-indigo-500/10 border-indigo-500/50 text-ink', row: 'bg-surface border-divider text-ink', trophy: 'text-indigo-500' },
    theme: { winnerRow: 'bg-accent-soft border-accent text-ink', row: 'bg-surface border-divider text-ink-soft', trophy: 'text-accent' },
};

interface EndScreenProps {
    /** ScreenHeader title — each game keeps its own back target. */
    title: string;
    onBack: () => void;
    onHome: () => void;
    /** Sorted descending by score inside the component (stable sort). */
    entries: EndScreenEntry[];
    accent: EndScreenAccent;
    /** Set for the centered layout with a bold text heading (Charades /
     *  Taboo). Omit for the scrolling 🏆 layout (5 Alive / Linked). */
    heading?: string;
    /** Words after the bolded winner name. Default: `wins with {score}.` */
    winnerText?: (top: EndScreenEntry) => string;
    playAgainLabel?: string;
    onPlayAgain: () => void;
    exitLabel?: string;
    onExit: () => void;
    /** Rendered above the Play Again / Exit buttons — the games use it for
     *  their Share Result button. */
    footerExtra?: React.ReactNode;
}

const EndScreen: React.FC<EndScreenProps> = ({
    title,
    onBack,
    onHome,
    entries,
    accent,
    heading,
    winnerText = top => `wins with ${top.score}.`,
    playAgainLabel = 'Play Again',
    onPlayAgain,
    exitLabel = 'Back to Home',
    onExit,
    footerExtra,
}) => {
    const [openIdx, setOpenIdx] = useState<number | null>(null);
    // Win moment — one buzz as the leaderboard appears (covers all four
    // games that end on this screen).
    useEffect(() => { hapticSuccess(); }, []);
    const acc = ACCENT[accent];
    const ranked = [...entries].sort((a, b) => b.score - a.score);
    const top = ranked[0];
    const tiedTop = ranked.filter(r => r.score === top.score).length > 1;
    const centered = heading !== undefined;

    const winnerLine = tiedTop
        ? <p className="text-muted">It's a tie at the top.</p>
        : <p className="text-muted"><span className="font-bold text-ink">{top.name}</span> {winnerText(top)}</p>;

    const rows = ranked.map((s, i) => {
        const rowClass = i === 0 ? acc.winnerRow : acc.row;
        const nameBlock = (
            <div className="flex items-center gap-2 min-w-0">
                {i === 0 && <Trophy size={16} className={`${acc.trophy} flex-shrink-0`} />}
                <span className="font-bold truncate">{s.name}</span>
            </div>
        );
        if (s.expand !== undefined) {
            const open = openIdx === i;
            return (
                <div key={s.name + i} className={`rounded-xl border ${rowClass}`}>
                    <button
                        onClick={() => setOpenIdx(open ? null : i)}
                        className="w-full flex items-center justify-between px-4 py-3"
                    >
                        {nameBlock}
                        <div className="flex items-center gap-2">
                            <span className="text-2xl font-black">{s.score}</span>
                            <ChevronRight size={16} className={`text-muted transition-transform ${open ? 'rotate-90' : ''}`} />
                        </div>
                    </button>
                    {open && s.expand}
                </div>
            );
        }
        return (
            <div key={s.name + i} className={`flex items-center justify-between px-4 py-3 rounded-xl border ${rowClass}`}>
                {nameBlock}
                <span className={centered ? 'text-2xl font-black ml-3' : 'text-2xl font-black'}>{s.score}</span>
            </div>
        );
    });

    const footer = (
        <>
            {footerExtra}
            <Button onClick={onPlayAgain} fullWidth>{playAgainLabel}</Button>
            <Button onClick={onExit} variant="secondary" fullWidth>{exitLabel}</Button>
        </>
    );

    return (
        <div className="h-full flex flex-col">
            <ScreenHeader title={title} onBack={onBack} onHome={onHome} />
            {centered ? (
                <div className="flex-1 flex flex-col items-center justify-center space-y-8 animate-slide-up">
                    <div className="text-center">
                        <h2 className="text-3xl font-bold mb-1 text-ink">{heading}</h2>
                        {winnerLine}
                    </div>
                    <div className="w-full max-w-[320px] space-y-2">{rows}</div>
                    <div className="flex flex-col gap-3 w-full">{footer}</div>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto px-4 pb-8 animate-slide-up">
                    <div className="text-center mb-5">
                        <div className="text-5xl mb-2">🏆</div>
                        {winnerLine}
                    </div>
                    <div className="space-y-2 max-w-[360px] mx-auto">{rows}</div>
                    <div className="flex flex-col gap-3 w-full max-w-[360px] mx-auto mt-6">{footer}</div>
                </div>
            )}
        </div>
    );
};

export default EndScreen;
