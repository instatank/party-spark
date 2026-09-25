import React, { useRef, useState } from 'react';
import { GripVertical } from 'lucide-react';
import { hapticLight } from '../../../services/haptics';

// The five-slot ranking list. Two ways to reorder, because a drag that works
// for one thumb does not work for every hand:
//   * DRAG a row (pointer events, so mouse, touch and pen are one code path);
//   * TAP one row, then another, to swap them.
// A press that moves less than DRAG_SLOP px is a tap; anything further is a
// drag. Slot numbers live in their own static column so "#1" never travels
// with the item being dragged. Rows set `touch-action: none` so a vertical
// drag moves the item instead of scrolling the page.

const DRAG_SLOP = 6;

interface RankListProps {
    order: string[];
    onChange: (next: string[]) => void;
    top: string;
    bottom: string;
    accent: string;
}

const move = (arr: string[], from: number, to: number) => {
    const next = arr.slice();
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    return next;
};

export const RankList: React.FC<RankListProps> = ({ order, onChange, top, bottom, accent }) => {
    const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
    const press = useRef<{ idx: number; y: number; pitch: number; moved: boolean; target: number } | null>(null);
    const [drag, setDrag] = useState<{ from: number; dy: number; pitch: number; target: number } | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    // On drop the rows re-render in their new DOM order with their offsets
    // cleared. Animating that change would replay the move from the wrong
    // starting point, so transitions are off for the one frame it happens in.
    const [instant, setInstant] = useState(false);
    const last = order.length - 1;

    const pitchOf = () => {
        const a = rowRefs.current[0], b = rowRefs.current[1];
        return a && b ? b.offsetTop - a.offsetTop : 60;
    };

    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>, idx: number) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        press.current = { idx, y: e.clientY, pitch: pitchOf(), moved: false, target: idx };
    };

    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        const p = press.current;
        if (!p) return;
        const raw = e.clientY - p.y;
        if (!p.moved && Math.abs(raw) < DRAG_SLOP) return;
        if (!p.moved) { p.moved = true; setSelected(null); }
        const dy = Math.max(-p.idx * p.pitch, Math.min((last - p.idx) * p.pitch, raw));
        const target = Math.max(0, Math.min(last, Math.round(p.idx + dy / p.pitch)));
        if (target !== p.target) { p.target = target; hapticLight(); }
        setDrag({ from: p.idx, dy, pitch: p.pitch, target });
    };

    const tap = (idx: number) => {
        if (selected === null) { setSelected(idx); hapticLight(); return; }
        if (selected === idx) { setSelected(null); return; }
        const next = order.slice();
        [next[selected], next[idx]] = [next[idx], next[selected]];
        setSelected(null);
        hapticLight();
        onChange(next);
    };

    const onPointerUp = () => {
        const p = press.current;
        press.current = null;
        setDrag(null);
        if (!p) return;
        if (!p.moved) { tap(p.idx); return; }
        setInstant(true);
        requestAnimationFrame(() => setInstant(false));
        if (p.target !== p.idx) onChange(move(order, p.idx, p.target));
    };

    const onPointerCancel = () => { press.current = null; setDrag(null); };

    const onKeyDown = (e: React.KeyboardEvent, idx: number) => {
        const to = e.key === 'ArrowUp' ? idx - 1 : e.key === 'ArrowDown' ? idx + 1 : -1;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(idx); return; }
        if (to < 0 || to > last) return;
        e.preventDefault();
        onChange(move(order, idx, to));
        requestAnimationFrame(() => rowRefs.current[to]?.focus());
    };

    // Where each row sits while a drag is in flight: the dragged row follows
    // the finger, the rows it has passed shift one pitch the other way.
    const offsetFor = (idx: number): number => {
        if (!drag) return 0;
        const { from, dy, pitch, target } = drag;
        if (idx === from) return dy;
        if (from < target && idx > from && idx <= target) return -pitch;
        if (from > target && idx >= target && idx < from) return pitch;
        return 0;
    };

    return (
        <div className="w-full max-w-[360px] mx-auto select-none" data-rank-list>
            <div className="flex items-center justify-center gap-1.5 mb-2 text-xs font-extrabold uppercase tracking-wider" style={{ color: accent }} data-label-top>
                <span aria-hidden>▲</span> {top}
            </div>
            <div className="grid grid-cols-[2.25rem_1fr] gap-x-2">
                <div className="grid gap-1.5">
                    {order.map((_, i) => {
                        const end = i === 0 || i === last;
                        return (
                            <div key={i} className="h-[52px] flex flex-col items-center justify-center">
                                <span
                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black border ${end ? 'text-slate-900' : 'bg-surface-alt border-divider text-ink-soft'}`}
                                    style={end ? { background: accent, borderColor: accent } : undefined}
                                >
                                    {i + 1}
                                </span>
                                {end && <span className="text-[9px] font-extrabold mt-0.5 leading-none" style={{ color: accent }}>×2</span>}
                            </div>
                        );
                    })}
                </div>
                <div className="grid gap-1.5 relative">
                    {order.map((item, i) => {
                        const off = offsetFor(i);
                        const dragging = drag?.from === i;
                        const isSel = selected === i;
                        return (
                            <div
                                key={item}
                                ref={el => { rowRefs.current[i] = el; }}
                                role="button"
                                tabIndex={0}
                                aria-label={`${item}, position ${i + 1}. Drag, or tap two items to swap. Arrow keys move it.`}
                                data-rank-item={item}
                                onPointerDown={e => onPointerDown(e, i)}
                                onPointerMove={onPointerMove}
                                onPointerUp={onPointerUp}
                                onPointerCancel={onPointerCancel}
                                onKeyDown={e => onKeyDown(e, i)}
                                className={`h-[52px] flex items-center gap-2 pl-3 pr-2 rounded-xl border-2 bg-surface cursor-grab active:cursor-grabbing outline-none focus-visible:ring-2 focus-visible:ring-accent ${dragging ? 'z-20 shadow-2xl' : 'z-0'} ${isSel ? '' : 'border-divider'}`}
                                style={{
                                    touchAction: 'none',
                                    transform: `translateY(${off}px)${dragging ? ' scale(1.03)' : ''}`,
                                    transition: dragging || instant ? 'none' : 'transform 160ms ease, border-color 160ms ease, background 160ms ease',
                                    ...(isSel ? { borderColor: accent, background: `${accent}1f` } : {}),
                                    ...(dragging ? { borderColor: accent } : {}),
                                }}
                            >
                                <span className="flex-1 min-w-0 text-[15px] font-bold text-ink leading-tight">{item}</span>
                                <GripVertical size={18} className="text-muted shrink-0" aria-hidden />
                            </div>
                        );
                    })}
                </div>
            </div>
            <div className="flex items-center justify-center gap-1.5 mt-2 text-xs font-extrabold uppercase tracking-wider text-muted" data-label-bottom>
                <span aria-hidden>▼</span> {bottom}
            </div>
            <p className="text-[11px] text-muted text-center mt-2">
                {selected !== null ? <>Now tap the item to swap with <span className="font-bold text-ink">{order[selected]}</span></> : 'Drag to reorder, or tap two items to swap'}
            </p>
        </div>
    );
};
