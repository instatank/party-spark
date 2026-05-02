import React, { useEffect, useState } from 'react';
import { Home } from 'lucide-react';

interface RoastLoadingProps {
    onClose: () => void;
}

// Cycling status messages — punchy, on-brand. The component owns this list
// (RoastGame no longer computes per-theme loading copy) so adding a new
// theme doesn't require editing the loader.
const STATUS_MESSAGES = [
    'Sharpening the knives…',
    'Building the Taj Mahal…',
    'Consulting the ghost of Don Rickles…',
    'Cross-referencing your face with regret…',
    'Loading 47 ways to insult your hairline…',
];

const CYCLE_MS = 1800;

// Direction D V2 — "Rubber Stamp Memo". A cream memo card sits as the hero
// of the page, with a rotated red rubber stamp pulsing in the corner, three
// bouncing dots, and a cycling status line. The home button floats top-right;
// no chrome band on this screen.
const RoastLoading: React.FC<RoastLoadingProps> = ({ onClose }) => {
    const [statusIndex, setStatusIndex] = useState(0);

    useEffect(() => {
        const id = setInterval(() => {
            setStatusIndex((i) => (i + 1) % STATUS_MESSAGES.length);
        }, CYCLE_MS);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="w-full flex flex-col font-sans relative">
            {/* Home button — top-right floating, replaces the old title band */}
            <button
                onClick={onClose}
                aria-label="Home"
                className="absolute top-4 right-4 z-20 w-[50px] h-[50px] rounded-full bg-surface border border-divider text-muted hover:text-ink hover:bg-surface-alt transition flex items-center justify-center"
            >
                <Home size={24} />
            </button>

            <div className="flex-1 flex items-center justify-center px-5 py-8 min-h-[480px]">
                <div
                    className="relative w-full max-w-[340px] bg-polaroid rounded-[14px] border-[2.5px] border-slate-900 px-7 pt-12 pb-9 overflow-hidden"
                    style={{ boxShadow: '5px 5px 0 #0F172A' }}
                >
                    {/* Memo paper rule lines — subtle horizontal lines, decorative. */}
                    <div
                        className="absolute inset-0 pointer-events-none"
                        style={{
                            background:
                                'repeating-linear-gradient(180deg, transparent 0 23px, rgba(15,30,51,0.08) 23px 24px)',
                        }}
                    />

                    <div className="relative z-10 flex flex-col items-center text-center">
                        {/* Rubber stamp — center-stage hero. Big, rotated, pulsing. */}
                        <div
                            className="font-display text-roast-red text-[52px] leading-none tracking-[0.14em] px-5 py-2 border-[3px] border-roast-red rounded-lg animate-roast-stamp"
                            style={{ transform: 'rotate(-8deg)' }}
                        >
                            ROASTING
                        </div>

                        {/* 3-dot spinner */}
                        <div className="flex items-end justify-center gap-1.5 mt-7 mb-4 h-3">
                            <span
                                className="w-[9px] h-[9px] rounded-full bg-roast-red inline-block animate-roast-dot"
                                style={{ animationDelay: '0s' }}
                            />
                            <span
                                className="w-[9px] h-[9px] rounded-full bg-roast-red inline-block animate-roast-dot"
                                style={{ animationDelay: '0.16s' }}
                            />
                            <span
                                className="w-[9px] h-[9px] rounded-full bg-roast-red inline-block animate-roast-dot"
                                style={{ animationDelay: '0.32s' }}
                            />
                        </div>

                        {/* Cycling status line — fixed-height to avoid reflow */}
                        <div
                            role="status"
                            aria-live="polite"
                            className="min-h-[44px] flex items-center justify-center text-[13px] font-semibold text-[#3A1A00] px-2"
                        >
                            {STATUS_MESSAGES[statusIndex]}
                        </div>

                        {/* Subtitle */}
                        <div className="mt-3 text-[11px] font-bold tracking-[0.08em] uppercase text-[#7A4A1A]">
                            Hang tight — quality burns take a sec.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoastLoading;
