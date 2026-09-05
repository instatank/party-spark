import React, { useState, use } from 'react';
import { ScreenHeader, Button } from '../ui/Layout';
import {
    Fingerprint, ChevronRight, ChevronDown, ArrowRight, Share2, ScrollText,
    Heart, Search, FileText, Users,
} from 'lucide-react';
import { useTheme } from '../../contexts/ThemeContext';
import { sessionService } from '../../services/SessionManager';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { playDing, playBuzzEnd, playReveal, playPop } from '../../services/audio';
import { hapticLight, hapticSuccess, hapticError, hapticHeavy } from '../../services/haptics';
import { shareResultCard } from '../../services/shareCard';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import TeamRosterRow from '../ui/TeamRosterRow';
import { GameType } from '../../types';
import {
    buildCase, clueSentence, pointsFor, type BuiltCase, type ShortlistData, type SLBoard, type SLItem,
} from '../../services/shortlistEngine';

// "Shortlist" — PartySpark's first COOPERATIVE game. The table doesn't play
// each other, it plays the app: sixteen suspects on the board, one of them
// guilty, and the app feeds truthful clues one at a time. Cross suspects off,
// argue, and name someone. Every extra clue you take is worth fewer points, so
// the whole game is one question asked five times — do we know enough yet?
//
// The app earns its place by being the honest oracle. At a party there is no
// referee who can hold a secret and answer questions without ever slipping;
// this is a game a deck of cards genuinely cannot run. And because clues are
// generated from each suspect's attributes rather than authored, three small
// boards produce an endless supply of cases.
//
// The guarantee that makes it fair — every clue is true, and the last one
// leaves exactly one suspect standing — lives in shortlistEngine.ts and is
// enforced over thousands of generated cases in tests/shortlistEngine.test.ts.
// Fully offline; the boards are a dynamic-imported JSON chunk.

interface Props { onExit: () => void; }

type Stage = 'SETUP' | 'CASE_INTRO' | 'BOARD' | 'NAME' | 'VERDICT' | 'END';

const dataPromise = import('../../data/shortlist.json').then(m => m.default as unknown as ShortlistData);

const CASES = 5;
const LIVES = 3;
const MAX_PLAYERS = 8;
const STATS_ID = 'SHORTLIST';
const TABLE = 'The table';

const ACCENT_DARK = '#38BDF8';   // sky-400
const ACCENT_LIGHT = '#0369A1';  // sky-700, ~25% darker for white surfaces

interface CaseLog { n: number; suspect: string; emoji: string; clues: number; points: number; solved: boolean; }

// 4x4 suspect board. Crossing a tile off is the table's own bookkeeping — the
// app never reacts to it, because reacting would do the deduction for them.
const Board: React.FC<{
    items: SLItem[]; crossed: Set<number>; accent: string; mode: 'mark' | 'accuse';
    picked?: number | null; onPick: (i: number) => void;
}> = ({ items, crossed, accent, mode, picked, onPick }) => (
    <div className="grid grid-cols-4 gap-2 max-w-[340px] mx-auto w-full">
        {items.map((it, i) => {
            const out = crossed.has(i);
            const hidden = mode === 'accuse' && out;
            const sel = mode === 'accuse' && picked === i;
            return (
                <button
                    key={it.w}
                    onClick={() => { if (!hidden) onPick(i); }}
                    disabled={hidden}
                    className="relative rounded-xl border-2 py-2.5 px-1 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:active:scale-100 min-h-[74px] overflow-hidden"
                    style={sel
                        ? { borderColor: accent, background: accent + '26' }
                        : hidden
                            ? { borderColor: 'var(--c-border)', background: 'transparent', opacity: 0.2 }
                            : out
                                ? { borderColor: 'var(--c-border)', background: 'transparent', opacity: 0.4 }
                                : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}
                >
                    <span className={`text-[22px] leading-none ${out && mode === 'mark' ? 'grayscale' : ''}`}>{it.e}</span>
                    <span className="text-[9px] font-bold leading-tight text-center text-ink px-0.5">{it.w}</span>
                    {out && mode === 'mark' && (
                        <span className="absolute inset-0 pointer-events-none opacity-60"
                            style={{ background: 'linear-gradient(to bottom right, transparent 49.2%, var(--c-muted) 49.2%, var(--c-muted) 50.8%, transparent 50.8%)' }} />
                    )}
                </button>
            );
        })}
    </div>
);

export const ShortlistGame: React.FC<Props> = ({ onExit }) => {
    const data = use(dataPromise);
    const { theme } = useTheme();
    const light = theme === 'light';
    const ACCENT = light ? ACCENT_LIGHT : ACCENT_DARK;
    const RIGHT = light ? '#15803D' : '#4ADE80';
    const WRONG = light ? '#BE123C' : '#FB7185';

    const [stage, setStage] = useState<Stage>('SETUP');
    // Seeded from the shared session roster so names carry in from other games.
    const [players, setPlayers] = useState<string[]>(() => sessionService.getTeams());
    const [showRules, setShowRules] = useState(() => shouldAutoExpandRules('shortlist'));

    const [boardId, setBoardId] = useState(data.boards[0].id);
    const [caseIdx, setCaseIdx] = useState(0);
    const [built, setBuilt] = useState<BuiltCase | null>(null);
    const [cluesShown, setCluesShown] = useState(1);
    const [crossed, setCrossed] = useState<Set<number>>(new Set());
    const [picked, setPicked] = useState<number | null>(null);
    const [lastGuess, setLastGuess] = useState<number | null>(null);
    const [crossedSecretEver, setCrossedSecretEver] = useState(false);
    const [lives, setLives] = useState(LIVES);
    const [score, setScore] = useState(0);
    const [log, setLog] = useState<CaseLog[]>([]);
    const [shareMsg, setShareMsg] = useState('');

    const named = players.map(p => p.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
    const board: SLBoard = data.boards.find(b => b.id === boardId) ?? data.boards[0];
    const items = board.items;
    const suspect = built ? items[built.secret] : null;
    const outOfClues = !!built && cluesShown >= built.clues.length;
    const payout = pointsFor(cluesShown);
    const left = items.length - crossed.size;

    const openCase = (n: number, id: string = boardId) => {
        const b = data.boards.find(x => x.id === id) ?? data.boards[0];
        setBuilt(buildCase(b));
        setCaseIdx(n);
        setCluesShown(1);
        setCrossed(new Set());
        setPicked(null);
        setLastGuess(null);
        setCrossedSecretEver(false);
        setStage('CASE_INTRO');
    };

    const start = (id: string) => {
        hapticLight(); playReveal();
        setBoardId(id);
        setLives(LIVES);
        setScore(0);
        setLog([]);
        setShareMsg('');
        openCase(0, id);
    };

    const toggleCross = (i: number) => {
        hapticLight(); playPop();
        setCrossed(c => {
            const n = new Set(c);
            if (n.has(i)) n.delete(i); else n.add(i);
            return n;
        });
        if (built && i === built.secret && !crossed.has(i)) setCrossedSecretEver(true);
    };

    const takeClue = () => {
        if (!built || outOfClues) return;
        hapticLight(); playReveal();
        setCluesShown(c => c + 1);
    };

    const accuse = () => {
        if (!built || picked === null) return;
        setLastGuess(picked);
        if (picked === built.secret) {
            const pts = payout;
            playDing(); hapticSuccess();
            setScore(s => s + pts);
            setLog(l => [...l, { n: caseIdx + 1, suspect: items[built.secret].w, emoji: items[built.secret].e, clues: cluesShown, points: pts, solved: true }]);
        } else {
            playBuzzEnd(); hapticError();
            setLives(v => v - 1);
        }
        setPicked(null);
        setStage('VERDICT');
    };

    // A wrong accusation costs a life and the case carries on — with one more
    // clue if the chain still has one.
    const afterWrong = () => {
        hapticLight();
        if (lives <= 0) {
            if (built) setLog(l => [...l, { n: caseIdx + 1, suspect: items[built.secret].w, emoji: items[built.secret].e, clues: cluesShown, points: 0, solved: false }]);
            finish();
            return;
        }
        if (!outOfClues) takeClue();
        setStage('BOARD');
    };

    const afterSolved = () => {
        hapticLight();
        if (caseIdx + 1 >= CASES) { finish(); return; }
        openCase(caseIdx + 1);
    };

    const finish = () => {
        hapticHeavy();
        statsStore.recordPlay(STATS_ID);
        statsStore.recordBest(STATS_ID, score, `${score} pts`);
        // Co-op: there is no individual winner, so nothing is written to the
        // per-player wins leaderboard. Game Night gets everyone on the shared
        // team score, which correctly reads as a tie for that game.
        if (named.length) {
            gameNightService.reportResult(GameType.SHORTLIST, named.map(n => ({ name: n, score })));
        }
        setStage('END');
    };

    const share = async () => {
        const solved = log.filter(l => l.solved).length;
        const out = await shareResultCard({
            gameTitle: 'Shortlist',
            accent: ACCENT_DARK,
            heading: `${solved} of ${CASES} cases closed`,
            sub: `${board.name} · ${score} points · ${lives} ${lives === 1 ? 'life' : 'lives'} left`,
            tagline: 'Sixteen suspects, one culprit, and clues that cost you points.',
            context: 'The earlier you name them, the more the case is worth',
            challenge: 'Think your table can close them faster?',
            emoji: '🔍',
            plainRows: true,
            rows: log.map(l => ({ label: `Case ${l.n} · ${l.suspect}`, value: l.solved ? `${l.clues} clue${l.clues === 1 ? '' : 's'} · ${l.points} pts` : 'unsolved' })),
        });
        setShareMsg(out === 'shared' ? 'Shared!' : out === 'downloaded' ? 'Saved to your device' : out === 'failed' ? "Couldn't share" : '');
    };

    const Lives = () => (
        <span className="flex items-center gap-1">
            {Array.from({ length: LIVES }).map((_, i) => (
                <Heart key={i} size={13} fill={i < lives ? (light ? '#BE123C' : '#FB7185') : 'none'}
                    className={i < lives ? '' : 'opacity-30'} style={{ color: light ? '#BE123C' : '#FB7185' }} />
            ))}
        </span>
    );

    // ---------------- SETUP ----------------
    if (stage === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Shortlist" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="text-center mb-4 -mt-3">
                        <p className="text-3xl mb-1.5 leading-none">🔍</p>
                        <h2 className="text-lg font-serif font-bold text-ink mb-0.5">
                            Everyone against <em>the app</em>.
                        </h2>
                        <p className="text-muted text-sm px-6">
                            Sixteen suspects. It knows which one. Every clue you take costs you points.
                        </p>
                    </div>

                    <div className="max-w-[340px] mx-auto w-full">
                        <TeamRosterRow teams={players} onTeamsChange={setPlayers} noun="Player" max={MAX_PLAYERS} />
                        <p className="text-center text-[11px] text-muted mt-1 mb-4 flex items-center justify-center gap-1.5">
                            <Users size={12} />
                            {named.length
                                ? `${named.join(', ')} — one score, shared.`
                                : 'Names are optional. You all win or lose together.'}
                        </p>
                    </div>

                    <p className="max-w-[340px] mx-auto w-full text-[10px] font-bold uppercase tracking-[0.18em] text-muted mb-2 px-1">
                        Pick a line-up
                    </p>
                    <div className="grid gap-3 max-w-[340px] mx-auto w-full">
                        {data.boards.map(b => (
                            <button
                                key={b.id}
                                onClick={() => start(b.id)}
                                className="group relative w-full text-left bg-surface-alt backdrop-blur-sm border border-divider border-l-4 border-b-2 hover:bg-app-tint hover:border-t-ink-soft/25 hover:border-r-ink-soft/25 rounded-xl py-3 px-4 transition-colors overflow-hidden"
                                style={{ borderLeftColor: ACCENT, borderBottomColor: ACCENT }}
                            >
                                <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                                <div className="flex items-center gap-3 relative z-10">
                                    <span className="text-base leading-none">{b.emoji}</span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-bold text-ink leading-snug truncate">{b.name}</p>
                                        <p className="text-[11px] text-muted leading-snug truncate">{b.tagline}</p>
                                    </div>
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
                                <p><span className="font-bold text-ink">1.</span> The app hides one of the sixteen and gives you a clue. Every clue is <span className="font-bold text-ink">true</span> — it never lies to you.</p>
                                <p><span className="font-bold text-ink">2.</span> Argue it out and tap suspects to cross them off. That's your board, not the app's — it won't help and it won't correct you.</p>
                                <p><span className="font-bold text-ink">3.</span> Name someone whenever you like. First clue is worth {pointsFor(1)}, and it drops with every clue you take after that.</p>
                                <p><span className="font-bold text-ink">4.</span> Wrong name costs one of your {LIVES} lives and you must take another clue before trying again. Run out and the night's over.</p>
                                <p className="text-muted pt-1 border-t border-divider">
                                    Five cases. It's always solvable — the last clue always leaves exactly one suspect standing, so if you're still guessing, you missed something.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    if (!built || !suspect) return null;

    // ---------------- CASE INTRO ----------------
    if (stage === 'CASE_INTRO') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Shortlist" onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 flex flex-col justify-center px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border border-divider rounded-[22px] px-6 py-9 text-center relative overflow-hidden animate-slide-up" style={{ boxShadow: 'var(--shadow-card)' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}2E, transparent 62%)` }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.25em] relative z-10" style={{ color: ACCENT }}>
                            Case {caseIdx + 1} of {CASES}
                        </p>
                        <Fingerprint size={34} className="mx-auto mt-4 relative z-10" style={{ color: ACCENT }} />
                        <h2 className="font-serif font-black text-[27px] leading-tight text-ink mt-3 relative z-10">
                            {board.cases[caseIdx % board.cases.length]}
                        </h2>
                        <p className="text-sm text-ink-soft leading-relaxed mt-3 relative z-10">
                            One of the {items.length} did it. Name them in as few clues as you can.
                        </p>
                        <div className="flex items-center justify-center gap-4 mt-5 relative z-10">
                            <Lives />
                            <span className="text-[11px] font-bold text-muted">{score} pts</span>
                        </div>
                    </div>
                    <Button onClick={() => { hapticLight(); setStage('BOARD'); }} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        Read the first clue <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- BOARD (the signature screen) ----------------
    if (stage === 'BOARD') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={`Case ${caseIdx + 1} of ${CASES}`} onBack={() => setStage('SETUP')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-4">
                    <div className="max-w-[340px] mx-auto w-full flex items-center justify-between mb-2.5">
                        <Lives />
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                            {left} left on your board
                        </span>
                    </div>

                    {/* the clue tape */}
                    <div className="grid gap-1.5 max-w-[340px] mx-auto w-full mb-4">
                        {built.clues.slice(0, cluesShown).map((c, i) => {
                            const newest = i === cluesShown - 1;
                            return (
                                <div key={c.text}
                                    className={`relative rounded-xl border pl-9 pr-3 py-2.5 overflow-hidden ${newest ? 'animate-slide-up' : ''}`}
                                    style={newest
                                        ? { borderColor: ACCENT + '99', background: ACCENT + '14' }
                                        : { borderColor: 'var(--c-border)', background: 'var(--c-surface-alt)' }}>
                                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-black tabular-nums"
                                        style={{ color: newest ? ACCENT : 'var(--c-muted)' }}>{i + 1}</span>
                                    <p className={`text-[13px] leading-snug ${newest ? 'text-ink font-bold' : 'text-ink-soft'}`}>
                                        {clueSentence(c)}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    <Board items={items} crossed={crossed} accent={ACCENT} mode="mark" onPick={toggleCross} />
                    <p className="text-center text-[11px] text-muted mt-3 px-6">
                        Tap to cross a suspect off. The app is watching, not helping.
                    </p>
                </div>

                <div className="px-2 pb-6 pt-2 max-w-[340px] mx-auto w-full flex gap-2">
                    <button onClick={takeClue} disabled={outOfClues}
                        className="flex-1 h-14 rounded-lg font-bold border-2 flex flex-col items-center justify-center transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                        style={{ borderColor: 'var(--c-border)', color: 'var(--c-ink-soft)' }}>
                        <span className="flex items-center gap-1.5 text-[15px]"><FileText size={15} /> Another clue</span>
                        <span className="text-[10px] text-muted font-bold">
                            {outOfClues ? 'no clues left' : `drops to ${pointsFor(cluesShown + 1)} pts`}
                        </span>
                    </button>
                    <button onClick={() => { hapticLight(); setPicked(null); setStage('NAME'); }} disabled={left === 0}
                        className="flex-1 h-14 rounded-lg font-bold border-2 flex flex-col items-center justify-center transition-colors active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                        style={{ borderColor: ACCENT, background: ACCENT + '1A', color: ACCENT }}>
                        <span className="flex items-center gap-1.5 text-[15px]"><Search size={15} /> Name them</span>
                        <span className="text-[10px] font-bold">
                            {left === 0 ? 'you crossed off everyone' : `worth ${payout} pts`}
                        </span>
                    </button>
                </div>
            </div>
        );
    }

    // ---------------- NAME ----------------
    if (stage === 'NAME') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Name them" onBack={() => setStage('BOARD')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <p className="text-center text-sm text-muted mb-4 px-6">
                        Worth <span className="font-bold" style={{ color: ACCENT }}>{payout} points</span> if you're right.
                        Wrong and it costs a life.
                    </p>
                    <Board items={items} crossed={crossed} accent={ACCENT} mode="accuse" picked={picked} onPick={i => { setPicked(i); hapticLight(); }} />
                    <p className="text-center text-[11px] text-muted mt-3">
                        The ones you crossed off aren't selectable.
                    </p>
                    <Button onClick={accuse} disabled={picked === null} fullWidth className="h-14 text-lg mt-5 max-w-[340px] mx-auto w-full">
                        {picked === null ? 'Pick a suspect' : `It was ${items[picked].w}`} <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- VERDICT ----------------
    if (stage === 'VERDICT' && lastGuess !== null) {
        const right = lastGuess === built.secret;
        const dead = !right && lives <= 0;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title={right ? 'Case closed' : 'Wrong'} onBack={() => setStage('BOARD')} onHome={onExit} confirmOnExit />
                <div className="flex-1 overflow-y-auto px-2 pb-8">
                    <div className="w-full max-w-[360px] mx-auto bg-surface border rounded-[22px] px-6 py-7 text-center relative overflow-hidden animate-slide-up"
                        style={{ boxShadow: 'var(--shadow-card)', borderColor: (right ? RIGHT : WRONG) + '66' }}>
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${right ? RIGHT : WRONG}2E, transparent 62%)` }} />
                        {right ? (
                            <>
                                <p className="text-4xl relative z-10">{suspect.e}</p>
                                <h2 className="font-serif font-black text-[30px] leading-tight text-ink mt-2 relative z-10">
                                    It was {suspect.w}
                                </h2>
                                <p className="text-[15px] text-ink-soft leading-relaxed mt-3 relative z-10">
                                    Closed on {cluesShown} clue{cluesShown === 1 ? '' : 's'} — <span className="font-bold" style={{ color: RIGHT }}>+{payout} points</span>.
                                </p>
                                {crossedSecretEver && (
                                    <p className="text-[12px] text-muted italic mt-3 relative z-10">
                                        You had them crossed off at one point. Bold recovery.
                                    </p>
                                )}
                            </>
                        ) : (
                            <>
                                <p className="text-3xl relative z-10">🚫</p>
                                <h2 className="font-serif font-black text-[30px] leading-tight text-ink mt-2 relative z-10">
                                    Not {items[lastGuess].w}
                                </h2>
                                <p className="text-[15px] text-ink-soft leading-relaxed mt-3 relative z-10">
                                    {dead
                                        ? `That was your last life. The culprit was ${suspect.e} ${suspect.w}.`
                                        : outOfClues
                                            ? 'No clues left — go back over the ones you have. Everything you need is there.'
                                            : 'One life gone. Here comes another clue.'}
                                </p>
                                {!dead && <div className="mt-4 relative z-10 flex justify-center"><Lives /></div>}
                            </>
                        )}
                    </div>

                    <Button onClick={right ? afterSolved : afterWrong} fullWidth className="h-14 text-lg mt-6 max-w-[340px] mx-auto w-full">
                        {right
                            ? (caseIdx + 1 >= CASES ? 'The final report' : `Case ${caseIdx + 2}`)
                            : dead ? 'The final report' : outOfClues ? 'Back to the board' : 'Take the next clue'}
                        <ArrowRight className="inline ml-2" size={20} />
                    </Button>
                </div>
            </div>
        );
    }

    // ---------------- END (bespoke: one shared result, no leaderboard) ----------------
    const solved = log.filter(l => l.solved).length;
    const totalClues = log.reduce((a, l) => a + l.clues, 0);
    const verdict = solved === CASES ? 'Every case closed.'
        : solved >= 3 ? 'A decent night at the desk.'
            : solved >= 1 ? 'Some of them got away.'
                : 'A catastrophe, frankly.';

    return (
        <div className="h-full flex flex-col animate-fade-in">
            <ScreenHeader title="Final report" onBack={() => setStage('SETUP')} onHome={onExit} />
            <div className="flex-1 overflow-y-auto px-2 pb-8">
                <div className="text-center mb-5">
                    <p className="text-5xl mb-2">{solved === CASES ? '🏆' : solved >= 3 ? '🔍' : '🗂️'}</p>
                    <h2 className="font-serif font-black text-[30px] leading-tight text-ink">
                        {solved} of {CASES} closed
                    </h2>
                    <p className="text-sm text-muted mt-1">
                        {named.length ? `${named.join(', ')} — ` : `${TABLE} — `}{verdict}
                    </p>
                </div>

                <div className="max-w-[340px] mx-auto w-full grid grid-cols-3 gap-2 mb-5">
                    {[
                        { v: String(score), l: 'points' },
                        { v: String(totalClues), l: 'clues used' },
                        { v: `${lives}/${LIVES}`, l: 'lives left' },
                    ].map(s => (
                        <div key={s.l} className="rounded-xl border py-3 text-center relative overflow-hidden"
                            style={{ borderColor: ACCENT + '55', background: 'var(--c-surface)' }}>
                            <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(95% 75% at 100% 0%, ${ACCENT}22, transparent 62%)` }} />
                            <p className="text-2xl font-black tabular-nums text-ink relative z-10">{s.v}</p>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted relative z-10">{s.l}</p>
                        </div>
                    ))}
                </div>

                <div className="grid gap-2 max-w-[340px] mx-auto w-full">
                    {log.map(l => (
                        <div key={l.n} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
                            style={l.solved
                                ? { borderColor: RIGHT + '55', background: RIGHT + '10' }
                                : { borderColor: WRONG + '55', background: WRONG + '10' }}>
                            <span className="text-lg leading-none">{l.emoji}</span>
                            <div className="min-w-0 flex-1">
                                <p className="text-[13px] font-bold text-ink leading-tight truncate">Case {l.n} — {l.suspect}</p>
                                <p className="text-[10px] text-muted leading-tight">
                                    {l.solved ? `named on clue ${l.clues}` : `got away on clue ${l.clues}`}
                                </p>
                            </div>
                            <span className="text-lg font-black tabular-nums" style={{ color: l.solved ? RIGHT : WRONG }}>{l.points}</span>
                        </div>
                    ))}
                </div>

                <div className="flex flex-col gap-3 w-full max-w-[340px] mx-auto mt-6">
                    <button onClick={share}
                        className="w-full h-12 rounded-lg font-bold border-2 flex items-center justify-center gap-2 transition-colors active:scale-95"
                        style={{ borderColor: ACCENT + '99', color: ACCENT }}>
                        <Share2 size={17} /> Share the report
                    </button>
                    {shareMsg && <p className="text-center text-xs text-muted">{shareMsg}</p>}
                    <Button onClick={() => setStage('SETUP')} fullWidth>New line-up</Button>
                    <Button onClick={onExit} variant="secondary" fullWidth>Back to Home</Button>
                </div>
            </div>
        </div>
    );
};

export default ShortlistGame;
