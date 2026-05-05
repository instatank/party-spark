import React, { useState } from 'react';
import { Plus, X, Pencil, Users } from 'lucide-react';
import { sessionService } from '../../services/SessionManager';

interface TeamRosterRowProps {
    teams: string[];
    onTeamsChange: (next: string[]) => void;
}

const MAX_TEAMS = 4;
const MIN_TEAMS = 2;

// Optional team-name capture shared across Charades / Taboo / Fact or Fiction.
// Three visual states:
//  1. Empty + collapsed → small "Add team names" prompt with Users icon
//  2. Editing            → inline text fields, +/- buttons, Save/Cancel
//  3. Saved + collapsed  → pill chips ("Mango vs Salt vs ...") + edit / clear
//
// Persistence is handled via SessionService.setTeams; the parent component
// just passes the current array down + an onTeamsChange callback. We keep a
// local draft array while editing so the user can cancel without commit.
const TeamRosterRow: React.FC<TeamRosterRowProps> = ({ teams, onTeamsChange }) => {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState<string[]>(['', '']);

    const startEdit = () => {
        // Seed the draft with what's saved, padded out to 2 fields if empty
        const seed = teams.length > 0 ? [...teams] : ['', ''];
        while (seed.length < MIN_TEAMS) seed.push('');
        setDraft(seed);
        setEditing(true);
    };

    const cancelEdit = () => {
        setEditing(false);
    };

    const saveEdit = () => {
        const cleaned = draft.map(n => n.trim()).filter(Boolean);
        sessionService.setTeams(cleaned);
        onTeamsChange(cleaned);
        setEditing(false);
    };

    const clearTeams = () => {
        sessionService.clearTeams();
        onTeamsChange([]);
        setEditing(false);
    };

    const addRow = () => {
        if (draft.length < MAX_TEAMS) setDraft([...draft, '']);
    };

    const removeRow = (i: number) => {
        if (draft.length <= MIN_TEAMS) return;
        setDraft(draft.filter((_, idx) => idx !== i));
    };

    const updateName = (i: number, value: string) => {
        const next = [...draft];
        next[i] = value;
        setDraft(next);
    };

    // ---------- Editing state ----------
    if (editing) {
        const canSave = draft.filter(n => n.trim()).length >= MIN_TEAMS;
        return (
            <div className="bg-surface border border-divider rounded-xl p-3 mb-3 max-w-[340px] mx-auto w-full">
                <div className="flex items-center gap-1.5 mb-2.5">
                    <Users size={14} className="text-muted" />
                    <span className="text-xs font-bold uppercase tracking-wider text-muted">
                        Team names <span className="text-muted/70 font-normal normal-case tracking-normal">(optional)</span>
                    </span>
                </div>
                <div className="space-y-2">
                    {draft.map((name, i) => (
                        <div key={i} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => updateName(i, e.target.value)}
                                placeholder={`Team ${i + 1}`}
                                maxLength={20}
                                className="flex-1 bg-app-tint border border-divider rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-accent placeholder:text-muted"
                            />
                            {draft.length > MIN_TEAMS && (
                                <button
                                    onClick={() => removeRow(i)}
                                    aria-label={`Remove team ${i + 1}`}
                                    className="w-7 h-7 rounded-full bg-surface-alt border border-divider text-muted hover:text-ink flex items-center justify-center transition-colors"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {draft.length < MAX_TEAMS && (
                    <button
                        onClick={addRow}
                        className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-ink font-semibold transition-colors"
                    >
                        <Plus size={13} /> Add another team
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
    if (teams.length > 0) {
        return (
            <div className="flex items-center justify-center gap-2 mb-3 max-w-[340px] mx-auto w-full px-2">
                <Users size={13} className="text-muted flex-shrink-0" />
                <div className="flex flex-wrap items-center gap-1 flex-1 min-w-0">
                    {teams.map((t, i) => (
                        <React.Fragment key={i}>
                            <span className="text-xs font-bold text-ink truncate max-w-[80px]">{t}</span>
                            {i < teams.length - 1 && <span className="text-xs text-muted">vs</span>}
                        </React.Fragment>
                    ))}
                </div>
                <button
                    onClick={startEdit}
                    aria-label="Edit team names"
                    className="w-6 h-6 rounded-full text-muted hover:text-ink transition-colors flex items-center justify-center flex-shrink-0"
                >
                    <Pencil size={12} />
                </button>
                <button
                    onClick={clearTeams}
                    aria-label="Clear team names"
                    className="w-6 h-6 rounded-full text-muted hover:text-ink transition-colors flex items-center justify-center flex-shrink-0"
                >
                    <X size={12} />
                </button>
            </div>
        );
    }

    // ---------- Empty + collapsed (default) ----------
    return (
        <button
            onClick={startEdit}
            className="flex items-center justify-center gap-1.5 w-full max-w-[340px] mx-auto mb-3 py-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
        >
            <Plus size={13} /> Add team names
            <span className="text-muted/70 font-normal">(optional)</span>
        </button>
    );
};

export default TeamRosterRow;
