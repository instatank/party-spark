import { useCallback, useRef, useState } from 'react';
import type { RoomSession, UseRoomResult } from '../services/roomService';
import { gameNo, logOf, rosterOf } from '../services/liveRoom';

// The writing half of the answer-log pattern (see services/liveRoom.ts).
//
// An answer shows under the player's thumb at once, then publishes the WHOLE
// log for this game — never a delta — so whatever lands on the server is
// complete on its own. The local copy is what makes the tap instant: without
// it the button would sit unpressed until the next poll came back.

type Local<T> = { g: number; log: Record<string, T> } | null;

export function useLiveLog<T>(room: UseRoomResult, session: RoomSession | null) {
    // State drives the render; the ref is read only inside the tap handler,
    // where two taps landing before a re-render must still see each other
    // (otherwise both would pass the one-answer-per-turn check).
    const [local, setLocal] = useState<Local<T>>(null);
    const latest = useRef<Local<T>>(null);
    const r = room.room;
    const g = r ? gameNo(r) : 0;
    const me = session?.playerId ?? '';

    // Everyone's published log for the game in play, by player id. My own
    // entry folds in anything I have answered that the server has not echoed.
    const logs: Record<string, Record<string, T>> = {};
    if (r) {
        for (const p of rosterOf(r)) logs[p.id] = logOf<T>(r, p.id);
        if (local?.g === g) logs[me] = { ...logs[me], ...local.log };
    }

    const answer = useCallback((t: number, value: T) => {
        if (!r) return;
        const base = latest.current?.g === g ? latest.current.log : logOf<T>(r, me);
        if (base[t] !== undefined) return;   // one answer per turn, no changing it
        const next = { g, log: { ...base, [t]: value } };
        latest.current = next;
        setLocal(next);
        void room.patch(next);
    }, [r, g, me, room]);

    const mine = (t: number): T | undefined => logs[me]?.[t];
    return { logs, mine, answer, g, me };
}
