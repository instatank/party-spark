import { useCallback, useEffect, useRef, useState } from 'react';
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

    // Self-healing publish. A patch that failed (a phone dropping signal for a
    // second) would otherwise leave the answer showing on this phone while the
    // room waits on it forever, with nothing on screen to say why. So on every
    // poll, if the server's copy of my log is missing anything I answered,
    // send the whole log again. Idempotent: the log is complete each time.
    const rev = r?.players.find(p => p.id === me)?.rev ?? 0;
    const roomRev = r?.meta.rev ?? 0;
    const polled = r ? r.players.length + rev + roomRev : 0;
    useEffect(() => {
        if (!r || !local || local.g !== g) return;
        const server = logOf<T>(r, me);
        const missing = Object.keys(local.log).some(k => server[k] === undefined);
        if (missing) void room.patch(local);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [r, polled]);

    const mine = (t: number): T | undefined => logs[me]?.[t];
    return { logs, mine, answer, g, me };
}
