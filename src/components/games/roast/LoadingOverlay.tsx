import React from 'react';

interface LoadingOverlayProps {
    message: string;
}

// Restyled to match the new sticker-meets-sleek system. Sticker treatment
// (heavy ink border + 5px offset shadow) is reserved for the loader card —
// it's a hero moment within the dark scrim. The Bebas headline carries the
// per-theme loading copy (e.g. "DRAWING CARICATURE…"). Logic + message
// strings are unchanged.
const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center px-6 bg-black/80 backdrop-blur-sm rounded-xl">
            <div
                className="bg-roast-ember border-[2.5px] border-ink rounded-[18px] px-7 pt-7 pb-6 max-w-[320px] w-full text-center relative overflow-hidden"
                style={{ boxShadow: '5px 5px 0 var(--c-ink)' }}
            >
                {/* Spinner ring */}
                <div className="relative w-20 h-20 mx-auto mb-4">
                    <div className="absolute inset-0 border-4 border-ink rounded-full animate-ping opacity-20" />
                    <div className="absolute inset-0 border-4 border-t-ink border-r-transparent border-b-ink border-l-transparent rounded-full animate-spin" />
                    <div className="absolute inset-0 flex items-center justify-center text-3xl">🔥</div>
                </div>
                <p className="font-display text-2xl tracking-wide text-white animate-pulse uppercase" style={{ textShadow: '2px 2px 0 var(--c-ink)' }}>
                    {message}
                </p>
            </div>
        </div>
    );
};

export default LoadingOverlay;
