import React, { useEffect, useState } from 'react';
import { Check, ChevronRight, Crown, Play, Plus, Share2, Trophy, Users, X } from 'lucide-react';
import { ScreenHeader, Button } from './ui/Layout';
import { GAMES, getIcon } from '../constants';
import { GameType } from '../types';
import { gameNightService } from '../services/gameNightService';
import { sessionService } from '../services/SessionManager';
import { shareResultCard } from '../services/shareCard';
import { hapticSuccess, playBell } from '../services/audio';

interface Props {
    onExit: () => void;
    onLaunchGame: (id: GameType) => void;
}

type Phase =
    | 'SETUP'   // crew + playlist picker (no night, or a cleared one)
    | 'HUB'     // active night: playlist progress + leaderboard + Play CTA
    | 'RECAP';  // champion + final standings + share card

// sessionStorage flag set when the hub launches a game. On the next mount
// (the user returning from that game) it tells us to mark the game played
// and advance the playlist — no game code needs to know about the hub.
const LAUNCHED_KEY = 'partyspark_gamenight_launched';

const GOLD = '#F2B544';
const MIN_CREW = 2;
const MAX_CREW = 10;
const MIN_GAMES = 3;
const MAX_GAMES = 5;

// Games a night can be built from. Adult-gated content (Truth or Drink,
// The Forecast, spicy decks) and hidden/partial games are deliberately
// excluded: launching from the hub bypasses the Home PIN gate.
const ELIGIBLE_GAME_IDS: GameType[] = [
    GameType.CHARADES,
    GameType.TABOO,
    GameType.IMPOSTER,
    GameType.MOST_LIKELY_TO,
    GameType.NEVER_HAVE_I_EVER,
    GameType.FACT_OR_FICTION,
    GameType.FIVE_ALIVE,
    GameType.LINKED,
    GameType.JUMBLE,
];

const ELIGIBLE_GAMES = ELIGIBLE_GAME_IDS
    .map(id => GAMES.find(g => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g);

const titleFor = (gameId: string): string =>
    GAMES.find(g => g.id === (gameId as GameType))?.title ?? gameId;

const readLaunched = (): string | null => {
    try { return sessionStorage.getItem(LAUNCHED_KEY); } catch { return null; }
};
const clearLaunched = (): void => {
    try { sessionStorage.removeItem(LAUNCHED_KEY); } catch { /* ignore */ }
};
const writeLaunched = (gameId: string): void => {
    try { sessionStorage.setItem(LAUNCHED_KEY, gameId); } catch { /* ignore */ }
};

export const GameNightScreen: React.FC<Props> = ({ onExit, onLaunchGame }) => {
    // Phase is derived once per mount from the service, INCLUDING the
    // return-from-game reconciliation: if the hub previously launched a game
    // (flag in sessionStorage), the user just came back from it — mark it
    // played. Games that reported scores directly are already marked played
    // by reportResult(), so advance() skips them either way. When nothing is
    // left to play, the night is over. Every service call here is idempotent,
    // so the initializer is safe under StrictMode's double-invoke.
    const [phase, setPhase] = useState<Phase>(() => {
        const night = gameNightService.get();
        if (!night) return 'SETUP';
        if (night.finished) return 'RECAP';
        const launched = readLaunched();
        if (launched) {
            clearLaunched();
            gameNightService.markPlayed(launched);
        }
        const next = gameNightService.advance();
        if (next === null) {
            gameNightService.finish();
            return 'RECAP';
        }
        return 'HUB';
    });

    // ---- SETUP state -------------------------------------------------------
    const [crew, setCrew] = useState<string[]>(() => {
        const seed = [...sessionService.getTeams()];
        while (seed.length < MIN_CREW) seed.push('');
        return seed;
    });
    const [playlist, setPlaylist] = useState<GameType[]>([]);
    const [sharing, setSharing] = useState(false);

    // Champion fanfare on entering the recap.
    useEffect(() => {
        if (phase !== 'RECAP') return;
        playBell();
        hapticSuccess();
    }, [phase]);

    // ---- Derived -----------------------------------------------------------
    const night = gameNightService.get();
    // If the service state vanished under us (e.g. cleared elsewhere), fall
    // back to setup instead of rendering an empty hub/recap.
    const view: Phase = night ? phase : 'SETUP';

    const trimmedCrew = crew.map(n => n.trim()).filter(Boolean);
    const canStart = trimmedCrew.length >= MIN_CREW
        && playlist.length >= MIN_GAMES
        && playlist.length <= MAX_GAMES;

    // ---- Handlers -----------------------------------------------------------
    const updateName = (i: number, value: string) => {
        setCrew(prev => prev.map((n, idx) => (idx === i ? value : n)));
    };
    const addRow = () => {
        setCrew(prev => (prev.length < MAX_CREW ? [...prev, ''] : prev));
    };
    const removeRow = (i: number) => {
        setCrew(prev => (prev.length > MIN_CREW ? prev.filter((_, idx) => idx !== i) : prev));
    };
    const toggleGame = (id: GameType) => {
        setPlaylist(prev => prev.includes(id)
            ? prev.filter(g => g !== id)
            : prev.length >= MAX_GAMES ? prev : [...prev, id]);
    };

    const handleStart = () => {
        if (!canStart) return;
        sessionService.setTeams(trimmedCrew);
        gameNightService.start(trimmedCrew, playlist);
        clearLaunched();
        setPhase('HUB');
    };

    const handlePlayNext = () => {
        const gid = gameNightService.currentGame();
        if (!gid) return;
        writeLaunched(gid);
        onLaunchGame(gid as GameType);
    };

    const handleEndNight = () => {
        gameNightService.finish();
        setPhase('RECAP');
    };

    const handleShare = async () => {
        const s = gameNightService.get();
        if (!s || sharing) return;
        const standings = gameNightService.leaderboard();
        const champ = standings[0];
        const playedCount = s.playlist.filter(gid => gameNightService.isPlayed(gid)).length;
        setSharing(true);
        await shareResultCard({
            gameTitle: 'Game Night',
            accent: GOLD,
            emoji: '👑',
            heading: champ && champ.points > 0 ? `${champ.name} takes the night!` : "That's a wrap!",
            sub: `${playedCount} game${playedCount === 1 ? '' : 's'} · ${s.crew.length} players`,
            rows: standings.slice(0, 7).map(st => ({
                label: st.name,
                value: `${st.points} pts`,
                highlight: !!champ && champ.points > 0 && st.points === champ.points,
            })),
        });
        setSharing(false);
    };

    const handleDone = () => {
        gameNightService.clear();
        onExit();
    };

    // =========================================================================
    // RENDER
    // =========================================================================

    // ---- SETUP — crew editor + playlist picker ----
    if (view === 'SETUP') {
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Game Night" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="max-w-[340px] mx-auto w-full">
                        <div className="text-center mb-5 -mt-2">
                            <p className="text-3xl mb-1 leading-none">👑</p>
                            <h2 className="text-base font-serif font-bold text-ink">One crew. One playlist. One champion.</h2>
                            <p className="text-muted text-xs mt-0.5">Play through 3–5 games — points add up to a night winner.</p>
                        </div>

                        {/* Crew editor */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <Users size={14} className="text-gold" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Tonight's crew</span>
                        </div>
                        <div className="space-y-2">
                            {crew.map((name, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={(e) => updateName(i, e.target.value)}
                                        placeholder={`Player ${i + 1}`}
                                        maxLength={20}
                                        className="flex-1 bg-app-tint border border-divider rounded-lg px-3 py-2 text-sm text-ink focus:outline-none focus:border-gold/60 placeholder:text-muted"
                                    />
                                    {crew.length > MIN_CREW && (
                                        <button
                                            onClick={() => removeRow(i)}
                                            aria-label={`Remove player ${i + 1}`}
                                            className="w-7 h-7 rounded-full bg-surface-alt border border-divider text-muted hover:text-ink flex items-center justify-center transition-colors flex-shrink-0"
                                        >
                                            <X size={13} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                        {crew.length < MAX_CREW && (
                            <button
                                onClick={addRow}
                                className="mt-2 flex items-center gap-1 text-xs text-muted hover:text-ink font-semibold transition-colors"
                            >
                                <Plus size={13} /> Add another player
                            </button>
                        )}

                        {/* Playlist picker */}
                        <div className="flex items-center justify-between mt-6 mb-2">
                            <div className="flex items-center gap-1.5">
                                <Play size={14} className="text-gold" />
                                <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Pick 3–5 games</span>
                            </div>
                            <span className={`text-[11px] font-bold ${playlist.length >= MIN_GAMES ? 'text-gold' : 'text-muted'}`}>
                                {playlist.length}/{MAX_GAMES}
                            </span>
                        </div>
                        <div className="grid gap-2">
                            {ELIGIBLE_GAMES.map(game => {
                                const order = playlist.indexOf(game.id);
                                const selected = order !== -1;
                                const full = !selected && playlist.length >= MAX_GAMES;
                                return (
                                    <button
                                        key={game.id}
                                        onClick={() => toggleGame(game.id)}
                                        disabled={full}
                                        className={`group relative w-full text-left rounded-xl py-2.5 px-3 border transition-colors active:scale-[0.99] overflow-hidden ${
                                            selected
                                                ? 'bg-gold/10 border-gold/50'
                                                : 'bg-surface-alt border-divider hover:bg-app-tint hover:border-ink-soft/40 disabled:opacity-40 disabled:cursor-not-allowed'
                                        }`}
                                    >
                                        {selected && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-[2px] bg-gold" />}
                                        <div className="flex items-center gap-3">
                                            <div className={`p-2 rounded-lg text-white flex-shrink-0 ${game.color}`}>
                                                {getIcon(game.icon, 16)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-bold text-ink leading-tight truncate">{game.title}</h3>
                                                <p className="text-[11px] text-muted leading-snug truncate">{game.description}</p>
                                            </div>
                                            {selected ? (
                                                <span className="w-6 h-6 rounded-full bg-gold text-app text-xs font-black flex items-center justify-center flex-shrink-0">
                                                    {order + 1}
                                                </span>
                                            ) : (
                                                <span className="w-6 h-6 rounded-full border border-divider text-muted group-hover:text-ink-soft flex items-center justify-center flex-shrink-0">
                                                    <Plus size={13} />
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <Button
                            onClick={handleStart}
                            disabled={!canStart}
                            fullWidth
                            className="py-4 text-lg mt-6"
                        >
                            Start Game Night <Crown className="inline ml-2 -mt-0.5" size={18} />
                        </Button>
                        {!canStart && (
                            <p className="text-center text-xs text-muted mt-2">
                                {trimmedCrew.length < MIN_CREW
                                    ? 'Add at least 2 player names to begin.'
                                    : `Pick ${playlist.length < MIN_GAMES ? `at least ${MIN_GAMES}` : `at most ${MAX_GAMES}`} games for tonight.`}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---- HUB — active night ----
    if (view === 'HUB' && night) {
        const standings = gameNightService.leaderboard();
        const current = gameNightService.currentGame();
        const playedCount = night.playlist.filter(gid => gameNightService.isPlayed(gid)).length;
        const topPoints = standings[0]?.points ?? 0;
        return (
            <div className="h-full flex flex-col animate-fade-in">
                <ScreenHeader title="Game Night" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8">
                    <div className="max-w-[340px] mx-auto w-full">
                        <p className="text-center text-xs text-muted mb-4 -mt-2">
                            <span className="font-bold text-gold">{playedCount}</span> of {night.playlist.length} games played · {night.crew.length} players
                        </p>

                        {/* Playlist progress */}
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-2">Tonight's playlist</p>
                        <div className="grid gap-2 mb-6">
                            {night.playlist.map((gid, i) => {
                                const played = gameNightService.isPlayed(gid);
                                const isNext = gid === current;
                                const rec = gameNightService.records()[gid];
                                return (
                                    <div
                                        key={gid}
                                        className={`relative flex items-center gap-3 rounded-xl py-2.5 px-3 border overflow-hidden ${
                                            isNext
                                                ? 'bg-gold/10 border-gold/50'
                                                : 'bg-surface-alt border-divider'
                                        } ${played ? 'opacity-70' : ''}`}
                                    >
                                        {isNext && <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-[2px] bg-gold" />}
                                        <span className={`w-6 h-6 rounded-full text-xs font-black flex items-center justify-center flex-shrink-0 ${
                                            played
                                                ? 'bg-emerald-500/15 text-emerald-500'
                                                : isNext ? 'bg-gold text-app' : 'border border-divider text-muted'
                                        }`}>
                                            {played ? <Check size={13} /> : i + 1}
                                        </span>
                                        <div className="flex-1 min-w-0">
                                            <h3 className={`text-sm font-bold leading-tight truncate ${played ? 'text-ink-soft' : 'text-ink'}`}>
                                                {titleFor(gid)}
                                            </h3>
                                            {played && rec?.winners && rec.winners.length > 0 && (
                                                <p className="text-[11px] text-muted leading-snug truncate">Won by {rec.winners.join(' & ')}</p>
                                            )}
                                        </div>
                                        {isNext && (
                                            <span className="text-[10px] font-black uppercase tracking-wider text-gold flex-shrink-0">Up next</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Leaderboard */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <Trophy size={14} className="text-gold" />
                            <span className="text-[11px] font-bold uppercase tracking-widest text-muted">Leaderboard</span>
                        </div>
                        <div className="grid gap-1.5 mb-6">
                            {standings.map((s, i) => (
                                <div
                                    key={s.name}
                                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 border ${
                                        i === 0 && s.points > 0 && s.points === topPoints
                                            ? 'bg-gold/10 border-gold/40'
                                            : 'bg-surface border-divider'
                                    }`}
                                >
                                    <span className="w-4 text-xs font-black text-muted flex-shrink-0">{i + 1}</span>
                                    <span className="flex-1 text-sm font-bold text-ink truncate">{s.name}</span>
                                    {s.wins > 0 && (
                                        <span className="text-[10px] text-muted flex-shrink-0">{s.wins} win{s.wins === 1 ? '' : 's'}</span>
                                    )}
                                    <span className="text-sm font-black tabular-nums text-ink flex-shrink-0">{s.points} pts</span>
                                </div>
                            ))}
                        </div>

                        {current ? (
                            <Button onClick={handlePlayNext} fullWidth className="py-4 text-lg">
                                Play: {titleFor(current)} <ChevronRight className="inline ml-1 -mt-0.5" size={18} />
                            </Button>
                        ) : (
                            <Button onClick={handleEndNight} fullWidth className="py-4 text-lg">
                                See the Recap <Crown className="inline ml-2 -mt-0.5" size={18} />
                            </Button>
                        )}
                        {current && (
                            <button
                                onClick={handleEndNight}
                                className="w-full mt-3 py-2 text-xs font-semibold text-muted hover:text-rose-500 transition-colors"
                            >
                                End night early
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ---- RECAP — champion + final standings ----
    if (view === 'RECAP' && night) {
        const standings = gameNightService.leaderboard();
        const champ = standings[0];
        const hasWinner = !!champ && champ.points > 0;
        const playedCount = night.playlist.filter(gid => gameNightService.isPlayed(gid)).length;
        return (
            <div className="h-full flex flex-col">
                <ScreenHeader title="Night Recap" onBack={onExit} onHome={onExit} />
                <div className="flex-1 overflow-y-auto pb-8 animate-slide-up">
                    <div className="max-w-[340px] mx-auto w-full">
                        <div className="text-center mb-5">
                            <div className="text-5xl mb-2">👑</div>
                            <h2 className="font-serif font-bold text-2xl text-ink break-words">
                                {hasWinner ? `${champ.name} takes the night!` : "That's a wrap!"}
                            </h2>
                            <p className="text-muted text-xs mt-1">
                                {playedCount} game{playedCount === 1 ? '' : 's'} · {night.crew.length} players
                            </p>
                        </div>

                        {/* Final standings */}
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-2">Final standings</p>
                        <div className="grid gap-1.5 mb-6">
                            {standings.map((s, i) => {
                                const isChamp = hasWinner && s.points === champ.points;
                                return (
                                    <div
                                        key={s.name}
                                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                                            isChamp ? 'bg-gold/10 border-gold/50' : 'bg-surface border-divider'
                                        }`}
                                    >
                                        <span className={`w-4 text-xs font-black flex-shrink-0 ${isChamp ? 'text-gold' : 'text-muted'}`}>{i + 1}</span>
                                        {isChamp && <Crown size={16} className="text-gold flex-shrink-0" />}
                                        <span className="flex-1 text-sm font-bold text-ink truncate">{s.name}</span>
                                        {s.wins > 0 && (
                                            <span className="text-[10px] text-muted flex-shrink-0">{s.wins} win{s.wins === 1 ? '' : 's'}</span>
                                        )}
                                        <span className={`text-base font-black tabular-nums flex-shrink-0 ${isChamp ? 'text-gold' : 'text-ink'}`}>
                                            {s.points} pts
                                        </span>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Per-game one-liners */}
                        <p className="text-[11px] font-bold uppercase tracking-widest text-muted mb-2">How it went</p>
                        <div className="grid gap-1.5 mb-6">
                            {night.playlist.map(gid => {
                                const rec = gameNightService.records()[gid];
                                const line = rec?.winners && rec.winners.length > 0
                                    ? `Won by ${rec.winners.join(' & ')}`
                                    : rec?.played ? 'Played' : 'Skipped';
                                return (
                                    <div key={gid} className="flex items-center gap-2 rounded-lg px-3 py-2 bg-surface-alt border border-divider">
                                        <span className="flex-1 text-xs font-bold text-ink-soft truncate">{titleFor(gid)}</span>
                                        <span className={`text-xs truncate ${rec?.winners?.length ? 'text-gold font-semibold' : 'text-muted'}`}>{line}</span>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="flex flex-col gap-3">
                            <Button onClick={handleShare} disabled={sharing} fullWidth className="py-4 text-lg">
                                <Share2 className="inline mr-2 -mt-0.5" size={18} /> {sharing ? 'Sharing…' : 'Share Night Card'}
                            </Button>
                            <Button onClick={handleDone} variant="secondary" fullWidth>
                                Done
                            </Button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};
