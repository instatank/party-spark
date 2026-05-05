import React, { useState, useEffect } from 'react';
import { ScreenHeader } from '../ui/Layout';
import type { MafiaPlayer, MafiaRole } from '../../types';
import { Users, UserPlus, Lock, Shield, Eye, Crosshair, Skull, Award } from 'lucide-react';
import { shuffle } from '../../services/SessionManager';

type GameState = 'SETUP' | 'ROLE_REVEAL' | 'NIGHT_TRANSITION' | 'NIGHT_ACTION' | 'DAY_REVEAL' | 'DAY_DEBATE' | 'DAY_VOTE' | 'VOTE_REVEAL' | 'GAME_OVER';

interface Props {
    onExit: () => void;
}

export const MiniMafiaGame: React.FC<Props> = ({ onExit }) => {
    const [gameState, setGameState] = useState<GameState>('SETUP');
    const [players, setPlayers] = useState<MafiaPlayer[]>([]);
    const [newPlayerName, setNewPlayerName] = useState('');
    const [hardMode, setHardMode] = useState(false);
    const [showHowToPlay, setShowHowToPlay] = useState(false);
    const [savedGroups, setSavedGroups] = useState<Record<string, string[]>>({});
    
    useEffect(() => {
        const loaded = localStorage.getItem('miniMafiaGroups');
        if (loaded) {
            try { setSavedGroups(JSON.parse(loaded)); } catch(e) {}
        }
    }, []);
    
    // Night/Pass Turn tracking
    const [currentPlayerIndex, setCurrentPlayerIndex] = useState(0);
    const [livingPlayerCache, setLivingPlayerCache] = useState<MafiaPlayer[]>([]);
    
    // Temporary action states per night/day
    const [nightTargetIds, setNightTargetIds] = useState<string[]>([]);
    const [doctorSaveIds, setDoctorSaveIds] = useState<string[]>([]);
    const [investigateResults, setInvestigateResults] = useState<{id: string, result: 'GUILTY' | 'INNOCENT'}[]>([]);
    const [actionMsg, setActionMsg] = useState("");
    
    // Day Phase
    const [deadPlayerIds, setDeadPlayerIds] = useState<string[]>([]);
    const [banishedPlayerIds, setBanishedPlayerIds] = useState<string[]>([]);
    const [voteSelectionIds, setVoteSelectionIds] = useState<string[]>([]); // local to DAY_VOTE
    const [debateTime, setDebateTime] = useState(300); // 5 mins
    const [winner, setWinner] = useState<'TOWN' | 'MAFIA' | null>(null);

    const [pendingExitAction, setPendingExitAction] = useState<(() => void) | null>(null);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (gameState !== 'SETUP' && gameState !== 'GAME_OVER') {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [gameState]);

    const handleSafeExit = (action: () => void) => {
        if (gameState === 'SETUP' || gameState === 'GAME_OVER') {
            action();
        } else {
            setPendingExitAction(() => action);
        }
    };

    const confirmExit = () => {
        if (pendingExitAction) {
            pendingExitAction();
            setPendingExitAction(null);
        }
    };

    const cancelExit = () => {
        setPendingExitAction(null);
    };

    // --- SETUP PHASE ---
    const addPlayer = () => {
        if (newPlayerName.trim().length > 0) {
            setPlayers([...players, { id: Date.now().toString(), name: newPlayerName.trim(), role: 'VILLAGER', isAlive: true }]);
            setNewPlayerName('');
        }
    };

    const removePlayer = (id: string) => {
        setPlayers(players.filter(p => p.id !== id));
    };

    const saveCurrentGroup = () => {
        if (players.length < 5) return;
        const name = prompt("Enter a name for this group (e.g., 'Damdama Crew'):");
        if (!name) return;
        const updated = { ...savedGroups, [name]: players.map(p => p.name) };
        setSavedGroups(updated);
        localStorage.setItem('miniMafiaGroups', JSON.stringify(updated));
    };

    const loadGroup = (names: string[]) => {
        setPlayers(names.map((name, i) => ({ id: `saved-${i}-${Date.now()}`, name, role: 'VILLAGER', isAlive: true })));
    };

    const startGame = () => {
        if (players.length < 5) return;
        
        // Build the role list
        const roles: MafiaRole[] = [];
        const mafiaCount = Math.max(1, Math.floor(players.length * 0.2));
        
        for (let i = 0; i < mafiaCount; i++) roles.push('MAFIA');
        
        // Doctor is only available in Hard Mode
        if (hardMode) {
            roles.push('DOCTOR');
        }
        
        roles.push('DETECTIVE');
        while (roles.length < players.length) roles.push('VILLAGER');

        // Shuffle roles, keeping player order intact
        const shuffledRoles = shuffle(roles);
        
        const newPlayers = players.map((p, i) => ({
            ...p, 
            role: shuffledRoles[i], 
            isAlive: true 
        }));

        setPlayers(newPlayers);
        setGameState('ROLE_REVEAL');
        setCurrentPlayerIndex(0);
    };

    // --- GAME LOOP LOGIC ---
    useEffect(() => {
        if (gameState === 'DAY_DEBATE' && debateTime > 0) {
            const timer = setTimeout(() => setDebateTime(debateTime - 1), 1000);
            return () => clearTimeout(timer);
        }
    }, [gameState, debateTime]);

    const livingPlayers = players.filter(p => p.isAlive);
    const mafiaCount = livingPlayers.filter(p => p.role === 'MAFIA').length;
    const townCount = livingPlayers.length - mafiaCount;

    const checkWinCondition = () => {
        if (mafiaCount === 0) {
            setWinner('TOWN');
            setGameState('GAME_OVER');
            return true;
        }
        if (mafiaCount >= townCount) {
            setWinner('MAFIA');
            setGameState('GAME_OVER');
            return true;
        }
        return false;
    };

    // --- ROTATION HANDLERS ---
    
    // ROLE_REVEAL Loop
    const handleNextReveal = () => {
        if (currentPlayerIndex < players.length - 1) {
            setCurrentPlayerIndex(currentIndex => currentIndex + 1);
        } else {
            // Start the first night!
            startNightPhase();
        }
    };

    const startNightPhase = () => {
        if (checkWinCondition()) return;
        setNightTargetIds([]);
        setDoctorSaveIds([]);
        setInvestigateResults([]);
        
        // We only pass the phone to LIVING players during the night.
        const alive = players.filter(p => p.isAlive);
        setLivingPlayerCache(alive);
        setCurrentPlayerIndex(0);
        setGameState('NIGHT_TRANSITION');
    };

    // NIGHT_TRANSITION -> NIGHT_ACTION
    const acceptPhone = () => {
        setGameState('NIGHT_ACTION');
        const me = livingPlayerCache[currentPlayerIndex];

        if (me.role === 'VILLAGER') {
            // Start fake timer immediately
            setActionMsg("Simulating...");
            setTimeout(() => {
                setActionMsg("Done");
            }, 4000 + Math.random() * 2000);
        } else {
            setActionMsg("Awaiting Choice");
        }
    };

    // NIGHT_ACTION -> pass back to NIGHT_TRANSITION or DAY_REVEAL
    const finishNightAction = () => {
        if (currentPlayerIndex < livingPlayerCache.length - 1) {
            setCurrentPlayerIndex(idx => idx + 1);
            setGameState('NIGHT_TRANSITION');
        } else {
            // All actions done. Proceed to morning.
            resolveNight();
        }
    };

    const resolveNight = () => {
        const diedIds = nightTargetIds.filter(id => !doctorSaveIds.includes(id));
        if (diedIds.length > 0) {
            setPlayers(players.map(p => diedIds.includes(p.id) ? { ...p, isAlive: false } : p));
        }
        setDeadPlayerIds(diedIds);
        setGameState('DAY_REVEAL');
    };

    // DAY_REVEAL -> DEBATE
    const startDebate = () => {
        if (!checkWinCondition()) {
            setDebateTime(300);
            setGameState('DAY_DEBATE');
        }
    };

    // DEBATE -> VOTE
    const startVote = () => {
        setVoteSelectionIds([]);
        setGameState('DAY_VOTE');
    };

    const toggleVoteSelection = (id: string) => {
        if (voteSelectionIds.includes(id)) {
            setVoteSelectionIds(voteSelectionIds.filter(vId => vId !== id));
        } else if (voteSelectionIds.length < 2) {
            setVoteSelectionIds([...voteSelectionIds, id]);
        }
    };

    // VOTE -> VOTE_REVEAL
    const executeVote = () => {
        if (voteSelectionIds.length === 0) return;
        setBanishedPlayerIds(voteSelectionIds);
        const aliveMap = players.map(p => voteSelectionIds.includes(p.id) ? { ...p, isAlive: false } : p);
        setPlayers(aliveMap);
        setGameState('VOTE_REVEAL');
    };

    // VOTE_REVEAL -> NIGHT (or Game Over)
    const proceedFromVoteReveal = () => {
        const ms = players.filter(p => p.isAlive && p.role === 'MAFIA').length;
        const ts = players.filter(p => p.isAlive).length - ms;
            
        if (ms === 0) { 
            setWinner('TOWN'); 
            setGameState('GAME_OVER'); 
        } else if (ms >= ts) { 
            setWinner('MAFIA'); 
            setGameState('GAME_OVER'); 
        } else { 
            startNightPhase(); 
        }
    };

    // --- RENDER HELPERS ---

    if (pendingExitAction) {
        return (
            <div className="flex flex-col h-full animate-fade-in bg-[#080605] items-center justify-center p-6 relative z-[9999]">
                 <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#3a0d0d] via-[#0a0604] to-[#0a0604] pointer-events-none opacity-50" />
                 <div className="bg-[#120c0a] border border-[#8a2a1a] p-8 max-w-sm w-full text-center shadow-[0_0_30px_rgba(138,42,26,0.3)] relative z-10">
                     <Skull size={56} className="mx-auto text-[#ff4d4d] mb-6" />
                     <h3 className="text-2xl font-black font-cinzel text-[#d4af37] mb-4 tracking-widest uppercase">Abandon Game?</h3>
                     <p className="text-[#8c6d46] mb-8 text-sm">Are you sure you want to exit? All current game progress will be lost to the void.</p>
                     <div className="flex flex-col gap-4">
                         <button onClick={confirmExit} className="w-full py-4 bg-[#5c1c11] hover:bg-[#7a2516] border border-[#8a2a1a] text-[#d4af37] font-cinzel font-bold tracking-widest text-sm shadow-xl">
                             YES, ABANDON
                         </button>
                         <button onClick={cancelExit} className="w-full py-4 bg-[#1a110e] hover:bg-[#2a1812] border border-[#3a2518] text-[#8c6d46] font-cinzel font-bold tracking-widest text-sm">
                             RETURN TO GAME
                         </button>
                     </div>
                 </div>
            </div>
        );
    }

    if (gameState === 'SETUP') {
        return (
            <div className="flex flex-col h-full animate-fade-in bg-[#080605]">
                <ScreenHeader title="The Traitors" onBack={() => handleSafeExit(onExit)} onHome={() => handleSafeExit(onExit)} />
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div className="bg-[#120c0a] border border-[#3a2518] rounded-2xl p-6 text-center shadow-2xl relative overflow-hidden">
                        <div className="absolute inset-0 bg-[#d4af37]/5 pointer-events-none" />
                        <Users className="mx-auto mb-3 text-[#d4af37]" size={32} />
                        <h2 className="text-2xl font-black font-cinzel tracking-widest mb-1 text-[#d4af37]">Assemble the Castle</h2>
                        <p className="text-sm text-[#8c6d46] mb-4">Pass-and-play betrayal. Traitors hide among you.</p>

                        <button onClick={() => setShowHowToPlay(!showHowToPlay)} className="text-xs font-bold font-cinzel text-[#d4af37] border border-[#d4af37]/30 px-3 py-1 bg-[#1a110e] hover:bg-[#2a1812] transition relative z-10 mx-auto block mb-2 rounded shadow-lg">
                             {showHowToPlay ? 'HIDE RULES' : 'HOW TO PLAY'}
                        </button>
                        
                        {showHowToPlay && (
                            <div className="text-left text-xs text-[#8c6d46] bg-[#1a110e] border border-[#3a2518] p-4 mt-2 mb-4 relative z-10 space-y-3 font-medium rounded animate-fade-in shadow-inner">
                                <p><strong className="text-[#ff4d4d] font-cinzel tracking-widest">1. THE CASTLE:</strong> Everyone is secretly assigned a role. Traitors try to eliminate the Faithful. Faithful try to banish the Traitors.</p>
                                <p><strong className="text-[#3b5b8c] font-cinzel tracking-widest">2. NIGHT:</strong> The phone is passed secretly. Traitors choose who to murder. The Detective investigates one person. The Doctor protects one person.</p>
                                <p><strong className="text-[#d4af37] font-cinzel tracking-widest">3. DAY:</strong> The murder victim is revealed. The surviving players debate and vote to banish one suspected Traitor at the roundtable.</p>
                                <p><strong className="text-[#4a6b3b] font-cinzel tracking-widest">4. WINNING:</strong> Traitors win if their numbers equal the Faithful. Faithful win if they banish all Traitors.</p>
                            </div>
                        )}
                        
                        <div className="mt-6 flex space-x-2 relative z-10">
                            <input
                                type="text"
                                value={newPlayerName}
                                onChange={(e) => setNewPlayerName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && addPlayer()}
                                placeholder="Player Name"
                                className="flex-1 bg-[#1a110e] border border-[#3a2518] rounded-xl px-4 py-3 text-[#d4af37] placeholder-[#6b5032] focus:outline-none focus:border-[#d4af37]/50"
                            />
                            <button onClick={addPlayer} className="bg-[#2a1812] hover:bg-[#3a2016] border border-[#4a2e1b] px-4 rounded-xl text-[#d4af37] font-bold transition shadow-lg">
                                <UserPlus size={20} />
                            </button>
                        </div>

                        <div className="mt-5 flex items-center justify-between bg-[#1a110e] p-3 rounded-lg border border-[#3a2518] relative z-10">
                            <div className="text-left">
                                <p className="text-sm font-bold font-cinzel text-[#d4af37]">Hard Mode</p>
                                <p className="text-xs text-[#8c6d46]">Hide dead roles & add the Doctor.</p>
                            </div>
                            <div 
                                onClick={() => setHardMode(!hardMode)}
                                className={`w-12 h-6 rounded-full cursor-pointer transition-colors relative border border-[#3a2518] ${hardMode ? 'bg-[#5c1c11]' : 'bg-[#1a110e]'}`}
                            >
                                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-transform ${hardMode ? 'translate-x-6 bg-[#d4af37]' : 'bg-[#5c452b]'}`} />
                            </div>
                        </div>
                    </div>

                    {Object.keys(savedGroups).length > 0 && (
                        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                            {Object.entries(savedGroups).map(([gName, gPlayers]) => (
                                <button key={gName} onClick={() => loadGroup(gPlayers)} className="whitespace-nowrap px-4 py-2 bg-[#1a110e] text-[#b38b59] hover:text-[#d4af37] hover:bg-[#2a1812] border border-[#3a2518] rounded-none text-xs font-cinzel font-bold tracking-widest transition">
                                    Load: {gName} ({gPlayers.length})
                                </button>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-between items-end mb-1 mt-2">
                        <h3 className="text-[#8c6d46] font-cinzel font-bold text-xs uppercase tracking-[0.2em]">Players ({players.length})</h3>
                        {players.length >= 5 && (
                            <button onClick={saveCurrentGroup} className="text-[10px] text-[#ff4d4d] hover:text-[#ff4d4d] font-cinzel font-bold uppercase tracking-widest">
                                Save Current Group
                            </button>
                        )}
                    </div>

                    <div className="grid gap-2">
                        {players.map((p, i) => (
                            <div key={p.id} className="flex justify-between items-center bg-[#120c0a] px-4 py-3 border border-[#3a2518] shadow-sm">
                                <span className="font-bold text-[#d4af37] font-cinzel uppercase tracking-widest text-sm flex items-center gap-3">
                                    <span className="text-[#5c452b] text-[10px] w-4">{i + 1}.</span> {p.name}
                                </span>
                                <button onClick={() => removePlayer(p.id)} className="text-[#ff4d4d] hover:text-[#ff4d4d] text-[10px] font-cinzel font-bold uppercase tracking-widest">Ban</button>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="p-4 bg-[#0a0604] border-t border-[#3a2518]">
                    <button
                        onClick={startGame}
                        disabled={players.length < 5}
                        className={`w-full py-4 font-cinzel font-bold tracking-[0.2em] uppercase transition-all active:scale-[0.98] ${players.length >= 5 ? 'bg-[#5c1c11] hover:bg-[#7a2516] text-[#d4af37] border border-[#8a2a1a] shadow-[0_0_15px_rgba(92,28,17,0.5)]' : 'bg-[#1a110e] border border-[#2a1812] text-[#5c452b] cursor-not-allowed'}`}
                    >
                        {players.length < 5 ? `NEED ${5 - players.length} MORE PLAYERS` : 'START GAME'}
                    </button>
                </div>
            </div>
        );
    }

    if (gameState === 'ROLE_REVEAL') {
        const p = players[currentPlayerIndex];
        return (
            <div className="flex flex-col h-full animate-fade-in relative overflow-hidden bg-[#0a0604]">
                 <div className="relative z-20">
                     <ScreenHeader title="Role Reveal" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                 </div>
                 <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#3a0d0d] via-[#0a0604] to-[#0a0604] pointer-events-none" />
                 
                 {!actionMsg ? (
                     <div className="relative z-10 w-full max-w-md mx-auto flex-1 flex flex-col px-6 pb-8 pt-12">
                         <div className="flex flex-col items-center justify-center flex-1">
                             <Lock size={64} className="mx-auto text-[#d4af37] mb-6 drop-shadow-[0_0_15px_rgba(212,175,55,0.3)]" />
                             <h2 className="text-3xl sm:text-4xl font-black font-cinzel text-[#d4af37] mb-2 tracking-widest text-center whitespace-nowrap overflow-hidden text-ellipsis w-full">Pass to {p.name}</h2>
                             <p className="text-[#8c6d46] text-center text-sm">Make sure no one else can see the screen.</p>
                         </div>
                         <button 
                             onClick={() => setActionMsg("REVEAL")}
                             className="mt-auto w-full mx-auto py-5 bg-[#1a110e] hover:bg-[#2a1812] border border-[#3a2518] rounded-2xl text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-xl text-lg transition-transform active:scale-95"
                         >
                             I AM {p.name.toUpperCase()}
                         </button>
                     </div>
                 ) : (
                     <div className="relative z-10 w-full max-w-md mx-auto flex-1 flex flex-col px-6 animate-slide-up pb-8 pt-8">
                         <div className="flex flex-col items-center justify-center flex-1">
                             {p.role === 'MAFIA' && <Crosshair size={96} className="mx-auto text-[#ff4d4d] mb-8 drop-shadow-[0_0_20px_rgba(138,42,26,0.6)]" />}
                             {p.role === 'DOCTOR' && <Shield size={96} className="mx-auto text-[#4a6b3b] mb-8 drop-shadow-[0_0_20px_rgba(74,107,59,0.5)]" />}
                             {p.role === 'DETECTIVE' && <Eye size={96} className="mx-auto text-[#3b5b8c] mb-8 drop-shadow-[0_0_20px_rgba(59,91,140,0.5)]" />}
                             {p.role === 'VILLAGER' && <Users size={96} className="mx-auto text-[#8c6d46] mb-8 drop-shadow-[0_0_20px_rgba(140,109,70,0.3)]" />}
                             
                             <h2 className="text-sm text-[#8c6d46] mb-3 font-cinzel uppercase tracking-[0.3em] font-bold text-center">You are</h2>
                             <h1 className={`text-4xl font-black font-cinzel tracking-widest text-center ${p.role==='MAFIA'?'text-[#ff4d4d]':p.role==='DOCTOR'?'text-[#4a6b3b]':p.role==='DETECTIVE'?'text-[#3b5b8c]':'text-[#d4af37]'}`}>
                                {p.role === 'MAFIA' ? 'TRAITOR' : p.role === 'VILLAGER' ? 'FAITHFUL' : p.role === 'DOCTOR' ? 'SHIELD' : 'DETECTIVE'}
                             </h1>
                         </div>
                         <button 
                             onClick={() => {
                                 setActionMsg("");
                                 handleNextReveal();
                             }}
                             className="mt-auto w-full mx-auto py-5 bg-[#5c1c11] hover:bg-[#7a2516] border border-[#8a2a1a] rounded-2xl text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-[0_0_15px_rgba(92,28,17,0.5)] text-lg transition-transform active:scale-95"
                         >
                             HIDE AND CONTINUE
                         </button>
                     </div>
                 )}
            </div>
        );
    }

    if (gameState === 'NIGHT_TRANSITION') {
        const p = livingPlayerCache[currentPlayerIndex];
        return (
            <div className="flex flex-col h-full animate-fade-in bg-[#080605]">
                 <ScreenHeader title="Night Falls" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                 <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                    <Lock size={56} className="mx-auto text-[#d4af37] mb-6 opacity-80" />
                 <h2 className="text-4xl font-black font-cinzel tracking-widest text-[#d4af37] mb-2 shadow-black drop-shadow-lg">Night Falls.</h2>
                 <p className="text-[#8c6d46] mb-12 text-lg">Pass phone to <span className="text-[#d4af37] font-bold">{p.name}</span></p>
                 <button 
                     onClick={acceptPhone}
                     className="w-full max-w-sm py-4 bg-[#1a110e] hover:bg-[#2a1812] border border-[#3a2518] rounded-none text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-xl"
                 >
                     I AM {p.name.toUpperCase()}
                 </button>
                 </div>
            </div>
        );
    }

    if (gameState === 'NIGHT_ACTION') {
        const p = livingPlayerCache[currentPlayerIndex];
        const others = livingPlayers.filter(o => o.id !== p.id);

        return (
            <div className="flex flex-col h-full animate-fade-in relative z-20 bg-[#080605]">
                <ScreenHeader title="Night Secret" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                <div className="flex-1 flex flex-col p-6 max-w-md mx-auto w-full">
                <div className="mb-4 text-center mt-2 border-b border-[#3a2518] pb-4">
                    <h2 className="text-xs text-[#8c6d46] font-cinzel uppercase font-bold tracking-[0.3em]">Secret Action Phase</h2>
                </div>

                {p.role === 'VILLAGER' && (
                    <div className="flex-1 overflow-y-auto flex flex-col items-center w-full text-center pb-8 scroll-smooth">
                         <div className="w-16 h-16 border-4 border-[#1a110e] border-t-[#d4af37] rounded-full animate-spin mb-6 mt-[10vh] shrink-0" />
                         <h3 className="text-2xl font-black font-cinzel text-[#d4af37] mb-2 tracking-widest shrink-0">Wait...</h3>
                         <p className="text-[#8c6d46] shrink-0">Wait a few seconds to disguise your role.</p>
                         
                         {actionMsg === "Done" && (
                             <button onClick={(e) => {
                                 setActionMsg("Scroll");
                                 setTimeout(() => (e.target as HTMLElement).parentElement?.scrollTo(0, document.body.scrollHeight), 100);
                             }} className="mt-12 w-full py-4 bg-[#5c1c11] border border-[#8a2a1a] text-[#d4af37] font-cinzel font-bold tracking-widest rounded-none animate-fade-in shadow-2xl shrink-0">
                                 CLICK DONE
                             </button>
                         )}

                         {actionMsg === "Scroll" && (
                             <div className="flex flex-col items-center w-full animate-fade-in">
                                 <p className="text-[#8c6d46] font-bold mt-8 mb-8 text-xl uppercase tracking-widest">Keep going... scroll down!</p>
                                 <div className="text-[#d4af37] flex flex-col gap-4 animate-bounce shrink-0 mb-[60vh] mt-4">
                                     <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
                                 </div>
                                 <button onClick={() => { window.scrollTo(0, 0); finishNightAction(); }} className="w-full py-5 bg-[#d4af37] border border-[#8a2a1a] text-[#2a0808] font-cinzel font-bold tracking-widest rounded-none shadow-2xl shrink-0">
                                     CLICK DONE AGAIN!
                                 </button>
                             </div>
                         )}
                    </div>
                )}

                {p.role === 'MAFIA' && (
                    <div className="flex-1 flex flex-col relative pb-20">
                        <h3 className="text-2xl font-black text-[#ff4d4d] mb-2 font-cinzel tracking-widest text-center mt-4">Choose One Target</h3>
                        <div className="flex-1 overflow-y-auto space-y-3 pb-8 mt-6">
                            {others.map(target => {
                                const isSelected = nightTargetIds.includes(target.id);
                                return (
                                <button 
                                    key={target.id} 
                                    onClick={() => {
                                        if (isSelected) setNightTargetIds(nightTargetIds.filter(id => id !== target.id));
                                        else if (nightTargetIds.length < 1) setNightTargetIds([...nightTargetIds, target.id]);
                                    }}
                                    className={`w-full p-4 border font-cinzel font-bold tracking-widest text-left flex justify-between items-center transition ${isSelected ? 'bg-[#2a0808] border-[#8a2a1a] text-[#d4af37]' : 'bg-[#120c0a] border-[#3a2518] hover:border-[#8a2a1a] hover:bg-[#1f0d0a] text-[#d4af37]'}`}
                                >
                                    <span>{target.name}</span>
                                    {target.role === 'MAFIA' && <span className="text-[10px] text-[#ff4d4d] font-bold px-2 py-1 bg-[#1f0d0a] border border-[#3a1510]">TRAITOR (TEAM)</span>}
                                </button>
                                );
                            })}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 py-2 bg-[#080605] pt-4">
                             <button onClick={finishNightAction} className="w-full py-4 bg-[#5c1c11] border border-[#8a2a1a] text-[#d4af37] font-cinzel tracking-widest font-bold rounded-none shadow-2xl">
                                 EXECUTE ({nightTargetIds.length}/1) & FINISH
                             </button>
                        </div>
                    </div>
                )}

                {p.role === 'DOCTOR' && (
                    <div className="flex-1 flex flex-col relative pb-20">
                        <h3 className="text-2xl font-black text-[#4a6b3b] mb-2 font-cinzel tracking-widest text-center mt-4">Protect One Person</h3>
                        <div className="flex-1 overflow-y-auto space-y-3 pb-8 mt-6">
                            <button
                                onClick={() => {
                                    const isSelected = doctorSaveIds.includes(p.id);
                                    if (isSelected) setDoctorSaveIds(doctorSaveIds.filter(id => id !== p.id));
                                    else if (doctorSaveIds.length < 1) setDoctorSaveIds([...doctorSaveIds, p.id]);
                                }}
                                className={`w-full p-4 border bg-opacity-50 font-cinzel font-bold tracking-widest text-left mb-6 flex justify-between transition ${doctorSaveIds.includes(p.id) ? 'bg-[#1a251a] border-[#4a6b3b] text-[#d4af37]' : 'bg-[#0d120a] border-[#2b3a18] hover:border-[#4a6b3b] text-[#8ba37b]'}`}
                            >
                                <span>Myself ({p.name})</span>
                                <span className="text-[10px] opacity-70">Self-Save</span>
                            </button>
                            {others.map(target => {
                                const isSelected = doctorSaveIds.includes(target.id);
                                return (
                                <button 
                                    key={target.id} 
                                    onClick={() => {
                                        if (isSelected) setDoctorSaveIds(doctorSaveIds.filter(id => id !== target.id));
                                        else if (doctorSaveIds.length < 1) setDoctorSaveIds([...doctorSaveIds, target.id]);
                                    }}
                                    className={`w-full p-4 border font-cinzel font-bold tracking-widest text-left transition ${isSelected ? 'bg-[#1a251a] border-[#4a6b3b] text-[#d4af37]' : 'bg-[#120c0a] border-[#3a2518] hover:border-[#4a6b3b] hover:bg-[#151a11] text-[#d4af37]'}`}
                                >
                                    {target.name}
                                </button>
                                );
                            })}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 py-2 bg-[#080605] pt-4">
                             <button onClick={finishNightAction} className="w-full py-4 bg-[#101f10] border border-[#1b3a1b] text-[#4a6b3b] font-cinzel tracking-widest font-bold rounded-none shadow-2xl">
                                 PROTECT ({doctorSaveIds.length}/1) & FINISH
                             </button>
                        </div>
                    </div>
                )}

                {p.role === 'DETECTIVE' && (
                    <div className="flex-1 flex flex-col relative pb-20">
                        <h3 className="text-2xl font-black text-[#3b5b8c] mb-1 font-cinzel tracking-widest text-center mt-4">Investigate (Max 1)</h3>
                        <div className="px-4 text-center mb-6 mt-2">
                            <p className="text-[#5c7a99] text-xs font-bold leading-tight bg-[#0d1424] border border-[#1a253b] p-3 rounded">
                                TIP: Subtly steer the town to banish the guilty tomorrow. If you openly claim to be the Detective, the Mafia will kill you next!
                            </p>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-3 pb-8">
                            {others.map(target => {
                                const res = investigateResults.find(r => r.id === target.id);
                                return (
                                <button 
                                    key={target.id} 
                                    onClick={() => {
                                        if (!res && investigateResults.length < 1) {
                                            setInvestigateResults([...investigateResults, {id: target.id, result: target.role === 'MAFIA' ? 'GUILTY' : 'INNOCENT'}]);
                                        }
                                    }}
                                    className={`w-full p-4 border font-cinzel font-bold tracking-widest text-left transition flex justify-between ${res ? (res.result === 'GUILTY' ? 'bg-[#2a0808] border-[#8a2a1a] text-[#ff4d4d]' : 'bg-[#1a251a] border-[#4a6b3b] text-[#4a6b3b]') : 'bg-[#120c0a] border-[#3a2518] hover:border-[#3b5b8c] text-[#d4af37]'}`}
                                >
                                    <span>{target.name}</span>
                                    {res && <span>{res.result}</span>}
                                </button>
                                );
                            })}
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 py-2 bg-[#080605] pt-4 z-20">
                             <button onClick={finishNightAction} className="w-full py-4 bg-[#0d1424] border border-[#1a253b] text-[#5c7a99] font-cinzel tracking-widest font-bold rounded-none shadow-2xl">
                                 DONE
                             </button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        );
    }

    if (gameState === 'DAY_REVEAL') {
        return (
            <div className="flex flex-col h-full animate-fade-in relative bg-[#0a0604]">
                <ScreenHeader title="The Morning" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                <div className="flex-1 flex flex-col items-center justify-start p-6 text-center bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-[#1f2937]/30 to-[#0a0604] overflow-y-auto">
                <h2 className="text-2xl font-black text-[#5c7a99] font-cinzel my-12 uppercase tracking-[0.3em] relative z-10 shrink-0">Morning Breaks</h2>
                
                <div className="relative z-10 w-full max-w-sm mx-auto space-y-6 mb-8">
                    {deadPlayerIds.length > 0 ? (
                        deadPlayerIds.map(id => {
                            const died = players.find(p => p.id === id);
                            if (!died) return null;
                            return (
                                <div key={id} className="animate-slide-up bg-[#120c0a] border border-[#3a2518] py-8 px-6 shadow-2xl relative overflow-hidden">
                                    <div className="absolute inset-0 bg-[#d4af37]/5 pointer-events-none" />
                                    <Skull size={48} className="mx-auto text-[#ff4d4d] mb-6 drop-shadow-[0_0_20px_rgba(138,42,26,0.5)]" />
                                    <h1 className="text-4xl font-black text-[#d4af37] font-cinzel tracking-widest mb-2">{died.name}</h1>
                                    <p className="text-[#ff4d4d] font-cinzel font-bold text-sm tracking-widest mb-6">was eliminated in the night.</p>
                                    
                                    {!hardMode && (
                                        <p className="text-[#b38b59] text-xs uppercase tracking-widest border border-[#3a2518] bg-[#1a110e] py-3 px-6 rounded-none inline-block font-bold">
                                            Their role was: <span className="font-black text-[#d4af37] ml-2 font-cinzel">{died.role}</span>
                                        </p>
                                    )}
                                </div>
                            );
                        })
                    ) : (
                        <div className="animate-slide-up">
                            <Shield size={72} className="mx-auto text-[#4a6b3b] mb-6 drop-shadow-[0_0_20px_rgba(74,107,59,0.5)]" />
                            <h1 className="text-4xl font-black font-cinzel tracking-widest text-[#d4af37] mb-2">No one died!</h1>
                            <p className="text-[#4a6b3b] font-cinzel tracking-widest font-bold">The town was protected.</p>
                        </div>
                    )}
                </div>

                <div className="w-full max-w-md mx-auto z-10 mt-auto shrink-0 pb-8">
                    <button onClick={startDebate} className="w-full py-4 bg-[#1a110e] hover:bg-[#2a1812] border border-[#3a2518] rounded-none text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-xl">
                        START DEBATE
                    </button>
                </div>
                </div>
            </div>
        );
    }

    if (gameState === 'DAY_DEBATE') {
        const mins = Math.floor(debateTime / 60);
        const secs = debateTime % 60;
        const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        return (
            <div className="flex flex-col h-full animate-fade-in bg-[#080605]">
                <ScreenHeader title="Day Debate" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
                <h2 className="text-[#8c6d46] uppercase tracking-[0.3em] font-cinzel font-bold mb-4 text-xs">The Roundtable</h2>
                <div className="text-7xl font-cinzel font-black text-[#d4af37] mb-8 tracking-widest drop-shadow-[0_0_15px_rgba(212,175,55,0.2)]">
                    {formatted}
                </div>
                <p className="text-[#8c6d46] bg-[#120c0a] border border-[#3a2518] p-6 text-center mb-12 text-sm leading-relaxed max-w-sm w-full mx-auto shadow-2xl">
                    <strong className="text-[#d4af37] font-cinzel tracking-widest">You must reach consensus.</strong><br/><br/>
                    Argue your case. Once someone declares <i className="text-white">"I move to banish [Name]"</i> and there are 3 seconds of silence, the moderator may call the vote.
                </p>
                
                <div className="w-full max-w-sm mx-auto flex gap-4 absolute bottom-8 px-6 left-0 right-0">
                    <button onClick={startVote} className="flex-1 py-4 bg-[#5c1c11] text-[#d4af37] border border-[#8a2a1a] hover:bg-[#7a2516] rounded-none font-cinzel font-bold tracking-widest shadow-2xl">
                        VOTE
                    </button>
                    <button onClick={() => setDebateTime(prev => prev + 60)} className="py-4 px-6 bg-[#1a110e] border border-[#3a2518] text-[#d4af37] rounded-none font-cinzel font-bold tracking-widest">
                        +1 MIN
                    </button>
                </div>
                </div>
            </div>
        );
    }

    if (gameState === 'DAY_VOTE') {
        return (
            <div className="flex flex-col h-full bg-[#0a0604] animate-fade-in">
                <ScreenHeader title="The Trial" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                <div className="flex-1 p-6 flex flex-col max-w-md mx-auto w-full">
                    <p className="text-center text-[#8c6d46] mb-6 text-sm">
                        As a group, point to who you want to eliminate. Moderator, tap the victim's name below to execute them.
                    </p>
                    
                    <div className="flex-1 overflow-y-auto space-y-3 pb-24">
                        {livingPlayers.map(p => {
                            const isSelected = voteSelectionIds.includes(p.id);
                            return (
                                <button 
                                    key={p.id}
                                    onClick={() => toggleVoteSelection(p.id)}
                                    className={`w-full p-5 rounded-none flex justify-between items-center transition-all border shadow-lg ${isSelected ? 'bg-[#2a0808] border-[#8a2a1a]' : 'bg-[#120c0a] border-[#3a2518] hover:border-[#8a2a1a]'}`}
                                >
                                    <span className={`font-bold font-cinzel text-lg tracking-widest uppercase ${isSelected ? 'text-[#d4af37]' : 'text-[#b38b59]'}`}>{p.name}</span>
                                    <Skull size={24} className={isSelected ? 'text-[#ff4d4d]' : 'text-[#3a2518]'} />
                                </button>
                            );
                        })}
                    </div>
                </div>

                {voteSelectionIds.length > 0 && (
                    <div className="absolute bottom-6 left-0 right-0 px-6 z-20 animate-slide-up max-w-md mx-auto">
                        <button onClick={executeVote} className="w-full py-4 bg-[#5c1c11] border border-[#8a2a1a] hover:bg-[#7a2516] text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-[0_0_20px_rgba(138,42,26,0.4)]">
                            EXECUTE ({voteSelectionIds.length})
                        </button>
                    </div>
                )}
            </div>
        );
    }

    if (gameState === 'VOTE_REVEAL') {
        const banishedPlayers = players.filter(p => banishedPlayerIds.includes(p.id));
        
        return (
            <div className="flex flex-col h-full animate-fade-in relative bg-[#0a0604]">
                <ScreenHeader title="The Verdict" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                <div className="flex-1 flex flex-col p-6 items-center justify-start text-center overflow-y-auto">
                <h2 className="text-xl font-bold text-[#8c6d46] font-cinzel my-8 uppercase tracking-[0.4em] relative z-10 shrink-0">The Verdict</h2>
                
                <div className="w-full max-w-sm space-y-6 relative z-10 mb-12">
                    {banishedPlayers.map(banished => (
                        <div key={banished.id} className="animate-slide-up bg-[#120c0a] border border-[#3a2518] py-8 px-6 shadow-2xl relative overflow-hidden">
                            <div className="absolute inset-0 bg-[#d4af37]/5 pointer-events-none" />
                            <Skull size={56} className="mx-auto text-[#8c6d46] mb-4" />
                            <h1 className="text-4xl font-black text-[#d4af37] font-cinzel tracking-widest mb-2">{banished.name}</h1>
                            <p className="text-[#8c6d46] font-medium text-sm mb-6">was banished from the castle.</p>
                            
                            {!hardMode && (
                                <div className="border-t border-[#3a2518] pt-4 mt-2">
                                    <p className="text-[10px] text-[#b38b59] font-cinzel uppercase tracking-[0.3em] font-bold mb-2">Their True Role</p>
                                    <p className={`text-2xl font-black font-cinzel tracking-widest uppercase ${banished.role === 'MAFIA' ? 'text-[#ff4d4d]' : 'text-[#5c7a99]'}`}>
                                        {banished.role === 'MAFIA' ? 'TRAITOR' : banished.role === 'VILLAGER' ? 'FAITHFUL' : banished.role === 'DOCTOR' ? 'SHIELD' : 'DETECTIVE'}
                                    </p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                <div className="w-full max-w-md mx-auto z-10 flex flex-col gap-3 mt-auto shrink-0 pb-8">
                    <button onClick={startDebate} className="w-full py-3 bg-[#0a0604] hover:bg-[#120c0a] border border-[#3a2518] text-[#8c6d46] font-cinzel font-bold tracking-[0.2em] text-xs transition transition-all active:scale-95">
                        SKIP NIGHT (DAY AGAIN)
                    </button>
                    <button onClick={proceedFromVoteReveal} className="w-full py-4 bg-[#1a110e] hover:bg-[#2a1812] border border-[#3a2518] text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-xl transition active:scale-95">
                        PROCEED TO NIGHT
                    </button>
                </div>
                </div>
            </div>
        );
    }

    if (gameState === 'GAME_OVER') {
        const isTownWin = winner === 'TOWN';
        return (
            <div className="flex flex-col h-full animate-fade-in bg-[#080605]">
                <ScreenHeader title="Game Over" onBack={() => handleSafeExit(() => setGameState('SETUP'))} onHome={() => handleSafeExit(() => setGameState('SETUP'))} />
                <div className={`flex-1 flex flex-col p-6 items-center justify-center text-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${isTownWin ? 'from-[#142914] to-[#080605]' : 'from-[#2e0b0b] to-[#080605]'}`}>
                <Award size={80} className={`mx-auto mb-6 drop-shadow-[0_0_20px_rgba(212,175,55,0.4)] ${isTownWin ? 'text-[#d4af37]' : 'text-[#ff4d4d]'}`} />
                <h2 className="text-xl text-[#8c6d46] font-bold uppercase tracking-[0.4em] mb-2 font-cinzel">Game Over</h2>
                <h1 className={`text-6xl font-black font-cinzel tracking-widest mb-12 ${isTownWin ? 'text-[#d4af37]' : 'text-[#ff4d4d]'}`}>
                    {isTownWin ? 'FAITHFUL WIN' : 'TRAITORS WIN'}
                </h1>
                
                <div className="w-full max-w-sm bg-[#120c0a] border border-[#3a2518] p-6 shadow-2xl text-left mb-12 relative overflow-hidden">
                    <div className="absolute inset-0 bg-[#d4af37]/5 pointer-events-none" />
                    <h3 className="text-[#d4af37] font-bold font-cinzel tracking-[0.2em] uppercase text-sm mb-4 pb-3 border-b border-[#3a2518] text-center">Player Roles</h3>
                    <div className="max-h-56 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                        {players.map(p => (
                            <div key={p.id} className="flex justify-between items-center bg-[#1a110e] border border-[#2a1812] p-3">
                                <span className={`font-cinzel tracking-widest font-bold ${p.isAlive ? 'text-[#d4af37]' : 'text-[#5c452b] line-through'}`}>{p.name}</span>
                                <span className={`text-[10px] font-bold font-cinzel tracking-widest px-2 py-1 uppercase ${p.role === 'MAFIA' ? 'text-[#ff4d4d] bg-[#2a0808] border border-[#4a1c11]' : p.role === 'DOCTOR' ? 'text-[#4a6b3b] bg-[#101f10] border border-[#1b3a1b]' : p.role === 'DETECTIVE' ? 'text-[#5c7a99] bg-[#0d1424] border border-[#1a253b]' : 'text-[#8c6d46] bg-[#120c0a] border border-[#3a2518]'}`}>
                                    {p.role === 'MAFIA' ? 'TRAITOR' : p.role === 'VILLAGER' ? 'FAITHFUL' : p.role === 'DOCTOR' ? 'SHIELD' : 'DETECTIVE'}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="w-full max-w-sm mx-auto">
                    <button onClick={() => setGameState('SETUP')} className="w-full py-4 bg-[#5c1c11] border border-[#8a2a1a] hover:bg-[#7a2516] text-[#d4af37] font-cinzel font-bold tracking-[0.2em] shadow-2xl">
                        PLAY AGAIN
                    </button>
                </div>
                </div>
            </div>
        );
    }

    return null;
};
