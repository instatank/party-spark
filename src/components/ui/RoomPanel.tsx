import React, { useEffect, useRef, useState } from 'react';
import { Users, Wifi, WifiOff, Copy, Check, Loader2, ArrowRight, Crown } from 'lucide-react';
import { Button } from './Layout';
import {
    createRoom, joinRoom, leaveRoom, useRoom,
    type Room, type RoomSession,
} from '../../services/roomService';
import { hapticLight, hapticSuccess, hapticError } from '../../services/haptics';

// The shared "play with a friend" front door: create or join a room by 4-digit
// code, then wait in a lobby until the host starts.
//
// It owns ONLY the room lifecycle — never any game state. A game hands it a
// config blob to stash on the room (difficulty, timer) and gets a session back
// when play begins; what happens after that is entirely the game's business.
// That boundary is what keeps wiring the second, third and fourth game cheap.

export type RoomPhase = 'ENTRY' | 'LOBBY';

interface RoomPanelProps {
    /** GameType string — stored on the room so a code can't cross games. */
    game: string;
    /** Shown at the top of the panel, e.g. "Head-to-head". */
    title: string;
    /** Copy under the title explaining what this mode is. */
    blurb: string;
    /** Accent key — static class maps only (Tailwind v4 JIT, see CLAUDE.md). */
    accent: RoomAccent;
    /** Host's chosen settings, stashed on the room so guests inherit them. */
    config?: Record<string, unknown>;
    minPlayers?: number;
    /** Round length the host is starting. Sent as a DURATION so the server
     *  stamps the deadline — see the clock-skew note in roomService.ts. */
    startDurationMs?: number;
    /** Extra controls for the host only (difficulty pickers, timer chips).
     *  Guests inherit the host's config and so must not see them. */
    hostControls?: React.ReactNode;
    /** Fires once the host starts — the room has left LOBBY. */
    onStart: (session: RoomSession, room: Room) => void;
    onCancel: () => void;
}

export type RoomAccent = 'gold' | 'lime' | 'violet';

// Tailwind v4 only detects complete static strings — never assemble these with
// template literals. (This exact mistake has bitten the codebase repeatedly.)
const ACCENT: Record<RoomAccent, { text: string; ring: string; chip: string; bar: string }> = {
    gold: { text: 'text-gold', ring: 'focus:ring-gold/50', chip: 'bg-gold/15 text-gold border-gold/30', bar: 'bg-gold' },
    lime: { text: 'text-lime-500', ring: 'focus:ring-lime-500/50', chip: 'bg-lime-500/15 text-lime-500 border-lime-500/30', bar: 'bg-lime-500' },
    violet: { text: 'text-violet-400', ring: 'focus:ring-violet-400/50', chip: 'bg-violet-400/15 text-violet-400 border-violet-400/30', bar: 'bg-violet-400' },
};

const NAME_KEY = 'partyspark_room_name';

const RoomPanel: React.FC<RoomPanelProps> = ({
    game, title, blurb, accent, config = {}, minPlayers = 2,
    startDurationMs, hostControls, onStart, onCancel,
}) => {
    const a = ACCENT[accent];
    const [session, setSession] = useState<RoomSession | null>(null);
    const [mode, setMode] = useState<'PICK' | 'CREATE' | 'JOIN'>('PICK');
    const [name, setName] = useState(() => {
        try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
    });
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [entryError, setEntryError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const { room, isHost, error, offline, persistent, host } = useRoom(session, []);

    // The guest's cue to enter the game is the host's phase flip arriving on a
    // poll — there is no "go" message. Same signal drives the host, so both
    // sides run the identical code path and cannot diverge.
    const startedRef = useRef(false);
    useEffect(() => {
        if (!session || !room || startedRef.current) return;
        if (room.meta.phase !== 'LOBBY') {
            startedRef.current = true;
            hapticSuccess();
            onStart(session, room);
        }
    }, [room, session, onStart]);

    const remember = (n: string) => {
        try { localStorage.setItem(NAME_KEY, n.trim()); } catch { /* private mode */ }
    };

    const doCreate = async () => {
        if (!name.trim() || busy) return;
        setBusy(true); setEntryError(null); remember(name);
        try {
            const { session: s } = await createRoom(game, name.trim(), config);
            hapticSuccess();
            setSession(s);
        } catch (e) {
            hapticError();
            setEntryError(e instanceof Error ? e.message : 'Could not create a room.');
        } finally { setBusy(false); }
    };

    const doJoin = async () => {
        if (!name.trim() || code.length !== 4 || busy) return;
        setBusy(true); setEntryError(null); remember(name);
        try {
            const { session: s, room: r } = await joinRoom(code, name.trim());
            if (r.meta.game !== game) {
                setEntryError('That code belongs to a different game.');
                await leaveRoom(s.code, s.playerId);
                return;
            }
            hapticSuccess();
            setSession(s);
        } catch (e) {
            hapticError();
            setEntryError(e instanceof Error ? e.message : 'Could not join that room.');
        } finally { setBusy(false); }
    };

    const doCancel = async () => {
        if (session) await leaveRoom(session.code, session.playerId);
        onCancel();
    };

    const doStart = async () => {
        if (!room || room.players.length < minPlayers) return;
        hapticLight();
        await host({ phase: 'PLAY', round: 1, durationMs: startDurationMs ?? null });
    };

    const copyCode = async () => {
        if (!room) return;
        try {
            await navigator.clipboard.writeText(room.meta.code);
            setCopied(true);
            hapticLight();
            window.setTimeout(() => setCopied(false), 1600);
        } catch { /* clipboard blocked — the code is on screen anyway */ }
    };

    // ---- lobby ----
    if (session && room) {
        const enough = room.players.length >= minPlayers;
        return (
            <div className="max-w-[340px] mx-auto w-full">
                <div className="text-center mb-6">
                    <p className="text-xs uppercase tracking-widest text-muted mb-2">Room code</p>
                    <button
                        onClick={copyCode}
                        className="inline-flex items-center gap-3 group"
                        aria-label="Copy room code"
                    >
                        <span className={`text-5xl font-black tracking-[0.3em] tabular-nums ${a.text}`}>
                            {room.meta.code}
                        </span>
                        {copied
                            ? <Check size={18} className="text-emerald-500" />
                            : <Copy size={18} className="text-muted group-hover:text-ink transition-colors" />}
                    </button>
                    <p className="text-sm text-ink-soft mt-3">
                        Everyone else opens {game === 'JUMBLE' ? 'Scramble' : 'this game'} and taps
                        {' '}<span className="text-ink font-medium">Join</span>, then types this code.
                    </p>
                </div>

                <div className="grid gap-2 mb-6">
                    {room.players.map(p => (
                        <div
                            key={p.id}
                            className="flex items-center gap-2 bg-surface-alt border border-divider rounded-xl py-2.5 px-4"
                        >
                            <Users size={14} className={a.text} />
                            <span className="text-ink font-medium flex-1 truncate">{p.name}</span>
                            {p.id === room.meta.hostId && (
                                <span title="Host"><Crown size={13} className="text-muted" /></span>
                            )}
                        </div>
                    ))}
                    {!enough && (
                        <div className="flex items-center gap-2 border border-dashed border-divider rounded-xl py-2.5 px-4 text-muted">
                            <Loader2 size={14} className="animate-spin" />
                            <span className="text-sm">Waiting for {minPlayers - room.players.length} more…</span>
                        </div>
                    )}
                </div>

                {!persistent && (
                    <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 mb-4">
                        The server has no room store configured, so phones won't find each other.
                        Add a Redis store in Vercel and redeploy.
                    </p>
                )}
                {offline && (
                    <p className="flex items-center gap-2 text-xs text-rose-500 mb-4">
                        <WifiOff size={13} /> Lost the connection. Retrying…
                    </p>
                )}
                {error && !offline && <p className="text-xs text-muted mb-4">{error}</p>}

                {isHost && hostControls && <div className="mb-4">{hostControls}</div>}

                {isHost ? (
                    <Button fullWidth onClick={doStart} disabled={!enough}>
                        {enough ? 'Start the round' : `Need ${minPlayers} players`}
                    </Button>
                ) : (
                    <p className="text-center text-sm text-muted py-3">
                        Waiting for the host to start…
                    </p>
                )}
                <button onClick={doCancel} className="w-full text-center text-sm text-muted hover:text-ink py-3 transition-colors">
                    Leave room
                </button>
            </div>
        );
    }

    // ---- entry ----
    return (
        <div className="max-w-[340px] mx-auto w-full">
            <div className="text-center mb-6">
                <div className={`inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest border rounded-full px-3 py-1 ${a.chip}`}>
                    <Wifi size={12} /> {title}
                </div>
                <p className="text-sm text-ink-soft mt-3">{blurb}</p>
            </div>

            <label className="block text-xs uppercase tracking-widest text-muted mb-2">Your name</label>
            <input
                value={name}
                onChange={e => setName(e.target.value.slice(0, 20))}
                placeholder="Ankit"
                className={`w-full bg-surface-alt border border-divider rounded-xl py-3 px-4 text-ink placeholder:text-muted outline-none focus:ring-2 ${a.ring} mb-5`}
            />

            {mode === 'PICK' && (
                <div className="grid gap-3">
                    <button
                        onClick={() => { hapticLight(); setMode('CREATE'); }}
                        disabled={!name.trim()}
                        className="group bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 border-l-emerald-500 border-b-emerald-500 hover:bg-app-tint rounded-xl py-3 px-4 transition-colors text-left disabled:opacity-40"
                    >
                        <div className="flex items-center gap-3">
                            <Users size={16} className="text-emerald-500" />
                            <div className="flex-1">
                                <p className="text-ink font-semibold">Start a room</p>
                                <p className="text-xs text-muted">You get a code to share</p>
                            </div>
                            <ArrowRight size={16} className="text-muted group-hover:text-ink" />
                        </div>
                    </button>
                    <button
                        onClick={() => { hapticLight(); setMode('JOIN'); }}
                        disabled={!name.trim()}
                        className="group bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 border-l-sky-500 border-b-sky-500 hover:bg-app-tint rounded-xl py-3 px-4 transition-colors text-left disabled:opacity-40"
                    >
                        <div className="flex items-center gap-3">
                            <Wifi size={16} className="text-sky-500" />
                            <div className="flex-1">
                                <p className="text-ink font-semibold">Join a room</p>
                                <p className="text-xs text-muted">Type a friend's 4-digit code</p>
                            </div>
                            <ArrowRight size={16} className="text-muted group-hover:text-ink" />
                        </div>
                    </button>
                </div>
            )}

            {mode === 'CREATE' && (
                <Button fullWidth onClick={doCreate} disabled={busy || !name.trim()}>
                    {busy ? 'Creating…' : 'Create the room'}
                </Button>
            )}

            {mode === 'JOIN' && (
                <>
                    <label className="block text-xs uppercase tracking-widest text-muted mb-2">Room code</label>
                    <input
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        inputMode="numeric"
                        placeholder="0000"
                        className={`w-full bg-surface-alt border border-divider rounded-xl py-3 px-4 text-ink text-center text-3xl font-black tracking-[0.3em] tabular-nums placeholder:text-muted/40 outline-none focus:ring-2 ${a.ring} mb-4`}
                    />
                    <Button fullWidth onClick={doJoin} disabled={busy || code.length !== 4 || !name.trim()}>
                        {busy ? 'Joining…' : 'Join'}
                    </Button>
                </>
            )}

            {entryError && <p className="text-sm text-rose-500 text-center mt-4">{entryError}</p>}

            <button
                onClick={() => (mode === 'PICK' ? onCancel() : setMode('PICK'))}
                className="w-full text-center text-sm text-muted hover:text-ink py-4 transition-colors"
            >
                {mode === 'PICK' ? 'Back' : 'Other options'}
            </button>
        </div>
    );
};

export default RoomPanel;
