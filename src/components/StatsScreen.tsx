import React, { useState } from 'react';
import { Crown, Flame, Gamepad2, Medal, Trophy } from 'lucide-react';
import { ScreenHeader } from './ui/Layout';
import { GAMES, getIcon } from '../constants';
import { GameType } from '../types';
import { statsStore } from '../services/statsStore';
import { dailyStore } from '../services/dailyChallenge';

interface Props {
    onExit: () => void;
}

// Lifetime "Trophies" screen — reads statsStore + the daily streak. One
// scrollable page: hero tiles, Hall of Fame (player wins), per-game history,
// and a two-tap reset. Fully offline; nothing here writes except reset.
export const StatsScreen: React.FC<Props> = ({ onExit }) => {
    // statsStore is imperative — bump a counter to re-render after reset.
    const [, setTick] = useState(0);
    const [armReset, setArmReset] = useState(false);

    const data = statsStore.getAll();
    const streak = dailyStore.getStreak();
    const hall = statsStore.topPlayers(8);
    const gameRows = Object.entries(data.games).sort((a, b) => b[1].plays - a[1].plays);

    const handleReset = () => {
        if (!armReset) {
            setArmReset(true);
            return;
        }
        statsStore.reset();
        setArmReset(false);
        setTick(t => t + 1);
    };

    return (
        <div className="h-full flex flex-col animate-fade-in">
            <ScreenHeader title="Trophies" onBack={onExit} onHome={onExit} />
            <div className="flex-1 overflow-y-auto pb-8">
                <div className="max-w-[340px] mx-auto w-full flex flex-col gap-6">

                    {/* Hero tiles */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-surface border border-divider rounded-xl p-4 text-center">
                            <Gamepad2 size={16} className="text-gold mx-auto mb-1.5" />
                            <p className="text-3xl font-black tabular-nums text-ink leading-none">{data.totalPlays}</p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mt-1.5">Games played</p>
                        </div>
                        <div className="bg-surface border border-divider rounded-xl p-4 text-center">
                            <Flame size={16} className={`mx-auto mb-1.5 ${streak > 0 ? 'text-gold' : 'text-muted'}`} />
                            <p className="text-3xl font-black tabular-nums text-ink leading-none">
                                {streak > 0 ? <>🔥 {streak}</> : 0}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted mt-1.5">Daily streak</p>
                        </div>
                    </div>

                    {/* Hall of Fame */}
                    <section>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Crown size={14} className="text-gold" />
                            <h2 className="text-[11px] font-bold uppercase tracking-widest text-gold">Hall of Fame</h2>
                        </div>
                        {hall.length === 0 ? (
                            <div className="bg-surface-alt border border-divider rounded-xl px-4 py-5 text-center">
                                <Medal size={18} className="text-muted mx-auto mb-1.5" />
                                <p className="text-xs text-muted">Win a game with named players to enter the Hall of Fame.</p>
                            </div>
                        ) : (
                            <div className="grid gap-1.5">
                                {hall.map((p, i) => (
                                    <div
                                        key={p.name}
                                        className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 border ${
                                            i === 0 ? 'bg-gold/10 border-gold/40' : 'bg-surface border-divider'
                                        }`}
                                    >
                                        <span className={`w-4 text-xs font-black flex-shrink-0 ${i === 0 ? 'text-gold' : 'text-muted'}`}>{i + 1}</span>
                                        {i === 0 && <Crown size={14} className="text-gold flex-shrink-0" />}
                                        <span className="flex-1 text-sm font-bold text-ink truncate">{p.name}</span>
                                        <span className={`text-sm font-black tabular-nums flex-shrink-0 ${i === 0 ? 'text-gold' : 'text-ink-soft'}`}>
                                            {p.wins} win{p.wins === 1 ? '' : 's'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Per game */}
                    <section>
                        <div className="flex items-center gap-1.5 mb-2">
                            <Trophy size={14} className="text-muted" />
                            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted">Per game</h2>
                        </div>
                        {gameRows.length === 0 ? (
                            <div className="bg-surface-alt border border-divider rounded-xl px-4 py-5 text-center">
                                <p className="text-xs text-muted">Play anything — your history shows up here.</p>
                            </div>
                        ) : (
                            <div className="grid gap-1.5">
                                {gameRows.map(([gameId, stats]) => {
                                    const meta = GAMES.find(g => g.id === (gameId as GameType));
                                    const best = stats.bestLabel ?? (stats.best !== undefined ? `${stats.best}` : null);
                                    return (
                                        <div key={gameId} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-surface-alt border border-divider">
                                            <div className={`p-2 rounded-lg text-white flex-shrink-0 ${meta?.color ?? 'bg-surface'}`}>
                                                {getIcon(meta?.icon ?? '', 16)}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-bold text-ink leading-tight truncate">{meta?.title ?? gameId}</h3>
                                                {best && (
                                                    <p className="text-[11px] text-muted leading-snug truncate">
                                                        Best: <span className="text-gold font-semibold">{best}</span>
                                                    </p>
                                                )}
                                            </div>
                                            <span className="text-xs font-bold tabular-nums text-ink-soft flex-shrink-0">
                                                {stats.plays} play{stats.plays === 1 ? '' : 's'}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>

                    {/* Reset — two-tap confirm */}
                    <div className="mt-2">
                        <button
                            onClick={handleReset}
                            className={`w-full py-3 rounded-xl font-bold text-sm bg-transparent border-2 text-rose-600 transition-colors ${
                                armReset
                                    ? 'border-rose-500 bg-rose-500/10'
                                    : 'border-rose-500/60 hover:bg-rose-500/10 hover:border-rose-500'
                            }`}
                        >
                            {armReset ? 'Tap again to confirm' : 'Reset stats'}
                        </button>
                        {armReset && (
                            <button
                                onClick={() => setArmReset(false)}
                                className="w-full mt-2 py-1.5 text-xs font-semibold text-muted hover:text-ink transition-colors"
                            >
                                Cancel — keep my stats
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
