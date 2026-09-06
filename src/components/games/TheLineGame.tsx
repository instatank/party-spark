import React, { useState, useEffect, useRef, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    ArrowUpNarrowWide, ChevronRight, ChevronDown, ArrowRight, Share2, ScrollText,
    Check, X, Plus, Heart, Users,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { sessionService } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playDing, playBuzzer, playReveal, playPop, playPangram } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import TeamRosterRow from '../ui/TeamRosterRow';
import EndScreen from '../ui/EndScreen';
import RoomPanel from '../ui/RoomPanel';
import { useRoom, leaveRoom, type Room, type RoomSession } from '../../services/roomService';
import { mulberry32 } from '../../services/seededRandom';
import { GameType } from '../../types';
import {
    dealGame, placeCard, formatValue, soloOver, winnerSeat,
    HAND_SIZE, SOLO_LIVES, MAX_PLAYERS,
    type GameState, type LineData, type LineDeck,
} from '../../services/lineEngine';

// "The Line" — sequencing. Every card is a claim with a HIDDEN number; you
// never say the number, you only say WHERE it goes. One starter card is face
// up, and from there the whole game is one question asked over and over: is
// this taller / faster / older / heavier than that?
//
// The phone is load-bearing three times over. It holds every hidden value, it
// judges the placement the instant you commit, and it keeps one shared line
// that mixes a giraffe, the Eiffel Tower and Mount Everest onto a single axis.
// On paper that is three printed decks and an argument about units.
//
// The signature screen is the line itself: tap a card, the line opens up into
// tappable gaps, and the card you commit slides into its slot while its value
// turns over. Fully offline; the deck is a dynamic-imported JSON chunk and all
// the rules live in src/services/lineEngine.ts, which holds THE LINE INVARIANT
// on every mutation.

interface Props { onExit: () => void; }

type Stage = 'SETUP' | 'ROOM' | 'HANDOFF' | 'PLAY' | 'END';

const dataPromise = import('../../data/the_line.json').then(m => m.default as unknown as LineData);

const STATS_ID = 'THE_LINE';
const SOLO_NAME = 'You';

const ACCENT_DARK = '#60A5FA';   // blue-400 — unused by any other game
const ACCENT_LIGHT = '#1D4ED8';  // blue-700, ~25% darker for white surfaces

interface Move { seat: number; cardIdx: number; gap: number; correct: boolean; truth: number; }

export const TheLineGame: React.FC<Props> = ({ onExit }) => {
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const GOOD = light ? '#15803D' : '#4ADE80';
    const BAD = light ? '#BE123C' : '#FB7185';

    const data = use(dataPromise);

    const [stage, setStage] = useState<Stage>('SETUP');
    // Live (separate phones). Null until a room actually starts, which is also
    // what keeps this component and RoomPanel from both polling.
    const [session, setSession] = useState<RoomSession | null>(null);
    const room = useRoom(session, ['PLAY']);
    const live = session !== null;
    // How many turns THIS device has applied. The replay below never rolls the
    // board backwards past this, so an optimistic local move is not undone by a
    // poll that has not seen it yet.
    const [turnCount, setTurnCount] = useState(0);
    // This player's own moves, keyed by global turn number. Sent whole on every
    // patch because the server merges state shallowly — a partial map would
    // replace the full one and lose the history the replay depends on.
    const myMoves = useRef<Record<string, { cardIdx: number; gap: number }>>({});
    // Seeded from the shared session roster so names carry in from other games.
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('the_line'));
    const [deck, setDeck] = useState<LineDeck | null>(null);
    const [state, setState] = useState<GameState | null>(null);
    const [seat, setSeat] = useState(0);
    const [sel, setSel] = useState<number | null>(null);
    const [move, setMove] = useState<Move | null>(null);
    const [flip, setFlip] = useState(false);
    const [best, setBest] = useState(0);
    const [newBest, setNewBest] = useState(false);
    const [shareMsg, setShareMsg] = useState('');

    const named = players.map(p => p.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
    // In live play the roster IS the room, ordered by join time — so seat N is
    // the same person on every phone, which the whole move log depends on.
    const liveRoster = room.room?.players.map(p => p.name) ?? [];
    const roster = live
        ? (liveRoster.length ? liveRoster : [SOLO_NAME])
        : (named.length >= 2 ? named : [named[0] || SOLO_NAME]);
    const solo = !live && roster.length === 1;
    const mySeat = live && room.room && session
        ? room.room.players.findIndex(p => p.id === session.playerId)
        : 0;
    // Turns rotate strictly, so whose turn it is is DERIVED from how many have
    // been played. Nothing needs to announce it, and no two devices can
    // disagree about it.
    const activeSeat = live ? turnCount % Math.max(1, roster.length) : seat;
    const myTurn = !live || activeSeat === mySeat;

    const landedRef = useRef<HTMLDivElement | null>(null);

    // The freshly-placed card scrolls itself into view — with a long line the
    // slot you chose is frequently off screen by the time it lands.
    useEffect(() => {
        if (move?.correct && landedRef.current) {
            landedRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }, [move]);

    // ---- flow ---------------------------------------------------------------
    const start = (d: LineDeck) => {
        hapticLight(); playReveal();
        setDeck(d);
        setState(dealGame(d.cards, roster.length));
        setSeat(0);
        setSel(null);
        setMove(null);
        setNewBest(false);
        setShareMsg('');
        setBest(statsStore.getGame(STATS_ID)?.best ?? 0);
        setStage(solo ? 'PLAY' : 'HANDOFF');
    };

    // ---- live: deal from the seed, then replay a turn-ordered move log ------
    //
    // The Line is turn-based, so unlike the other three games a shared seed is
    // not enough on its own — the board depends on what people DID, not only on
    // what was dealt. But it needs no authoritative server either: the deal is
    // deterministic, placeCard is a pure function, and turns rotate strictly.
    // So each move is (turn number → cardIdx, gap), only the player whose turn
    // it is writes turn N, and every device replays the same log to the same
    // state. One writer per key, no locks, no host arbitration.
    //
    // The end of the game falls out of this for free: winnerSeat() is a
    // property of the replayed state, so every phone reaches it independently.
    // There is no "host finished but nobody told the guests" bug to have here.
    const startLive = (sess: RoomSession, r: Room) => {
        const deckId = (r.meta.config.deckId as string) ?? data.decks[0].id;
        const d = data.decks.find(x => x.id === deckId) ?? data.decks[0];
        const n = Math.max(2, r.players.length);
        hapticLight(); playReveal();
        myMoves.current = {};
        setDeck(d);
        setState(dealGame(d.cards, n, mulberry32(r.meta.seed)));
        setTurnCount(0);
        setSeat(0);
        setSel(null);
        setMove(null);
        setFlip(false);
        setNewBest(false);
        setShareMsg('');
        setBest(statsStore.getGame(STATS_ID)?.best ?? 0);
        setSession(sess);
        setStage('PLAY');
    };

    // Collect every player's moves into one turn-indexed log. A gap in the
    // numbering stops the replay: turn 5 cannot be applied before turn 4, and
    // applying it out of order would produce a different board on this device
    // than on the one that made the move.
    const collectMoves = (): { cardIdx: number; gap: number }[] => {
        const r = room.room;
        if (!r) return [];
        const log: Record<number, { cardIdx: number; gap: number }> = {};
        r.players.forEach(p => {
            const raw = (p.state.moves ?? {}) as Record<string, { cardIdx: number; gap: number }>;
            Object.entries(raw).forEach(([t, m]) => {
                const n = Number(t);
                if (Number.isInteger(n) && m && Number.isInteger(m.cardIdx) && Number.isInteger(m.gap)) log[n] = m;
            });
        });
        const out: { cardIdx: number; gap: number }[] = [];
        for (let t = 0; log[t]; t++) out.push(log[t]);
        return out;
    };

    useEffect(() => {
        if (!live || !deck || !room.room) return;
        const log = collectMoves();
        // Never roll the board backwards. Our own move is applied optimistically
        // the instant it is made; a poll that has not yet seen it would
        // otherwise yank the card back out of the line under the player.
        if (log.length <= turnCount) return;

        const n = Math.max(2, room.room.players.length);
        let s = dealGame(deck.cards, n, mulberry32(room.room.meta.seed));
        let last: { seat: number; cardIdx: number; gap: number; correct: boolean; truth: number } | null = null;
        try {
            log.forEach((m, t) => {
                const out = placeCard(s, deck.cards, t % n, m.cardIdx, m.gap);
                s = out.state;
                last = { seat: t % n, cardIdx: m.cardIdx, gap: m.gap, correct: out.correct, truth: out.truth };
            });
        } catch {
            // A malformed log means someone is on a different game than we are.
            // Better to hold the last good board than to render a broken one.
            return;
        }
        setState(s);
        setTurnCount(log.length);
        setSel(null);
        if (last) {
            setMove(last);
            setFlip(false);
            window.setTimeout(() => { setFlip(true); playReveal(); }, 420);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [room.room, live, deck, turnCount]);

    // Backing out must free the seat — the turn order is derived from the
    // roster, so a ghost player would stall every rotation on their turn.
    const exitLive = () => {
        if (session) void leaveRoom(session.code, session.playerId);
        setSession(null);
        myMoves.current = {};
        setStage('SETUP');
    };

    const commit = (gap: number) => {
        if (!state || !deck || sel === null || move) return;
        if (live && !myTurn) return;
        const actor = live ? mySeat : seat;
        const out = placeCard(state, deck.cards, actor, sel, gap);
        setState(out.state);
        setMove({ seat: actor, cardIdx: sel, gap, correct: out.correct, truth: out.truth });
        setSel(null);
        if (live) {
            // Applied locally first so the card lands under your thumb, then
            // published. The replay above will not undo it: it refuses to move
            // the board backwards past what this device has already applied.
            const turn = turnCount;
            myMoves.current = { ...myMoves.current, [String(turn)]: { cardIdx: sel, gap } };
            setTurnCount(turn + 1);
            void room.patch({ moves: myMoves.current, placed: out.state.placed[actor], misses: out.state.misses[actor] });
        }
        setFlip(false);
        if (out.correct) { hapticSuccess(); playDing(); } else { hapticError(); playBuzzer(); }
        // The value turns over a beat after the card lands. This reveals but
        // never advances — the player taps to move on, so nothing can happen
        // under a table still looking at the number (notes/08).
        window.setTimeout(() => { setFlip(true); playReveal(); }, 420);
    };

    const finish = (s: GameState) => {
        hapticHeavy();
        statsStore.recordPlay(STATS_ID);
        if (solo) {
            const isNew = statsStore.recordBest(STATS_ID, s.placed[0], `${s.placed[0]} cards · ${deck?.name ?? ''}`);
            setNewBest(isNew);
            if (isNew) playPangram();
        } else {
            const top = Math.max(...s.placed);
            const winners = roster.filter((_, i) => s.placed[i] === top);
            if (winners.length) statsStore.recordWins(STATS_ID, winners);
        }
        gameNightService.reportResult(GameType.THE_LINE, roster.map((n, i) => ({ name: n, score: s.placed[i] })));
        setStage('END');
    };

    const next = () => {
        if (!state) return;
        hapticLight();
        setMove(null);
        setFlip(false);
        if (solo) {
            if (soloOver(state)) { finish(state); return; }
            return;   // same seat, keep going
        }
        if (winnerSeat(state) >= 0) { finish(state); return; }
        if (live) return;   // the seat is derived from turnCount; nothing to pass
        setSeat((seat + 1) % roster.length);
        setStage('HANDOFF');
    };

    // Live: the game ending is a property of the replayed board, so every phone
    // reaches it on its own. Nothing has to be announced, which is the one
    // failure mode the other three games each needed explicit handling for.
    useEffect(() => {
        if (!live || stage !== 'PLAY' || !state || move) return;
        if (winnerSeat(state) >= 0) finish(state);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state, live, stage, move]);

    const share = async () => {
        if (!deck || !state) return;
        const ranked = roster
            .map((n, i) => ({ n, placed: state.placed[i], misses: state.misses[i] }))
            .sort((a, b) => b.placed - a.placed || a.misses - b.misses);
        const out = await shareResultCard({
            gameTitle: 'The Line',
            accent: ACCENT_DARK,
            heading: solo ? `${state.placed[0]} on the line` : `${ranked[0].n} emptied their hand`,
            sub: `${deck.name} · ${state.order.length} cards long`,
            tagline: 'Never say the number. Just say where it goes.',
            context: 'Score = cards you got into the line',
            challenge: 'Reckon you know what goes where?',
            emoji: deck.emoji,
            rows: ranked.map(r => ({ label: r.n, value: `${r.placed} placed · ${r.misses} miss${r.misses === 1 ? '' : 'es'}` })),
        });
        setShareMsg(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Saved to your device' : out === 'failed' ? "Couldn't share" : '');
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in" data-line-stage="SETUP">
                <ScreenHeader title="The Line" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">📈</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            Never say the number. <em>Say where it goes.</em>
                        </h2>
                        <p className="text-muted text-sm px-6">
                            Every card hides a number. You only ever choose the gap it belongs in.
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} />
                        <p className="text-center text-[11px] text-muted mt-1 mb-4">
                            {named.length >= 2
                                ? `${named.length} players — first to empty a hand of ${HAND_SIZE} wins.`
                                : `Playing solo — how long can you make the line on ${SOLO_LIVES} lives? Add 2+ names for pass-and-play.`}
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mb-5">
                        <button
                            onClick={() => { hapticLight(); setStage('ROOM'); }}
                            className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 border-l-sky-500 border-b-sky-500 hover:bg-app-tint rounded-xl py-3 px-4 transition-colors overflow-hidden"
                        >
                            <div className="flex items-center gap-3 relative z-10">
                                <Users size={16} className="text-sky-500 flex-shrink-0" />
                                <div className="min-w-0 flex-1">
                                    <p className="text-[15px] font-bold text-ink leading-snug">Play on separate phones</p>
                                    <p className="text-[11px] text-muted leading-snug">Your hand stays yours. Needs internet.</p>
                                </div>
                                <ChevronRight size={16} className="text-gray-500 group-hover:text-ink flex-shrink-0" />
                            </div>
                        </button>
                    </div>

                    <p className="max-w-[340px] mx-auto w-full text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2 px-1">
                        Pick your axis
                    </p>
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {data.decks.map(d => (
                            <button
                                key={d.id}
                                onClick={() => start(d)}
                                className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25 rounded-xl py-3 px-4 transition-colors overflow-hidden"
                                style={{ borderLeftColor: ACCENT, borderBottomColor: ACCENT }}
                            >
                                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                                <div className="flex items-center gap-3 relative z-10">
                                    <span className="text-base leading-none">{d.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-bold text-ink leading-snug truncate">{d.name}</p>
                                        <p className="text-[11px] text-muted leading-snug truncate">{d.tagline}</p>
                                    </div>
                                    <span className="text-[10px] font-bold text-muted tabular-nums flex-shrink-0">{d.cards.length} cards</span>
                                    <ChevronRight size={16} className="text-gray-500 group-hover:text-ink flex-shrink-0" />
                                </div>
                            </button>
                        ))}
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-5">
                        <button onClick={() => setShowRules(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink text-sm font-bold">
                            <span className="flex items-center gap-2"><ScrollText size={14} className="text-muted" /> How to play</span>
                            <ChevronDown size={16} className={`text-muted transition-transform ${showRules ? 'rotate-180' : ''}`} />
                        </button>
                        {showRules && (
                            <div className="mt-2 px-4 py-3.5 rounded-xl bg-surface border border-divider text-sm text-ink-soft leading-relaxed animate-slide-up space-y-2">
                                <p><span className="font-bold text-ink">1.</span> One card starts face up with its number showing. That's the line.</p>
                                <p><span className="font-bold text-ink">2.</span> You hold {HAND_SIZE} cards and you never see their numbers. On your turn, pick one and tap the gap in the line where you think it belongs.</p>
                                <p><span className="font-bold text-ink">3.</span> Right, and it locks into the line with its number revealed. Wrong, and it's discarded, the truth is shown, and you draw a replacement.</p>
                                <p><span className="font-bold text-ink">4.</span> First to empty their hand wins. Level scores break on fewest misses.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Playing alone? Same game, but you keep drawing until {SOLO_LIVES} misses — the score is how long you made the line.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- ROOM (live lobby) ----------------
    if (stage === 'ROOM') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Play live" onBack={() => setStage('SETUP')} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 px-2">
                    <RoomPanel
                        game={GameType.THE_LINE}
                        title="Your hand stays yours"
                        blurb="One shared line, but the cards in your hand are only ever on your own phone — the thing passing one phone around cannot do."
                        accent="lime"
                        config={{ deckId: deck?.id ?? data.decks[0].id }}
                        minPlayers={2}
                        hostControls={
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Deck</p>
                                <div className="grid gap-2">
                                    {data.decks.map(d => (
                                        <button key={d.id} onClick={() => { hapticLight(); setDeck(d); }}
                                            className={`text-left rounded-lg py-2 px-3 border transition-colors ${(deck?.id ?? data.decks[0].id) === d.id ? 'bg-lime-500/10 border-lime-500/50' : 'bg-surface-alt border-divider hover:bg-app-tint'}`}>
                                            <span className="text-sm text-ink font-semibold">{d.emoji} {d.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        }
                        onStart={(sess, r) => startLive(sess, r)}
                        onCancel={() => setStage('SETUP')}
                    />
                </div>
            </div>
        );
    }

    if (!deck || !state) return null;
    const cards = deck.cards;
    // In live play a phone renders only ITS OWN hand. Every device can compute
    // every hand (the deal is deterministic), so this is UI privacy rather than
    // a cryptographic guarantee — the same trust model as the rest of the room
    // layer, where scoring is client-authoritative among friends. What it does
    // buy is the thing pass-and-play cannot: nobody has to look away.
    const hand = state.hands[live ? mySeat : seat] ?? [];

    // ---------------- HANDOFF ----------------
    if (stage === 'HANDOFF') {
        return (
            <div className="h-full flex flex-col animate-fade-in" data-line-stage="HANDOFF">
                <ScreenHeader title="The Line" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            {deck.name} · {state.order.length} on the line
                        </p>
                        <ArrowUpNarrowWide size={32} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-3 relative z-10">
                            Phone to {roster[seat]}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            {hand.length} card{hand.length === 1 ? '' : 's'} left to place.
                            {state.misses[seat] > 0 && ` ${state.misses[seat]} miss${state.misses[seat] === 1 ? '' : 'es'} so far.`}
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); setStage('PLAY'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Take a look <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- PLAY — the signature screen ----------------
    if (stage === 'PLAY') {
        const showGaps = sel !== null && !move;
        const selCard = sel !== null ? cards[sel] : null;
        const moveCard = move ? cards[move.cardIdx] : null;
        const lives = SOLO_LIVES - state.misses[0];

        // A row of the line. `landed` is the card that just locked in — it gets
        // the slide + the value flip and pulls itself into view.
        const row = (idx: number, landed: boolean) => (
            <div
                key={cards[idx].id}
                ref={landed ? landedRef : undefined}
                data-line-row={cards[idx].label}
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 ${landed ? 'animate-slide-up' : ''}`}
                style={landed
                    ? { borderColor: GOOD + '88', background: GOOD + '16' }
                    : { borderColor: 'var(--c-border)', background: 'var(--c-surface)' }}
            >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: landed ? GOOD : ACCENT }} />
                <span data-line-label className="text-[12.5px] font-bold text-ink leading-snug flex-1 min-w-0">{cards[idx].label}</span>
                <span
                    data-line-value
                    className={`text-[12.5px] font-black tabular-nums px-2 py-0.5 rounded-md border flex-shrink-0 ${landed && flip ? 'animate-line-flip' : ''}`}
                    style={{
                        color: landed ? GOOD : ACCENT,
                        borderColor: (landed ? GOOD : ACCENT) + '55',
                        background: (landed ? GOOD : ACCENT) + '14',
                        visibility: landed && !flip ? 'hidden' : 'visible',
                    }}
                >
                    {formatValue(cards[idx].value, deck.units)}
                </span>
            </div>
        );

        // A gap says what CLAIM you would be making by tapping it — "under 96 m",
        // "452 m – 979 m", "over 6,190 m". Printing the selected card's name in
        // every gap instead (the first version) repeated it four times over and
        // told the player nothing they did not already know.
        const gapRange = (g: number): string => {
            const above = g > 0 ? formatValue(cards[state.order[g - 1]].value, deck.units) : null;
            const below = g < state.order.length ? formatValue(cards[state.order[g]].value, deck.units) : null;
            if (!above) return `under ${below}`;
            if (!below) return `over ${above}`;
            return `${above} – ${below}`;
        };

        const gap = (g: number) => (
            <button
                key={`gap-${g}`}
                onClick={() => { hapticLight(); playPop(); commit(g); }}
                data-line-gap={g}
                aria-label={`Place ${selCard?.label} here — ${gapRange(g)}`}
                className="animate-line-gap w-full rounded-lg border-2 border-dashed py-1.5 flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                style={{ borderColor: ACCENT + '99', background: ACCENT + '10' }}
            >
                <Plus size={13} style={{ color: ACCENT }} />
                <span className="text-[11px] font-bold tabular-nums truncate max-w-[240px]" style={{ color: ACCENT }}>
                    {gapRange(g)}
                </span>
            </button>
        );

        return (
            // `h-full` cannot resolve here — App's shell is `min-h-screen`, not
            // a definite height — so `flex-1` on the line silently collapsed and
            // the hand sat wherever the line ended. On a long line that pushed a
            // player's own cards below the fold every turn. An explicit viewport
            // height makes the line the part that scrolls and pins the hand.
            <div className="flex flex-col animate-fade-in h-[calc(100dvh-2rem)] md:h-[calc(100dvh-3rem)]" data-line-stage="PLAY">
                <ScreenHeader
                    title={live ? (myTurn ? 'Your turn' : `${roster[activeSeat]}'s turn`) : solo ? 'The Line' : roster[seat]}
                    onBack={live ? exitLive : () => setStage('SETUP')}
                    onHome={onExit}
                    confirmOnExit
                />

                {/* status strip */}
                <div className="max-w-[340px] mx-auto w-full flex items-center justify-between mb-2 px-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted truncate">
                        {deck.emoji} {deck.name}
                    </span>
                    {solo ? (
                        <span className="flex items-center gap-1">
                            {Array.from({ length: SOLO_LIVES }, (_, i) => (
                                <Heart key={i} size={13} fill={i < lives ? BAD : 'transparent'} style={{ color: i < lives ? BAD : 'var(--c-muted)' }} />
                            ))}
                        </span>
                    ) : (
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                            {hand.length} left · {state.misses[seat]} miss{state.misses[seat] === 1 ? '' : 'es'}
                        </span>
                    )}
                </div>

                {/* THE LINE */}
                <div className="flex-1 min-h-0 overflow-y-auto px-2">
                    <div className="max-w-[340px] mx-auto w-full relative pb-2 min-h-full flex flex-col">
                        <p className="text-[10px] text-muted text-center mb-1.5">{deck.axis}</p>
                        {/* The rail — a gradient, so the direction of travel is never in
                            doubt. It runs the FULL height of the region rather than
                            stopping at the last card: early on there is a lot of space
                            between a two-card line and the hand, and a rail that carries
                            on into it reads as a line still being built instead of a
                            layout that ran out. It fades at the tail so it never looks
                            like an edge. */}
                        <div
                            className="absolute left-[3px] top-6 bottom-0 w-[2px] rounded-full pointer-events-none"
                            style={{ background: `linear-gradient(to bottom, ${ACCENT}22, ${ACCENT}CC 62%, ${ACCENT}00)` }}
                        />
                        {/* Spacers, not `justify-center`: they centre a short line so the
                            starter sits mid-screen — it comes from the middle third of the
                            deck, so cards genuinely go both above and below it, and pinning
                            it to the top implies otherwise. When the line outgrows the
                            region they collapse to nothing and it scrolls from the top.
                            `justify-content: center` would clip the smallest cards out of
                            reach instead. */}
                        <div className="flex-1 min-h-2" />
                        <div className="grid gap-1.5 pl-3">
                            {state.order.map((idx, i) => (
                                <React.Fragment key={cards[idx].id}>
                                    {showGaps && i === 0 && gap(0)}
                                    {/* a rejected card is shown where it was aimed, then it is gone */}
                                    {move && !move.correct && move.gap === i && (
                                        <div data-line-reject={moveCard?.label}
                                            className="flex items-center gap-2.5 rounded-xl border-2 border-dashed px-3 py-2 animate-shake"
                                            style={{ borderColor: BAD + 'AA', background: BAD + '12' }}>
                                            <X size={13} className="flex-shrink-0" style={{ color: BAD }} />
                                            <span className="text-[12.5px] font-bold leading-snug flex-1 min-w-0" style={{ color: BAD }}>{moveCard?.label}</span>
                                            <span className="text-[12.5px] font-black tabular-nums flex-shrink-0" style={{ color: BAD, visibility: flip ? 'visible' : 'hidden' }}>
                                                {moveCard && formatValue(moveCard.value, deck.units)}
                                            </span>
                                        </div>
                                    )}
                                    {row(idx, Boolean(move?.correct && move.cardIdx === idx))}
                                    {showGaps && gap(i + 1)}
                                </React.Fragment>
                            ))}
                            {move && !move.correct && move.gap === state.order.length && (
                                <div data-line-reject={moveCard?.label}
                                    className="flex items-center gap-2.5 rounded-xl border-2 border-dashed px-3 py-2 animate-shake"
                                    style={{ borderColor: BAD + 'AA', background: BAD + '12' }}>
                                    <X size={13} className="flex-shrink-0" style={{ color: BAD }} />
                                    <span className="text-[12.5px] font-bold leading-snug flex-1 min-w-0" style={{ color: BAD }}>{moveCard?.label}</span>
                                    <span className="text-[12.5px] font-black tabular-nums flex-shrink-0" style={{ color: BAD, visibility: flip ? 'visible' : 'hidden' }}>
                                        {moveCard && formatValue(moveCard.value, deck.units)}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div className="flex-1 min-h-2" />
                    </div>
                </div>

                {/* HAND / VERDICT */}
                <div className="flex-shrink-0 px-2 pt-2 pb-5 max-w-[340px] mx-auto w-full">
                    {move ? (
                        <div data-line-verdict={move.correct ? 'correct' : 'wrong'}
                            className="rounded-2xl border px-4 py-3.5 animate-slide-up relative overflow-hidden"
                            style={{ borderColor: (move.correct ? GOOD : BAD) + '77', background: 'var(--c-surface)', boxShadow: 'var(--shadow-card)' }}>
                            <div className="absolute inset-0 pointer-events-none"
                                style={{ background: `radial-gradient(95% 75% at 100% 0%, ${(move.correct ? GOOD : BAD)}26, transparent 62%)` }} />
                            <div className="relative z-10">
                                <div className="flex items-center gap-2 mb-1">
                                    {move.correct
                                        ? <Check size={16} style={{ color: GOOD }} />
                                        : <X size={16} style={{ color: BAD }} />}
                                    <p className="text-[11px] font-black uppercase tracking-[0.2em]" style={{ color: move.correct ? GOOD : BAD }}>
                                        {move.correct ? 'Locked in' : 'Not quite'}
                                    </p>
                                    <span className="ml-auto text-[12px] font-black tabular-nums" style={{ color: move.correct ? GOOD : BAD }}>
                                        {moveCard && formatValue(moveCard.value, deck.units)}
                                    </span>
                                </div>
                                <p className="text-[13px] font-bold text-ink leading-snug">{moveCard?.label}</p>
                                <p className="text-[12px] text-muted leading-snug mt-1">{moveCard?.note}</p>
                                {!move.correct && (
                                    <p className="text-[11px] font-bold mt-1.5" style={{ color: BAD }}>
                                        It belonged {move.truth === 0
                                            ? 'at the very top of the line'
                                            : move.truth === state.order.length
                                                ? 'at the very bottom of the line'
                                                : `just below ${cards[state.order[move.truth - 1]].label}`}.
                                    </p>
                                )}
                                <Button onClick={next} fullWidth className="h-12 mt-3">
                                    {solo && soloOver(state)
                                        ? 'See how you did'
                                        : !solo && winnerSeat(state) >= 0
                                            ? 'Final scores'
                                            : solo ? 'Next card' : live ? 'Got it' : 'Pass the phone'}
                                    <ArrowRight className="inline ml-2" size={18} />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-center text-[11px] text-muted mb-2">
                                {live && !myTurn
                                    ? <><span className="font-bold text-ink">{roster[activeSeat]}</span> is choosing. Your cards stay hidden from them.</>
                                    : sel === null
                                        ? 'Pick a card from your hand.'
                                        : <>Where does <span className="font-bold" style={{ color: ACCENT }}>{selCard?.label}</span> go?</>}
                            </p>
                            <div className={`grid grid-cols-2 gap-2 ${live && !myTurn ? 'opacity-45 pointer-events-none' : ''}`}>
                                {hand.map(idx => {
                                    const on = sel === idx;
                                    return (
                                        <button
                                            key={cards[idx].id}
                                            onClick={() => { hapticLight(); playPop(); setSel(on ? null : idx); }}
                                            data-hand-card={cards[idx].label}
                                            className="relative rounded-xl border-2 px-2.5 py-2 text-left transition-colors active:scale-95 min-h-[64px] overflow-hidden"
                                            style={on
                                                ? { borderColor: ACCENT, background: ACCENT + '1F' }
                                                : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}
                                        >
                                            <span className="text-[11.5px] font-bold leading-tight block" style={{ color: on ? ACCENT : 'var(--c-ink)' }}>
                                                {cards[idx].label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const entries = roster
        .map((n, i) => ({ n, placed: state.placed[i], misses: state.misses[i] }))
        // Pre-sorted so EndScreen's stable sort keeps the fewest-misses
        // tie-break intact when two players placed the same number.
        .sort((a, b) => b.placed - a.placed || a.misses - b.misses)
        .map(r => ({
            name: r.n,
            score: r.placed,
            expand: (
                <div className="px-4 pb-3 text-sm text-muted">
                    {r.misses} wrong placement{r.misses === 1 ? '' : 's'} · {r.placed + r.misses} card{r.placed + r.misses === 1 ? '' : 's'} played
                </div>
            ),
        }));

    return (
        // `contents` keeps the wrapper out of layout entirely while still
        // giving the stage machine an observable END — the drive should be
        // able to ask the app what screen it is on, not infer it from what
        // happens to be rendered.
        <div className="contents" data-line-stage="END">
        <EndScreen
            title="The Line"
            onBack={live ? exitLive : () => setStage('SETUP')}
            onHome={onExit}
            entries={entries}
            accent="theme"
            winnerText={top => (solo
                ? `got ${top.score} card${top.score === 1 ? '' : 's'} onto the line.`
                : `emptied their hand first.`)}
            playAgainLabel="New line"
            onPlayAgain={live ? exitLive : () => setStage('SETUP')}
            exitLabel="Back to Home"
            onExit={onExit}
            footerExtra={
                <div className="max-w-[340px] mx-auto w-full space-y-3">
                    <div className="rounded-xl border border-divider bg-surface-alt px-4 py-3 text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
                            {deck.name} · final line
                        </p>
                        <p className="font-serif font-black text-[30px] leading-none text-ink mt-1 tabular-nums">
                            {state.order.length}
                        </p>
                        <p className="text-[11px] text-muted mt-1">
                            cards in order, {formatValue(cards[state.order[0]].value, deck.units)} to {formatValue(cards[state.order[state.order.length - 1]].value, deck.units)}
                        </p>
                        {solo && (
                            <p className="text-[11px] font-bold mt-1.5" style={{ color: newBest ? GOOD : 'var(--c-muted)' }}>
                                {newBest ? 'New personal best!' : best > 0 ? `Your best is ${best}` : 'First run on the board'}
                            </p>
                        )}
                    </div>
                    <button onClick={share}
                        className="w-full h-12 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT + '99', color: ACCENT }}>
                        <Share2 size={17} /> Share the line
                    </button>
                    {shareMsg && <p className="text-center text-xs text-muted">{shareMsg}</p>}
                </div>
            }
        />
        </div>
    );
};

export default TheLineGame;
