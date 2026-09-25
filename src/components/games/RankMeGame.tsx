import React, { use, useRef, useState } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';
import TeamRosterRow from '../ui/TeamRosterRow';
import { sessionService } from '../../services/SessionManager';
import { statsStore } from '../../services/statsStore';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playReveal, playDing, playPop } from '../../services/audio';
import { hapticSuccess, hapticLight } from '../../services/haptics';
import { GameType } from '../../types';
import {
    scoreRanking, tierFor, toPercent, cardPool, pickCard, recordDeal, startingOrder, seenStore,
    MAX_CARD_POINTS, type RankCard, type RankDeck, type CardScore,
} from '../../services/rankMeEngine';
import { RankList } from './rankme/RankList';
import { RevealTable } from './rankme/RevealTable';
import { ArrowRight, Check, ChevronDown, Heart, Lock, RotateCcw, Search, Settings2 } from 'lucide-react';

// RANK ME — a social reading game, not trivia. A ranker privately orders five
// items; somebody else predicts that order; the reveal shows how well they
// read the person. One dataset, three modes that differ only in WHO ranks and
// WHO reads (see buildTurns). Scoring and dealing are pure functions in
// services/rankMeEngine.ts and are tested there.

const dataPromise = import('../../data/rank_me.json').then(m => m.default as unknown as { categories: RankDeck[]; cards: RankCard[] });

const ACCENT = '#EC4899';
// Static map — never template a Tailwind class from a deck id (CLAUDE.md).
const DECK_COLOR: Record<string, string> = { reallife: '#F59E0B', whatif: '#8B5CF6', afterdark: '#F43F5E' };
const ROOM = 'The room';

type Mode = 'hotseat' | 'knowme' | 'couples';
type Stage = 'SETUP' | 'PASS_RANK' | 'RANK' | 'PASS_READ' | 'READ' | 'REVEAL' | 'BOARD' | 'END';

interface Turn { ranker: string; reader: string; team: number | null; round: number }
interface Play { turn: Turn; card: RankCard; rankerOrder: string[]; prediction: string[]; score: CardScore }

const MODES: { id: Mode; label: string; who: string; blurb: string }[] = [
    { id: 'hotseat', label: '🔥 Hot Seat', who: '3+ players', blurb: 'One player ranks in secret. The room agrees on ONE guess of their order.' },
    { id: 'knowme', label: '💞 Know Me', who: '2 players', blurb: 'One ranks, the other predicts it. Swap roles every card.' },
    { id: 'couples', label: '⚔️ Couples', who: '2+ pairs', blurb: 'Couples vs Couples. Every pair plays the same card; points add up on a leaderboard.' },
];

// Teams of two, partners entered side by side. Kept as string[][] so a
// bigger team is a change to this one function, not to the turn logic.
const pairUp = (names: string[]): string[][] => {
    const teams: string[][] = [];
    for (let i = 0; i + 1 < names.length; i += 2) teams.push([names[i], names[i + 1]]);
    return teams;
};

// Hot Seat laps the table twice in small groups so a round is not over
// before it starts, and once from six players up.
const hotSeatCards = (n: number) => n * (n <= 5 ? 2 : 1);

function buildTurns(mode: Mode, players: string[], opts: { seat: number; knowMeLen: number; rounds: number }): Turn[] {
    if (mode === 'hotseat') {
        const n = players.length;
        return Array.from({ length: hotSeatCards(n) }, (_, t) => ({ ranker: players[(opts.seat + t) % n], reader: ROOM, team: null, round: t }));
    }
    if (mode === 'knowme') {
        return Array.from({ length: opts.knowMeLen }, (_, t) => ({ ranker: players[t % 2], reader: players[(t + 1) % 2], team: null, round: t }));
    }
    const teams = pairUp(players);
    const turns: Turn[] = [];
    for (let r = 0; r < opts.rounds; r++) {
        teams.forEach((team, k) => {
            // Roles alternate inside each team every round, so each person ranks equally often.
            const ranker = team[r % team.length];
            turns.push({ ranker, reader: team.filter(x => x !== ranker).join(' & '), team: k, round: r });
        });
    }
    return turns;
}

const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);

interface RankMeGameProps { onExit: () => void }

export const RankMeGame: React.FC<RankMeGameProps> = ({ onExit }) => {
    const DATA = use(dataPromise);
    const deckById = Object.fromEntries(DATA.categories.map(d => [d.id, d]));

    // ---- setup
    const [stage, setStage] = useState<Stage>('SETUP');
    const [mode, setMode] = useState<Mode>('hotseat');
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [decks, setDecks] = useState<string[]>(() => ['reallife', 'whatif', ...(isAdultUnlocked() ? ['afterdark'] : [])]);
    const [sweet, setSweet] = useState(false);
    const [knowMeLen, setKnowMeLen] = useState(8);
    const [rounds, setRounds] = useState(6);
    const [showPin, setShowPin] = useState(false);
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('rank_me'));
    const [nudge, setNudge] = useState<string | null>(null);

    // ---- dealing memory: no repeats this session, prefer unseen on this device
    const sessionUsed = useRef(new Set<string>());
    const seen = useRef<Set<string> | null>(null);
    const lastTheme = useRef<string | null>(null);

    // ---- play
    const [seat, setSeat] = useState(0);
    const [turns, setTurns] = useState<Turn[]>([]);
    const [turnIdx, setTurnIdx] = useState(0);
    const [card, setCard] = useState<RankCard | null>(null);
    const [working, setWorking] = useState<string[]>([]);
    const [locked, setLocked] = useState<string[] | null>(null);
    const [plays, setPlays] = useState<Play[]>([]);

    const turn = turns[turnIdx];
    const teams = mode === 'couples' ? pairUp(players) : [];

    const setupProblem = (): string | null => {
        if (mode === 'hotseat' && players.length < 3) return 'Hot Seat needs at least 3 names: one ranks, the rest read them.';
        if (mode === 'knowme' && players.length !== 2) return 'Know Me is for exactly 2 players. Edit the names down to two.';
        if (mode === 'couples' && (players.length < 4 || players.length % 2)) return 'Add partners side by side: 4, 6, 8… names.';
        if (!decks.length) return 'Pick at least one deck.';
        return null;
    };

    const pool = () => cardPool(DATA.cards, { decks, adultAllowed: isAdultUnlocked(), keepItSweet: sweet });

    const deal = (): RankCard | null => {
        const p = pool();
        if (!seen.current) seen.current = seenStore.load();
        const d = pickCard(p, { sessionUsed: sessionUsed.current, seen: seen.current, lastTheme: lastTheme.current });
        if (!d) return null;
        sessionUsed.current.add(d.card.id);
        seen.current = recordDeal(seen.current, d, p);
        seenStore.save(seen.current);
        lastTheme.current = d.card.theme;
        return d.card;
    };

    const start = (seatFrom = seat) => {
        const problem = setupProblem();
        if (problem) { setNudge(problem); return; }
        const first = deal();
        if (!first) { setNudge('No cards match those settings. Pick another deck.'); return; }
        setNudge(null);
        setTurns(buildTurns(mode, players, { seat: seatFrom, knowMeLen, rounds }));
        setTurnIdx(0);
        setCard(first);
        setLocked(null);
        setPlays([]);
        setStage('PASS_RANK');
    };

    const toggleDeck = (id: string) => {
        setNudge(null);
        if (decks.includes(id)) { setDecks(decks.filter(d => d !== id)); return; }
        if (deckById[id]?.spicy && !isAdultUnlocked()) { setShowPin(true); return; }
        setDecks([...decks, id]);
    };

    // ---- the per-turn flow
    const beginRank = () => { if (card) { setWorking(startingOrder(card.items, null)); setStage('RANK'); } };
    const lockRank = () => { setLocked(working); hapticLight(); playPop(); setStage('PASS_READ'); };
    const beginRead = () => { if (card && locked) { setWorking(startingOrder(card.items, locked)); setStage('READ'); } };
    const lockRead = () => {
        if (!card || !locked || !turn) return;
        const score = scoreRanking(locked, working);
        setPlays(p => [...p, { turn, card, rankerOrder: locked, prediction: working, score }]);
        if (score.points === MAX_CARD_POINTS) { playDing(); hapticSuccess(); } else { playReveal(); hapticLight(); }
        setStage('REVEAL');
    };

    const advance = (nextIdx: number) => {
        const sameCard = mode === 'couples' && turns[nextIdx].round === turns[turnIdx].round;
        if (!sameCard) {
            const next = deal();
            if (next) setCard(next);
        }
        setTurnIdx(nextIdx);
        setLocked(null);
        setStage('PASS_RANK');
    };

    const finish = () => {
        statsStore.recordPlay(GameType.RANK_ME);
        const winners = winnerNames();
        if (winners.length) statsStore.recordWins(GameType.RANK_ME, winners);
        setStage('END');
    };

    const afterReveal = () => {
        const nextIdx = turnIdx + 1;
        if (mode === 'couples' && (nextIdx >= turns.length || turns[nextIdx].round !== turn.round)) { setStage('BOARD'); return; }
        if (nextIdx >= turns.length) { finish(); return; }
        advance(nextIdx);
    };

    const afterBoard = () => {
        if (turnIdx + 1 >= turns.length) { finish(); return; }
        advance(turnIdx + 1);
    };

    const playAgain = () => {
        // The hot seat carries on round to round rather than restarting at the top of the list.
        const nextSeat = mode === 'hotseat' ? seat + turns.length : seat;
        setSeat(nextSeat);
        start(nextSeat);
    };

    // ---- tallies
    const teamTotals = () => teams.map((team, k) => {
        const mine = plays.filter(p => p.turn.team === k);
        const points = mine.reduce((s, p) => s + p.score.points, 0);
        return { k, team, points, pct: toPercent(points, mine.length), cards: mine.length };
    });

    const knowsPct = (name: string) => avg(plays.filter(p => p.turn.reader === name).map(p => p.score.percent));

    function winnerNames(): string[] {
        if (mode === 'knowme') {
            const [a, b] = players;
            const pa = knowsPct(a), pb = knowsPct(b);
            return pa === pb ? [] : [pa > pb ? a : b];
        }
        if (mode === 'couples') {
            const t = teamTotals().sort((x, y) => y.points - x.points);
            return t.length > 1 && t[0].points > t[1].points ? t[0].team : [];
        }
        return [];
    }

    const inPlay = stage !== 'SETUP' && stage !== 'END';
    const header = (
        <ScreenHeader
            title="Rank Me"
            onBack={stage === 'SETUP' ? onExit : () => setStage('SETUP')}
            onHome={onExit}
            confirmOnExit={inPlay}
        />
    );

    // =====================================================================
    // SETUP
    // =====================================================================
    if (stage === 'SETUP') {
        const modeMeta = MODES.find(m => m.id === mode)!;
        const problem = setupProblem();
        return (
            <div className="h-full flex flex-col animate-fade-in" data-stage="SETUP">
                {header}
                {showPin && (
                    <PinGateModal
                        onSuccess={() => { setShowPin(false); setDecks(d => (d.includes('afterdark') ? d : [...d, 'afterdark'])); }}
                        onCancel={() => setShowPin(false)}
                    />
                )}
                <div className="flex-1 overflow-y-auto pb-10">
                    <p className="text-muted mb-4 text-sm text-center">Rank five things. See who can read you.</p>

                    <div className="flex gap-1.5 justify-center mb-2 flex-wrap" role="tablist" aria-label="Game mode">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                role="tab"
                                aria-selected={mode === m.id}
                                data-mode={m.id}
                                onClick={() => { setMode(m.id); setNudge(null); }}
                                className={`px-3.5 py-1.5 rounded-full text-sm font-bold border transition-colors ${mode === m.id ? 'bg-pink-500/15 border-pink-500 text-pink-500' : 'bg-surface-alt border-divider text-muted hover:text-ink'}`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-muted text-center mb-3 leading-snug max-w-[340px] mx-auto">
                        <span className="font-bold text-ink-soft">{modeMeta.who}.</span> {modeMeta.blurb}
                    </p>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow
                            teams={players}
                            onTeamsChange={p => { setPlayers(p); setNudge(null); }}
                            noun="Player"
                            max={mode === 'knowme' ? 2 : 12}
                        />
                        {mode === 'couples' && players.length >= 2 && (
                            <div className="flex flex-wrap justify-center gap-1.5 -mt-1 mb-3" data-teams>
                                {pairUp(players).map((t, k) => (
                                    <span key={k} className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-alt border border-divider text-ink-soft">
                                        Team {k + 1}: {t.join(' & ')}
                                    </span>
                                ))}
                                {players.length % 2 === 1 && (
                                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border border-rose-500/50 text-rose-500">{players[players.length - 1]} needs a partner</span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Keep it sweet: offered in every mode, but it is Know Me and Couples it matters for. */}
                    <button
                        onClick={() => setSweet(s => !s)}
                        aria-pressed={sweet}
                        data-sweet={sweet}
                        className={`flex items-center gap-3 w-full max-w-[340px] mx-auto mb-4 px-4 py-2.5 rounded-xl border text-left transition-colors ${sweet ? 'border-pink-500/60 bg-pink-500/10' : 'border-divider bg-surface-alt'}`}
                    >
                        <Heart size={16} className={sweet ? 'text-pink-500 fill-pink-500' : 'text-muted'} />
                        <span className="flex-1 min-w-0">
                            <span className="block text-sm font-bold text-ink">Keep it sweet</span>
                            <span className="block text-[11px] text-muted leading-snug">Leave out cards that mention an ex</span>
                        </span>
                        <span className={`w-10 h-6 rounded-full p-0.5 transition-colors ${sweet ? 'bg-pink-500' : 'bg-divider'}`}>
                            <span className={`block w-5 h-5 rounded-full bg-white shadow transition-transform ${sweet ? 'translate-x-4' : ''}`} />
                        </span>
                    </button>

                    <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-muted text-center mb-2">Decks</h3>
                    <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 max-w-[340px] mx-auto w-full mb-4">
                        {DATA.categories.map(d => {
                            const on = decks.includes(d.id);
                            const color = DECK_COLOR[d.id] ?? ACCENT;
                            const gated = d.spicy && !isAdultUnlocked();
                            return (
                                <button
                                    key={d.id}
                                    onClick={() => toggleDeck(d.id)}
                                    aria-pressed={on}
                                    data-deck={d.id}
                                    className="group relative w-full text-left active:scale-[0.99] transition-transform"
                                >
                                    <div
                                        className={`relative backdrop-blur-sm border rounded-xl py-3 px-4 overflow-hidden transition-colors ${on ? '' : 'bg-surface-alt border-divider hover:bg-app-tint'}`}
                                        style={on ? { borderColor: color, background: `${color}14` } : undefined}
                                    >
                                        <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: color }} />
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg leading-none flex-shrink-0">{d.emoji}</span>
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-base font-bold text-ink leading-tight flex items-center gap-1.5">
                                                    <span className="truncate">{d.name}</span>
                                                    {d.spicy && <span className="text-[9px] font-extrabold tracking-[0.1em] text-red-500 bg-red-500/15 px-1.5 py-[2px] rounded flex-shrink-0">18+</span>}
                                                    {gated && <Lock size={12} className="text-muted flex-shrink-0" />}
                                                </h4>
                                                <p className="text-xs text-muted leading-snug truncate">{d.description}</p>
                                            </div>
                                            <span
                                                className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${on ? 'text-white' : 'border-divider'}`}
                                                style={on ? { background: color, borderColor: color } : undefined}
                                            >
                                                {on && <Check size={14} strokeWidth={3} />}
                                            </span>
                                        </div>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {mode !== 'hotseat' && (
                        <div className="flex items-center justify-center gap-2 mb-4">
                            <Settings2 size={14} className="text-muted" />
                            <span className="text-xs text-muted">{mode === 'knowme' ? 'Cards' : 'Rounds'}</span>
                            {(mode === 'knowme' ? [6, 8, 10] : [4, 6, 8]).map(n => {
                                const on = (mode === 'knowme' ? knowMeLen : rounds) === n;
                                return (
                                    <button
                                        key={n}
                                        onClick={() => (mode === 'knowme' ? setKnowMeLen(n) : setRounds(n))}
                                        aria-pressed={on}
                                        className={`w-9 h-8 rounded-lg text-sm font-bold border transition-colors ${on ? 'bg-pink-500/15 border-pink-500 text-pink-500' : 'bg-surface-alt border-divider text-muted'}`}
                                    >
                                        {n}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    <div className="max-w-[340px] mx-auto w-full">
                        <Button onClick={() => start()} className={`w-full py-4 text-lg font-bold flex items-center justify-center gap-2 ${problem ? 'opacity-60' : ''}`}>
                            Start <ArrowRight size={20} />
                        </Button>
                        {nudge && <p className="text-xs text-rose-500 text-center mt-2" data-nudge>{nudge}</p>}
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-5">
                        <button onClick={() => setShowRules(v => !v)} className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink text-sm font-bold">
                            <span className="flex items-center gap-2"><Search size={14} className="text-muted" /> How to play</span>
                            <ChevronDown size={16} className={`text-muted transition-transform ${showRules ? 'rotate-180' : ''}`} />
                        </button>
                        {showRules && (
                            <div className="mt-2 px-4 py-3.5 rounded-xl bg-surface border border-divider text-sm text-ink-soft leading-relaxed animate-slide-up space-y-2">
                                <p>Each card has five things. The <b className="text-ink">ranker</b> secretly puts them in their true order, top to bottom. Then someone else predicts that order.</p>
                                <p>For each item: <b className="text-ink">exact spot +2</b>, one spot off +1, further 0. The ranker's <b className="text-ink">#1 and #5 count double</b>. A perfect read is 14.</p>
                                <p>Points go to whoever is reading, never to the ranker. So rank honestly: there's nothing to win by being hard to read.</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // =====================================================================
    // END
    // =====================================================================
    if (stage === 'END') {
        return (
            <div className="h-full flex flex-col animate-fade-in" data-stage="END">
                {header}
                <div className="flex-1 overflow-y-auto pb-10">
                    <div className="max-w-[360px] mx-auto w-full">
                        {mode === 'hotseat' && <HotSeatEnd plays={plays} />}
                        {mode === 'knowme' && <KnowMeEnd plays={plays} players={players} knowsPct={knowsPct} deckName={id => deckById[id]?.name ?? id} />}
                        {mode === 'couples' && <CouplesEnd plays={plays} totals={teamTotals()} />}
                        <div className="grid gap-2 mt-6">
                            <Button onClick={playAgain} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2">
                                <RotateCcw size={18} /> Play again
                            </Button>
                            <button onClick={() => setStage('SETUP')} className="text-sm text-muted hover:text-ink py-2">Change setup</button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (!card || !turn) return null;
    const deck = deckById[card.deck];
    const deckColor = DECK_COLOR[card.deck] ?? ACCENT;
    const hot = mode === 'hotseat';
    const progress = mode === 'couples'
        ? `Round ${turn.round + 1} / ${rounds} · Team ${(turn.team ?? 0) + 1}`
        : `Card ${turnIdx + 1} / ${turns.length}`;

    const cardHead = (
        <div className="text-center mb-3" data-card-id={card.id}>
            <div className="flex items-center justify-center gap-2 mb-2">
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border" style={{ color: deckColor, borderColor: `${deckColor}80`, background: `${deckColor}14` }}>
                    {deck?.emoji} {deck?.name}
                </span>
                <span className="text-[10px] font-mono text-muted">{progress}</span>
            </div>
            <h2 className="text-2xl font-black text-ink leading-tight font-serif" data-prompt>{card.prompt}</h2>
        </div>
    );

    // A full-screen interstitial: the phone changes hands here, so nothing
    // about anyone's order may be on screen.
    const handoff = ({ emoji, title, body, cta, onGo }: { emoji: string; title: React.ReactNode; body: React.ReactNode; cta: string; onGo: () => void }) => (
        <div className="h-full flex flex-col animate-fade-in" data-stage={stage}>
            {header}
            <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-5 pb-10">
                <span className="text-[10px] font-mono text-muted">{progress}</span>
                <div className="text-6xl">{emoji}</div>
                <h2 className="text-3xl font-black text-ink leading-tight">{title}</h2>
                <p className="text-ink-soft max-w-[300px] leading-snug">{body}</p>
                <Button onClick={onGo} className="w-full max-w-[320px] py-4 text-lg font-bold flex items-center justify-center gap-2" data-cta>
                    {cta} <ArrowRight size={20} />
                </Button>
            </div>
        </div>
    );

    if (stage === 'PASS_RANK') {
        return (
            handoff({
                emoji: hot ? '🔥' : '🤫',
                title: <>Pass to <span className="text-pink-500">{turn.ranker}</span></>,
                body: hot
                    ? <>{turn.ranker} is in the hot seat. Everyone else, look away while they rank.</>
                    : <>{mode === 'couples' && <>Team {(turn.team ?? 0) + 1}. </>}{turn.ranker} ranks in private. {turn.reader}, no peeking.</>,
                cta: `I'm ${turn.ranker}, show me`,
                onGo: beginRank,
            })
        );
    }

    if (stage === 'PASS_READ') {
        return (
            handoff({
                emoji: '🔒',
                title: hot ? <>Locked in. Room, gather round.</> : <>Locked in. Pass to <span className="text-pink-500">{turn.reader}</span></>,
                body: hot
                    ? <>{turn.ranker}'s order is hidden. Argue it out, then agree on ONE order you think {turn.ranker} chose.</>
                    : <>{turn.ranker}'s order is hidden. {turn.reader}: rank it the way you think {turn.ranker} did.</>,
                cta: hot ? "We're ready" : `I'm ${turn.reader}, let me guess`,
                onGo: beginRead,
            })
        );
    }

    if (stage === 'RANK' || stage === 'READ') {
        const reading = stage === 'READ';
        return (
            <div className="h-full flex flex-col" data-stage={stage}>
                {header}
                <div className="flex-1 overflow-y-auto pb-8">
                    {cardHead}
                    <div className="mb-2 mx-auto max-w-[340px] text-center">
                        {reading ? (
                            <p className="text-base font-bold text-ink" data-read-banner>
                                Rank it as <span className="text-pink-500">{turn.ranker}</span> would.
                                {hot && <span className="block text-xs font-normal text-muted mt-0.5">One shared answer from the room.</span>}
                            </p>
                        ) : (
                            <p className="text-sm text-ink-soft"><span className="font-bold text-ink">{turn.ranker}</span>, your true order. Only you see this.</p>
                        )}
                    </div>
                    <RankList order={working} onChange={setWorking} top={card.top} bottom={card.bottom} accent={ACCENT} />
                    <div className="max-w-[340px] mx-auto w-full mt-3">
                        <Button onClick={reading ? lockRead : lockRank} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2" data-lock>
                            <Lock size={18} /> {reading ? 'Lock in guess' : 'Lock in'}
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (stage === 'REVEAL') {
        const play = plays[plays.length - 1];
        const tier = tierFor(play.score.points);
        const nextIdx = turnIdx + 1;
        const endOfRound = mode === 'couples' && (nextIdx >= turns.length || turns[nextIdx].round !== turn.round);
        const nextLabel = mode === 'couples'
            ? (endOfRound ? 'Leaderboard' : `Next: Team ${(turns[nextIdx].team ?? 0) + 1}`)
            : (nextIdx >= turns.length ? 'See results' : 'Next card');
        return (
            <div className="h-full flex flex-col animate-fade-in" data-stage="REVEAL">
                {header}
                <div className="flex-1 overflow-y-auto pb-8">
                    {cardHead}
                    <div className="text-center mb-4" data-score={play.score.points}>
                        <div className="flex items-baseline justify-center gap-1">
                            <span className="text-5xl font-black text-ink tabular-nums">{play.score.points}</span>
                            <span className="text-lg font-bold text-muted">/ {MAX_CARD_POINTS}</span>
                        </div>
                        <p className="text-lg font-black mt-1" style={{ color: ACCENT }} data-tier>{tier.emoji} {tier.label} · {play.score.percent}%</p>
                        <p className="text-xs text-muted mt-1">
                            {turn.reader === ROOM ? 'The room' : turn.reader} read {turn.ranker} · {play.score.exact} of 5 exact
                        </p>
                    </div>
                    <div className="max-w-[360px] mx-auto w-full">
                        <RevealTable
                            rankerOrder={play.rankerOrder}
                            prediction={play.prediction}
                            score={play.score}
                            rankerLabel={`${turn.ranker}'s order`}
                            readerLabel={turn.reader === ROOM ? "Room's guess" : `${turn.reader}'s guess`}
                            accent={ACCENT}
                        />
                        <Button onClick={afterReveal} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2 mt-5" data-next>
                            {nextLabel} <ArrowRight size={20} />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // BOARD — Couples vs Couples, after every round
    const totals = teamTotals().sort((a, b) => b.points - a.points);
    const lastRound = turnIdx + 1 >= turns.length;
    return (
        <div className="h-full flex flex-col animate-fade-in" data-stage="BOARD">
            {header}
            <div className="flex-1 overflow-y-auto pb-8">
                <div className="max-w-[360px] mx-auto w-full text-center">
                    <p className="text-[10px] font-mono text-muted mb-1">After round {turn.round + 1} of {rounds}</p>
                    <h2 className="text-3xl font-black text-ink mb-5">Leaderboard</h2>
                    <div className="grid gap-2 text-left">
                        {totals.map((t, i) => {
                            const thisRound = plays.find(p => p.turn.team === t.k && p.turn.round === turn.round);
                            return (
                                <div key={t.k} data-team-row={t.k} data-team-points={t.points} className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${i === 0 ? 'border-pink-500/60 bg-pink-500/10' : 'bg-surface-alt border-divider'}`}>
                                    <span className="text-lg w-6 text-center">{i === 0 ? '👑' : i + 1}</span>
                                    <span className="flex-1 min-w-0">
                                        <span className="block font-bold text-ink truncate">Team {t.k + 1}</span>
                                        <span className="block text-[11px] text-muted truncate">{t.team.join(' & ')}</span>
                                    </span>
                                    <span className="text-right shrink-0">
                                        <span className="block text-xl font-black text-ink tabular-nums">{t.points}</span>
                                        {thisRound && <span className="block text-[10px] text-muted">+{thisRound.score.points} this round</span>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    <Button onClick={afterBoard} className="w-full py-4 text-lg font-bold flex items-center justify-center gap-2 mt-6" data-next>
                        {lastRound ? 'See results' : `Round ${turn.round + 2}`} <ArrowRight size={20} />
                    </Button>
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------- end screens

const StatRow: React.FC<{ name: string; sub?: string; pct: number; lead?: boolean }> = ({ name, sub, pct, lead }) => (
    <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${lead ? 'border-pink-500/60 bg-pink-500/10' : 'bg-surface-alt border-divider'}`}>
        <span className="flex-1 min-w-0">
            <span className="block font-bold text-ink truncate">{name}</span>
            {sub && <span className="block text-[11px] text-muted truncate">{sub}</span>}
        </span>
        <span className="text-2xl font-black text-ink tabular-nums shrink-0">{pct}%</span>
    </div>
);

const PlayCard: React.FC<{ title: string; play: Play }> = ({ title, play }) => (
    <div className="rounded-xl border border-divider bg-surface p-3">
        <div className="flex items-baseline justify-between gap-2 mb-1">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-muted">{title}</span>
            <span className="text-sm font-black text-ink tabular-nums">{play.score.points}/{MAX_CARD_POINTS}</span>
        </div>
        <p className="text-sm font-bold text-ink leading-snug mb-2">{play.card.prompt}</p>
        <RevealTable
            compact
            rankerOrder={play.rankerOrder}
            prediction={play.prediction}
            score={play.score}
            rankerLabel={play.turn.ranker}
            readerLabel={play.turn.reader === ROOM ? 'The room' : play.turn.reader}
            accent={ACCENT}
        />
    </div>
);

const bestAndWorst = (plays: Play[]) => {
    // Ties go to the later card: it is the one people remember.
    const best = plays.reduce<Play | null>((b, p) => (!b || p.score.points >= b.score.points ? p : b), null);
    const worst = plays.reduce<Play | null>((w, p) => (!w || p.score.points <= w.score.points ? p : w), null);
    return { best, worst: worst && best && worst.score.points < best.score.points ? worst : null };
};

const HotSeatEnd: React.FC<{ plays: Play[] }> = ({ plays }) => {
    const names = [...new Set(plays.map(p => p.turn.ranker))];
    const rows = names
        .map(n => ({ n, pct: avg(plays.filter(p => p.turn.ranker === n).map(p => p.score.percent)), sat: plays.filter(p => p.turn.ranker === n).length }))
        .sort((a, b) => b.pct - a.pct);
    const total = plays.reduce((s, p) => s + p.score.points, 0);
    const spread = rows.length > 1 && rows[0].pct !== rows[rows.length - 1].pct;
    const joinNames = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0]);
    // A tie at either end is named as a tie, never settled by list order.
    const closed = rows.filter(r => r.pct === rows[rows.length - 1].pct).map(r => r.n);
    const open = rows.filter(r => r.pct === rows[0].pct).map(r => r.n);
    return (
        <div className="text-center" data-end="hotseat">
            <div className="text-5xl mb-2">🔥</div>
            <h2 className="text-2xl font-black text-ink leading-tight mb-1">
                {!spread ? <>Everyone was equally readable.</>
                    : closed.length > 1 ? <>{joinNames(closed)} tie for hardest to read.</> : <>{closed[0]} is the hardest to read.</>}
            </h2>
            {spread && <p className="text-sm text-muted mb-4">{joinNames(open)} {open.length > 1 ? 'are open books' : 'is an open book'}.</p>}
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-muted mb-2 mt-4">How readable · the room's average read</p>
            <div className="grid gap-2 text-left">
                {rows.map((r, i) => <StatRow key={r.n} name={r.n} sub={`${r.sat} card${r.sat === 1 ? '' : 's'} in the hot seat`} pct={r.pct} lead={i === 0} />)}
            </div>
            <div className="mt-4 rounded-xl border border-divider bg-surface-alt px-4 py-3 flex items-center justify-between" data-room-total={total}>
                <span className="text-sm font-bold text-ink">Room total</span>
                <span className="text-sm text-muted"><span className="text-xl font-black text-ink tabular-nums">{total}</span> / {plays.length * MAX_CARD_POINTS} · {toPercent(total, plays.length)}%</span>
            </div>
        </div>
    );
};

const KnowMeEnd: React.FC<{ plays: Play[]; players: string[]; knowsPct: (n: string) => number; deckName: (id: string) => string }> = ({ plays, players, knowsPct, deckName }) => {
    const [a, b] = players;
    const pa = knowsPct(a), pb = knowsPct(b);
    const byDeck = [...new Set(plays.map(p => p.card.deck))].map(d => `${deckName(d)} ${avg(plays.filter(p => p.card.deck === d).map(p => p.score.percent))}%`);
    const { best, worst } = bestAndWorst(plays);
    const leader = pa > pb ? a : b, other = pa > pb ? b : a;
    return (
        <div className="text-center" data-end="knowme">
            <div className="text-5xl mb-2">💞</div>
            <h2 className="text-2xl font-black text-ink leading-tight mb-4" data-headline>
                {pa === pb ? <>Dead heat. You read each other equally well.</> : <>{leader} knows {other} better.</>}
            </h2>
            <div className="grid gap-2 text-left">
                <StatRow name={`${a} knows ${b}`} pct={pa} lead={pa >= pb} />
                <StatRow name={`${b} knows ${a}`} pct={pb} lead={pb >= pa} />
            </div>
            {byDeck.length > 0 && <p className="text-xs text-muted mt-3" data-deck-split>{byDeck.join(' · ')}</p>}
            <div className="grid gap-3 mt-5 text-left">
                {best && <PlayCard title="Best read" play={best} />}
                {worst && <PlayCard title="Biggest miss" play={worst} />}
            </div>
        </div>
    );
};

const CouplesEnd: React.FC<{ plays: Play[]; totals: { k: number; team: string[]; points: number; pct: number }[] }> = ({ plays, totals }) => {
    const sorted = totals.slice().sort((x, y) => y.points - x.points);
    const tie = sorted.length > 1 && sorted[0].points === sorted[1].points;
    const { best } = bestAndWorst(plays);
    return (
        <div className="text-center" data-end="couples">
            <div className="text-5xl mb-2">🏆</div>
            <h2 className="text-2xl font-black text-ink leading-tight mb-4" data-headline>
                {tie ? <>It's a tie at the top.</> : <>Team {sorted[0].k + 1} wins: {sorted[0].team.join(' & ')}</>}
            </h2>
            <div className="grid gap-2 text-left">
                {sorted.map((t, i) => <StatRow key={t.k} name={`Team ${t.k + 1}`} sub={`${t.team.join(' & ')} · ${t.points} pts`} pct={t.pct} lead={i === 0 && !tie} />)}
            </div>
            {best && (
                <div className="mt-5 text-left">
                    <PlayCard title={`Best read of the night · ${best.turn.reader} reading ${best.turn.ranker}`} play={best} />
                </div>
            )}
        </div>
    );
};
