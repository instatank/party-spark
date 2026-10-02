import { useCallback, useRef, useState } from 'react';
import type { RoomSession, UseRoomResult } from '../services/roomService';
import { gameNo, logOf, rosterOf } from '../services/liveRoom';

// The writing half of the answer-log pattern (see services/liveRoom.ts).
//
// An answer shows under the player's thumb at once, then publishes the WHOLE
// log for this game — never a delta — so whatever lands on the server is
// complete on its own. The local copy is what makes the tap instant: without
// it the button would sit unpressed until the next poll came back.

export function useLiveLog<T>(room: UseRoomResult, session: RoomSession | null) {
    const local = useRef<{ g: number; log: Record<string, T> } | null>(null);
    const [, rerender] = useState(0);
    const r = room.room;
    const g = r ? gameNo(r) : 0;
    const me = session?.playerId ?? '';

    // Everyone's published log for the game in play, by player id. My own
    // entry folds in anything I have answered that the server has not echoed.
    const logs: Record<string, Record<string, T>> = {};
    if (r) {
        for (const p of rosterOf(r)) logs[p.id] = logOf<T>(r, p.id);
        if (local.current?.g === g) logs[me] = { ...logs[me], ...local.current.log };
    }

    const answer = useCallback((t: number, value: T) => {
        if (!r) return;
        const base = local.current?.g === g ? local.current.log : logOf<T>(r, me);
        if (base[t] !== undefined) return;   // one answer per turn, no changing it
        const next = { ...base, [t]: value };
        local.current = { g, log: next };
        rerender(n => n + 1);
        void room.patch({ g, log: next });
    }, [r, g, me, room]);

    return { logs, mine: (t: number): T | undefined => logs[me]?.[t], answer, g, me };
}
