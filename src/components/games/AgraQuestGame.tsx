import React, { useState } from 'react';
import { Card, ScreenHeader, Button } from '../ui/Layout';
import { Lock, Unlock, ShieldCheck, Award, AlertCircle, Heart, Camera } from 'lucide-react';

interface Vault {
    id: string;
    title: string;
    riddle: string;
    type?: 'text' | 'photo';
    keywords: string[]; 
    legacyFact: string;
    icon: string;
    hint: string;
}

const VAULTS: Vault[] = [
    {
        id: 'v1',
        title: "The Origin",
        riddle: "Where it all began. Question the Keepers (Grandma/Mom) to find the name of the hospital where Mom was born. Input the name to unlock.",
        keywords: ["safdarjung", "aiims", "moolchand", "apollo", "max", "fortis", "ganga ram", "holy family"], // These should be configured by user later
        legacyFact: "Mom was born there decades ago! The family rushed through traffic, and it remains a core piece of your origin story.",
        icon: "🏥",
        hint: "It's a very famous hospital in the city. Give Grandma a hug to get the first letter!"
    },
    {
        id: 'v2',
        title: "Grandma's Craving",
        riddle: "Discover the one street food Grandma misses most from her childhood in Agra. What is it?",
        keywords: ["petha", "bedmi", "puri", "jalebi", "kachori", "chaat", "bhalla", "tikki"],
        legacyFact: "Agra's street food is legendary! Grandma grew up eating this exact dish from a tiny vendor near her old house.",
        icon: "🥘",
        hint: "It's sweet/spicy and very famous in Agra. Ask Mom what Grandma always talks about."
    },
    {
        id: 'v3',
        title: "The Symmetry Trap",
        riddle: "The Taj Mahal is famous for its perfect symmetry, but there is one intentional flaw. What specific object inside the monument is NOT symmetrical?",
        keywords: ["grave", "tomb", "cenotaph", "shah jahan", "king"],
        legacyFact: "Shah Jahan's cenotaph is placed off-center, right next to his wife Mumtaz Mahal's perfectly centered tomb, forever breaking the monument's perfect symmetry.",
        icon: "⚖️",
        hint: "Look inside the main chamber at the floor."
    },
    {
        id: 'v4',
        type: 'photo',
        title: "The Optical Illusion",
        riddle: "Stand at the Darwaza-i-Rauza (Great Gate) and look at the Taj Mahal. There is a famous optical illusion here. Step backward through the gate until the Taj looks surprisingly LARGE. Frame it perfectly and take a photo as proof for the Keepers!",
        keywords: [],
        legacyFact: "Due to the framing of the archway, as you move AWAY from the Taj Mahal, the optical illusion makes the monument appear to grow surprisingly larger!",
        icon: "📸",
        hint: "Move far back through the main gate, keeping your eyes on the dome."
    },
    {
        id: 'v5',
        title: "The Secret Moniker",
        riddle: "Unlock the final piece of lore. What was the embarrassing childhood nickname the Keepers used to call Ankit?",
        keywords: ["chotu", "golu", "babu", "guddu", "raja", "bunty"],
        legacyFact: "The truth is out. You are now officially authorized to use this name for the rest of the trip.",
        icon: "🤫",
        hint: "Threaten to not eat your dinner unless they tell you."
    }
];

export const AgraQuestGame: React.FC<{ onExit: () => void }> = ({ onExit }) => {
    const [unlockedVaults, setUnlockedVaults] = useState<string[]>([]);
    const [activeVaultId, setActiveVaultId] = useState<string | null>(null);
    const [inputValue, setInputValue] = useState("");
    const [showKeeperMode, setShowKeeperMode] = useState(false);
    const [showFact, setShowFact] = useState(false);
    const [penaltyActive, setPenaltyActive] = useState(false);
    const [showHint, setShowHint] = useState(false);

    const activeVault = VAULTS.find(v => v.id === activeVaultId);
    const isComplete = unlockedVaults.length === VAULTS.length;

    const handleVaultClick = (id: string) => {
        if (!unlockedVaults.includes(id)) {
            setActiveVaultId(id);
            setInputValue("");
            setShowKeeperMode(false);
            setShowFact(false);
            setPenaltyActive(false);
            setShowHint(false);
        }
    };

    const handleBackToHub = () => {
        setActiveVaultId(null);
    };

    const handleSubmitAnswer = () => {
        if (!inputValue.trim() || !activeVault) return;
        
        // Flexible checking: convert input to lowercase and check if any keyword is included in the input
        const normalizedInput = inputValue.toLowerCase().trim();
        const isMatch = activeVault.keywords.some(keyword => 
            normalizedInput.includes(keyword.toLowerCase())
        );

        if (isMatch) {
            setShowKeeperMode(true);
        } else {
            // Wrong answer penalty
            setPenaltyActive(true);
            setInputValue("");
        }
    };

    const handleKeeperVerify = (approved: boolean) => {
        if (approved && activeVault) {
            setUnlockedVaults([...unlockedVaults, activeVault.id]);
            setShowKeeperMode(false);
            setShowFact(true);
        } else {
            setShowKeeperMode(false);
            setPenaltyActive(true);
        }
    };

    if (isComplete) {
        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title="Quest Complete!" onBack={onExit} />
                <Card className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-amber-600/20 to-amber-900/40 border-amber-500/30">
                    <div className="w-24 h-24 bg-amber-500 text-white rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(245,158,11,0.5)]">
                        <Award size={48} />
                    </div>
                    <h2 className="text-3xl font-serif font-bold text-amber-500 mb-2 mt-4">Certified Historian</h2>
                    <h3 className="text-xl font-medium text-white mb-6">Rehaan</h3>
                    <p className="text-gray-300 text-lg mb-8">
                        You have successfully unlocked the family vault, survived the illusions of the Taj Mahal, and uncovered the deepest secrets of your ancestors!
                    </p>
                    <div className="w-full space-y-3 mb-8">
                        {VAULTS.map((vault) => (
                            <div key={vault.id} className="bg-black/30 w-full p-3 rounded-lg text-left flex items-center gap-3">
                                <span className="text-2xl">{vault.icon}</span>
                                <div>
                                    <p className="text-amber-400 font-bold text-sm tracking-wide uppercase">{vault.title}</p>
                                    <p className="text-gray-300 text-xs italic line-clamp-1">{vault.legacyFact}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Button onClick={onExit} variant="primary" className="w-full bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.4)]">
                        Save Digital Card & Exit
                    </Button>
                </Card>
            </div>
        );
    }

    if (activeVault) {
        if (showFact) {
            return (
                <div className="flex flex-col h-full animate-fade-in relative z-10">
                    <ScreenHeader title="Vault Unlocked!" onBack={handleBackToHub} />
                    <Card className="flex-1 flex flex-col p-6 items-center justify-center text-center">
                        <div className="w-20 h-20 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-6 animate-pulse">
                            <Unlock size={40} />
                        </div>
                        <h2 className="text-2xl font-bold mb-4">{activeVault.title}</h2>
                        <div className="text-6xl mb-6">{activeVault.icon}</div>
                        <p className="text-xl text-gray-200 bg-white/5 p-6 rounded-xl border border-white/10 italic">
                            "{activeVault.legacyFact}"
                        </p>
                        <Button onClick={handleBackToHub} className="mt-12 w-full">
                            Return to Hub
                        </Button>
                    </Card>
                </div>
            )
        }

        if (showKeeperMode) {
            return (
                <div className="flex flex-col h-full animate-fade-in relative z-10">
                    <ScreenHeader title="Keeper Verification" onBack={() => setShowKeeperMode(false)} />
                    <Card className="flex-1 flex flex-col p-6 items-center justify-center text-center border-party-accent border-2 bg-slate-900 shadow-[0_0_40px_rgba(240,101,109,0.3)]">
                        <ShieldCheck size={64} className="text-party-accent mb-6" />
                        <h2 className="text-2xl font-bold text-party-accent uppercase tracking-widest mb-2">HAND TO KEEPER</h2>
                        <p className="text-gray-300 mb-8 max-w-xs">
                            Rehaan, pass this device to Grandma or Mom to verify your truth.
                        </p>
                        
                        <div className="bg-black/40 p-5 rounded-xl border border-white/10 w-full mb-8">
                            <p className="text-sm text-gray-400 mb-1">Seeker's Proof:</p>
                            {activeVault?.type === 'photo' ? (
                                <p className="text-xl font-bold text-party-accent uppercase tracking-widest"><Camera className="inline mr-2"/> REVIEW PHOTO</p>
                            ) : (
                                <p className="text-2xl font-bold text-white capitalize">"{inputValue}"</p>
                            )}
                        </div>

                        <div className="w-full space-y-4">
                            <Button onClick={() => handleKeeperVerify(true)} className="w-full py-5 text-lg bg-green-600 hover:bg-green-500 font-bold border-0">
                                Verify Truth
                            </Button>
                            <Button onClick={() => handleKeeperVerify(false)} variant="secondary" className="w-full py-5 text-lg border-red-500/50 text-red-400 hover:bg-red-500/10">
                                Deny (Requires Penalty)
                            </Button>
                        </div>
                    </Card>
                </div>
            )
        }

        return (
            <div className="flex flex-col h-full animate-fade-in relative z-10">
                <ScreenHeader title={activeVault.title} onBack={handleBackToHub} />
                <Card className="flex-1 flex flex-col p-6">
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl">
                            {activeVault.icon}
                        </div>
                        <h2 className="text-2xl font-serif font-bold text-amber-500">Vault Access</h2>
                    </div>

                    <div className="bg-black/30 p-5 rounded-xl border border-white/10 mb-8">
                        <p className="text-lg text-gray-200 leading-relaxed font-medium">
                            {activeVault.riddle}
                        </p>
                    </div>

                    {penaltyActive && (
                        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3 text-red-400 animate-shake">
                            <AlertCircle className="shrink-0 mt-0.5" size={20} />
                            <p className="text-sm font-medium">
                                Access Denied! WRONG ANSWER.<br/><br/>
                                <span className="text-white">Penalty:</span> You must sing the chorus of a Bollywood song before trying again.
                            </p>
                        </div>
                    )}

                    <div className="space-y-4 mt-auto">
                        {activeVault.type === 'photo' ? (
                            <Button 
                                onClick={() => setShowKeeperMode(true)}
                                className="w-full py-4 text-lg bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] border-0 flex items-center justify-center gap-2"
                            >
                                <Camera size={24} /> Submit Photo Proof
                            </Button>
                        ) : (
                            <>
                                <input
                                    type="text"
                                    placeholder="Enter the secret word..."
                                    className="w-full bg-white/5 border border-white/20 rounded-xl p-4 text-white text-lg focus:outline-none focus:border-amber-500 transition-colors"
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSubmitAnswer()}
                                />
                                <Button 
                                    onClick={handleSubmitAnswer}
                                    disabled={!inputValue.trim()}
                                    className="w-full py-4 text-lg bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)] border-0"
                                >
                                    Unlock Vault
                                </Button>
                            </>
                        )}

                        {!showHint ? (
                            <button 
                                onClick={() => setShowHint(true)}
                                className="w-full py-3 text-sm text-gray-400 hover:text-white transition-colors underline underline-offset-4 decoration-white/20"
                            >
                                Request a Hint
                            </button>
                        ) : (
                            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl text-blue-200 text-sm flex gap-3 text-left">
                                <Heart className="shrink-0 text-blue-400" size={18} />
                                <p>{activeVault.hint}</p>
                            </div>
                        )}
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full animate-fade-in relative z-10">
            <ScreenHeader title="Origin Quest" onBack={onExit} />
            <div className="px-1 pb-4">
                <p className="text-gray-300 text-sm mb-6 text-center">
                    Decrypt the vaults to uncover the forgotten lore of Agra.
                </p>

                <div className="flex items-center justify-between px-2 mb-2">
                    <span className="text-xs uppercase tracking-widest text-gray-500 font-bold">Progress</span>
                    <span className="text-xs font-bold text-amber-500">{unlockedVaults.length} / {VAULTS.length}</span>
                </div>
                <div className="w-full bg-white/10 h-2 rounded-full mb-6 overflow-hidden">
                    <div 
                        className="bg-amber-500 h-full transition-all duration-1000 ease-out" 
                        style={{ width: `${(unlockedVaults.length / VAULTS.length) * 100}%` }}
                    />
                </div>

                <div className="space-y-3">
                    {VAULTS.map((vault, index) => {
                        const isUnlocked = unlockedVaults.includes(vault.id);
                        return (
                            <button
                                key={vault.id}
                                onClick={() => handleVaultClick(vault.id)}
                                disabled={isUnlocked}
                                className={`w-full text-left flex items-center gap-4 p-4 rounded-xl border transition-all ${
                                    isUnlocked 
                                        ? 'bg-amber-900/20 border-amber-500/30 opacity-70' 
                                        : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-amber-500/50 group'
                                }`}
                            >
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${isUnlocked ? 'bg-amber-500/20 text-amber-500' : 'bg-black/50 text-gray-400'}`}>
                                    {isUnlocked ? <Unlock size={20} /> : <Lock size={20} />}
                                </div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-500 font-bold tracking-widest uppercase mb-1">Vault 0{index + 1}</p>
                                    <h3 className={`text-lg font-bold ${isUnlocked ? 'text-amber-400' : 'text-white'}`}>
                                        {vault.title}
                                    </h3>
                                </div>
                                {!isUnlocked && <ChevronRight className="text-gray-500 group-hover:text-amber-500 transition-colors" />}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// Helper icon component
const ChevronRight = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m9 18 6-6-6-6"/></svg>
);
