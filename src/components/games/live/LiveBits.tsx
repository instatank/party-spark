import React from 'react';
import { ArrowRight, Loader2, WifiOff, Users } from 'lucide-react';
import { Button, ScreenHeader } from '../../ui/Layout';
import { PinGateModal } from '../../ui/PinGate';

// Small pieces every separate-phones screen needs, so the three live games
// (Would You Rather, Rank Me, Truth or Drink) say the same things the same
// way: who the room is waiting on, who moves it on, and what to do when a
// phone has gone quiet.

/** "Waiting on Priya, Sam" — plus, for the host only, a way to stop waiting.
 *  A phone asleep in a pocket is still in the room, so leaving is not the
 *  only way a reveal gets stuck. */
export const LiveWaiting: React.FC<{
    names: string[];
    isHost: boolean;
    onForce: () => void;
    note?: React.ReactNode;
}> = ({ names, isHost, onForce, note }) => (
    <div className="text-center py-3" data-live-waiting={names.join(',')}>
        <p className="text-sm text-muted flex items-center justify-center gap-2">
            <Loader2 size={14} className="animate-spin" />
            Waiting on <span className="text-ink font-semibold">{names.join(', ')}</span>
        </p>
        {note && <p className="text-[11px] text-muted mt-1.5 max-w-[300px] mx-auto">{note}</p>}
        {isHost && (
            <button onClick={onForce} className="text-xs text-muted underline underline-offset-2 hover:text-ink mt-2" data-live-force>
                Don't wait for {names.length === 1 ? names[0] : 'them'}
            </button>
        )}
    </div>
);

/** The move-on control. Only the host can deal the next card: two phones
 *  advancing independently is how a room ends up on two different cards. */
export const LiveNext: React.FC<{
    isHost: boolean;
    hostName: string;
    label: string;
    onNext: () => void;
}> = ({ isHost, hostName, label, onNext }) => (
    isHost ? (
        <Button onClick={onNext} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2" data-live-next>
            {label} <ArrowRight size={20} />
        </Button>
    ) : (
        <p className="text-center text-sm text-muted py-3" data-live-await-host>
            {hostName} moves the room on.
        </p>
    )
);

export const LiveOffline: React.FC<{ offline: boolean }> = ({ offline }) =>
    offline ? (
        <p className="flex items-center justify-center gap-2 text-xs text-rose-500 py-2">
            <WifiOff size={13} /> Lost the connection. Retrying…
        </p>
    ) : null;

/** Shown on a phone that joined after the deal: it watches this game and is
 *  dealt in on the next one, because the seat order is frozen at the start. */
export const LiveSpectating: React.FC = () => (
    <p className="text-center text-xs text-muted bg-surface-alt border border-divider rounded-lg px-3 py-2 mb-3 flex items-center justify-center gap-2">
        <Users size={13} /> You joined mid-game. You're watching this one and dealt in on the next.
    </p>
);

/** A guest's own 0438 check. The adult gate is per device on purpose (a
 *  shared tablet must not open 18+ content by accident), so a host who
 *  unlocked it on their phone does not unlock it on anyone else's. */
export const LiveAdultGate: React.FC<{
    title: string;
    deckName: string;
    onUnlock: () => void;
    onLeave: () => void;
}> = ({ title, deckName, onUnlock, onLeave }) => (
    <div className="h-full flex flex-col animate-fade-in">
        <ScreenHeader title={title} onBack={onLeave} onHome={onLeave} />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3">
            <div className="text-5xl">🔞</div>
            <p className="text-ink font-bold">The host picked {deckName}.</p>
            <p className="text-sm text-muted max-w-[280px]">It's 18+. Enter the PIN on this phone to play, or leave the room.</p>
        </div>
        <PinGateModal onSuccess={onUnlock} onCancel={onLeave} />
    </div>
);

/** The tile that opens a game's live mode — same look on every game. */
export const LiveEntryTile: React.FC<{ title: string; tagline: string; onClick: () => void }> = ({ title, tagline, onClick }) => (
    <button
        onClick={onClick}
        data-live-entry
        className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 border-l-sky-500 border-b-sky-500 hover:bg-app-tint rounded-xl py-3 px-4 transition-colors overflow-hidden"
    >
        <div className="flex items-center gap-3 relative z-10">
            <Users size={16} className="text-sky-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-ink leading-snug">{title}</p>
                <p className="text-[11px] text-muted leading-snug truncate">{tagline}</p>
            </div>
            <ArrowRight size={16} className="text-muted group-hover:text-ink flex-shrink-0" />
        </div>
    </button>
);
