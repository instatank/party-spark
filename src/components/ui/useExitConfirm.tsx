import { useEffect, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// Shared exit-guard hook. When `enabled` is true, wraps navigation handlers
// through a confirm modal AND attaches a `beforeunload` listener so browser
// tab close / refresh triggers the native "Leave site?" prompt. Returns:
//   - guard(fn): wrapped onClick — shows the modal when enabled, else calls fn
//   - dialog: the modal element to render somewhere in your tree
// Used by ScreenHeader (via its `confirmOnExit` prop) and by games whose
// play screens have custom headers (MLT, WILTY, Taboo PLAYING).
export function useExitConfirm(enabled: boolean, opts?: { title?: string; message?: string }) {
    const [pending, setPending] = useState<(() => void) | null>(null);

    useEffect(() => {
        if (!enabled) return;
        const handler = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            // Modern browsers ignore custom messages and show their own, but
            // assigning returnValue is still required to trigger the prompt.
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [enabled]);

    const guard = (fn?: () => void) => () => {
        if (!fn) return;
        // Stash via updater-form setter so React doesn't invoke the fn itself.
        if (enabled) setPending(() => fn);
        else fn();
    };

    const dialog = (
        <ConfirmDialog
            open={pending !== null}
            title={opts?.title}
            message={opts?.message}
            onCancel={() => setPending(null)}
            onConfirm={() => { const fn = pending; setPending(null); fn?.(); }}
        />
    );

    return { guard, dialog };
}
