import React, { useState, useEffect, useRef, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    ArrowUpNarrowWide, ChevronRight, ChevronDown, ArrowRight, Share2, ScrollText,
    Check, X, Plus, Heart,
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

type Stage = 'SETUP' | 'HANDOFF' | 'PLAY' | 'END';

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
    const roster = named.length >= 2 ? named : [named[0] || SOLO_NAME];
    const solo = roster.length === 1;

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

    const commit = (gap: number) => {
        if (!state || !deck || sel === null || move) return;
        const out = placeCard(state, deck.cards, seat, sel, gap);
        setState(out.state);
        setMove({ seat, cardIdx: sel, gap, correct: out.correct, truth: out.truth });
        setSel(null);
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
        setSeat((seat + 1) % roster.length);
        setStage('HANDOFF');
    };

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
                                    <span className="text-[10px] font-bold text-muted tabular-nums flex-shrink-0">{d.cards.length}</span>
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

    if (!deck || !state) return null;
    const cards = deck.cards;
    const hand = state.hands[seat] ?? [];

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

        const gap = (g: number) => (
            <button
                key={`gap-${g}`}
                onClick={() => { hapticLight(); playPop(); commit(g); }}
                data-line-gap={g}
                aria-label={`Place here, position ${g + 1}`}
                className="animate-line-gap w-full rounded-lg border-2 border-dashed py-1.5 flex items-center justify-center gap-1.5 transition-colors active:scale-95"
                style={{ borderColor: ACCENT + '99', background: ACCENT + '10' }}
            >
                <Plus size={13} style={{ color: ACCENT }} />
                <span className="text-[11px] font-bold truncate max-w-[220px]" style={{ color: ACCENT }}>
                    {selCard?.label}
                </span>
            </button>
        );

        return (
            <div className="h-full flex flex-col animate-fade-in" data-line-stage="PLAY">
                <ScreenHeader
                    title={solo ? 'The Line' : roster[seat]}
                    onBack={() => setStage('SETUP')}
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
                <div className="flex-1 overflow-y-auto px-2">
                    <div className="max-w-[340px] mx-auto w-full relative pb-2">
                        <p className="text-[10px] text-muted text-center mb-1.5">{deck.axis}</p>
                        {/* the rail — a gradient so the direction of travel is never in doubt */}
                        <div
                            className="absolute left-[3px] top-6 bottom-2 w-[2px] rounded-full pointer-events-none"
                            style={{ background: `linear-gradient(to bottom, ${ACCENT}22, ${ACCENT}CC)` }}
                        />
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
                    </div>
                </div>

                {/* HAND / VERDICT */}
                <div className="px-2 pt-2 pb-5 max-w-[340px] mx-auto w-full">
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
                                            : solo ? 'Next card' : 'Pass the phone'}
                                    <ArrowRight className="inline ml-2" size={18} />
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <p className="text-center text-[11px] text-muted mb-2">
                                {sel === null ? 'Pick a card from your hand.' : 'Now tap the gap where it belongs.'}
                            </p>
                            <div className="grid grid-cols-2 gap-2">
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
        <EndScreen
            title="The Line"
            onBack={() => setStage('SETUP')}
            onHome={onExit}
            entries={entries}
            accent="theme"
            winnerText={top => (solo
                ? `got ${top.score} card${top.score === 1 ? '' : 's'} onto the line.`
                : `emptied their hand first.`)}
            playAgainLabel="New line"
            onPlayAgain={() => setStage('SETUP')}
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
    );
};

export default TheLineGame;
