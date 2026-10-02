import React, { useMemo, useState } from 'react';
import { GlassWater, MessageCircleHeart, RotateCcw, Share2, Wand2, Sparkles, DoorClosed, SkipForward } from 'lucide-react';
import { ScreenHeader, Button } from '../../ui/Layout';
import RoomPanel from '../../ui/RoomPanel';
import { useRoom, leaveRoom, type RoomSession } from '../../../services/roomService';
import { newSeed } from '../../../services/seededRandom';
import { freezeRoster, rosterOf, forcedKey, forcedList, isForced, isPresent } from '../../../services/liveRoom';
import { dealTodDeck, currentTurn, playerFor, tallyTod, LIVE_TOD_ROUNDS, type TodChoice } from '../../../services/todLive';
import { useLiveLog } from '../../../hooks/useLiveLog';
import { generateCustomTruthOrDrink } from '../../../services/geminiService';
import { shareResultCard } from '../../../services/shareCard';
import { statsStore } from '../../../services/statsStore';
import { playPop, playReveal } from '../../../services/audio';
import { hapticLight, hapticSuccess } from '../../../services/haptics';
import { GameType } from '../../../types';
import { LiveOffline, LiveSpectating, LiveCue } from './LiveBits';

// TRUTH OR DRINK on separate phones. Turn-based: card t belongs to the player
// at seat t, and only their phone can answer it; every other phone shows the
// same question, whose turn it is, and the running tally. Whose turn it is and
// when the game ends are both DERIVED from the answer logs (services/todLive.ts)
// so the room needs the host only to start, skip and end early.
//
// Every deck works: the five curated decks deal from the seed; Create Your
// Vibe is AI-written on the host's phone after the start and shipped to the
// room in its config, since generated text cannot be re-derived from a seed.
// If generation fails, the host can fall back to a curated deck — AI is
// spice here, never a dependency (CLAUDE.md's offline directive).

export interface LiveTodDeck { id: string; title: string; emoji: string; tagline: string; color: string; tint: string }

const GROUP_TYPES = [
    { id: 'friends', label: '🍻 Friends' }, { id: 'couple', label: '💕 Couple' }, { id: 'family', label: '👨‍👩‍👧‍👦 Family' },
    { id: 'colleagues', label: '💼 Colleagues' }, { id: 'mixed', label: '🎉 Mixed' },
];
const TONES = [{ id: 'clean', label: '😇 Clean' }, { id: 'cheeky', label: '😏 Cheeky' }, { id: 'spicy', label: '🔥 Spicy' }];
const WORD_LIMIT = 150;

interface Props {
    decks: LiveTodDeck[];
    questions: Record<string, string[]>;
    onBack: () => void;
    onHome: () => void;
}

export const TruthOrDrinkLive: React.FC<Props> = ({ decks, questions, onBack, onHome }) => {
    const [session, setSession] = useState<RoomSession | null>(null);
    const room = useRoom(session, ['PLAY']);
    const { logs, answer, g, me } = useLiveLog<TodChoice>(room, session);
    const [deckId, setDeckId] = useState('classic');

    // Host-only Create Your Vibe form, shown after the start.
    const [group, setGroup] = useState('friends');
    const [tone, setTone] = useState<string | null>(null);
    const [context, setContext] = useState('');
    const [busy, setBusy] = useState(false);
    const [aiError, setAiError] = useState('');
    const [sharing, setSharing] = useState(false);

    const leave = () => { if (session) void leaveRoom(session.code, session.playerId); setSession(null); onBack(); };
    const home = () => { if (session) void leaveRoom(session.code, session.playerId); onHome(); };

    const r = room.room;
    const cfgDeckId = typeof r?.meta.config.deck === 'string' ? r.meta.config.deck : 'classic';
    const deckMeta = decks.find(d => d.id === cfgDeckId) ?? decks[0];
    const custom = cfgDeckId === 'custom';
    const customDeck = Array.isArray(r?.meta.config.customDeck) ? (r!.meta.config.customDeck as unknown[]).filter((x): x is string => typeof x === 'string') : null;
    const seed = r?.meta.seed ?? 0;
    const customKey = customDeck ? JSON.stringify(customDeck) : '';
    const cards = useMemo(() => {
        if (custom) return customKey ? (JSON.parse(customKey) as string[]).slice(0, LIVE_TOD_ROUNDS) : [];
        return dealTodDeck(questions[cfgDeckId] ?? [], seed);
    }, [custom, customKey, questions, cfgDeckId, seed]);

    // ---------------- lobby ----------------
    if (!session) {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Play live" onBack={leave} onHome={home} />
                <div className="flex-1 overflow-y-auto pb-8 px-2">
                    <RoomPanel
                        game={GameType.TRUTH_OR_DRINK}
                        title="Separate phones"
                        blurb="The question lands on every phone. Whoever's turn it is answers on theirs, and the tally keeps itself."
                        accent="violet"
                        config={{ deck: deckId, customDeck: null }}
                        minPlayers={2}
                        startConfig={rm => ({ roster: freezeRoster(rm), g: 1, forced: [] })}
                        describeConfig={c => {
                            const d = decks.find(x => x.id === c.deck) ?? decks[0];
                            return <>Deck: <span className="font-bold text-ink">{d.title} {d.emoji}</span>{d.id === 'custom' ? ' · the host writes the vibe after the start' : ''}</>;
                        }}
                        hostControls={
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2">Deck</p>
                                <div className="grid gap-1.5">
                                    {decks.map(d => (
                                        <button key={d.id} onClick={() => { hapticLight(); setDeckId(d.id); }} data-live-deck={d.id}
                                            className={`flex items-center gap-2 text-left rounded-lg py-2 px-3 border transition-colors ${deckId === d.id ? '' : 'bg-surface-alt border-divider hover:bg-app-tint'}`}
                                            style={deckId === d.id ? { borderColor: d.color, background: d.tint } : undefined}>
                                            <span className="text-sm">{d.emoji}</span>
                                            <span className="flex-1 min-w-0">
                                                <span className="block text-sm text-ink font-semibold">{d.title}</span>
                                                <span className="block text-[11px] text-muted truncate">{d.tagline}</span>
                                            </span>
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

    const roster = rosterOf(r);
    const inGame = roster.some(p => p.id === me);
    const hostName = r.players.find(p => p.id === r.meta.hostId)?.name ?? 'The host';

    // ---------------- Create Your Vibe: the host writes, everyone waits ----------------
    if (custom && !customDeck) {
        if (!room.isHost) {
            return (
                <div className="h-full flex flex-col animate-fade-in" data-live-custom-wait>
                    <ScreenHeader title="Create Your Vibe" onBack={leave} onHome={home} />
                    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
                        <Wand2 size={32} className="text-vibe animate-pulse" />
                        <p className="text-ink font-bold">{hostName} is writing a deck for your group.</p>
                        <p className="text-sm text-muted">It lands on every phone the moment it's ready.</p>
                        <LiveOffline offline={room.offline} />
                    </div>
                </div>
            );
        }
        const words = context.trim().split(/\s+/).filter(Boolean).length;
        const canGo = context.trim().length >= 10 && words <= WORD_LIMIT && !busy;
        const generate = async () => {
            setBusy(true); setAiError('');
            try {
                const out = await generateCustomTruthOrDrink(group, context.trim(), roster.map(p => p.name), 15, tone ?? '');
                const clean = out.filter(x => typeof x === 'string' && x.trim()).slice(0, LIVE_TOD_ROUNDS);
                if (!clean.length) { setAiError('The AI came back empty. Tweak the description, or play a ready-made deck.'); return; }
                await room.host({ config: { customDeck: clean } });
                hapticSuccess();
            } catch {
                setAiError("Couldn't reach the AI. Try again, or play a ready-made deck.");
            } finally { setBusy(false); }
        };
        return (
            <div className="h-full flex flex-col animate-fade-in" data-live-custom-form>
                <ScreenHeader title="Create Your Vibe" onBack={leave} onHome={home} />
                <div className="flex-1 overflow-y-auto pb-8 px-1 max-w-[380px] mx-auto w-full">
                    <p className="text-sm text-muted text-center mb-3">Everyone's waiting on you. Describe the group and the cards go to every phone.</p>
                    <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">Who's playing?</label>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {GROUP_TYPES.map(x => (
                            <button key={x.id} onClick={() => setGroup(x.id)} className={`px-3 py-1.5 rounded-lg text-xs font-bold border ${group === x.id ? 'bg-violet-600/30 border-violet-500 text-vibe' : 'bg-surface-alt border-divider text-muted'}`}>{x.label}</button>
                        ))}
                    </div>
                    <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">Tone <span className="normal-case tracking-normal font-medium">(optional)</span></label>
                    <div className="grid grid-cols-3 gap-1.5 mb-3">
                        {TONES.map(x => (
                            <button key={x.id} onClick={() => setTone(tone === x.id ? null : x.id)} className={`px-2 py-1.5 rounded-lg text-xs font-bold border ${tone === x.id ? 'bg-violet-600/30 border-violet-500 text-vibe' : 'bg-surface-alt border-divider text-muted'}`}>{x.label}</button>
                        ))}
                    </div>
                    <label className="text-[11px] font-bold text-muted uppercase tracking-widest mb-1.5 block">Describe your group</label>
                    <textarea value={context} onChange={e => { setContext(e.target.value); setAiError(''); }} rows={4} data-live-context
                        placeholder={`e.g. "${roster.map(p => p.name).join(', ')}: old flatmates, first reunion in two years."`}
                        className="w-full bg-surface-alt border border-divider rounded-xl px-3 py-2 text-ink placeholder:text-muted text-sm resize-none focus:outline-none focus:border-violet-500/50 mb-1" />
                    <p className={`text-[11px] mb-3 ${words > WORD_LIMIT ? 'text-red-500' : 'text-muted'}`}>{words}/{WORD_LIMIT} words</p>
                    {aiError && <p className="text-red-500 text-sm text-center mb-3" data-live-ai-error>{aiError}</p>}
                    <button onClick={generate} disabled={!canGo} data-live-generate
                        className={`w-full py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-2 ${canGo ? 'bg-gradient-to-r from-violet-600 to-fuchsia-500 text-white' : 'bg-surface-alt text-muted cursor-not-allowed'}`}>
                        <Sparkles size={20} /> {busy ? 'Writing…' : 'Generate & deal'}
                    </button>
                    <p className="text-[11px] text-muted text-center mt-4 mb-2">Or play a ready-made deck</p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                        {decks.filter(d => d.id !== 'custom').map(d => (
                            <button key={d.id} onClick={() => void room.host({ config: { deck: d.id } })} data-live-fallback={d.id}
                                className="px-3 py-1.5 rounded-lg text-xs font-bold border bg-surface-alt border-divider text-ink-soft">{d.emoji} {d.title}</button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // A player who has left takes their log with them (the server deletes their
    // key), so their cards must read as skipped. Otherwise the derived turn
    // would jump BACK to their first card the moment they walked out.
    const skipped = (t: number) => isForced(r, t) || !isPresent(r, playerFor(roster, t)?.id ?? '');
    const t = currentTurn(roster, logs, cards.length, skipped);
    // Only players still here: a leaver's answers left with them, so a row of
    // zeros under their name would be a claim the room cannot back.
    const rows = tallyTod(roster, logs, cards.length).rows.filter(x => isPresent(r, x.id));
    const topTruths = rows.length ? Math.max(...rows.map(x => x.truths)) : 0;
    const winners = topTruths > 0 ? rows.filter(x => x.truths === topTruths).map(x => x.name) : [];
    const played = rows.reduce((s, x) => s + x.truths + x.drinks, 0);
    const ended = r.meta.phase === 'END' || t >= cards.length;

    const playAgain = () => {
        hapticLight();
        void room.host({ phase: 'PLAY', round: 1, seed: newSeed(), config: { g: g + 1, roster: freezeRoster(r), forced: [], customDeck: null } });
    };

    // ---------------- end ----------------
    if (ended) {
        const share = async () => {
            if (sharing) return;
            setSharing(true);
            try {
                await shareResultCard({
                    gameTitle: 'Truth or Drink', accent: deckMeta.color, emoji: '🥂',
                    heading: winners.length === 1 ? `${winners[0]} told the truth` : 'Tied on truths',
                    sub: `${deckMeta.title} · ${played} rounds · separate phones`,
                    tagline: 'Answer honestly — or take the sip',
                    context: 'Most truths told takes the night',
                    challenge: 'Could your table survive these questions?',
                    rows: rows.map(x => ({ label: x.name, value: `${x.truths} truths · ${x.drinks} sips`, highlight: winners.includes(x.name) })),
                });
            } finally { setSharing(false); }
        };
        return (
            <div className="flex flex-col h-full animate-fade-in" data-live-end>
                <ScreenHeader title="That's a Wrap" onBack={leave} onHome={home} />
                <LiveCue cueKey={`${r.meta.code}:${g}`} onCue={() => {
                    statsStore.recordPlay('TRUTH_OR_DRINK');
                    if (winners.length) statsStore.recordWins('TRUTH_OR_DRINK', winners);
                }} />
                <div className="flex-1 overflow-y-auto flex flex-col items-center px-4 gap-5 text-center pb-8">
                    <p className="text-7xl">🥂</p>
                    <h2 className="text-3xl font-serif font-bold text-ink" data-headline>
                        {winners.length === 1 ? `${winners[0]} told the most truths.` : winners.length ? 'Tied on truths.' : 'Cheers to chaos.'}
                    </h2>
                    <div className="bg-surface-alt p-5 rounded-2xl border border-divider-soft w-full max-w-[380px]">
                        <div className="flex items-center justify-between text-[10px] font-bold text-muted uppercase tracking-widest pb-2 border-b border-divider-soft">
                            <span>Player · {played} rounds</span>
                            <div className="flex items-center gap-4"><span className="w-12 text-right">🗣️ Truths</span><span className="w-12 text-right">🥃 Drinks</span></div>
                        </div>
                        {rows.map(x => (
                            <div key={x.id} className="flex items-center justify-between py-2 border-b border-divider-soft last:border-0" data-tod-row={x.name} data-truths={x.truths} data-drinks={x.drinks}>
                                <span className="text-sm font-semibold text-ink truncate pr-2">{x.name}</span>
                                <div className="flex items-center gap-4 font-mono font-bold text-base">
                                    <span className="w-12 text-right text-emerald-500">{x.truths}</span>
                                    <span className="w-12 text-right text-amber-500">{x.drinks}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="flex flex-col gap-3 w-full max-w-[380px]">
                        <button onClick={share} disabled={sharing} className="w-full py-3 bg-transparent border-2 border-gold/60 text-gold hover:bg-gold/10 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50">
                            <Share2 size={18} /> Share Result
                        </button>
                        {room.isHost ? (
                            <Button onClick={playAgain} className="w-full py-3" data-live-again><RotateCcw className="inline mr-2" size={18} /> Play again</Button>
                        ) : <p className="text-sm text-muted">{hostName} can deal another round.</p>}
                        <button onClick={leave} className="text-sm text-muted hover:text-ink py-2">Leave room</button>
                    </div>
                    <LiveOffline offline={room.offline} />
                </div>
            </div>
        );
    }

    // ---------------- a turn ----------------
    const player = playerFor(roster, t)!;
    const mine = player.id === me;
    const question = cards[t];
    // The previous answered card, announced on every phone — the beat that
    // tells the room what just happened before the next question takes over.
    const last = (() => {
        for (let k = t - 1; k >= 0; k--) {
            const p = playerFor(roster, k);
            const c = p ? logs[p.id]?.[k] : undefined;
            if (p && c) return { name: p.name, c };
        }
        return null;
    })();

    const choose = (c: TodChoice) => {
        if (!mine) return;
        hapticLight(); playPop();
        answer(t, c);
    };

    return (
        <div className="flex flex-col h-full animate-fade-in relative z-10" data-live-turn={t} data-live-player={player.name} data-live-question={question}>
            <ScreenHeader title={mine ? 'Your turn' : `${player.name}'s turn`} onBack={leave} onHome={home} confirmOnExit />
            {/* A nudge on the phone whose turn just came round. */}
            <LiveCue cueKey={mine ? `${g}:${t}` : ''} onCue={() => { playReveal(); hapticSuccess(); }} />
            <div className="px-2 pb-4 flex-1 flex flex-col max-w-[420px] mx-auto w-full">
                {!inGame && <LiveSpectating />}
                {last && (
                    <p className="text-center text-xs text-muted mb-1" data-live-last>
                        {last.name} {last.c === 'truth' ? 'told the truth 🗣️' : 'took a drink 🥃'}
                    </p>
                )}
                <div className="flex-1 flex items-center justify-center pt-1 pb-3">
                    <div className="w-full aspect-[3/4] max-h-[420px] bg-surface border border-divider rounded-[22px] p-6 flex flex-col relative overflow-hidden" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute -top-[60px] -right-[60px] w-[160px] h-[160px] rounded-full pointer-events-none" style={{ background: deckMeta.tint }} />
                        <div className="self-start text-[10.5px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md relative z-10" style={{ background: deckMeta.tint, color: deckMeta.color }}>
                            {mine ? 'Your question' : `For ${player.name}`} · {deckMeta.title}
                        </div>
                        <div className="flex-1 flex items-center justify-center relative z-10 px-1">
                            <p className="font-serif font-semibold text-[24px] leading-[1.2] tracking-[-0.015em] text-ink text-center">{question}</p>
                        </div>
                        <div className="text-[11px] text-muted flex items-center justify-between relative z-10">
                            <span>Round {t + 1} of {cards.length}</span>
                            <span className="font-serif italic text-[12px]" style={{ color: deckMeta.color }}>PartySpark</span>
                        </div>
                    </div>
                </div>

                {mine ? (
                    <div className="flex gap-3">
                        <button onClick={() => choose('drink')} data-live-choice="drink"
                            className="flex-1 py-4 rounded-xl font-bold text-base text-amber-600 bg-transparent border-2 border-amber-500/60 hover:bg-amber-500/10 hover:border-amber-500 transition-colors flex items-center justify-center gap-2">
                            <GlassWater size={18} /> Take a Drink
                        </button>
                        <button onClick={() => choose('truth')} data-live-choice="truth"
                            className="flex-1 py-4 rounded-xl font-bold text-base text-emerald-600 bg-transparent border-2 border-emerald-500/60 hover:bg-emerald-500/10 hover:border-emerald-500 transition-colors flex items-center justify-center gap-2">
                            <MessageCircleHeart size={18} /> Tell the Truth
                        </button>
                    </div>
                ) : (
                    <p className="text-center text-sm text-muted py-3" data-live-waiting-turn>
                        <span className="text-ink font-semibold">{player.name}</span>: truth, or drink?
                    </p>
                )}

                {/* The running tally, on every phone. */}
                <div className="mt-3 flex flex-wrap justify-center gap-1.5" data-live-tally>
                    {rows.map(x => (
                        <span key={x.id} className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${x.id === player.id ? 'border-violet-500/60 text-ink' : 'border-divider text-ink-soft'} bg-surface-alt`}>
                            {x.name} <span className="text-emerald-500">{x.truths}</span>·<span className="text-amber-500">{x.drinks}</span>
                        </span>
                    ))}
                </div>

                {room.isHost && (
                    <div className="flex justify-center gap-4 mt-3">
                        {!mine && (
                            <button onClick={() => void room.host({ config: { forced: [...forcedList(r), forcedKey(g, t)] } })} data-live-skip
                                className="flex items-center gap-1.5 text-xs text-muted hover:text-ink-soft">
                                <SkipForward size={12} /> Skip {player.name}
                            </button>
                        )}
                        <button onClick={() => void room.host({ phase: 'END' })} data-live-end-early className="flex items-center gap-1.5 text-xs text-muted hover:text-ink-soft">
                            <DoorClosed size={12} /> End game early
                        </button>
                    </div>
                )}
                <LiveOffline offline={room.offline} />
            </div>
        </div>
    );
};
