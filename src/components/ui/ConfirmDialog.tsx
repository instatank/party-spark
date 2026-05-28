import React from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    open: boolean;
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    onConfirm: () => void;
    onCancel: () => void;
}

// Small confirmation modal — used by ScreenHeader to guard mid-game exits.
// Backdrop click and Cancel button both dismiss; Confirm runs the dangerous
// action. Lives at z-[200] so it sits above anything inside a game screen
// (the splash sits at z-[100]).
export const ConfirmDialog: React.FC<Props> = ({
    open,
    title = 'Leave the game?',
    message = "You're in the middle of a round — your progress will be lost.",
    confirmLabel = 'Quit',
    cancelLabel = 'Stay',
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;
    return (
        <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
            onClick={onCancel}
        >
            <div
                onClick={e => e.stopPropagation()}
                className="w-full max-w-sm bg-surface border border-divider rounded-2xl p-6 shadow-2xl animate-slide-up"
            >
                <div className="flex items-start gap-3 mb-1">
                    <div className="w-10 h-10 rounded-full bg-amber-500/15 text-amber-500 flex items-center justify-center flex-shrink-0">
                        <AlertTriangle size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="text-lg font-serif font-bold text-ink mb-1">{title}</h2>
                        <p className="text-sm text-muted">{message}</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2.5 mt-5">
                    <button
                        onClick={onCancel}
                        className="h-12 rounded-xl font-bold text-base text-ink bg-surface-alt border border-divider hover:bg-app-tint transition-colors"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        className="h-12 rounded-xl font-bold text-base text-white bg-red-500 hover:bg-red-600 transition-colors"
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
