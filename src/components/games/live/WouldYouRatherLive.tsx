import React, { useMemo, useState } from 'react';
import { RotateCcw, Check, X as XIcon, EyeOff } from 'lucide-react';
import { ScreenHeader, Button } from '../../ui/Layout';
import RoomPanel from '../../ui/RoomPanel';
import { PinGateModal, isAdultUnlocked } from '../../ui/PinGate';
import { useRoom, leaveRoom, type RoomSession } from '../../../services/roomService';
import { newSeed } from '../../../services/seededRandom';
import { freezeRoster, rosterOf, turnOf, forcedKey, waitingOn } from '../../../services/liveRoom';
import {
    dealLiveRound, seatFor, splitFor, tallyVote, tallyHotSeat,
    type Side, type LiveWyrMode,
} from '../../../services/wyrLive';
import { useLiveLog } from '../../../hooks/useLiveLog';
import { playReveal, playPop } from '../../../services/audio';
import { hapticLight, hapticSuccess } from '../../../services/haptics';
import { GameType } from '../../../types';
import { LiveWaiting, LiveNext, LiveOffline, LiveSpectating, LiveAdultGate, LiveCue } from './LiveBits';

// WOULD YOU RATHER on separate phones. Everything synced is derived from the
// room — the deck and mode the host froze into config, the seed, the round
// number and every player's answer log — so no phone ever holds a version of
// the game that another phone does not. Rules and tallies: services/wyrLive.ts.

interface Question { id: string; optionA: string; optionB: string; stats: { a: number; b: number } }
interface Deck { id: string; name: string; tagline: string; adult: boolean; color: string; items: Question[] }

const MODES: { id: LiveWyrMode; label: string; blurb: string }[] = [
    { id: 'vote', label: 'Everyone votes', blurb: 'Pick blind on your own phone. The reveal shows the real split, with names.' },
    { id: 'hotseat', label: '🔥 Hot Seat', blurb: 'One player picks in secret. Everyone else guesses their pick on their own phone.' },
];

export const WouldYouRatherLive: React.FC<{ decks: Deck[]; onBack: () => void; onHome: () => void }> = ({ decks, onBack, onHome }) => {
    const [session, setSession] = useState<RoomSession | null>(null);
    const room = useRoom(session, ['PLAY']);
    const { logs, mine, answer, g, me } = useLiveLog<Side>(room, session);

    // Host's lobby choices. Guests never see these controls; they inherit the
    // values through meta.config.
    const [deckId, setDeckId] = useState(decks[0].id);
    const [mode, setMode] = useState<LiveWyrMode>('vote');
    const [hostPin, setHostPin] = useState<string | null>(null);
    const [, setUnlocked] = useState(0);

    const leave = () => {
        if (session) void leaveRoom(session.code, session.playerId);
        setSession(null);
        onBack();
    };
    const home = () => {
        if (session) void leaveRoom(session.code, session.playerId);
        onHome();
    };

    const r = room.room;
    const cfgDeck = decks.find(d => d.id === r?.meta.config.deck) ?? decks[0];
    const cfgMode: LiveWyrMode = r?.meta.config.mode === 'hotseat' ? 'hotseat' : 'vote';
    const seed = r?.meta.seed ?? 0;
    const cards = useMemo(() => dealLiveRound(cfgDeck.items, seed), [cfgDeck, seed]);
    const t = r ? turnOf(r) : 0;

    // ---------------- lobby ----------------
    if (!session) {
        const pickDeck = (d: Deck) => {
            hapticLight();
            if (d.adult && !isAdultUnlocked()) { setHostPin(d.id); return; }
            setDeckId(d.id);
        };
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Play live" onBack={leave} onHome={home} />
                {hostPin && (
                    <PinGateModal
                        onSuccess={() => { setDeckId(hostPin); setHostPin(null); }}
                        onCancel={() => setHostPin(null)}
                    />
                )}
                <div className="flex-1 overflow-y-auto pb-8 px-2">
                    <RoomPanel
                        game={GameType.WOULD_YOU_RATHER}
                        title="Separate phones"
                        blurb="Same ten dilemmas on every phone. Nobody sees a vote until everyone's in."
                        accent="gold"
                        config={{ deck: deckId, mode }}
                        minPlayers={2}
                        startConfig={rm => ({ roster: freezeRoster(rm), g: 1, forced: null })}
                        describeConfig={c => {
                            const d = decks.find(x => x.id === c.deck) ?? decks[0];
                            const m = MODES.find(x => x.id === c.mode) ?? MODES[0];
                            return <><span className="font-bold text-ink">{d.name}</span>{d.adult && ' (18+)'} · {m.label}</>;
                        }}
                        hostControls={
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Mode</p>
                                <div className="grid grid-cols-2 gap-2 mb-1">
                                    {MODES.map(m => (
                                        <button key={m.id} onClick={() => { hapticLight(); setMode(m.id); }} data-live-mode={m.id}
                                            className={`rounded-lg py-2 px-2 border text-sm font-bold transition-colors ${mode === m.id ? 'bg-gold/15 border-gold text-gold' : 'bg-surface-alt border-divider text-muted'}`}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-muted mb-3 leading-snug">{MODES.find(m => m.id === mode)!.blurb}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Deck</p>
                                <div className="grid gap-2">
                                    {decks.map(d => (
                                        <button key={d.id} onClick={() => pickDeck(d)} data-live-deck={d.id}
                                            className={`text-left rounded-lg py-2 px-3 border transition-colors ${deckId === d.id ? 'bg-gold/10 border-gold/50' : 'bg-surface-alt border-divider hover:bg-app-tint'}`}>
                                            <span className="text-sm text-ink font-semibold">{d.name}</span>
                                            {d.adult && <span className="ml-1.5 text-[9px] font-extrabold text-red-500 bg-red-500/15 px-1.5 py-[2px] rounded">18+</span>}
                                            <span className="block text-[11px] text-muted truncate">{d.tagline}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        }
                        onStart={s => setSession(s)}
                        onCancel={onBack}
                    />
                </div>
            </div>
        );
    }

    if (!r || r.meta.phase === 'LOBBY') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Play live" onBack={leave} onHome={home} />
                <p className="flex-1 flex items-center justify-center text-sm text-muted">Starting…</p>
            </div>
        );
    }

    // ---------------- 18+ deck on a phone that has not unlocked it ----------------
    if (cfgDeck.adult && !isAdultUnlocked()) {
        return <LiveAdultGate title="Would You Rather?" deckName={cfgDeck.name} onUnlock={() => setUnlocked(n => n + 1)} onLeave={leave} />;
    }

    const roster = rosterOf(r);
    const host = r.players.find(p => p.id === r.meta.hostId);
    const hostName = host?.name ?? 'The host';
    const inGame = roster.some(p => p.id === me);
    const nameOf = (id: string) => roster.find(p => p.id === id)?.name ?? '?';
    const hot = cfgMode === 'hotseat';

    const playAgain = () => {
        hapticLight();
        void room.host({ phase: 'PLAY', round: 1, seed: newSeed(), config: { g: g + 1, roster: freezeRoster(r), forced: null } });
    };

    // ---------------- end of round ----------------
    if (r.meta.phase === 'END' || t >= cards.length) {
        const vote = tallyVote(roster, logs, cards.length);
        const seat = tallyHotSeat(roster, logs, g, cards.length);
        const readers = seat.readers.slice().sort((a, b) => b.right / b.of - a.right / a.of);
        const seats = seat.seats.slice().sort((a, b) => b.fooled / Math.max(1, b.of) - a.fooled / Math.max(1, a.of));
        const rows = vote.rows.filter(x => x.voted > 0).sort((a, b) => a.withRoom - b.withRoom);
        return (
            <div className="h-full flex flex-col animate-fade-in" data-live-end={cfgMode}>
                <ScreenHeader title="Would You Rather?" onBack={leave} onHome={home} />
                <div className="flex-1 overflow-y-auto pb-10">
                    <div className="max-w-[340px] mx-auto w-full text-center">
                        <div className="text-5xl mb-2">{hot ? '🔥' : '⚖️'}</div>
                        {hot ? (
                            <>
                                <h2 className="text-2xl font-black text-ink leading-tight mb-1" data-headline>
                                    {readers.length ? `${readers[0].name} reads the room best.` : 'Nobody got a read in.'}
                                </h2>
                                {seats[0] && seats[0].fooled > 0 && (
                                    <p className="text-sm text-muted mb-4">{seats[0].name} was hardest to read: fooled {seats[0].fooled} of {seats[0].of} guesses.</p>
                                )}
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted mb-2 mt-4">Reads right</p>
                                <div className="grid gap-2 text-left">
                                    {readers.map((x, i) => (
                                        <div key={x.id} data-reader-row={x.name} data-right={x.right} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${i === 0 ? 'border-gold/60 bg-gold/10' : 'bg-surface-alt border-divider'}`}>
                                            <span className="font-bold text-ink truncate">{x.name}</span>
                                            <span className="text-sm text-muted shrink-0"><span className="text-ink font-bold">{x.right}</span> of {x.of}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-black text-ink leading-tight mb-1" data-headline>
                                    {vote.closest ? `${vote.closest.a} & ${vote.closest.b} agreed on ${vote.closest.agreed} of ${vote.closest.of}.` : `That's ${cards.length}.`}
                                </h2>
                                {vote.furthest && vote.furthest.agreed < vote.furthest.of && (
                                    <p className="text-sm text-muted mb-4">{vote.furthest.a} & {vote.furthest.b} only agreed on {vote.furthest.agreed}.</p>
                                )}
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted mb-2 mt-4">With the room's majority</p>
                                <div className="grid gap-2 text-left">
                                    {rows.map((x, i) => (
                                        <div key={x.id} data-vote-row={x.name} data-with-room={x.withRoom} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${i === 0 ? 'border-gold/60 bg-gold/10' : 'bg-surface-alt border-divider'}`}>
                                            <span className="font-bold text-ink truncate">{x.name}{i === 0 && rows.length > 1 && rows[1].withRoom > x.withRoom && <span className="text-xs text-gold font-bold ml-1.5">contrarian</span>}</span>
                                            <span className="text-sm text-muted shrink-0"><span className="text-ink font-bold">{x.withRoom}</span> of {x.voted}</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                        <div className="grid gap-2 mt-6">
                            {room.isHost ? (
                                <Button onClick={playAgain} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2" data-live-again>
                                    <RotateCcw size={18} /> Ten more
                                </Button>
                            ) : (
                                <p className="text-sm text-muted py-2">{hostName} can deal ten more.</p>
                            )}
                            <button onClick={leave} className="text-sm text-muted hover:text-ink py-2">Leave room</button>
                        </div>
                        <LiveOffline offline={room.offline} error={room.error} />
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- a card ----------------
    const card = cards[t];
    const seatP = hot ? seatFor(roster, g, t) : null;
    const iAmSeat = seatP?.id === me;
    const waiting = waitingOn(r, t, roster.map(p => p.id), logs);
    const revealed = waiting.length === 0;
    const myPick = mine(t);
    const split = splitFor(roster, logs, t);
    const seatPick = seatP ? logs[seatP.id]?.[t] : undefined;

    const tap = (side: Side) => {
        if (!inGame || myPick || revealed) return;
        hapticLight(); playPop();
        answer(t, side);
    };

    // In hot seat a guesser's "pick" is a guess about the seat, so the reveal
    // groups guessers under the side they called and marks the seat's own pick.
    const option = (side: Side) => {
        const text = side === 'A' ? card.optionA : card.optionB;
        const est = side === 'A' ? card.stats.a : card.stats.b;
        const voters = split[side];
        const total = split.A.length + split.B.length;
        const isTruth = hot ? seatPick === side : false;
        const hl = revealed ? (hot ? isTruth : voters.length > 0 && voters.length >= (side === 'A' ? split.B.length : split.A.length)) : myPick === side;
        return (
            <button
                onClick={() => tap(side)}
                disabled={!inGame || Boolean(myPick) || revealed}
                data-live-option={side}
                className={`relative w-full p-5 rounded-2xl border-2 transition-all duration-300 text-left ${hl ? 'bg-gold/15 border-gold shadow-[0_0_15px_rgba(234,179,8,0.25)]' : revealed || myPick ? 'bg-surface border-divider opacity-70' : 'bg-surface border-divider hover:border-gold active:scale-[0.98]'}`}
            >
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className={`text-xs font-bold uppercase tracking-wider ${side === 'A' ? 'text-gold' : 'text-accent'}`}>Option {side}</span>
                    {!revealed && myPick === side && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gold/20 text-gold">{hot && !iAmSeat ? 'your guess' : 'your pick'}</span>}
                    {revealed && hot && isTruth && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-gold text-slate-900" data-seat-pick>{seatP!.name}'s pick</span>}
                    {revealed && !hot && <span className="text-sm font-black text-ink tabular-nums" data-live-count={voters.length}>{voters.length}/{total}</span>}
                </div>
                <h3 className="text-xl font-bold text-ink leading-tight">{text}</h3>
                {revealed && (
                    <div className="flex flex-wrap gap-1 mt-2.5 animate-fade-in">
                        {voters.filter(v => !(hot && v.id === seatP?.id)).map(v => {
                            const right = hot ? side === seatPick : null;
                            return (
                                <span key={v.id} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-alt border border-divider text-ink-soft inline-flex items-center gap-1">
                                    {right === true && <Check size={11} className="text-emerald-500" />}
                                    {right === false && <XIcon size={11} className="text-rose-500" />}
                                    {v.name}
                                </span>
                            );
                        })}
                        {!hot && <span className="text-[10px] text-muted self-center ml-auto">est. {est}% of people</span>}
                    </div>
                )}
            </button>
        );
    };

    const verdict = (() => {
        if (!revealed) return null;
        if (hot) {
            if (!seatPick) return `${seatP!.name} never picked. No reads this card.`;
            const guessers = roster.filter(p => p.id !== seatP!.id && logs[p.id]?.[t]);
            const right = guessers.filter(p => logs[p.id][t] === seatPick).length;
            if (iAmSeat) return right === guessers.length ? 'They read you perfectly.' : `You fooled ${guessers.length - right} of ${guessers.length}.`;
            if (!myPick) return `${right} of ${guessers.length} read ${seatP!.name} right.`;
            return myPick === seatPick ? `You read ${seatP!.name} right.` : `${seatP!.name} fooled you.`;
        }
        const total = split.A.length + split.B.length;
        if (split.A.length === split.B.length) return `Dead even, ${split.A.length}–${split.B.length}.`;
        if (!myPick) return `The room went ${Math.max(split.A.length, split.B.length)}–${Math.min(split.A.length, split.B.length)}.`;
        const mineCount = split[myPick].length;
        if (mineCount === 1) return "You're on your own on that one.";
        return mineCount * 2 > total ? `You're with the room, ${mineCount} of ${total}.` : `Minority report: ${mineCount} of ${total}.`;
    })();

    const prompt = (() => {
        if (!hot) return myPick ? null : 'Pick a side. Nobody sees it until everyone has.';
        if (iAmSeat) return myPick ? null : <><EyeOff size={14} className="inline -mt-0.5 mr-1" />Pick in secret. Everyone else is guessing.</>;
        return myPick ? null : <>What did <span className="font-bold text-ink">{seatP!.name}</span> pick? Make your call.</>;
    })();

    return (
        <div className="h-full flex flex-col animate-fade-in" data-live-card={card.id} data-live-turn={t}>
            <ScreenHeader title={cfgDeck.name} onBack={leave} onHome={home} confirmOnExit />
            {/* A beat of sound when a card flips to its reveal — once per card. */}
            <LiveCue cueKey={revealed ? `${g}:${t}` : ''} onCue={() => { playReveal(); hapticSuccess(); }} />
            <div className="flex-1 overflow-y-auto pb-8">
                <div className="max-w-[380px] mx-auto w-full">
                    {!inGame && <LiveSpectating />}
                    <p className="text-center text-xs font-mono text-muted mb-2">Question {t + 1} / {cards.length}</p>
                    {hot && (
                        <div className="text-center mb-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/40 text-orange-500 text-xs font-extrabold uppercase tracking-wider" data-live-seat={seatP!.name}>
                                🔥 {iAmSeat ? "You're" : `${seatP!.name} is`} in the hot seat
                            </span>
                        </div>
                    )}
                    {prompt && <p className="text-center text-sm text-ink-soft mb-3">{prompt}</p>}
                    <div className="grid gap-3">
                        {option('A')}
                        <div className="flex items-center gap-4 text-muted font-serif italic justify-center">
                            <div className="h-px bg-divider flex-1" /><span>OR</span><div className="h-px bg-divider flex-1" />
                        </div>
                        {option('B')}
                    </div>
                    <div className="mt-4">
                        {revealed ? (
                            <>
                                <p className="text-center text-sm text-ink-soft mb-4" data-live-verdict>{verdict}</p>
                                <LiveNext
                                    isHost={room.isHost}
                                    hostName={hostName}
                                    label={t + 1 >= cards.length ? 'Finish round' : 'Next question'}
                                    onNext={() => { hapticLight(); void room.host(t + 1 >= cards.length ? { phase: 'END' } : { round: t + 2 }); }}
                                />
                            </>
                        ) : (myPick || !inGame) ? (
                            <LiveWaiting
                                names={waiting.map(nameOf)}
                                isHost={room.isHost}
                                onForce={() => void room.host({ config: { forced: forcedKey(g, t) } })}
                                note={hot && iAmSeat ? 'Your pick stays hidden until every guess is in.' : 'Nothing is shown until everyone has answered.'}
                            />
                        ) : null}
                    </div>
                    <LiveOffline offline={room.offline} error={room.error} />
                    {!hot && <p className="text-center text-[10px] text-muted font-mono mt-6">* The room's split is real. "est." is PartySpark's estimate.</p>}
                </div>
            </div>
        </div>
    );
};
