import React, { useState } from 'react';
import { Plus, X, Pencil, User } from 'lucide-react';
import { sessionService } from '../../services/SessionManager';

interface PlayerRosterRowProps {
    players: string[];
    onPlayersChange: (next: string[]) => void;
    minPlayers: number;        // game-specific floor (Forecast 2, TOD 2)
    maxPlayers: number;        // game-specific ceiling (Forecast 2, TOD 10)
    label?: string;            // override row label; defaults to "Player names"
    fixedSize?: boolean;       // when true, hide + and ✕ (e.g. Forecast: exactly 2)
    hideWhenEmpty?: boolean;   // when true and roster is empty, render nothing.
                               // Used by games (MLT, NHIE) that don't prompt
                               // for entry but display existing roster.
}

// Sibling of TeamRosterRow but for individual human players. Same three-state
// UX (empty / editing / saved-pill). Persists via SessionService.players, so
// names entered in one game auto-fill the next. Each game scopes the row with
// its own min/max — Forecast wants exactly 2, TOD up to 10, etc. — but the
// underlying state is shared.
const PlayerRosterRow: React.FC<PlayerRosterRowProps> = ({
    players,
    onPlayersChange,
    minPlayers,
    maxPlayers,
    label = 'Player names',
    fixedSize = false,
    hideWhenEmpty = false,
}) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string[]>(['', '']);

    const startEdit = () => {
        // Seed from saved players, padded out to minPlayers if there aren't enough.
        // Truncate if the saved list is bigger than this game's max (e.g. coming
        // from a 6-player TOD into Forecast which only takes 2).
        const seed = players.length > 0 ? [...players] : [];
        while (seed.length < minPlayers) seed.push('');
        const trimmed = seed.slice(0, maxPlayers);
        setDraft(trimmed);
        setEditing(true);
    };

    const cancelEdit = () => setEditing(false);

    const saveEdit = () => {
        const cleaned = draft.map(n => n.trim()).filter(Boolean);
        sessionService.setPlayers(cleaned);
        onPlayersChange(cleaned);
        setEditing(false);
    };

    const clearAll = () => {
        sessionService.clearPlayers();
        onPlayersChange([]);
        setEditing(false);
    };

    const addRow = () => {
        if (draft.length < maxPlayers) setDraft([...draft, '']);
    };

    const removeRow = (i: number) => {
        if (draft.length <= minPlayers) return;
        setDraft(draft.filter((_, idx) => idx !== i));
    };

    const updateName = (i: number, value: string) => {
        const next = [...draft];
        next[i] = value;
        setDraft(next);
    };

    // ---------- Editing state ----------
    if (editing) {
        const filledCount = draft.filter(n => n.trim()).length;
        const canSave = filledCount >= minPlayers;
        return (
            <div className="bg-surface border border-divider rounded-xl p-3 mb-3 max-w-[360px] mx-auto w-full">
                <div className="flex items-center gap-1.5 mb-2.5">
                    <User size={14} className="text-muted" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">
                        {label} <span className="text-muted/70 font-normal normal-case tracking-normal">(optional)</span>
                    </span>
                </div>
                <div className="space-y-2">
                    {draft.map((name, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => updateName(i, e.target.value)}
                                placeholder={`Player ${i + 1}`}
                                maxLength={20}
                                className="flex-1 bg-app-tint border border-divider rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent placeholder:text-muted"
                            />
                            {!fixedSize && draft.length > minPlayers && (
                                <button
                                    onClick={() => removeRow(i)}
                                    aria-label={`Remove player ${i + 1}`}
                                    className="w-7 h-7 rounded-full bg-surface-alt border border-divider text-muted hover:text-ink flex items-center justify-center transition-colors"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {!fixedSize && draft.length < maxPlayers && (
                    <button
                        onClick={addRow}
                        className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-ink font-semibold transition-colors"
                    >
                        <Plus size={13} /> Add another player
                    </button>
                )}
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={cancelEdit}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold bg-surface-alt text-ink-soft hover:text-ink border border-divider transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={saveEdit}
                        disabled={!canSave}
                        className="flex-1 py-2 rounded-lg text-sm font-semibold bg-accent text-white disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                    >
                        Save
                    </button>
                </div>
            </div>
        );
    }

    // ---------- Saved + collapsed ----------
    if (players.length > 0) {
        // Truncate displayed names to first 4; show "+N" for the rest so a
        // 10-player TOD roster doesn't flood the row.
        const SHOW = 4;
        const visible = players.slice(0, SHOW);
        const overflow = players.length - visible.length;
        return (
            <div className="flex items-center justify-center gap-2 mb-3 max-w-[360px] mx-auto w-full px-2">
                <User size={13} className="text-muted flex-shrink-0" />
                <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                    {visible.map((p, i) => (
                        <React.Fragment key={i}>
                            <span className="text-xs font-bold text-ink truncate max-w-[80px]">{p}</span>
                            {i < visible.length - 1 && <span className="text-xs text-muted">·</span>}
                        </React.Fragment>
                    ))}
                    {overflow > 0 && (
                        <span className="text-xs text-muted font-semibold">+{overflow}</span>
                    )}
                </div>
                <button
                    onClick={startEdit}
                    aria-label="Edit player names"
                    className="w-6 h-6 rounded-full text-muted hover:text-ink transition-colors flex items-center justify-center flex-shrink-0"
                >
                    <Pencil size={12} />
                </button>
                <button
                    onClick={clearAll}
                    aria-label="Clear player names"
                    className="w-6 h-6 rounded-full text-muted hover:text-ink transition-colors flex items-center justify-center flex-shrink-0"
                >
                    <X size={12} />
                </button>
            </div>
        );
    }

    // ---------- Empty + collapsed (default) ----------
    // Games that don't capture names locally (MLT, NHIE) pass hideWhenEmpty
    // so the empty state renders nothing — they only display the pill if a
    // roster was set elsewhere (Forecast / TOD).
    if (hideWhenEmpty) return null;

    return (
        <button
            onClick={startEdit}
            className="flex items-center justify-center gap-1.5 w-full max-w-[360px] mx-auto mb-3 py-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
        >
            <Plus size={13} /> Add player names
            <span className="text-muted/70 font-normal">(optional)</span>
        </button>
    );
};

export default PlayerRosterRow;
