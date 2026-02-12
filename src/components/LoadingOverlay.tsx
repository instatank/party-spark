import React from 'react';

interface LoadingOverlayProps {
    message: string;
}

const LoadingOverlay: React.FC<LoadingOverlayProps> = ({ message }) => {
    return (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-50 rounded-xl border border-yellow-500/20">
            <div className="relative w-24 h-24 mb-6">
                <div className="absolute inset-0 border-4 border-yellow-500 rounded-full animate-ping opacity-25"></div>
                <div className="absolute inset-0 border-4 border-t-yellow-500 border-r-transparent border-b-yellow-500 border-l-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center text-3xl">
                    🔥
                </div>
            </div>
            <p className="text-yellow-400 font-comic text-2xl animate-pulse text-center px-4">
                {message}
            </p>
        </div>
    );
};

export default LoadingOverlay;
