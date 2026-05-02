import React from 'react';
import { Flame, X } from 'lucide-react';

interface GameHeaderProps {
    onClose: () => void;
}

// Shared chrome for every Roast Me screen — flame + wordmark on the left,
// circular close on the right. Kept pixel-identical to the original inline
// versions in ImageUpload / RoastResult so swapping them in is invisible.
const GameHeader: React.FC<GameHeaderProps> = ({ onClose }) => {
    return (
        <div className="flex items-center justify-between px-5 pt-6 pb-4 border-b border-divider-soft">
            <div className="flex items-center gap-2">
                <Flame size={18} className="text-roast-red" fill="currentColor" />
                <span className="text-[15px] font-bold text-ink tracking-tight">Roast Me</span>
            </div>
            <button
                onClick={onClose}
                aria-label="Close"
                className="w-[30px] h-[30px] rounded-full bg-surface border border-divider text-muted hover:text-ink hover:bg-surface-alt transition flex items-center justify-center"
            >
                <X size={14} />
            </button>
        </div>
    );
};

export default GameHeader;
