import React, { useEffect, useRef, useState } from 'react';
import { Camera, Image as ImageIcon, X, Flame, Swords, Sparkles, Share2, Users, Dices, RefreshCcw, Crown } from 'lucide-react';
import { ScreenHeader, Button } from '../ui/Layout';
import TeamRosterRow from '../ui/TeamRosterRow';
import EndScreen from '../ui/EndScreen';
import { PinGateModal, isAdultUnlocked } from '../ui/PinGate';
import { sessionService } from '../../services/SessionManager';
import { statsStore } from '../../services/statsStore';
import { gameNightService } from '../../services/gameNightService';
import { shouldAutoExpandRules } from '../../services/firstPlay';
import { observeRoastPhoto, generateRoastBatch, cleanBase64, type RoastObservations } from '../../services/geminiService';
import { renderRoastCard, type RoastCardTemplate } from '../../services/roastCards';
import { shareResultCard, shareCanvasImage } from '../../services/shareCard';
import { unlockAudio, playPop, playDingSoft, playBell, hapticTap, hapticSuccess } from '../../services/audio';
import {
    PERSONAS, FORMATS, SPICES, personaById, spiceById,
    MAX_BATCHES_PER_SESSION, BATCH_SIZE, randomTemplate,
    downscaleDataUrl, fileToDataUrl, hashDataUrl, loadFallbackDeck,
} from './roastShared';

// =============================================================================
// Roast Battle — Roast Me v2 Phase 3 (the party layer).
//
// Pure client assembly on top of the Phase 1+2 engine (roastShared + the
// /api/ai roast_observe / roast_text_batch handlers + roastCards posters). No
// new AI plumbing. Pass-and-play:
//   roster (2–8) → one shared persona/format/spice → each player snaps a face
//   → one roast + poster per player (offline fallback if the API is down) →
//   pass-the-phone reveal → vote the hardest burn (can't vote yourself) →
//   EndScreen leaderboard → Game Night + a share-card recap.
//
// Cost: ~$0.02/player (one observe + one text batch, no image gen — reveals are
// $0 canvas posters). A 6-player battle ≈ $0.12. Every player's batch counts
// against the shared 'ROAST_CENTRAL' session cap. Full design: §5a of
// docs/ROAST_ME_V2_PLAN.md.
// =============================================================================

interface Props {
    onExit: () => void;          // → Home (or Game Night hub if a night is live)
    onBackToStudio: () => void;  // → Roast Central solo SETUP
}

type Phase = 'SETUP' | 'CAPTURE' | 'GENERATING' | 'REVEAL' | 'VOTE' | 'RESULT';

interface BattlePlayer {
    name: string;
    photo: string | null;        // downscaled dataURL
    persona: string;             // the persona that actually roasted them (safety may override)
    roast: string;
    template: RoastCardTemplate;
    offline: boolean;
    posterUrl: string | null;    // rendered poster dataURL (reveal + vote thumb)
    votes: number;
}

const MAX_PLAYERS = 8;

const LOADING_LINES = [
    'Lining up the firing squad…',
    'Studying every face…',
    'Sharpening the one-liners…',
    'No mercy in the chamber…',
    'Loading the burns…',
];

export const RoastBattleGame: React.FC<Props> = ({ onExit, onBackToStudio }) => {
    const [phase, setPhase] = useState<Phase>('SETUP');

    // Shared battle settings (same for every player — fairness).
    const [names, setNames] = useState<string[]>(() => sessionService.getTeams());
    const [persona, setPersona] = useState('roastmaster');
    const [format, setFormat] = useState('zinger');
    const [spice, setSpice] = useState('medium');
    const [pinOpen, setPinOpen] = useState(false);
    const [rulesOpen, setRulesOpen] = useState(() => shouldAutoExpandRules('roast_battle'));

    // Players + their roasts.
    const [players, setPlayers] = useState<BattlePlayer[]>([]);
    const playersRef = useRef<BattlePlayer[]>([]);
    playersRef.current = players;

    // Pass-and-play pointer + handoff gate (shown before each player's turn so
    // the previous player doesn't peek at what's coming).
    const [activeIdx, setActiveIdx] = useState(0);
    const [handoff, setHandoff] = useState(true);

    // Per-player observation promises (keyed by player index) — kicked off the
    // moment each face lands so vision overlaps the remaining captures.
    const obsRef = useRef<Map<number, Promise<RoastObservations | null>>>(new Map());
    // Per-player poster canvases for share/download (index → canvas).
    const posterCanvasRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
    // Fallback lines already dealt this battle, so no two players share one.
    const usedFallbackRef = useRef<Set<string>>(new Set());

    // Generation progress + one-shot guards.
    const [genProgress, setGenProgress] = useState(0);
    const [loadingLine, setLoadingLine] = useState(0);
    const genStartedRef = useRef(false);
    const recordedRef = useRef(false);

    // Camera overlay.
    const [cameraOpen, setCameraOpen] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [sharing, setSharing] = useState(false);

    // --- generation (fires once when entering GENERATING) ---------------------

    useEffect(() => {
        if (phase !== 'GENERATING' || genStartedRef.current) return;
        genStartedRef.current = true;
        const lineTimer = setInterval(() => setLoadingLine(l => (l + 1) % LOADING_LINES.length), 1400);

        (async () => {
            const snap = [...playersRef.current];
            for (let i = 0; i < snap.length; i++) {
                setGenProgress(i);
                const p = snap[i];

                let obs: RoastObservations | null = null;
                try { const pr = obsRef.current.get(i); obs = pr ? await pr : null; } catch { obs = null; }

                // Wholesome override, same rule as the solo deck: a kid in frame
                // forces hype-only + mild, regardless of the battle setting. The
                // server enforces this too; here it keeps the UI honest.
                let effPersona = persona;
                let effSpice = spice;
                if (obs && (obs.hasChild || (obs.contextTags || []).includes('baby'))) {
                    effPersona = 'hype_man';
                    effSpice = 'mild';
                }

                let roast = '';
                let offline = false;
                const underCap = sessionService.getUsageCount('ROAST_CENTRAL') < MAX_BATCHES_PER_SESSION;
                if (obs && underCap) {
                    try {
                        const lines = await generateRoastBatch(obs, effPersona, format, effSpice, BATCH_SIZE);
                        if (lines.length) {
                            roast = lines[0];
                            sessionService.markAsUsed('ROAST_CENTRAL', 'battle', Date.now().toString());
                        }
                    } catch { /* fall through to the offline deck */ }
                }
                if (!roast) {
                    roast = await pickFallback(effPersona);
                    offline = true;
                }

                let posterUrl: string | null = null;
                if (p.photo) {
                    try {
                        const pp = personaById(effPersona);
                        const canvas = await renderRoastCard({
                            template: p.template,
                            photo: p.photo,
                            roast,
                            personaLabel: pp.label,
                            personaEmoji: pp.emoji,
                            observations: obs,
                        });
                        posterCanvasRef.current.set(i, canvas);
                        posterUrl = canvas.toDataURL('image/jpeg', 0.9);
                    } catch (e) {
                        console.error('[roast-battle] poster render failed:', e);
                    }
                }

                snap[i] = { ...p, roast, offline, posterUrl, persona: effPersona };
                setPlayers([...snap]);
            }
            clearInterval(lineTimer);
            setGenProgress(snap.length);
            setActiveIdx(0);
            setHandoff(true);
            setPhase('REVEAL');
        })();

        return () => clearInterval(lineTimer);
    }, [phase, persona, format, spice]);

    // --- lifetime stats + Game Night (fires once on RESULT) -------------------

    useEffect(() => {
        if (phase !== 'RESULT') { recordedRef.current = false; return; }
        if (recordedRef.current) return;
        recordedRef.current = true;
        playBell();
        statsStore.recordPlay('ROAST_CENTRAL');
        const entries = players.map(p => ({ name: p.name, score: p.votes }));
        if (entries.length) {
            const topVotes = Math.max(...entries.map(e => e.score));
            // Only crown when someone actually got a vote (avoids an all-zero tie
            // handing everyone a "win").
            if (topVotes > 0) {
                statsStore.recordWins('ROAST_CENTRAL', entries.filter(e => e.score === topVotes).map(e => e.name));
            }
            gameNightService.reportResult('ROAST_CENTRAL', entries);
        }
    }, [phase, players]);

    // --- offline fallback (one fresh line per player) -------------------------

    const pickFallback = async (personaId: string): Promise<string> => {
        const deck = await loadFallbackDeck();
        const pool = deck[personaId] ?? deck['roastmaster'] ?? [];
        const fresh = pool.filter(l => !usedFallbackRef.current.has(l));
        const source = fresh.length ? fresh : pool;
        const pick = source[Math.floor(Math.random() * source.length)] ?? 'The panel is speechless. That says it all.';
        usedFallbackRef.current.add(pick);
        return pick;
    };

    // --- photo intake (per active player) -------------------------------------

    const acceptPhoto = async (rawDataUrl: string) => {
        try {
            const scaled = await downscaleDataUrl(rawDataUrl);
            const idx = activeIdx;
            setPlayers(prev => prev.map((p, i) => (i === idx ? { ...p, photo: scaled } : p)));
            startObservation(idx, scaled);
            playPop();
            hapticTap();
        } catch (err) {
            console.error('[roast-battle] photo processing failed:', err);
            alert("Couldn't read that image. Try a different photo (JPG or PNG).");
        }
    };

    const startObservation = (idx: number, dataUrl: string) => {
        const cacheKey = `rc_obs_${hashDataUrl(dataUrl)}`;
        try {
            const cached = sessionStorage.getItem(cacheKey);
            if (cached) {
                obsRef.current.set(idx, Promise.resolve(JSON.parse(cached) as RoastObservations));
                return;
            }
        } catch { /* fall through to a fresh call */ }
        obsRef.current.set(idx, observeRoastPhoto(cleanBase64(dataUrl)).then(obs => {
            if (obs) { try { sessionStorage.setItem(cacheKey, JSON.stringify(obs)); } catch { /* quota */ } }
            return obs;
        }));
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) fileToDataUrl(file).then(acceptPhoto).catch(err => console.error('[roast-battle] file read failed:', err));
        e.target.value = '';
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            streamRef.current = stream;
            setCameraOpen(true);
            setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 100);
        } catch (err) {
            console.error('[roast-battle] camera error:', err);
            alert('Could not access the camera. Please allow permissions or upload a photo instead.');
        }
    };

    const stopCamera = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setCameraOpen(false);
    };

    const capturePhoto = () => {
        const video = videoRef.current;
        if (!video) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        stopCamera();
        acceptPhoto(dataUrl);
    };

    // --- flow control ---------------------------------------------------------

    const spiceLocked = (id: string) => SPICES.find(s => s.id === id)?.adult && !isAdultUnlocked();

    const selectSpice = (id: string) => {
        if (spiceLocked(id)) { setPinOpen(true); return; }
        setSpice(id);
        hapticTap();
    };

    const surpriseMe = () => {
        setPersona(PERSONAS[Math.floor(Math.random() * PERSONAS.length)].id);
        setFormat(FORMATS[Math.floor(Math.random() * FORMATS.length)].id);
        playDingSoft();
        hapticTap();
    };

    const startBattle = () => {
        const roster = names.map(n => n.trim()).filter(Boolean).slice(0, MAX_PLAYERS);
        if (roster.length < 2) return;
        unlockAudio();
        obsRef.current.clear();
        posterCanvasRef.current.clear();
        usedFallbackRef.current.clear();
        genStartedRef.current = false;
        recordedRef.current = false;
        setPlayers(roster.map(name => ({
            name,
            photo: null,
            persona,
            roast: '',
            template: randomTemplate(),
            offline: false,
            posterUrl: null,
            votes: 0,
        })));
        setActiveIdx(0);
        setHandoff(true);
        setGenProgress(0);
        setPhase('CAPTURE');
    };

    const advanceCapture = () => {
        if (activeIdx < players.length - 1) {
            setActiveIdx(activeIdx + 1);
            setHandoff(true);
        } else {
            genStartedRef.current = false;
            setPhase('GENERATING');
        }
    };

    const advanceReveal = () => {
        if (activeIdx < players.length - 1) {
            setActiveIdx(activeIdx + 1);
            setHandoff(true);
        } else {
            setActiveIdx(0);
            setHandoff(true);
            setPhase('VOTE');
        }
    };

    const castVote = (targetIdx: number) => {
        setPlayers(prev => prev.map((p, i) => (i === targetIdx ? { ...p, votes: p.votes + 1 } : p)));
        playDingSoft();
        hapticTap();
        if (activeIdx < players.length - 1) {
            setActiveIdx(activeIdx + 1);
            setHandoff(true);
        } else {
            setPhase('RESULT');
        }
    };

    const handlePlayAgain = () => {
        // Keep the crew + settings, drop the photos/roasts/votes.
        obsRef.current.clear();
        posterCanvasRef.current.clear();
        usedFallbackRef.current.clear();
        genStartedRef.current = false;
        recordedRef.current = false;
        setPlayers([]);
        setActiveIdx(0);
        setHandoff(true);
        setGenProgress(0);
        setPhase('SETUP');
    };

    // --- share ----------------------------------------------------------------

    const winner = (): BattlePlayer | null => {
        if (!players.length) return null;
        const top = Math.max(...players.map(p => p.votes));
        if (top <= 0) return null;
        const leaders = players.filter(p => p.votes === top);
        return leaders.length === 1 ? leaders[0] : null; // null on a tie
    };

    const shareRecap = async () => {
        if (sharing || !players.length) return;
        setSharing(true);
        try {
            const ranked = [...players].sort((a, b) => b.votes - a.votes);
            const w = winner();
            const sp = spiceById(spice);
            await shareResultCard({
                gameTitle: 'Roast Battle',
                accent: '#818CF8',
                emoji: '⚔️',
                heading: w ? `${w.name} survived the roast` : 'A brutal tie',
                sub: `${personaById(persona).label} · ${sp.label} heat · ${players.length} players`,
                rows: ranked.map((p, i) => ({
                    label: `${i === 0 && p.votes > 0 ? '👑 ' : ''}${p.name}`,
                    value: `${p.votes} vote${p.votes === 1 ? '' : 's'}`,
                    highlight: !!w && p.name === w.name,
                })),
                footer: 'Roast Battle — bring faces, leave legends',
            });
        } finally {
            setSharing(false);
        }
    };

    const shareWinnerPoster = async () => {
        const w = winner();
        if (!w) return;
        const idx = players.findIndex(p => p.name === w.name && p.votes === w.votes);
        const canvas = posterCanvasRef.current.get(idx);
        if (canvas) await shareCanvasImage(canvas, 'roast_battle_winner');
    };

    // =========================================================================
    // Camera overlay (shared by every capture turn)
    // =========================================================================

    if (cameraOpen) {
        return (
            <div className="w-full min-h-[600px] flex items-center justify-center px-4 py-6">
                <div className="relative w-full max-w-md rounded-2xl overflow-hidden bg-black border border-divider" style={{ boxShadow: 'var(--shadow-card)' }}>
                    <video ref={videoRef} autoPlay playsInline muted className="w-full h-80 object-cover scale-x-[-1]" />
                    <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 px-4">
                        <button onClick={stopCamera} className="px-4 py-2 bg-black/60 text-white rounded-full text-sm font-semibold hover:bg-black/80 transition">
                            Cancel
                        </button>
                        <button onClick={capturePhoto} className="px-6 py-2 bg-gold text-slate-900 rounded-full font-bold text-base shadow-lg">
                            SNAP 📸
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // SETUP — roster + one shared persona/format/spice
    // =========================================================================

    if (phase === 'SETUP') {
        const rosterCount = names.map(n => n.trim()).filter(Boolean).length;
        return (
            <div className="w-full">
                <ScreenHeader title="Roast Battle" onBack={onBackToStudio} onHome={onExit} />

                {pinOpen && (
                    <PinGateModal
                        onSuccess={() => { setPinOpen(false); setSpice('extra'); }}
                        onCancel={() => setPinOpen(false)}
                    />
                )}

                <div className="flex flex-col gap-4 max-w-[380px] mx-auto w-full pb-6">
                    <p className="text-sm text-ink-soft -mt-2 flex items-center gap-1.5">
                        <Swords size={15} className="text-indigo-400" />
                        Everyone snaps a face. One AI comic roasts all of you. Vote the hardest burn.
                    </p>

                    {/* How to play — auto-expands on first ever open */}
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl">
                        <button onClick={() => setRulesOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-2.5 text-left">
                            <span className="text-xs font-bold tracking-wider text-muted uppercase">How to play</span>
                            <span className="text-muted text-xs">{rulesOpen ? '▴' : '▾'}</span>
                        </button>
                        {rulesOpen && (
                            <div className="px-4 pb-3 text-xs text-ink-soft leading-relaxed">
                                1. Add 2–8 players and pick one comic + style + heat (same for everyone — fair fight).<br />
                                2. Pass the phone around — each player snaps their own face.<br />
                                3. Reveal the roasts one by one, then everyone votes the hardest burn (no voting for yourself).<br />
                                <span className="text-muted">Photos are analyzed once and never stored on a server.</span>
                            </div>
                        )}
                    </div>

                    {/* Roster */}
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2 flex items-center gap-1.5">
                            <Users size={12} /> The line-up
                        </div>
                        <TeamRosterRow teams={names} onTeamsChange={setNames} noun="Player" max={MAX_PLAYERS} />
                        {rosterCount < 2 && (
                            <p className="text-[11px] text-muted text-center mt-1">Add at least 2 players to battle.</p>
                        )}
                    </div>

                    {/* Persona */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase">★ The comic</span>
                            <button onClick={surpriseMe} className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                                <Dices size={13} /> Surprise me
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {PERSONAS.map(p => {
                                const active = p.id === persona;
                                return (
                                    <button
                                        key={p.id}
                                        onClick={() => { setPersona(p.id); hapticTap(); }}
                                        className={`group text-left bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 ${p.borderL} rounded-xl py-2.5 px-3 transition-colors
                                            ${active ? 'bg-white/[0.12] border-t-white/25 border-r-white/25 border-b-white/25' : 'hover:bg-white/[0.08]'}`}
                                    >
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-base leading-none">{p.emoji}</span>
                                            <span className={`text-sm font-bold ${active ? 'text-ink' : 'text-ink-soft'}`}>{p.label}</span>
                                        </div>
                                        <div className={`text-[11px] mt-0.5 truncate ${p.text}`}>{p.tagline}</div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Format */}
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">✍️ Style</div>
                        <div className="flex gap-1.5 flex-wrap">
                            {FORMATS.map(f => {
                                const active = f.id === format;
                                return (
                                    <button
                                        key={f.id}
                                        onClick={() => { setFormat(f.id); hapticTap(); }}
                                        className={`px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors
                                            ${active ? 'bg-gold text-slate-900 border-gold' : 'bg-white/5 text-ink-soft border-white/10 hover:border-white/25'}`}
                                    >
                                        {f.emoji} {f.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Spice */}
                    <div>
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase mb-2">🌡 Heat</div>
                        <div className="flex gap-1.5">
                            {SPICES.map(s => {
                                const active = s.id === spice;
                                const locked = spiceLocked(s.id);
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => selectSpice(s.id)}
                                        className={`flex-1 px-3 py-2 rounded-xl border text-xs font-semibold transition-colors
                                            ${active ? 'bg-gold text-slate-900 border-gold' : 'bg-white/5 text-ink-soft border-white/10 hover:border-white/25'}`}
                                    >
                                        {s.emoji} {s.label}{locked ? ' 🔒' : ''}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <Button fullWidth className="!py-3.5 text-base flex items-center justify-center gap-2" disabled={rosterCount < 2} onClick={startBattle}>
                        <Swords size={18} /> START BATTLE
                    </Button>
                </div>
            </div>
        );
    }

    const active = players[activeIdx];

    // =========================================================================
    // CAPTURE — pass the phone; each player snaps their own face
    // =========================================================================

    if (phase === 'CAPTURE' && active) {
        if (handoff) {
            return (
                <PassGate
                    title="Roast Battle"
                    onHome={onExit}
                    onBack={() => setPhase('SETUP')}
                    name={active.name}
                    step={`Player ${activeIdx + 1} of ${players.length}`}
                    cta="I'm ready — snap my face"
                    icon={<Camera size={30} className="text-indigo-400" />}
                    onReady={() => setHandoff(false)}
                />
            );
        }
        return (
            <div className="w-full">
                <ScreenHeader title="Roast Battle" onBack={() => setPhase('SETUP')} onHome={onExit} />
                <div className="flex flex-col gap-4 max-w-[380px] mx-auto w-full pb-6">
                    <div className="text-center">
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase">Player {activeIdx + 1} / {players.length}</div>
                        <h2 className="text-2xl font-bold text-ink mt-0.5">{active.name}, get in frame</h2>
                        <p className="text-xs text-muted mt-1">The comic can only roast what it sees. Make it count.</p>
                    </div>

                    {!active.photo ? (
                        <div className="bg-white/5 backdrop-blur-sm border border-white/10 border-l-4 border-l-indigo-500 rounded-xl p-4">
                            <div className="font-bold text-ink mb-0.5">Add {active.name}'s face</div>
                            <div className="text-xs text-muted mb-3">Photo stays on this device.</div>
                            <div className="flex gap-2">
                                <Button variant="secondary" className="flex-1 !py-2.5 flex items-center justify-center gap-1.5 text-sm" onClick={() => fileInputRef.current?.click()}>
                                    <ImageIcon size={16} /> Upload
                                </Button>
                                <Button variant="secondary" className="flex-1 !py-2.5 flex items-center justify-center gap-1.5 text-sm" onClick={startCamera}>
                                    <Camera size={16} /> Camera
                                </Button>
                            </div>
                            <input ref={fileInputRef} type="file" accept="image/png, image/jpeg, image/jpg" onChange={handleFileChange} className="hidden" />
                        </div>
                    ) : (
                        <>
                            <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20 mx-auto" style={{ aspectRatio: '1 / 1', maxWidth: 240 }}>
                                <img src={active.photo} alt={`${active.name}'s face`} className="w-full h-full object-cover" />
                                <button
                                    onClick={() => setPlayers(prev => prev.map((p, i) => (i === activeIdx ? { ...p, photo: null } : p)))}
                                    aria-label="Retake photo"
                                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition"
                                >
                                    <X size={15} />
                                </button>
                            </div>
                            <Button fullWidth className="!py-3 flex items-center justify-center gap-2" onClick={advanceCapture}>
                                {activeIdx < players.length - 1
                                    ? <>Next player <span className="opacity-80">→ {players[activeIdx + 1].name}</span></>
                                    : <><Flame size={16} /> Roast them all</>}
                            </Button>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // =========================================================================
    // GENERATING
    // =========================================================================

    if (phase === 'GENERATING') {
        const total = players.length || 1;
        return (
            <div className="w-full">
                <ScreenHeader title="Roast Battle" onBack={() => setPhase('SETUP')} onHome={onExit} />
                <div className="flex flex-col items-center justify-center gap-4 max-w-[380px] mx-auto w-full min-h-[420px] text-center px-6">
                    <Flame className="text-indigo-400 animate-pulse" size={40} />
                    <div className="text-lg font-bold text-ink">{LOADING_LINES[loadingLine]}</div>
                    <div className="text-sm text-muted">Roasting {players[Math.min(genProgress, players.length - 1)]?.name ?? ''}…</div>
                    <div className="w-full max-w-[240px] h-2 rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${Math.round((genProgress / total) * 100)}%` }} />
                    </div>
                    <div className="text-[11px] text-muted">{Math.min(genProgress + 1, total)} / {total}</div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // REVEAL — pass the phone; unveil each roast
    // =========================================================================

    if (phase === 'REVEAL' && active) {
        if (handoff) {
            return (
                <PassGate
                    title="Roast Battle"
                    onHome={onExit}
                    onBack={() => setPhase('SETUP')}
                    name={active.name}
                    step={`Reveal ${activeIdx + 1} of ${players.length}`}
                    cta="Reveal my roast 🔥"
                    icon={<Flame size={30} className="text-indigo-400" />}
                    onReady={() => { setHandoff(false); playPop(); hapticSuccess(); }}
                />
            );
        }
        const p = personaById(active.persona);
        return (
            <div className="w-full">
                <ScreenHeader title="Roast Battle" onBack={() => setPhase('SETUP')} onHome={onExit} />
                <div className="flex flex-col gap-3 max-w-[380px] mx-auto w-full pb-6">
                    <div className="text-center">
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase">Roast {activeIdx + 1} / {players.length}</div>
                        <h2 className="text-2xl font-bold text-ink mt-0.5">{active.name}</h2>
                    </div>

                    <div className="relative rounded-2xl overflow-hidden border border-white/10 bg-black/20" style={{ boxShadow: 'var(--shadow-card)', aspectRatio: '4 / 5' }}>
                        {active.posterUrl ? (
                            <img src={active.posterUrl} alt={active.roast} className="w-full h-full object-cover" />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center px-6">
                                <span className="text-3xl">{p.emoji}</span>
                                <p className="text-base font-semibold text-ink leading-snug">{active.roast}</p>
                            </div>
                        )}
                        <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-black/50 text-white flex items-center gap-1">
                            {p.emoji} {p.label}
                        </span>
                        {active.offline && (
                            <span className="absolute top-2 right-2 text-[10px] px-2 py-0.5 rounded-full bg-black/50 text-white/90">classic deck</span>
                        )}
                    </div>

                    <Button fullWidth className="!py-3 flex items-center justify-center gap-2" onClick={advanceReveal}>
                        {activeIdx < players.length - 1
                            ? <>Next roast <span className="opacity-80">→ {players[activeIdx + 1].name}</span></>
                            : <><Swords size={16} /> Time to vote</>}
                    </Button>
                </div>
            </div>
        );
    }

    // =========================================================================
    // VOTE — pass the phone; each player picks the hardest burn (not their own)
    // =========================================================================

    if (phase === 'VOTE' && active) {
        if (handoff) {
            return (
                <PassGate
                    title="Roast Battle"
                    onHome={onExit}
                    onBack={() => setPhase('SETUP')}
                    name={active.name}
                    step={`Voter ${activeIdx + 1} of ${players.length}`}
                    cta="I'm ready to vote"
                    icon={<Swords size={30} className="text-indigo-400" />}
                    onReady={() => setHandoff(false)}
                />
            );
        }
        return (
            <div className="w-full">
                <ScreenHeader title="Roast Battle" onBack={() => setPhase('SETUP')} onHome={onExit} />
                <div className="flex flex-col gap-3 max-w-[380px] mx-auto w-full pb-6">
                    <div className="text-center">
                        <div className="text-[10px] font-extrabold tracking-[0.16em] text-muted uppercase">{active.name}, you're up</div>
                        <h2 className="text-xl font-bold text-ink mt-0.5">Who got roasted the hardest?</h2>
                        <p className="text-xs text-muted mt-1">Pick any burn but your own.</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                        {players.map((p, i) => {
                            if (i === activeIdx) return null; // can't vote yourself
                            return (
                                <button
                                    key={i}
                                    onClick={() => castVote(i)}
                                    className="group relative rounded-xl overflow-hidden border border-white/10 bg-black/20 hover:border-indigo-400 transition-colors"
                                    style={{ aspectRatio: '4 / 5' }}
                                >
                                    {p.posterUrl ? (
                                        <img src={p.posterUrl} alt={p.roast} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="absolute inset-0 flex items-center justify-center px-3 text-center">
                                            <span className="text-xs font-semibold text-ink leading-snug">{p.roast}</span>
                                        </div>
                                    )}
                                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-1.5">
                                        <span className="text-sm font-bold text-white">{p.name}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    // =========================================================================
    // RESULT
    // =========================================================================

    if (phase === 'RESULT') {
        const w = winner();
        return (
            <EndScreen
                title="Roast Battle"
                onBack={() => setPhase('SETUP')}
                onHome={onExit}
                accent="indigo"
                entries={players.map(p => ({ name: p.name, score: p.votes }))}
                winnerText={top => `takes the crown with ${top.score} vote${top.score === 1 ? '' : 's'}.`}
                footerExtra={(
                    <div className="flex flex-col gap-2 w-full">
                        <button
                            onClick={shareRecap}
                            disabled={sharing}
                            className="w-full py-3 px-6 bg-transparent border-2 border-indigo-500/60 text-indigo-400 hover:bg-indigo-500/10 rounded-xl font-bold transition-colors active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            <Share2 size={18} /> Share Result
                        </button>
                        {w && posterCanvasRef.current.size > 0 && (
                            <button
                                onClick={shareWinnerPoster}
                                className="w-full py-2.5 px-6 bg-transparent border border-gold/50 text-gold hover:bg-gold/10 rounded-xl font-semibold text-sm transition-colors active:scale-95 flex items-center justify-center gap-2"
                            >
                                <Crown size={16} /> Share {w.name}'s poster
                            </button>
                        )}
                    </div>
                )}
                onPlayAgain={handlePlayAgain}
                playAgainLabel="Battle Again"
                onExit={onExit}
            />
        );
    }

    // Fallback (should never render) — bounce back to setup.
    return (
        <div className="w-full">
            <ScreenHeader title="Roast Battle" onBack={onBackToStudio} onHome={onExit} />
            <div className="flex flex-col items-center justify-center gap-3 min-h-[300px] text-center px-6">
                <Sparkles className="text-indigo-400" size={28} />
                <p className="text-sm text-ink-soft">Let's set up a fresh battle.</p>
                <Button onClick={() => setPhase('SETUP')}><RefreshCcw size={15} /> Back to setup</Button>
            </div>
        </div>
    );
};

// --- Pass-the-phone handoff gate (shared by capture / reveal / vote) ----------

const PassGate: React.FC<{
    title: string;
    onBack: () => void;
    onHome: () => void;
    name: string;
    step: string;
    cta: string;
    icon: React.ReactNode;
    onReady: () => void;
}> = ({ title, onBack, onHome, name, step, cta, icon, onReady }) => (
    <div className="w-full">
        <ScreenHeader title={title} onBack={onBack} onHome={onHome} />
        <div className="flex flex-col items-center justify-center gap-5 max-w-[380px] mx-auto w-full min-h-[440px] text-center px-6">
            <div className="w-20 h-20 rounded-full bg-indigo-500/15 border border-indigo-500/40 flex items-center justify-center">
                {icon}
            </div>
            <div>
                <div className="text-[10px] font-extrabold tracking-[0.18em] text-muted uppercase mb-1.5">{step}</div>
                <div className="text-sm text-muted">Pass the phone to</div>
                <h2 className="text-3xl font-black text-ink mt-1">{name}</h2>
            </div>
            <Button fullWidth className="!py-3.5 text-base" onClick={onReady}>{cta}</Button>
        </div>
    </div>
);
