import React, { useEffect, useState } from 'react';
import type { CardScore, ItemVerdict } from '../../../services/rankMeEngine';

// The payoff screen's centrepiece: the ranker's order on the left, the
// reader's on the right, and a line joining each item to where the reader put
// it. A flat line is an exact hit, a gentle slope is one off, a steep one a
// miss — so the shape of the read is visible before any number is. The
// ranker's #1 and #5 count double, so their rows and lines are drawn heavier.

export const VERDICT_COLOR: Record<ItemVerdict, string> = {
    exact: '#10B981',
    near: '#F59E0B',
    miss: '#F43F5E',
};

interface RevealTableProps {
    rankerOrder: string[];
    prediction: string[];
    score: CardScore;
    rankerLabel: string;
    readerLabel: string;
    accent: string;
    compact?: boolean;
}

export const RevealTable: React.FC<RevealTableProps> = ({ rankerOrder, prediction, score, rankerLabel, readerLabel, accent, compact = false }) => {
    const ROW = compact ? 38 : 50;
    const GAP = compact ? 4 : 6;
    const MID = compact ? 30 : 44;
    const last = rankerOrder.length - 1;
    const height = rankerOrder.length * ROW + last * GAP;
    const yOf = (i: number) => i * (ROW + GAP) + ROW / 2;
    const byItem = new Map(score.items.map(r => [r.item, r]));

    // Lines draw in after mount (pathLength=1 makes the dash maths unitless).
    const [drawn, setDrawn] = useState(compact);
    useEffect(() => {
        if (compact) return;
        const id = requestAnimationFrame(() => setDrawn(true));
        return () => cancelAnimationFrame(id);
    }, [compact]);

    const cell = `flex items-center rounded-lg border px-2 ${compact ? 'text-[11.5px]' : 'text-[13px]'} font-bold text-ink leading-tight`;

    return (
        <div className="w-full" data-reveal>
            <div className="grid mb-1.5 text-[10px] font-extrabold uppercase tracking-wider text-muted" style={{ gridTemplateColumns: `1fr ${MID}px 1fr` }}>
                <span className="truncate">{rankerLabel}</span>
                <span />
                <span className="truncate text-right">{readerLabel}</span>
            </div>
            <div className="grid" style={{ gridTemplateColumns: `1fr ${MID}px 1fr` }}>
                <div className="grid" style={{ gap: GAP }}>
                    {rankerOrder.map((item, i) => {
                        const r = byItem.get(item)!;
                        const end = i === 0 || i === last;
                        return (
                            <div
                                key={item}
                                data-ranker-item={item}
                                data-points={r.points}
                                className={`${cell} gap-1.5 ${end ? 'border-2' : 'border-divider bg-surface'}`}
                                style={{ height: ROW, ...(end ? { borderColor: accent, background: `${accent}14` } : {}) }}
                            >
                                <span className="text-[10px] font-black shrink-0 w-4 text-center" style={{ color: end ? accent : undefined }}>
                                    {i + 1}
                                </span>
                                <span className="flex-1 min-w-0 line-clamp-2">{item}</span>
                                <span className="text-[11px] font-black shrink-0 tabular-nums" style={{ color: VERDICT_COLOR[r.verdict] }}>
                                    +{r.points}
                                </span>
                            </div>
                        );
                    })}
                </div>
                <svg width={MID} height={height} className="overflow-visible" aria-hidden>
                    {score.items.map(r => (
                        <path
                            key={r.item}
                            d={`M 2 ${yOf(r.rankerPos)} C ${MID / 2} ${yOf(r.rankerPos)}, ${MID / 2} ${yOf(r.predictedPos)}, ${MID - 2} ${yOf(r.predictedPos)}`}
                            fill="none"
                            stroke={VERDICT_COLOR[r.verdict]}
                            strokeWidth={r.weight === 2 ? (compact ? 3 : 4) : (compact ? 1.75 : 2.25)}
                            strokeLinecap="round"
                            pathLength={1}
                            strokeDasharray={1}
                            strokeDashoffset={drawn ? 0 : 1}
                            style={{ transition: `stroke-dashoffset 500ms ease ${120 + r.rankerPos * 110}ms` }}
                        />
                    ))}
                </svg>
                <div className="grid" style={{ gap: GAP }}>
                    {prediction.map((item, j) => {
                        const r = byItem.get(item)!;
                        const color = VERDICT_COLOR[r.verdict];
                        return (
                            <div
                                key={item}
                                data-reader-item={item}
                                data-verdict={r.verdict}
                                className={`${cell} gap-1.5 border-2`}
                                style={{ height: ROW, borderColor: `${color}99`, background: `${color}14` }}
                            >
                                <span className="text-[10px] font-black shrink-0 w-4 text-center text-muted">{j + 1}</span>
                                <span className="flex-1 min-w-0 line-clamp-2">{item}</span>
                                <span className="text-[11px] font-black shrink-0" style={{ color }} aria-label={r.verdict}>
                                    {r.verdict === 'exact' ? '✓' : r.verdict === 'near' ? '±1' : '✗'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
            {!compact && (
                <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mt-3 text-[10.5px] text-muted">
                    <span><span className="font-black" style={{ color: VERDICT_COLOR.exact }}>✓</span> exact +2</span>
                    <span><span className="font-black" style={{ color: VERDICT_COLOR.near }}>±1</span> one off +1</span>
                    <span><span className="font-black" style={{ color: VERDICT_COLOR.miss }}>✗</span> miss 0</span>
                    <span><span className="font-black" style={{ color: accent }}>#1 & #5</span> count double</span>
                </div>
            )}
        </div>
    );
};
