import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../lib/firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Menu, User, X, LogOut, Wallet, ShieldAlert, History, Volume2, VolumeX, Music, TrendingUp, HelpCircle, BookOpen, FileText, ShieldCheck, Diamond, Bomb, Trophy, Info } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import HistoryModal from '../components/HistoryModal';

const getNetworkConfig = () => {
  return {
    apiBase: `${window.location.origin}/api`
  };
};

export default function MinesGame() {
  const { profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [betAmount, setBetAmount] = useState(10);
  const [mineCount, setMineCount] = useState(3);
  const [gameState, setGameState] = useState<'idle' | 'playing' | 'won' | 'lost'>('idle');
  const [tiles, setTiles] = useState<any[]>(Array(25).fill({ revealed: false, type: 'none' }));
  const [multiplier, setMultiplier] = useState(1.0);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [winAmount, setWinAmount] = useState(0);
  const [revealedCount, setRevealedCount] = useState(0);

  // Audio refs
  const flipAudio = useRef<HTMLAudioElement | null>(null);
  const bombAudio = useRef<HTMLAudioElement | null>(null);
  const winAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio with more robust URLs
    flipAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3');
    bombAudio.current = new Audio('https://www.soundjay.com/buttons/sounds/button-10.mp3'); // Clearer bomb sound
    winAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');
    
    // Set some volumes
    if (flipAudio.current) flipAudio.current.volume = 0.5;
    if (bombAudio.current) bombAudio.current.volume = 0.6;
    if (winAudio.current) winAudio.current.volume = 0.5;
  }, []);

  const calculateMultiplier = (numMines: number, revealed: number) => {
    let mult = 1.0;
    const totalTiles = 25;
    const houseEdge = 0.03;
    for (let i = 0; i < revealed; i++) {
        mult *= (totalTiles - i) / (totalTiles - numMines - i);
    }
    return parseFloat((mult * (1 - houseEdge)).toFixed(2));
  };

  const handleStartGame = async () => {
    if (gameState === 'playing') return;
    if ((profile?.balance || 0) < betAmount) {
      alert("Insufficient balance!");
      return;
    }

    if (!profile?.uid) {
      alert("User profile not loaded. Please refresh or log in again.");
      return;
    }

    const config = getNetworkConfig();
    try {
      const res = await fetch(`${config.apiBase}/mines/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile?.uid,
          betAmount,
          numMines: mineCount
        })
      });
      const data = await res.json();
      if (data.success) {
        setGameState('playing');
        setTiles(Array(25).fill({ revealed: false, type: 'none' }));
        setMultiplier(1.0);
        setRevealedCount(0);
        refreshProfile(); 
      } else {
        alert(data.error);
      }
    } catch (e: any) {
      console.error(e);
      alert("Failed to start game: " + (e.message || "Unknown error"));
    }
  };

  const handleReveal = async (index: number) => {
    if (gameState !== 'playing' || tiles[index].revealed) return;

    const config = getNetworkConfig();
    try {
      const res = await fetch(`${config.apiBase}/mines/reveal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile?.uid, tileIndex: index })
      });
      const data = await res.json();

      if (data.success) {
        if (!isMuted) flipAudio.current?.play().catch(() => {});

        if (data.hitMine) {
          if (!isMuted) bombAudio.current?.play().catch(() => {});
          setGameState('lost');
          // Show all mines
          const finalTiles = [...tiles];
          data.mines.forEach((mIdx: number) => {
            finalTiles[mIdx] = { revealed: true, type: 'mine' };
          });
          // Mark the hit one specifically if needed
          setTiles(finalTiles);
        } else {
          const newTiles = [...tiles];
          newTiles[index] = { revealed: true, type: 'diamond' };
          setTiles(newTiles);
          setMultiplier(data.multiplier);
          setRevealedCount(prev => prev + 1);

          if (data.isGameOver) {
             // Automatic win (all diamonds revealed)
             setGameState('won');
             setWinAmount(data.winAmount);
             // Show mines
             const winTiles = [...newTiles];
             data.mines.forEach((mIdx: number) => {
                winTiles[mIdx] = { revealed: true, type: 'mine' };
             });
             setTiles(winTiles);
             refreshProfile();
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      alert("Error revealing tile: " + (e.message || "Unknown error"));
    }
  };

  const handleCashout = async () => {
    if (gameState !== 'playing' || revealedCount === 0) return;

    const config = getNetworkConfig();
    try {
      const res = await fetch(`${config.apiBase}/mines/cashout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: profile?.uid })
      });
      const data = await res.json();
      if (data.success) {
        if (!isMuted) winAudio.current?.play().catch(() => {});
        setGameState('won');
        setWinAmount(data.winAmount);
        
        // Show remaining mines
        const finalTiles = [...tiles];
        data.mines.forEach((mIdx: number) => {
           finalTiles[mIdx] = { revealed: true, type: 'mine' };
        });
        setTiles(finalTiles);
        refreshProfile();
      }
    } catch (e: any) {
      console.error(e);
      alert("Cashout error: " + (e.message || "Unknown error"));
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-[#0f1115] text-white flex flex-col font-sans">
      {/* Header */}
      <header className="bg-[#1b1c1d] px-4 py-3 flex items-center justify-between border-b border-white/5 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Diamond className="w-6 h-6 text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black italic tracking-tighter leading-none">MINES</span>
            <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest leading-none">ORIGINALS</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/profile" className="flex items-center gap-2 bg-black/40 px-3 py-1.5 rounded-full border border-indigo-500/20 hover:border-indigo-500/40 transition-all group">
             <Wallet className="w-4 h-4 text-green-500 group-hover:scale-110 transition-transform" />
             <span className="font-mono font-bold">₹{profile?.balance?.toFixed(2) || '0.00'}</span>
          </Link>
          <button 
            onClick={() => setIsMuted(!isMuted)} 
            className={`p-2 rounded-lg transition-colors ${isMuted ? 'bg-red-500/10 text-red-500' : 'hover:bg-white/5 text-white/60'}`}
            title={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button onClick={() => setIsMenuOpen(true)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
            <Menu className="w-6 h-6 text-white/60" />
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 p-4 flex flex-col md:flex-row gap-6 max-w-6xl mx-auto w-full">
        
        {/* Controls Panel */}
        <aside className="w-full md:w-80 bg-[#1b1c1d] rounded-3xl p-6 border border-white/5 shadow-2xl flex flex-col gap-6 order-2 md:order-1">
           <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Bet Amount</label>
                <div className="relative">
                   <input 
                     type="number" 
                     value={betAmount} 
                     onChange={(e) => setBetAmount(Number(e.target.value))}
                     disabled={gameState === 'playing'}
                     className="w-full bg-black/40 border-2 border-white/5 rounded-xl px-4 py-3 outline-none focus:border-indigo-500/50 transition-all font-mono font-bold"
                   />
                   <div className="absolute right-2 top-1.5 flex gap-1">
                      <button onClick={() => setBetAmount(prev => prev / 2)} disabled={gameState === 'playing'} className="bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-xs font-bold font-mono">1/2</button>
                      <button onClick={() => setBetAmount(prev => prev * 2)} disabled={gameState === 'playing'} className="bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-xs font-bold font-mono">2x</button>
                   </div>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40 mb-2 block">Mines</label>
                <div className="grid grid-cols-4 gap-2">
                   {[1, 3, 5, 24].map(num => (
                     <button 
                       key={num}
                       onClick={() => setMineCount(num)}
                       disabled={gameState === 'playing'}
                       className={`py-2 rounded-xl text-sm font-bold border-2 transition-all ${mineCount === num ? 'bg-indigo-600 border-indigo-400 text-white shadow-lg shadow-indigo-500/20' : 'bg-black/40 border-white/5 text-white/60 hover:border-white/10'}`}
                     >
                       {num}
                     </button>
                   ))}
                </div>
                <input 
                  type="range" 
                  min="1" 
                  max="24" 
                  value={mineCount} 
                  onChange={(e) => setMineCount(Number(e.target.value))}
                  disabled={gameState === 'playing'}
                  className="w-full mt-4 accent-indigo-500"
                />
              </div>
           </div>

           <div className="mt-auto">
              {gameState === 'playing' ? (
                <button 
                  onClick={handleCashout}
                  disabled={revealedCount === 0}
                  className="w-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 disabled:opacity-50 disabled:grayscale py-4 rounded-2xl font-black text-xl shadow-lg shadow-green-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex flex-col items-center gap-0.5"
                >
                  <span>CASHOUT</span>
                  {revealedCount > 0 && <span className="text-sm font-mono opacity-80">₹{(betAmount * multiplier).toFixed(2)}</span>}
                </button>
              ) : (
                <button 
                  onClick={handleStartGame}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 py-5 rounded-2xl font-black text-xl shadow-lg shadow-indigo-500/20 transition-all transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  BET NOW
                </button>
              )}
           </div>

           {gameState === 'won' && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.8 }}
               animate={{ opacity: 1, scale: 1 }}
               className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex flex-col items-center"
             >
                <div className="bg-green-500/20 p-2 rounded-full mb-2">
                   <Trophy className="w-8 h-8 text-green-500" />
                </div>
                <div className="text-xs font-black text-green-500 uppercase tracking-widest mb-1">YOU WON</div>
                <div className="text-2xl font-black font-mono">₹{winAmount.toFixed(2)}</div>
             </motion.div>
           )}

           {gameState === 'lost' && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.8 }}
               animate={{ opacity: 1, scale: 1 }}
               className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 flex flex-col items-center"
             >
                <div className="bg-red-500/20 p-2 rounded-full mb-2">
                   <Bomb className="w-8 h-8 text-red-500" />
                </div>
                <div className="text-xs font-black text-red-500 uppercase tracking-widest mb-1">BOOM!</div>
                <div className="text-lg font-bold text-white/80">Try again!</div>
             </motion.div>
           )}
        </aside>

        {/* Tiles Grid Area */}
        <section className="flex-1 flex flex-col items-center justify-center order-1 md:order-2">
           <div className="w-full max-w-lg aspect-square grid grid-cols-5 gap-2 sm:gap-4 p-4 bg-[#1b1c1d] rounded-[2rem] border border-white/5 shadow-2xl relative overflow-hidden">
              {/* Background ambient glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80%] h-[80%] bg-indigo-500/5 blur-[100px] pointer-events-none" />

              {tiles.map((tile, i) => (
                <button
                  key={i}
                  onClick={() => handleReveal(i)}
                  disabled={gameState !== 'playing' || tile.revealed}
                  className={`relative w-full h-full rounded-xl sm:rounded-2xl transition-all duration-300 preserve-3d perspective-none ${tile.revealed ? 'rotate-y-180' : 'hover:scale-[1.05] active:scale-[0.95]'}`}
                >
                  <div className={`absolute inset-0 rounded-xl sm:rounded-2xl flex items-center justify-center transition-all ${tile.revealed ? (tile.type === 'mine' ? 'bg-red-500/20 border-red-500/40' : 'bg-indigo-500/20 border-indigo-500/40') : 'bg-[#2a2b2d] border-b-4 border-black/40 hover:bg-[#353638]'}`}>
                    {!tile.revealed ? (
                      <div className="w-3 h-3 sm:w-5 sm:h-5 rounded-full bg-white/5" />
                    ) : (
                      tile.type === 'diamond' ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Diamond className="w-6 h-6 sm:w-10 sm:h-10 text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.5)]" />
                        </motion.div>
                      ) : (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                          <Bomb className="w-6 h-6 sm:w-10 sm:h-10 text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                        </motion.div>
                      )
                    )}
                  </div>
                </button>
              ))}
           </div>

           {gameState === 'playing' && (
             <div className="mt-8 flex flex-col items-center">
                <div className="text-4xl sm:text-6xl font-black font-mono text-white flex items-baseline gap-2">
                   <span>{multiplier.toFixed(2)}</span>
                   <span className="text-xl sm:text-2xl text-indigo-400">x</span>
                </div>
                <div className="text-xs font-black text-white/40 uppercase tracking-[0.3em] mt-2">Next Multiplier</div>
             </div>
           )}
        </section>
      </main>

      {/* Side Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsMenuOpen(false)}
               className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
               initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
               className="fixed top-0 right-0 h-full w-[300px] bg-[#1b1c1d] z-[101] shadow-2xl border-l border-white/5 flex flex-col"
            >
               <div className="p-6 flex items-center justify-between border-b border-white/5">
                 <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center">
                     <User className="w-6 h-6 text-white" />
                   </div>
                   <span className="font-bold text-sm tracking-tight">{profile?.displayName || profile?.email.split('@')[0]}</span>
                 </div>
                 <button onClick={() => setIsMenuOpen(false)}>
                   <X className="w-5 h-5 text-white/40" />
                 </button>
               </div>
               
               <div className="flex-1 p-4 space-y-2 overflow-y-auto">
                  <Link to="/profile" onClick={() => setIsMenuOpen(false)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all">
                    <User className="w-4 h-4 text-[#F27D26]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-white">My Profile</span>
                  </Link>
                  <Link to="/deposit" onClick={() => setIsMenuOpen(false)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-green-500/10 transition-all text-green-500">
                    <Wallet className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Deposit</span>
                  </Link>
                  <Link to="/withdrawal" onClick={() => setIsMenuOpen(false)} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-yellow-500/10 transition-all text-yellow-500">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Withdraw</span>
                  </Link>
                  <button onClick={() => { setIsHistoryModalOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all">
                    <History className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-bold uppercase tracking-wider">History</span>
                  </button>
                  <button onClick={() => { setIsHowToPlayOpen(true); setIsMenuOpen(false); }} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all">
                    <HelpCircle className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-bold uppercase tracking-wider">How to Play</span>
                  </button>
                  {(profile?.isAdmin) && (
                    <Link to="/admin" className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-500/10 border border-red-500/10 transition-all text-red-500">
                      <ShieldAlert className="w-4 h-4" />
                      <span className="text-xs font-black uppercase tracking-wider">Admin Panel</span>
                    </Link>
                  )}
               </div>

               <div className="p-4 border-t border-white/5 mt-auto">
                  <button onClick={handleLogout} className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all">
                    <LogOut className="w-4 h-4" />
                    LOGOUT
                  </button>
               </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <HistoryModal 
        isOpen={isHistoryModalOpen} 
        onClose={() => setIsHistoryModalOpen(false)} 
      />

      <footer className="p-4 text-center text-white/20 text-[10px] uppercase font-bold tracking-[0.5em] pb-safe">
        Provably Fair Gaming • Jalwa369
      </footer>
    </div>
  );
}
