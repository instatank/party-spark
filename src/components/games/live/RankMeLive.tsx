import React, { useState } from 'react';
import { Check, Lock, RotateCcw, Heart } from 'lucide-react';
import { ScreenHeader, Button } from '../../ui/Layout';
import RoomPanel from '../../ui/RoomPanel';
import { PinGateModal, isAdultUnlocked } from '../../ui/PinGate';
import { useRoom, leaveRoom, type RoomSession } from '../../../services/roomService';
import { mulberry32, newSeed } from '../../../services/seededRandom';
import { freezeRoster, rosterOf, turnOf, forcedKey, waitingOn } from '../../../services/liveRoom';
import {
    cardPool, dealSequence, startingOrder, tierFor, MAX_CARD_POINTS,
    type RankCard, type RankDeck,
} from '../../../services/rankMeEngine';
import {
    liveTurnCount, tasksFor, teamsOf, readsAt, readsThrough, readerBoard, rankerBoard, teamBoard,
    type LiveRankMode, type LiveRead,
} from '../../../services/rankMeLive';
import { useLiveLog } from '../../../hooks/useLiveLog';
import { statsStore } from '../../../services/statsStore';
import { playReveal, playDing, playPop } from '../../../services/audio';
import { hapticLight, hapticSuccess } from '../../../services/haptics';
import { GameType } from '../../../types';
import { RankList } from '../rankme/RankList';
import { RevealTable } from '../rankme/RevealTable';
import { LiveWaiting, LiveNext, LiveOffline, LiveSpectating, LiveAdultGate, LiveCue } from './LiveBits';

// RANK ME on separate phones. The point of a second phone here is privacy
// without hand-offs: the ranker orders on their own screen while everybody
// else predicts on theirs, all at once. Turn structure: services/rankMeLive.ts.
// Scoring: scoreRanking in rankMeEngine.ts, identical to pass-and-play.

const ACCENT = '#EC4899';
const DECK_COLOR: Record<string, string> = { reallife: '#F59E0B', whatif: '#8B5CF6', afterdark: '#F43F5E' };
const SPICY = 'afterdark';

const MODES: { id: LiveRankMode; label: string; blurb: string }[] = [
    { id: 'read', label: '🔮 Read them', blurb: 'One ranks; everyone else predicts on their own phone and is scored on their own read. Two players = Know Me.' },
    { id: 'couples', label: '⚔️ Couples', blurb: 'Partners join one after the other and pair up in join order. Every team plays the same card at once.' },
];

interface Props { data: { categories: RankDeck[]; cards: RankCard[] }; onBack: () => void; onHome: () => void }

export const RankMeLive: React.FC<Props> = ({ data, onBack, onHome }) => {
    const [session, setSession] = useState<RoomSession | null>(null);
    const room = useRoom(session, ['PLAY']);
    const { logs, mine, answer, g, me } = useLiveLog<string[]>(room, session);

    // Host lobby choices.
    const [mode, setMode] = useState<LiveRankMode>('read');
    const [decks, setDecks] = useState<string[]>(() => ['reallife', 'whatif', ...(isAdultUnlocked() ? [SPICY] : [])]);
    const [sweet, setSweet] = useState(false);
    const [laps, setLaps] = useState(2);
    const [rounds, setRounds] = useState(6);
    const [hostPin, setHostPin] = useState(false);
    const [, setUnlocked] = useState(0);

    // This phone's working order for the current turn, re-shuffled whenever
    // the turn (or this phone's role in it) changes.
    const [working, setWorking] = useState<{ key: string; order: string[] }>({ key: '', order: [] });
    const [view, setView] = useState<{ key: string; id: string | null }>({ key: '', id: null });

    const leave = () => { if (session) void leaveRoom(session.code, session.playerId); setSession(null); onBack(); };
    const home = () => { if (session) void leaveRoom(session.code, session.playerId); onHome(); };

    const r = room.room;
    const cfg = r?.meta.config ?? {};
    const cfgMode: LiveRankMode = cfg.mode === 'couples' ? 'couples' : 'read';
    const cfgDecks = Array.isArray(cfg.decks) ? (cfg.decks as string[]) : ['reallife', 'whatif'];
    const roster = r ? rosterOf(r) : [];
    const turns = liveTurnCount(cfgMode, roster.length, { laps: Number(cfg.laps) || 2, rounds: Number(cfg.rounds) || 6 });
    // Dealing must not depend on THIS phone's unlock — every phone deals the
    // host's selection; the per-device PIN only decides what this phone shows.
    const seed = r?.meta.seed ?? 0;
    const sweetOn = cfg.sweet === true;
    // Cheap (a few hundred comparisons), so derived every render rather than
    // memoised — the compiler could not preserve a manual memo here.
    const cards = dealSequence(
        cardPool(data.cards, { decks: cfgDecks, adultAllowed: cfgDecks.includes(SPICY), keepItSweet: sweetOn }),
        turns, mulberry32(seed),
    );

    // ---------------- lobby ----------------
    if (!session) {
        const toggleDeck = (id: string) => {
            hapticLight();
            if (decks.includes(id)) { if (decks.length > 1) setDecks(decks.filter(d => d !== id)); return; }
            if (id === SPICY && !isAdultUnlocked()) { setHostPin(true); return; }
            setDecks([...decks, id]);
        };
        const lengths = mode === 'read' ? [1, 2, 3] : [4, 6, 8];
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Play live" onBack={leave} onHome={home} />
                {hostPin && (
                    <PinGateModal
                        onSuccess={() => { setHostPin(false); setDecks(d => (d.includes(SPICY) ? d : [...d, SPICY])); }}
                        onCancel={() => setHostPin(false)}
                    />
                )}
                <div className="flex-1 overflow-y-auto pb-8 px-2">
                    <RoomPanel
                        game={GameType.RANK_ME}
                        title="Separate phones"
                        blurb="Rank in private on your own phone, while everyone else predicts on theirs. No passing the phone."
                        accent="pink"
                        config={{ mode, decks, sweet, laps, rounds }}
                        minPlayers={mode === 'couples' ? 4 : 2}
                        startConfig={rm => ({ roster: freezeRoster(rm), g: 1, forced: null })}
                        describeConfig={c => {
                            const m = MODES.find(x => x.id === c.mode) ?? MODES[0];
                            const ds = (Array.isArray(c.decks) ? c.decks as string[] : []).map(id => data.categories.find(d => d.id === id)?.name ?? id);
                            return <><span className="font-bold text-ink">{m.label}</span> · {ds.join(', ')}{c.sweet ? ' · sweet' : ''}{c.mode === 'couples' ? <span className="block mt-1">Partners: join one after the other.</span> : null}</>;
                        }}
                        hostControls={
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Mode</p>
                                <div className="grid grid-cols-2 gap-2 mb-1">
                                    {MODES.map(m => (
                                        <button key={m.id} onClick={() => { hapticLight(); setMode(m.id); }} data-live-mode={m.id}
                                            className={`rounded-lg py-2 px-2 border text-sm font-bold transition-colors ${mode === m.id ? 'bg-pink-500/15 border-pink-500 text-pink-500' : 'bg-surface-alt border-divider text-muted'}`}>
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                                <p className="text-[11px] text-muted mb-3 leading-snug">{MODES.find(m => m.id === mode)!.blurb}</p>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Decks</p>
                                <div className="grid gap-1.5 mb-3">
                                    {data.categories.map(d => {
                                        const on = decks.includes(d.id);
                                        const color = DECK_COLOR[d.id] ?? ACCENT;
                                        return (
                                            <button key={d.id} onClick={() => toggleDeck(d.id)} aria-pressed={on} data-live-deck={d.id}
                                                className={`flex items-center gap-2 text-left rounded-lg py-2 px-3 border transition-colors ${on ? '' : 'bg-surface-alt border-divider'}`}
                                                style={on ? { borderColor: color, background: `${color}14` } : undefined}>
                                                <span>{d.emoji}</span>
                                                <span className="flex-1 text-sm text-ink font-semibold">{d.name}{d.spicy && <span className="ml-1.5 text-[9px] font-extrabold text-red-500 bg-red-500/15 px-1.5 py-[2px] rounded">18+</span>}</span>
                                                {on && <Check size={14} style={{ color }} />}
                                            </button>
                                        );
                                    })}
                                </div>
                                <button onClick={() => setSweet(s => !s)} aria-pressed={sweet} className={`flex items-center gap-2 w-full rounded-lg py-2 px-3 border mb-3 text-left ${sweet ? 'border-pink-500/60 bg-pink-500/10' : 'border-divider bg-surface-alt'}`}>
                                    <Heart size={14} className={sweet ? 'text-pink-500 fill-pink-500' : 'text-muted'} />
                                    <span className="text-sm text-ink font-semibold flex-1">Keep it sweet</span>
                                    <span className="text-[11px] text-muted">no exes</span>
                                </button>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted flex-1">{mode === 'read' ? 'Laps of the room' : 'Rounds'}</span>
                                    {lengths.map(n => {
                                        const on = (mode === 'read' ? laps : rounds) === n;
                                        return (
                                            <button key={n} onClick={() => (mode === 'read' ? setLaps(n) : setRounds(n))} aria-pressed={on} data-live-length={n}
                                                className={`w-9 h-8 rounded-lg text-sm font-bold border ${on ? 'bg-pink-500/15 border-pink-500 text-pink-500' : 'bg-surface-alt border-divider text-muted'}`}>
                                                {n}
                                            </button>
                                        );
                                    })}
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

    if (cfgDecks.includes(SPICY) && !isAdultUnlocked()) {
        return <LiveAdultGate title="Rank Me" deckName="After Dark" onUnlock={() => setUnlocked(n => n + 1)} onLeave={leave} />;
    }

    const hostName = r.players.find(p => p.id === r.meta.hostId)?.name ?? 'The host';
    const nameOf = (id: string) => roster.find(p => p.id === id)?.name ?? '?';
    const teams = teamsOf(roster);
    const teamName = (k: number) => teams[k]?.map(p => p.name).join(' & ') ?? '';
    const t = turnOf(r);
    const ended = r.meta.phase === 'END' || t >= cards.length;

    const playAgain = () => {
        hapticLight();
        void room.host({ phase: 'PLAY', round: 1, seed: newSeed(), config: { g: g + 1, roster: freezeRoster(r), forced: null } });
    };

    // ---------------- end ----------------
    if (ended) {
        const reads = readsThrough(cfgMode, roster, logs, Math.min(t + 1, cards.length));
        const readers = readerBoard(roster, reads);
        const readable = rankerBoard(roster, reads);
        const board = teamBoard(roster, reads);
        const winners = cfgMode === 'couples'
            ? (board.length > 1 && board[0].points > board[1].points ? board[0].team.map(p => p.name) : [])
            : (readers.length > 1 && readers[0].pct > readers[1].pct ? [readers[0].name] : []);
        const best = reads.reduce<LiveRead | null>((b, x) => (!b || x.score.points >= b.score.points ? x : b), null);
        return (
            <div className="h-full flex flex-col animate-fade-in" data-live-end={cfgMode}>
                <ScreenHeader title="Rank Me" onBack={leave} onHome={home} />
                <LiveCue cueKey={`${r.meta.code}:${g}`} onCue={() => {
                    statsStore.recordPlay(GameType.RANK_ME);
                    if (winners.length) statsStore.recordWins(GameType.RANK_ME, winners);
                }} />
                <div className="flex-1 overflow-y-auto pb-10">
                    <div className="max-w-[360px] mx-auto w-full text-center">
                        <div className="text-5xl mb-2">{cfgMode === 'couples' ? '🏆' : '🔮'}</div>
                        {cfgMode === 'couples' ? (
                            <>
                                <h2 className="text-2xl font-black text-ink leading-tight mb-4" data-headline>
                                    {winners.length ? <>Team {board[0].k + 1} wins: {teamName(board[0].k)}</> : <>It's a tie at the top.</>}
                                </h2>
                                <div className="grid gap-2 text-left">
                                    {board.map((b, i) => (
                                        <Row key={b.k} name={`Team ${b.k + 1}`} sub={`${teamName(b.k)} · ${b.points} pts`} right={`${b.pct}%`} lead={i === 0 && winners.length > 0} data={{ 'data-team-row': b.k, 'data-team-points': b.points }} />
                                    ))}
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 className="text-2xl font-black text-ink leading-tight mb-1" data-headline>
                                    {winners.length ? <>{readers[0].name} reads people best.</> : readers.length ? <>A dead heat at the top.</> : <>Nobody got a read in.</>}
                                </h2>
                                {readable.length > 1 && readable[0].pct < readable[readable.length - 1].pct && (
                                    <p className="text-sm text-muted mb-4">{readable[0].name} was hardest to read ({readable[0].pct}%).</p>
                                )}
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted mb-2 mt-4">Average read</p>
                                <div className="grid gap-2 text-left">
                                    {readers.map((x, i) => (
                                        <Row key={x.id} name={x.name} sub={`${x.points} pts over ${x.cards} card${x.cards === 1 ? '' : 's'}`} right={`${x.pct}%`} lead={i === 0 && winners.length > 0} data={{ 'data-reader-row': x.name, 'data-reader-points': x.points }} />
                                    ))}
                                </div>
                            </>
                        )}
                        {best && (
                            <div className="mt-5 text-left rounded-xl border border-divider bg-surface p-3">
                                <div className="flex items-baseline justify-between gap-2 mb-1">
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">Best read · {nameOf(best.reader)} reading {nameOf(best.ranker)}</span>
                                    <span className="text-sm font-black text-ink tabular-nums">{best.score.points}/{MAX_CARD_POINTS}</span>
                                </div>
                                <p className="text-sm font-bold text-ink leading-snug mb-2">{cards[best.t]?.prompt}</p>
                                <RevealTable compact rankerOrder={best.order} prediction={best.guess} score={best.score} rankerLabel={nameOf(best.ranker)} readerLabel={nameOf(best.reader)} accent={ACCENT} />
                            </div>
                        )}
                        <div className="grid gap-2 mt-6">
                            {room.isHost ? (
                                <Button onClick={playAgain} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2" data-live-again>
                                    <RotateCcw size={18} /> Play again
                                </Button>
                            ) : <p className="text-sm text-muted py-2">{hostName} can start another game.</p>}
                            <button onClick={leave} className="text-sm text-muted hover:text-ink py-2">Leave room</button>
                        </div>
                        <LiveOffline offline={room.offline} error={room.error} />
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- a turn ----------------
    const card = cards[t];
    const tasks = tasksFor(cfgMode, roster, t);
    const needed = tasks.flatMap(x => [x.ranker, ...x.readers]);
    const myTask = tasks.find(x => x.ranker === me || x.readers.includes(me));
    const role: 'rank' | 'read' | null = !myTask ? null : myTask.ranker === me ? 'rank' : 'read';
    const waiting = waitingOn(r, t, needed, logs);
    const revealed = waiting.length === 0;
    const locked = mine(t);
    const turnKey = `${g}:${t}:${role}`;

    if (role && !locked && working.key !== turnKey) {
        // The reader never starts on the ranker's answer when it is already
        // known, or a no-touch lock-in would score a perfect 14.
        const avoid = role === 'read' ? logs[myTask!.ranker]?.[t] ?? null : null;
        setWorking({ key: turnKey, order: startingOrder(card.items, avoid) });
    }

    const reads = revealed ? readsAt(cfgMode, roster, logs, t) : [];
    const perfect = reads.some(x => x.score.points === MAX_CARD_POINTS);

    const deck = data.categories.find(d => d.id === card.deck);
    const deckColor = DECK_COLOR[card.deck] ?? ACCENT;
    const progress = cfgMode === 'couples' ? `Round ${t + 1} / ${cards.length}` : `Card ${t + 1} / ${cards.length}`;

    const cardHead = (
        <div className="text-center mb-3">
            <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: deckColor, borderColor: `${deckColor}80`, background: `${deckColor}14` }}>
                    {deck?.emoji} {deck?.name}
                </span>
                <span className="text-[10px] font-mono text-muted">{progress}</span>
            </div>
            <h2 className="text-2xl font-black text-ink leading-tight font-serif" data-prompt>{card.prompt}</h2>
        </div>
    );

    const who = (() => {
        if (!myTask) return cfgMode === 'couples' && roster.some(p => p.id === me)
            ? <>Couples needs pairs. You're the odd one out this game.</>
            : null;
        if (cfgMode === 'couples') {
            const partner = role === 'rank' ? nameOf(myTask.readers[0]) : nameOf(myTask.ranker);
            return role === 'rank' ? <>Your true order. {partner} is predicting it right now.</> : <>Rank it as <span className="text-pink-500 font-bold">{partner}</span> would.</>;
        }
        return role === 'rank'
            ? <>You're ranking. Everyone else is predicting your order on their own phone.</>
            : <>Rank it as <span className="text-pink-500 font-bold">{nameOf(myTask.ranker)}</span> would.</>;
    })();

    const lock = () => {
        hapticLight(); playPop();
        answer(t, working.order);
    };

    // Which read the reveal table shows: tapped row, else my own, else the best.
    const shown = (() => {
        if (!reads.length) return null;
        const pick = view.key === turnKey ? view.id : null;
        return reads.find(x => x.reader === pick)
            ?? reads.find(x => x.reader === me)
            ?? (myTask ? reads.find(x => x.ranker === myTask.ranker) : undefined)
            ?? reads.slice().sort((a, b) => b.score.points - a.score.points)[0];
    })();

    return (
        <div className="h-full flex flex-col animate-fade-in" data-live-turn={t} data-live-card={card.id} data-live-role={role ?? 'none'}>
            <ScreenHeader title="Rank Me" onBack={leave} onHome={home} confirmOnExit />
            <LiveCue cueKey={revealed ? turnKey : ''} onCue={() => { if (perfect) { playDing(); hapticSuccess(); } else { playReveal(); hapticLight(); } }} />
            <div className="flex-1 overflow-y-auto pb-8">
                {!roster.some(p => p.id === me) && <div className="max-w-[340px] mx-auto"><LiveSpectating /></div>}
                {cardHead}

                {!revealed && role && !locked && (
                    <>
                        <p className="text-sm text-ink-soft text-center mb-2 max-w-[340px] mx-auto" data-live-who>{who}</p>
                        <RankList order={working.key === turnKey ? working.order : card.items} onChange={o => setWorking({ key: turnKey, order: o })} top={card.top} bottom={card.bottom} accent={ACCENT} />
                        <div className="max-w-[340px] mx-auto w-full mt-3">
                            <Button onClick={lock} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2" data-lock>
                                <Lock size={18} /> {role === 'read' ? 'Lock in guess' : 'Lock in'}
                            </Button>
                        </div>
                    </>
                )}

                {!revealed && (locked || !role) && (
                    <div className="max-w-[340px] mx-auto w-full">
                        {who && !locked && <p className="text-sm text-muted text-center mb-2">{who}</p>}
                        {locked && (
                            <div className="rounded-xl border border-divider bg-surface-alt p-3 mb-3" data-live-locked>
                                <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted mb-2 text-center">{role === 'read' ? 'Your guess, locked' : 'Your order, locked'}</p>
                                <ol className="text-sm text-ink space-y-1">
                                    {locked.map((x, i) => <li key={x} className="flex gap-2"><span className="text-muted tabular-nums w-4">{i + 1}</span>{x}</li>)}
                                </ol>
                            </div>
                        )}
                        <LiveWaiting
                            names={waiting.map(nameOf)}
                            isHost={room.isHost}
                            onForce={() => void room.host({ config: { forced: forcedKey(g, t) } })}
                            note="Nobody sees an order until every phone has locked in."
                        />
                    </div>
                )}

                {revealed && (
                    <div className="max-w-[360px] mx-auto w-full">
                        {!reads.length && <p className="text-center text-sm text-muted mb-4">No reads this card: the ranker didn't lock in.</p>}
                        <div className="grid gap-1.5 mb-4">
                            {reads.slice().sort((a, b) => b.score.points - a.score.points).map(x => {
                                const tier = tierFor(x.score.points);
                                const active = shown === x;
                                return (
                                    <button key={`${x.ranker}-${x.reader}`} onClick={() => setView({ key: turnKey, id: x.reader })}
                                        data-live-read={nameOf(x.reader)} data-points={x.score.points}
                                        className={`flex items-center gap-3 rounded-xl border px-3 py-2 text-left ${active ? 'border-pink-500/60 bg-pink-500/10' : 'bg-surface-alt border-divider'}`}>
                                        <span className="flex-1 min-w-0">
                                            <span className="block text-sm font-bold text-ink truncate">
                                                {cfgMode === 'couples' ? `Team ${(x.team ?? 0) + 1} · ` : ''}{nameOf(x.reader)} read {nameOf(x.ranker)}
                                            </span>
                                            <span className="block text-[11px] text-muted">{tier.emoji} {tier.label} · {x.score.exact} of 5 exact</span>
                                        </span>
                                        <span className="text-lg font-black text-ink tabular-nums">{x.score.points}<span className="text-xs text-muted">/{MAX_CARD_POINTS}</span></span>
                                    </button>
                                );
                            })}
                        </div>
                        {shown && (
                            <RevealTable
                                key={`${turnKey}-${shown.reader}`}
                                rankerOrder={shown.order}
                                prediction={shown.guess}
                                score={shown.score}
                                rankerLabel={`${nameOf(shown.ranker)}'s order`}
                                readerLabel={shown.reader === me ? 'Your guess' : `${nameOf(shown.reader)}'s guess`}
                                accent={ACCENT}
                            />
                        )}
                        <RunningBoard mode={cfgMode} roster={roster} logs={logs} through={t + 1} teamName={teamName} />
                        <div className="mt-5">
                            <LiveNext
                                isHost={room.isHost}
                                hostName={hostName}
                                label={t + 1 >= cards.length ? 'See results' : cfgMode === 'couples' ? `Round ${t + 2}` : 'Next card'}
                                onNext={() => { hapticLight(); void room.host(t + 1 >= cards.length ? { phase: 'END' } : { round: t + 2 }); }}
                            />
                        </div>
                    </div>
                )}
                <LiveOffline offline={room.offline} error={room.error} />
            </div>
        </div>
    );
};

const Row: React.FC<{ name: string; sub?: string; right: string; lead?: boolean; data?: Record<string, string | number> }> = ({ name, sub, right, lead, data }) => (
    <div {...data} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${lead ? 'border-pink-500/60 bg-pink-500/10' : 'bg-surface-alt border-divider'}`}>
        <span className="flex-1 min-w-0">
            <span className="block font-bold text-ink truncate">{name}</span>
            {sub && <span className="block text-[11px] text-muted truncate">{sub}</span>}
        </span>
        <span className="text-2xl font-black text-ink tabular-nums shrink-0">{right}</span>
    </div>
);

// The standings so far, under every reveal — the thing the room argues about.
const RunningBoard: React.FC<{
    mode: LiveRankMode; roster: ReturnType<typeof rosterOf>; logs: Record<string, Record<string, string[]>>;
    through: number; teamName: (k: number) => string;
}> = ({ mode, roster, logs, through, teamName }) => {
    const reads = readsThrough(mode, roster, logs, through);
    const rows = mode === 'couples'
        ? teamBoard(roster, reads).map(b => ({ key: `t${b.k}`, label: `Team ${b.k + 1} · ${teamName(b.k)}`, points: b.points }))
        : readerBoard(roster, reads).map(b => ({ key: b.id, label: b.name, points: b.points }));
    if (!rows.length) return null;
    return (
        <div className="mt-4 rounded-xl border border-divider bg-surface-alt px-3 py-2" data-live-board>
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-muted mb-1">{mode === 'couples' ? 'Leaderboard' : 'Points read so far'}</p>
            {rows.sort((a, b) => b.points - a.points).map((x, i) => (
                <div key={x.key} className="flex items-center justify-between text-sm py-0.5" data-board-row={x.label} data-board-points={x.points}>
                    <span className="text-ink truncate">{i === 0 ? '👑 ' : ''}{x.label}</span>
                    <span className="font-black text-ink tabular-nums">{x.points}</span>
                </div>
            ))}
        </div>
    );
};
