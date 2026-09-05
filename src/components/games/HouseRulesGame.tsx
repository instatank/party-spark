import React, { useState, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    Scale, Gavel, ChevronDown, ArrowRight, Share2, ScrollText, Users,
} from 'lucide-react';
import { sessionService, shuffle } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playDing, playBuzzEnd, playReveal } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import TeamRosterRow from '../ui/TeamRosterRow';
import EndScreen from '../ui/EndScreen';
import { GameType } from '../../types';

// "House Rules" — a group drinking game where the laws accumulate.
//
// Each round one player (the Lawmaker) is handed a new law that binds the
// whole table for the rest of the session; laws never expire, so the table is
// juggling nine of them by the end. Before reading it out, the Lawmaker
// secretly picks a Mark — the player they reckon will break it first. If the
// Mark breaks it, the Lawmaker scores; if anyone else does, the Lawmaker
// drinks alongside them.
//
// The app earns its place here by being the thing that REMEMBERS: the Book of
// Laws is the hub screen, and no drunk table can hold nine live rules.
// Fully offline; the law deck is a dynamic-imported JSON chunk.

interface Props { onExit: () => void; }

type Stage = 'SETUP' | 'HANDOFF' | 'PRIVATE' | 'PUBLIC' | 'BOARD' | 'PICK_LAW' | 'PICK_BREAKER' | 'VERDICT' | 'END';

interface Law { t: string; d: string; }
interface Tier { name: string; sub: string; sips: number; laws: Law[]; }
interface RulesData { lastCallNote: string; tiers: Tier[]; }

const dataPromise = import('../../data/house_rules.json').then(m => m.default as unknown as RulesData);

const LAWS_PER_GAME = 9;          // 3 per tier, escalating
const LAWS_PER_TIER = 3;
const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;
const MARK_HIT_POINTS = 2;
const STATS_ID = 'HOUSE_RULES';   // must match GameType so the Trophies screen can name it

const ACCENT = '#D97706';         // amber-600 — reads as gavel/whisky in both themes
const ACCENT_SOFT = '#D9770622';

interface ActiveLaw {
    n: number;          // 1-based law number, as shown in the book
    t: string;          // text with {maker} already resolved
    d: string;
    sips: number;
    maker: number;      // player index who made it
    mark: number;       // player index they secretly bet on
    tier: string;
}

// Laws are dealt tier by tier so the session escalates: the first three are
// gentle, the last three are chaos.
const buildDeck = (data: RulesData): { law: Law; sips: number; tier: string }[] => {
    const out: { law: Law; sips: number; tier: string }[] = [];
    data.tiers.forEach(tier => {
        shuffle(tier.laws).slice(0, LAWS_PER_TIER).forEach(law => {
            out.push({ law, sips: tier.sips, tier: tier.name });
        });
    });
    return out;
};

export const HouseRulesGame: React.FC<Props> = ({ onExit }) => {
    const data = use(dataPromise);

    const [stage, setStage] = useState<Stage>('SETUP');
    // Seeded from the shared session roster, so names typed in any other
    // game this session carry straight in (see "Tonight's crew" on Home).
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('house_rules'));

    const [deck, setDeck] = useState<{ law: Law; sips: number; tier: string }[]>([]);
    const [book, setBook] = useState<ActiveLaw[]>([]);
    const [makerIdx, setMakerIdx] = useState(0);
    const [pendingMark, setPendingMark] = useState<number | null>(null);
    const [brokenLawN, setBrokenLawN] = useState<number | null>(null);
    const [breakerIdx, setBreakerIdx] = useState<number | null>(null);
    const [points, setPoints] = useState<number[]>([]);
    const [sips, setSips] = useState<number[]>([]);
    const [shareMsg, setShareMsg] = useState('');

    const named = players.map(p => p.trim()).filter(Boolean);
    const name = (i: number): string => named[i] ?? `Player ${i + 1}`;
    const canStart = named.length >= MIN_PLAYERS;

    const nextLaw = deck[book.length];
    const isFinalLaw = book.length === LAWS_PER_GAME - 1;
    const allLawsDealt = book.length >= LAWS_PER_GAME;

    const start = () => {
        hapticLight();
        setDeck(buildDeck(data));
        setBook([]);
        setMakerIdx(0);
        setPendingMark(null);
        setPoints(new Array(named.length).fill(0));
        setSips(new Array(named.length).fill(0));
        setShareMsg('');
        setStage('HANDOFF');
    };

    // The Lawmaker locks their secret Mark, then the law goes public.
    const lockMark = () => {
        if (pendingMark === null || !nextLaw) return;
        hapticLight(); playReveal();
        const resolve = (s: string) => s.replace(/\{maker\}/g, name(makerIdx));
        setBook(b => [...b, {
            n: b.length + 1,
            t: resolve(nextLaw.law.t),
            d: resolve(nextLaw.law.d),
            sips: nextLaw.sips,
            maker: makerIdx,
            mark: pendingMark,
            tier: nextLaw.tier,
        }]);
        setStage('PUBLIC');
    };

    const resolveBreak = () => {
        if (brokenLawN === null || breakerIdx === null) return;
        const law = book.find(l => l.n === brokenLawN);
        if (!law) return;
        const calledIt = law.mark === breakerIdx;

        setSips(s => {
            const n = [...s];
            n[breakerIdx] += law.sips;
            // A wrong call costs the Lawmaker the same as the breaker — unless
            // they broke their own law, in which case they've paid already.
            if (!calledIt && law.maker !== breakerIdx) n[law.maker] += law.sips;
            return n;
        });
        if (calledIt) {
            setPoints(p => { const n = [...p]; n[law.maker] += MARK_HIT_POINTS; return n; });
            playDing(); hapticSuccess();
        } else {
            playBuzzEnd(); hapticError();
        }
        setStage('VERDICT');
    };

    const afterVerdict = () => {
        hapticLight();
        setBrokenLawN(null);
        setBreakerIdx(null);
        if (allLawsDealt) { finish(); return; }
        setMakerIdx(m => (m + 1) % named.length);
        setPendingMark(null);
        setStage('HANDOFF');
    };

    const finish = () => {
        hapticHeavy();
        statsStore.recordPlay(STATS_ID);
        const top = Math.max(...points, 0);
        const winners = named.filter((_, i) => points[i] === top && top > 0);
        if (winners.length) statsStore.recordWins(STATS_ID, winners);
        gameNightService.reportResult(GameType.HOUSE_RULES, named.map((n, i) => ({ name: n, score: points[i] ?? 0 })));
        setStage('END');
    };

    const share = async () => {
        const ranked = named.map((n, i) => ({ n, p: points[i] ?? 0, s: sips[i] ?? 0 }))
            .sort((a, b) => b.p - a.p);
        const out = await shareResultCard({
            gameTitle: 'House Rules',
            accent: ACCENT,
            heading: ranked[0] && ranked[0].p > 0 ? `${ranked[0].n} ran the table` : 'Nobody read the room',
            sub: `${book.length} laws · ${sips.reduce((a, b) => a + b, 0)} sips paid`,
            tagline: 'The laws stack. Nobody remembers them. Everybody drinks.',
            context: '2 pts each time you called who would crack first',
            challenge: 'Think your crew could keep nine laws straight?',
            emoji: '⚖️',
            rows: ranked.map(r => ({ label: r.n, value: `${r.p} pts · ${r.s} sips` })),
        });
        setShareMsg(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Saved to your device' : out === 'failed' ? "Couldn't share" : '');
    };

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="House Rules" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">⚖️</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            The laws <em>stack</em>. Nobody gets out clean.
                        </h2>
                        <p className="text-muted text-sm px-6">
                            Nine laws, one table, and a phone that remembers all of them.
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} />
                        <p className="text-center text-[11px] text-muted mt-1">
                            {canStart
                                ? `${named.length} players — ${named.join(', ')}`
                                : `Add at least ${MIN_PLAYERS} names to begin (4–5 is the sweet spot).`}
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-4">
                        <Button onClick={start} disabled={!canStart} fullWidth className="h-14 text-lg">
                            <Gavel className="inline mr-2" size={20} /> Open the session
                        </Button>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-5">
                        <button onClick={() => setShowRules(v => !v)}
                            className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-surface-alt border border-divider text-ink text-sm font-bold">
                            <span className="flex items-center gap-2"><ScrollText size={14} className="text-muted" /> How to play</span>
                            <ChevronDown size={16} className={`text-muted transition-transform ${showRules ? 'rotate-180' : ''}`} />
                        </button>
                        {showRules && (
                            <div className="mt-2 px-4 py-3.5 rounded-xl bg-surface border border-divider text-sm text-ink-soft leading-relaxed animate-slide-up space-y-2">
                                <p><span className="font-bold text-ink">1.</span> Each round one of you is the Lawmaker. The phone hands you a law that binds the whole table — forever. Laws never expire.</p>
                                <p><span className="font-bold text-ink">2.</span> Before you read it out, you secretly pick the person you think will break it first. Nobody else sees your pick.</p>
                                <p><span className="font-bold text-ink">3.</span> Carry on drinking and talking. When somebody slips, tap it in: they drink.</p>
                                <p><span className="font-bold text-ink">4.</span> If it was your Mark, you score {MARK_HIT_POINTS}. If it was anyone else, you drink alongside them for calling it wrong.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Nine laws, getting worse. The phone stays on the table as the Book of Laws —
                                    that's the only reason this is playable past law four.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- HANDOFF ----------------
    if (stage === 'HANDOFF') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="House Rules" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Law {book.length + 1} of {LAWS_PER_GAME}{isFinalLaw ? ' · final law' : ''}
                        </p>
                        <Gavel size={32} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <h2 className="font-serif font-black text-[34px] leading-tight text-ink mt-3 relative z-10">
                            Phone to {name(makerIdx)}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            You're the Lawmaker. Everyone else — no peeking, your pick stays secret.
                        </p>
                    </div>
                    <Button onClick={() => { hapticLight(); setStage('PRIVATE'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        I've got it <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- PRIVATE (law + secret Mark) ----------------
    if (stage === 'PRIVATE' && nextLaw) {
        const resolved = nextLaw.law.t.replace(/\{maker\}/g, name(makerIdx));
        const resolvedD = nextLaw.law.d.replace(/\{maker\}/g, name(makerIdx));
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Your law" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <p className="text-center text-[10px] font-bold uppercase tracking-[0.25em] mb-2" style={{ color: ACCENT }}>
                        {name(makerIdx)}'s eyes only
                    </p>
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-6 text-center relative overflow-hidden" style={{ boxShadow: 'var(--shadow-card)', borderColor: ACCENT + '55' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 0% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted relative z-10">{nextLaw.tier}</p>
                        <p className="font-serif font-black text-[26px] leading-[1.15] text-ink mt-3 relative z-10">{resolved}</p>
                        <p className="text-sm text-muted italic mt-3 relative z-10">{resolvedD}</p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full mt-6">
                        <p className="text-sm font-bold text-ink text-center">Who cracks first?</p>
                        <p className="text-[11px] text-muted text-center mt-0.5 mb-3">
                            Secret. Call it right and you score {MARK_HIT_POINTS} — call it wrong and you drink too.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {named.map((n, i) => (
                                i === makerIdx ? null : (
                                    <button key={n} onClick={() => { setPendingMark(i); hapticLight(); }}
                                        className="px-3 py-3 rounded-xl text-sm font-bold border transition-colors truncate"
                                        style={pendingMark === i
                                            ? { borderColor: ACCENT, background: ACCENT_SOFT, color: ACCENT }
                                            : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)', color: 'var(--c-ink)' }}>
                                        {n}
                                    </button>
                                )
                            ))}
                        </div>
                    </div>

                    <Button onClick={lockMark} disabled={pendingMark === null} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Lock it in <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    const latest = book[book.length - 1];

    // ---------------- PUBLIC (read it to the table) ----------------
    if (stage === 'PUBLIC' && latest) {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="New law" onBack={() => setStage('BOARD')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-8 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: ACCENT + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}33, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Law {latest.n}{latest.n === LAWS_PER_GAME ? ' · final law' : ''} · by {name(latest.maker)}
                        </p>
                        <Scale size={30} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <p className="font-serif font-black text-[30px] leading-[1.12] text-ink mt-4 relative z-10">{latest.t}</p>
                        <p className="text-sm text-ink-soft leading-relaxed mt-4 relative z-10">{latest.d}</p>
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] mt-5 relative z-10" style={{ color: ACCENT }}>
                            Breaking it costs {latest.sips} sips
                        </p>
                        {latest.n === LAWS_PER_GAME && (
                            <p className="text-[12px] text-muted leading-relaxed mt-4 relative z-10">{data.lastCallNote}</p>
                        )}
                    </div>
                    <p className="text-center text-sm text-muted mt-5">Read it out. It's binding from now on.</p>
                    <Button onClick={() => { hapticLight(); setStage('BOARD'); }} fullWidth className="h-14 text-lg mt-3 max-w-[340px] mx-auto w-full">
                        Add it to the book <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- BOARD (the Book of Laws — the hub) ----------------
    if (stage === 'BOARD') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="The Book" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-4">
                    <div className="max-w-[340px] mx-auto w-full flex items-baseline justify-between mb-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: ACCENT }}>
                            {book.length} law{book.length === 1 ? '' : 's'} in force
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                            {allLawsDealt ? 'Final law · next slip ends it' : `${LAWS_PER_GAME - book.length} still to come`}
                        </span>
                    </div>

                    <div className="grid gap-2 max-w-[340px] mx-auto w-full">
                        {book.map(l => (
                            <div key={l.n} className="relative bg-surface-alt border border-divider rounded-xl py-3 px-4 overflow-hidden">
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: ACCENT }} />
                                <div className="flex items-start gap-3">
                                    <span className="text-[11px] font-black tabular-nums mt-0.5 flex-shrink-0" style={{ color: ACCENT }}>{l.n}</span>
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-bold text-ink leading-snug">{l.t}</p>
                                        <p className="text-[11px] text-muted leading-snug mt-0.5">{l.d}</p>
                                        <p className="text-[10px] text-muted mt-1">{name(l.maker)}'s law · {l.sips} sips</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="px-2 pb-6 pt-2 max-w-[340px] mx-auto w-full">
                    <Button onClick={() => { hapticLight(); setStage('PICK_LAW'); }} fullWidth className="h-14 text-lg">
                        <Gavel className="inline mr-2" size={20} /> Someone broke a law
                    </Button>
                    <button onClick={finish}
                        className="mx-auto mt-4 text-xs font-bold text-muted hover:text-ink flex items-center gap-1 transition-colors">
                        Call it a night <ArrowRight size={13} />
                    </button>
                </div>
            </div>
        );
    }

    // ---------------- PICK LAW ----------------
    if (stage === 'PICK_LAW') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Which law?" onBack={() => setStage('BOARD')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="grid gap-2 max-w-[340px] mx-auto w-full">
                        {book.map(l => (
                            <button key={l.n} onClick={() => { setBrokenLawN(l.n); hapticLight(); setStage('PICK_BREAKER'); }}
                                className="relative w-full text-left bg-surface-alt border border-divider hover:bg-app-tint rounded-xl py-3 px-4 transition-colors active:scale-[0.99] overflow-hidden">
                                <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-[2px]" style={{ background: ACCENT }} />
                                <div className="flex items-start gap-3">
                                    <span className="text-[11px] font-black tabular-nums mt-0.5 flex-shrink-0" style={{ color: ACCENT }}>{l.n}</span>
                                    <div className="min-w-0">
                                        <p className="text-[15px] font-bold text-ink leading-snug">{l.t}</p>
                                        <p className="text-[10px] text-muted mt-0.5">{l.sips} sips</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- PICK BREAKER ----------------
    if (stage === 'PICK_BREAKER') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Who broke it?" onBack={() => setStage('PICK_LAW')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="max-w-[340px] mx-auto w-full">
                        <p className="text-center text-sm text-muted mb-4 flex items-center justify-center gap-1.5">
                            <Users size={14} /> Name and shame.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                            {named.map((n, i) => (
                                <button key={n} onClick={() => { setBreakerIdx(i); hapticLight(); }}
                                    className="px-3 py-3.5 rounded-xl text-sm font-bold border transition-colors truncate"
                                    style={breakerIdx === i
                                        ? { borderColor: ACCENT, background: ACCENT_SOFT, color: ACCENT }
                                        : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)', color: 'var(--c-ink)' }}>
                                    {n}
                                </button>
                            ))}
                        </div>
                        <Button onClick={resolveBreak} disabled={breakerIdx === null} fullWidth className="h-14 text-lg mt-6">
                            Pass sentence <ArrowRight className="inline ml-2" size={20} />
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    // ---------------- VERDICT ----------------
    if (stage === 'VERDICT' && brokenLawN !== null && breakerIdx !== null) {
        const law = book.find(l => l.n === brokenLawN)!;
        const calledIt = law.mark === breakerIdx;
        const selfBreak = law.maker === breakerIdx;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Verdict" onBack={() => setStage('BOARD')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)', borderColor: ACCENT + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-3xl relative z-10">{calledIt ? '🎯' : '🔨'}</p>
                        <h2 className="font-serif font-black text-[32px] leading-tight text-ink mt-2 relative z-10">
                            {name(breakerIdx)} drinks {law.sips}
                        </h2>
                        <p className="text-sm text-muted mt-2 relative z-10">Law {law.n} — “{law.t}”</p>

                        <div className="mt-5 pt-4 border-t border-divider relative z-10">
                            {calledIt ? (
                                <>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: ACCENT }}>Called it</p>
                                    <p className="text-[15px] text-ink-soft leading-relaxed mt-2">
                                        {name(law.maker)} bet on {name(law.mark)} and was dead right. <span className="font-bold text-ink">+{MARK_HIT_POINTS} points.</span>
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">Bad call</p>
                                    <p className="text-[15px] text-ink-soft leading-relaxed mt-2">
                                        {name(law.maker)} had money on {name(law.mark)}.{' '}
                                        {selfBreak
                                            ? 'And then broke their own law. No points, and the sips were theirs anyway.'
                                            : `They drink ${law.sips} too, for reading the room that badly.`}
                                    </p>
                                </>
                            )}
                        </div>
                        <p className="text-[11px] text-muted mt-5 relative z-10">Every law is still in force.</p>
                    </div>
                    <Button onClick={afterVerdict} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {allLawsDealt ? 'Close the session' : `Law ${book.length + 1} — ${name((makerIdx + 1) % named.length)}'s turn`}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- END ----------------
    const entries = named.map((n, i) => ({
        name: n,
        score: points[i] ?? 0,
        expand: (
            <div className="px-4 pb-3 text-sm text-muted">
                {points[i] ?? 0} points from {(points[i] ?? 0) / MARK_HIT_POINTS} correct call
                {(points[i] ?? 0) / MARK_HIT_POINTS === 1 ? '' : 's'} · {sips[i] ?? 0} sips paid
            </div>
        ),
    }));

    return (
        <EndScreen
            title="House Rules"
            onBack={() => setStage('SETUP')}
            onHome={onExit}
            entries={entries}
            accent="theme"
            winnerText={top => `read the room best — ${top.score} points.`}
            playAgainLabel="New session, same crew"
            onPlayAgain={start}
            exitLabel="Back to Home"
            onExit={onExit}
            footerExtra={
                <div className="max-w-[340px] mx-auto w-full">
                    <button onClick={share}
                        className="w-full h-12 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT + '99', color: ACCENT }}>
                        <Share2 size={17} /> Share the verdict
                    </button>
                    {shareMsg && <p className="text-center text-xs text-muted mt-2">{shareMsg}</p>}
                </div>
            }
        />
    );
};

export default HouseRulesGame;
