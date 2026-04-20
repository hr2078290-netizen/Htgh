import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { db, auth } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, increment, addDoc, collection, query, orderBy, limit, serverTimestamp, getDocs, deleteDoc, where, setDoc } from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';
import { Plane, History, TrendingUp, AlertCircle, TrendingDown, Volume2, VolumeX, Plus, Minus, Repeat, Zap, Menu, Music, Settings, ShieldCheck, ShieldAlert, BookOpen, FileText, HelpCircle, User, X, LogOut, Wallet, Users } from 'lucide-react';
import { GameSettings, GameHistoryEntry } from '../types';
import { useAuth } from '../lib/AuthContext';

export default function Home() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [overriddenBalance, setOverriddenBalance] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [multiplier, setMultiplier] = useState(1.0);
  const [gameState, setGameState] = useState<'waiting' | 'flying' | 'crashed'>('waiting');
  const [crashValue, setCrashValue] = useState(2.0);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [countdown, setCountdown] = useState(5);
  const [isMuted, setIsMuted] = useState(false);
  const isMutedRef = useRef(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMusicEnabled, setIsMusicEnabled] = useState(true);
  const [isAnimationEnabled, setIsAnimationEnabled] = useState(true);
  const [historyTab, setHistoryTab] = useState<'all' | 'previous' | 'top'>('all');
  const [topHistory, setTopHistory] = useState<GameHistoryEntry[]>([]);
  const [activeBets, setActiveBets] = useState<any[]>([]);
  
  // Dual Bet Panels
  const [panel1, setPanel1] = useState({ amount: 10, isAutoBet: false, autoCashOut: 0, isBetPlaced: false, hasCashedOut: false, currentBetId: '', isQueued: false });
  const [panel2, setPanel2] = useState({ amount: 10, isAutoBet: false, autoCashOut: 0, isBetPlaced: false, hasCashedOut: false, currentBetId: '', isQueued: false });
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isHowToPlayOpen, setIsHowToPlayOpen] = useState(false);
  const [userBetHistory, setUserBetHistory] = useState<any[]>([]);
  const [lastWin, setLastWin] = useState<{ amount: number, multiplier: number } | null>(null);
  const [showWinPopup, setShowWinPopup] = useState(false);
  const [lastCrashValue, setLastCrashValue] = useState<number>(0);
  const currentRoundRef = useRef(1);

  const multiplierRef = useRef(1.0);
  const requestRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  
  const serverOffsetRef = useRef<number>(0);
  
  const flightAudio = useRef<HTMLAudioElement | null>(null);
  const crashAudio = useRef<HTMLAudioElement | null>(null);

  const isPlacingBet = useRef({ panel1: false, panel2: false });

  const fetchBetHistory = async () => {
    if (!profile) return;
    try {
      const q = query(
        collection(db, 'user_bets'),
        where('userId', '==', profile.uid),
        orderBy('timestamp', 'desc'),
        limit(50)
      );
      const snap = await getDocs(q);
      const history: any[] = [];
      snap.forEach(d => history.push({ id: d.id, ...d.data() }));
      setUserBetHistory(history);
      setIsHistoryModalOpen(true);
      setIsMenuOpen(false);
    } catch (err) {
      console.error("Error fetching bet history:", err);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  // Sync game state from SSE Stream (Solves Quota Error)
  useEffect(() => {
    // Initialize audio
    const music = new Audio('/u_o0a9yfwhsr-aviator-music-394813.mp3');
    music.loop = true;
    flightAudio.current = music;
    crashAudio.current = new Audio('https://assets.mixkit.co/active_storage/sfx/264/264-preview.mp3');

    const eventSource = new EventSource('/api/game/stream');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (!data) return;

      const serverTime = data.serverTime || Date.now();
      serverOffsetRef.current = Date.now() - serverTime;

      const newGameState = data.status || 'waiting';
      
      // Update basic state
      setGameState(prev => {
        if (prev !== 'flying' && newGameState === 'flying') {
          if (flightAudio.current) {
            flightAudio.current.muted = isMutedRef.current;
            flightAudio.current.currentTime = 0;
            flightAudio.current.play().catch(() => {});
          }
        }
        if (prev === 'flying' && newGameState === 'crashed') {
          if (flightAudio.current) {
            flightAudio.current.pause();
            flightAudio.current.currentTime = 0;
          }
          if (crashAudio.current) {
            crashAudio.current.muted = isMutedRef.current;
            crashAudio.current.play().catch(() => {});
          }
        }
        return newGameState;
      });

      // Sync multiplier and timing
      if (newGameState === 'flying') {
        startTimeRef.current = data.startTime;
        if (!requestRef.current) requestRef.current = requestAnimationFrame(animate);
      } else {
        if (requestRef.current) {
          cancelAnimationFrame(requestRef.current);
          requestRef.current = null;
        }
        if (newGameState === 'crashed') {
          setMultiplier(data.lastFinalValue);
          multiplierRef.current = data.lastFinalValue;
          setLastCrashValue(data.lastFinalValue);
        } else {
          setMultiplier(1.0);
          multiplierRef.current = 1.0;
        }
      }

      if (newGameState === 'waiting') {
        const remaining = Math.max(0, Math.ceil((data.countdownEndTime - Date.now() + serverOffsetRef.current) / 1000));
        setCountdown(remaining);
      }

      setHistory(data.history || []);
      const newActiveBets = data.activeBets || [];
      const newQueuedBets = data.queuedBets || [];
      setActiveBets(newActiveBets);
      
      // Auto-sync local panel states with server truth
      if (profile) {
        const myActive = newActiveBets.filter((b: any) => b.userId === profile.uid);
        const myQueued = newQueuedBets.filter((b: any) => b.userId === profile.uid);

        setPanel1(prev => {
          const active = myActive.find((b: any) => b.panel === 1);
          const queued = myQueued.find((b: any) => b.panel === 1);
          if (active) return { ...prev, isBetPlaced: true, isQueued: false, hasCashedOut: active.status === 'cashed_out' };
          if (queued) return { ...prev, isQueued: true, isBetPlaced: false };
          if (newGameState === 'waiting' && !prev.isAutoBet) return { ...prev, isBetPlaced: false, isQueued: false };
          return prev;
        });

        setPanel2(prev => {
          const active = myActive.find((b: any) => b.panel === 2);
          const queued = myQueued.find((b: any) => b.panel === 2);
          if (active) return { ...prev, isBetPlaced: true, isQueued: false, hasCashedOut: active.status === 'cashed_out' };
          if (queued) return { ...prev, isQueued: true, isBetPlaced: false };
          if (newGameState === 'waiting' && !prev.isAutoBet) return { ...prev, isBetPlaced: false, isQueued: false };
          return prev;
        });
      }

      currentRoundRef.current = data.currentRound;
      setCrashValue(data.nextCrashValue);
      setIsConnected(true);
    };

    eventSource.onerror = (e) => {
      console.error("SSE Connection failed:", e);
      setIsConnected(false);
      eventSource.close();
      // Auto-retry in 3s
      setTimeout(() => setRetryKey(prev => prev + 1), 3000);
    };

    return () => {
      eventSource.close();
      if (flightAudio.current) {
        flightAudio.current.pause();
        flightAudio.current = null;
      }
      if (crashAudio.current) {
        crashAudio.current.pause();
        crashAudio.current = null;
      }
    };
  }, [retryKey]);

  // Update audio volume and behavior when state changes
  useEffect(() => {
    isMutedRef.current = isMuted;
    if (flightAudio.current) {
      flightAudio.current.muted = isMuted;
      flightAudio.current.loop = true;
      // Re-bind to ensure closure over latest gameState
      flightAudio.current.onended = () => {
        if (gameState === 'flying' && flightAudio.current) {
          flightAudio.current.currentTime = 0;
          flightAudio.current.play().catch(() => {});
        }
      };
    }
    if (crashAudio.current) crashAudio.current.muted = isMuted;
  }, [isMuted, gameState]);

  const animate = () => {
    if (!startTimeRef.current) return;
    const now = Date.now() - serverOffsetRef.current;
    const elapsed = (now - startTimeRef.current) / 1000;
    
    // Growth logic: f(t) = e^(0.15t)
    const currentMult = Math.exp(0.15 * elapsed);
    
    if (currentMult > 1) {
      setMultiplier(currentMult);
      multiplierRef.current = currentMult;

      // High-precision Auto Cashout check (Checked at 60fps)
      if (panel1Ref.current.isBetPlaced && !panel1Ref.current.hasCashedOut && panel1Ref.current.autoCashOut > 0 && currentMult >= panel1Ref.current.autoCashOut) {
        handleCashOut(1);
      }
      if (panel2Ref.current.isBetPlaced && !panel2Ref.current.hasCashedOut && panel2Ref.current.autoCashOut > 0 && currentMult >= panel2Ref.current.autoCashOut) {
        handleCashOut(2);
      }
    }
    requestRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    panel1Ref.current = panel1;
    panel2Ref.current = panel2;
  }, [panel1, panel2]);

  const panel1Ref = useRef(panel1);
  const panel2Ref = useRef(panel2);

  useEffect(() => {
    if (gameState === 'crashed') {
      handleLocalCrashCleanup(lastCrashValue);
    }
  }, [gameState, lastCrashValue]);

  const handleLocalCrashCleanup = async (serverFinalValue?: number) => {
    if (requestRef.current) cancelAnimationFrame(requestRef.current);
    
    // Force multiplier to match server's final value exactly
    if (serverFinalValue) {
      setMultiplier(serverFinalValue);
      multiplierRef.current = serverFinalValue;
    }

    // Update panels for next round
    setPanel1(prev => ({ ...prev, isBetPlaced: false, hasCashedOut: false, currentBetId: '' }));
    setPanel2(prev => ({ ...prev, isBetPlaced: false, hasCashedOut: false, currentBetId: '' }));
  };
  useEffect(() => {
    let timer: any;
    if (gameState === 'waiting' && countdown > 0) {
      timer = setInterval(() => {
        setCountdown(prev => Math.max(0, prev - 1));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState, countdown]);

  // Separate Effect for Auto Betting - only triggers on state change or auto toggle
  useEffect(() => {
    if (gameState === 'waiting') {
      const autoPlace = async () => {
        if (panel1.isAutoBet && !panel1.isBetPlaced && !isPlacingBet.current.panel1) {
          await handlePlaceBet(1);
        }
        if (panel2.isAutoBet && !panel2.isBetPlaced && !isPlacingBet.current.panel2) {
          await handlePlaceBet(2);
        }
      };
      autoPlace();
    }
  }, [gameState, panel1.isAutoBet, panel2.isAutoBet, panel1.isBetPlaced, panel2.isBetPlaced, overriddenBalance, profile?.balance]);

  useEffect(() => {
    if (gameState === 'flying') {
      // Auto Cash out handling - MOVED TO ANIMATE LOOP FOR PRECISION
    }
  }, [gameState]);

  const handlePlaceBet = async (panelIdx: 1 | 2) => {
    const p = panelIdx === 1 ? panel1 : panel2;
    if (!profile) return;
    
    const panelKey = panelIdx === 1 ? 'panel1' : 'panel2';
    if (isPlacingBet.current[panelKey] || p.isBetPlaced || p.isQueued) return;
    
    // Use the most up-to-date balance for the check
    const currentBalance = overriddenBalance ?? profile?.balance ?? 0;
    const currentReferral = profile?.referralBalance ?? 0;
    const totalAvailable = currentBalance + currentReferral;

    if (totalAvailable < p.amount) {
      if (!p.isAutoBet) alert('Insufficient balance! Please deposit to continue betting.');
      return;
    }

    isPlacingBet.current[panelKey] = true;
    try {
      const isNextRound = gameState === 'flying' || gameState === 'crashed';
      
      const response = await fetch('/api/game/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.uid,
          email: profile.email,
          amount: p.amount,
          panel: panelIdx
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        if (!p.isAutoBet) alert(resData.error || 'Betting failed');
        return;
      }

      if (resData.newBalance !== undefined) {
        setOverriddenBalance(resData.newBalance);
      }

      const update = isNextRound 
        ? { isQueued: true, isBetPlaced: false, hasCashedOut: false }
        : { isBetPlaced: true, hasCashedOut: false, isQueued: false };

      if (panelIdx === 1) setPanel1(prev => ({ ...prev, ...update }));
      else setPanel2(prev => ({ ...prev, ...update }));
    } catch (e) {
      console.error(e);
    } finally {
      isPlacingBet.current[panelKey] = false;
    }
  };

  const handleCancelBet = async (panelIdx: 1 | 2) => {
    const p = panelIdx === 1 ? panel1 : panel2;
    if (!profile) return;

    if (p.isQueued) {
      if (panelIdx === 1) setPanel1(prev => ({ ...prev, isQueued: false }));
      else setPanel2(prev => ({ ...prev, isQueued: false }));
      return;
    }

    if (!p.isBetPlaced || gameState !== 'waiting') return;

    try {
      const response = await fetch('/api/game/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.uid,
          panel: panelIdx
        })
      });

      if (!response.ok) {
        const resData = await response.json();
        alert(resData.error || 'Cancellation failed');
        return;
      }

      const resData = await response.json();
      if (resData.newBalance !== undefined) {
        setOverriddenBalance(resData.newBalance);
      }

      if (panelIdx === 1) setPanel1(prev => ({ ...prev, isBetPlaced: false }));
      else setPanel2(prev => ({ ...prev, isBetPlaced: false }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleCashOut = async (panelIdx: 1 | 2) => {
    const p = panelIdx === 1 ? panel1 : panel2;
    if (!profile || !p.isBetPlaced || p.hasCashedOut || gameState !== 'flying') return;

    const currentMultiplier = multiplierRef.current;

    // Set local state immediately to prevent multiple clicks
    if (panelIdx === 1) setPanel1(prev => ({ ...prev, hasCashedOut: true }));
    else setPanel2(prev => ({ ...prev, hasCashedOut: true }));

    try {
      const response = await fetch('/api/game/cashout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.uid,
          panel: panelIdx,
          multiplier: currentMultiplier
        })
      });

      const resData = await response.json();
      if (!response.ok) {
         // Rollback
        if (panelIdx === 1) setPanel1(prev => ({ ...prev, hasCashedOut: false }));
        else setPanel2(prev => ({ ...prev, hasCashedOut: false }));
        alert(resData.error || 'Cashout failed');
        return;
      }

      if (resData.newBalance !== undefined) {
        setOverriddenBalance(resData.newBalance);
      }

      setLastWin({ amount: resData.winAmount, multiplier: currentMultiplier });
      setShowWinPopup(true);
      setTimeout(() => setShowWinPopup(false), 3000);
    } catch (e) {
      console.error(e);
      // Rollback on error
      if (panelIdx === 1) setPanel1(prev => ({ ...prev, hasCashedOut: false }));
      else setPanel2(prev => ({ ...prev, hasCashedOut: false }));
    }
  };

  const getBgColor = () => {
    if (multiplier < 2) return 'from-blue-900/40';
    if (multiplier < 10) return 'from-purple-900/40';
    return 'from-pink-900/40';
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Persistent Header with Balance */}
      <div className="flex items-center justify-between bg-[#1b1c1d] px-4 sm:px-6 py-2 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 shadow-2xl sticky top-0 z-[100] backdrop-blur-md bg-opacity-95">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br from-[#f27d26] to-[#ff4e00] flex items-center justify-center shadow-[0_0_15px_rgba(242,125,38,0.3)]">
             <Plane className="w-4 h-4 sm:w-6 sm:h-6 text-white transform -rotate-12" />
          </div>
          <div className="flex flex-col -gap-1">
            <span className="text-base sm:text-xl font-black text-white italic tracking-tighter leading-none">AVITED</span>
            <span className="text-[6px] sm:text-[8px] font-black text-[#f27d26] uppercase tracking-[0.2em] leading-none mb-0.5">AVIATOR</span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 sm:gap-4">
           <Link 
             to="/profile"
             className="bg-black/60 rounded-full px-2 py-1 sm:px-5 sm:py-1.5 flex items-center gap-1 sm:gap-2 border border-[#28a745]/30 shadow-inner hover:bg-black/40 transition-colors group"
           >
              <Wallet className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-[#28a745] group-hover:scale-110 transition-transform" />
              <span className="text-xs sm:text-base font-black text-white font-mono tracking-tight group-hover:text-[#28a745] transition-colors">
                ₹{(overriddenBalance ?? profile?.balance ?? 0).toFixed(2)}
              </span>
           </Link>
           
           <button 
             onClick={() => setIsMenuOpen(true)}
             className="p-1.5 sm:p-2.5 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 rounded-xl transition-all group"
           >
             <Menu className="w-5 h-5 sm:w-6 sm:h-6 text-white/40 group-hover:text-white transition-colors" />
           </button>
        </div>
      </div>

      {/* Cash Out Popup */}
      <AnimatePresence>
        {showWinPopup && lastWin && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-sm"
          >
            <div className="bg-[#1b1c1d]/95 backdrop-blur-md border border-[#28a745]/30 rounded-2xl overflow-hidden shadow-[0_10px_40px_rgba(0,0,0,0.5)] flex items-stretch">
              <div className="bg-[#28a745]/20 flex flex-col items-center justify-center px-4 py-4 border-r border-[#28a745]/10">
                 <div className="text-[10px] font-black text-[#28a745] uppercase tracking-widest mb-1">Cashed Out</div>
                 <div className="text-2xl font-black text-white font-mono">{lastWin.multiplier.toFixed(2)}x</div>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center p-4">
                 <div className="text-xs font-bold text-gray-400 uppercase mb-1">You won</div>
                 <div className="text-2xl font-black text-[#28a745] font-mono">₹{lastWin.amount.toFixed(2)}</div>
              </div>
              <button onClick={() => setShowWinPopup(false)} className="p-3 text-white/40 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Side Menu Overlay */}
      <AnimatePresence>
        {isMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 h-full w-[300px] bg-[#1b1c1d] z-[101] shadow-2xl border-l border-white/5 flex flex-col pt-safe"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#F27D26] to-[#ffaa00] flex items-center justify-center border-2 border-white/10">
                      <User className="w-6 h-6 text-white" />
                   </div>
                   <div className="flex flex-col">
                      <span className="text-xs font-bold text-white uppercase tracking-wider">{profile?.displayName || profile?.email.split('@')[0]}</span>
                      <button className="text-[10px] text-[#F27D26] font-bold uppercase hover:underline">Change Avatar</button>
                   </div>
                </div>
                <button onClick={() => setIsMenuOpen(false)} className="p-2 hover:bg-white/5 rounded-lg transition-colors">
                  <X className="w-5 h-5 text-white/40" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="flex items-center gap-3">
                      <Volume2 className="w-4 h-4 text-white/60" />
                      <span className="text-xs font-medium text-white/80">Sound</span>
                    </div>
                    <button onClick={() => setIsMuted(!isMuted)} className={`w-10 h-5 rounded-full relative transition-colors ${!isMuted ? 'bg-[#28a745]' : 'bg-[#424344]'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${!isMuted ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="flex items-center gap-3">
                      <Music className="w-4 h-4 text-white/60" />
                      <span className="text-xs font-medium text-white/80">Music</span>
                    </div>
                    <button onClick={() => setIsMusicEnabled(!isMusicEnabled)} className={`w-10 h-5 rounded-full relative transition-colors ${isMusicEnabled ? 'bg-[#28a745]' : 'bg-[#424344]'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isMusicEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-xl bg-black/20 border border-white/5">
                    <div className="flex items-center gap-3">
                      <TrendingUp className="w-4 h-4 text-white/60" />
                      <span className="text-xs font-medium text-white/80">Animation</span>
                    </div>
                    <button onClick={() => setIsAnimationEnabled(!isAnimationEnabled)} className={`w-10 h-5 rounded-full relative transition-colors ${isAnimationEnabled ? 'bg-[#28a745]' : 'bg-[#424344]'}`}>
                      <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${isAnimationEnabled ? 'left-6' : 'left-1'}`} />
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <Link 
                    to="/profile"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left"
                  >
                    <User className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/70">My Profile</span>
                  </Link>

                  {(profile?.isAdmin || profile?.email === 'hr2078290@gmail.com') && (
                    <Link 
                      to="/admin"
                      onClick={() => setIsMenuOpen(false)}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left bg-white/5 border border-white/5"
                    >
                      <ShieldAlert className="w-4 h-4 text-[#F27D26]" />
                      <span className="text-xs font-bold text-[#F27D26] uppercase">Admin Control</span>
                    </Link>
                  )}
                  <Link 
                    to="/referral"
                    onClick={() => setIsMenuOpen(false)}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left"
                  >
                    <Users className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/70">My Referrals</span>
                  </Link>
                  <button 
                    onClick={fetchBetHistory}
                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left"
                  >
                    <History className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/70">My Bet History</span>
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left">
                    <ShieldCheck className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/70">Game Limits</span>
                  </button>
                    <button 
                      onClick={() => {
                        setIsHowToPlayOpen(true);
                        setIsMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left"
                    >
                      <HelpCircle className="w-4 h-4 text-white/40" />
                      <span className="text-xs font-medium text-white/70">How To Play</span>
                    </button>
                  <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left">
                    <BookOpen className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/70">Game Rules</span>
                  </button>
                  <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left border-t border-white/5 pt-4">
                    <FileText className="w-4 h-4 text-white/40" />
                    <span className="text-xs font-medium text-white/70">Provably Fair Settings</span>
                  </button>
                </div>
              </div>

              <div className="p-6 border-t border-white/5 space-y-3">
                <Link to="/" onClick={() => setIsMenuOpen(false)} className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-white/5 hover:bg-white/10 transition-all text-white/60 font-bold uppercase text-xs tracking-widest">
                  Home
                </Link>
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-500/10 hover:bg-red-500/20 transition-all text-red-500 font-bold uppercase text-xs tracking-widest border border-red-500/10"
                >
                  <LogOut className="w-4 h-4" />
                  Log Out
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* My Bet History Modal */}
      <AnimatePresence>
        {isHistoryModalOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsHistoryModalOpen(false)}
               className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full max-w-lg bg-[#1b1c1d] rounded-3xl border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/5">
                    <History className="w-5 h-5 text-[#F27D26]" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-widest">My Bet History</h3>
                </div>
                <button onClick={() => setIsHistoryModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-[#141516] text-[9px] font-bold uppercase text-white/30">
                    <tr>
                      <th className="px-3 py-3 font-normal">Date</th>
                      <th className="px-3 py-3 font-normal text-right">Bet INR</th>
                      <th className="px-3 py-3 text-center font-normal">X</th>
                      <th className="px-3 py-3 text-right font-normal">Cash out INR</th>
                      <th className="px-3 py-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {userBetHistory.map((bet) => (
                      <tr 
                        key={bet.id} 
                        className={`transition-colors h-14 ${bet.status === 'win' ? 'bg-[#12342d]/80 border-l-2 border-[#28a745]' : 'bg-[#000000]/40 border-l-2 border-transparent'}`}
                      >
                        <td className="px-3 py-2">
                          <div className="text-[10px] font-bold text-white/90 leading-tight">
                            {bet.timestamp?.toDate ? bet.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A'}
                          </div>
                          <div className="text-[9px] text-white/30 font-medium">
                             {bet.timestamp?.toDate ? bet.timestamp.toDate().toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-') : ''}
                          </div>
                        </td>
                        <td className="px-3 py-2 font-mono font-bold text-[11px] text-right text-[#9ea0a1]">
                           {bet.amount.toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {bet.status === 'win' ? (
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full bg-[#1b1c1d] border border-white/10 text-[#28a745] font-mono font-black text-[10px]">
                               {bet.multiplier?.toFixed(2)}x
                            </span>
                          ) : (
                            <span className="text-white/20 font-mono font-bold text-[10px]">{bet.finalMultiplier?.toFixed(2) || '0.00'}x</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono font-black text-[11px] text-right">
                          {bet.status === 'win' ? (
                            <span className="text-white">{bet.winAmount?.toFixed(2)}</span>
                          ) : (
                            <span className="text-white/20"></span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5 justify-end opacity-20">
                             <div className="w-3.5 h-3.5 rounded-full border border-white" />
                             <div className="w-3.5 h-3.5 rounded-full border border-white" />
                          </div>
                        </td>
                      </tr>
                    ))}
                    {userBetHistory.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-20 text-center text-gray-500 uppercase text-[10px] font-bold tracking-widest">
                          No bets registered
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-[#141516] border-t border-white/5 flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em]">Showing last 50 bets</span>
                <span className="text-[9px] font-bold text-[#F27D26] uppercase tracking-[0.2em] italic font-black">Total Rounds: {userBetHistory.length}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* How To Play Modal */}
      <AnimatePresence>
        {isHowToPlayOpen && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-4">
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setIsHowToPlayOpen(false)}
               className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-full max-w-2xl bg-[#1b1c1d] rounded-3xl border border-white/5 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-white/5">
                    <BookOpen className="w-5 h-5 text-[#F27D26]" />
                  </div>
                  <h3 className="text-lg font-black uppercase tracking-widest">How to Play</h3>
                </div>
                <button onClick={() => setIsHowToPlayOpen(false)} className="p-2 hover:bg-white/5 rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                <section className="space-y-4">
                   <h4 className="text-[#F27D26] text-xs font-black uppercase tracking-widest">Quick Guide</h4>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-3">
                         <div className="w-8 h-8 rounded-full bg-[#f27d26] flex items-center justify-center font-black text-white">01</div>
                         <p className="text-xs font-bold leading-relaxed text-white/80">Make a bet, or even two at the same time and wait for the round to start.</p>
                      </div>
                      <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-3">
                         <div className="w-8 h-8 rounded-full bg-[#f27d26] flex items-center justify-center font-black text-white">02</div>
                         <p className="text-xs font-bold leading-relaxed text-white/80">Look after the Lucky Plane. Your win is bet multiplied by a coefficient of Lucky Plane.</p>
                      </div>
                      <div className="bg-black/40 p-5 rounded-2xl border border-white/5 space-y-3">
                         <div className="w-8 h-8 rounded-full bg-[#f27d26] flex items-center justify-center font-black text-white">03</div>
                         <p className="text-xs font-bold leading-relaxed text-white/80">Cash out before plane flies away and money is yours!</p>
                      </div>
                   </div>
                </section>

                <section className="space-y-4">
                   <h4 className="text-[#F27D26] text-xs font-black uppercase tracking-widest text-center">Watch our tutorial</h4>
                   <div className="aspect-video bg-black/40 rounded-2xl border border-white/5 flex items-center justify-center overflow-hidden">
                      <div className="text-center p-6 bg-black/60 backdrop-blur-sm rounded-xl border border-white/10 m-4">
                         <HelpCircle className="w-10 h-10 text-white/20 mx-auto mb-3" />
                         <p className="text-xs font-medium text-white/60">Tutorial video coming soon!</p>
                      </div>
                   </div>
                </section>

                <section className="bg-black/40 p-6 rounded-2xl border border-white/5 space-y-4">
                   <h4 className="text-xs font-black uppercase tracking-widest text-white">Game Functions</h4>
                   <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                      {[
                        "Select an amount and press the \"Bet\" button to make a bet.",
                        "You can cancel the bet by pressing the \"Cancel\" button.",
                        "Adjust the bet size using the \"+\" and \"-\" buttons.",
                        "Press the \"Cash Out\" button to cash out your winnings.",
                        "Auto Play is available for automatic betting.",
                        "Auto Cash Out allows you to cash out at a fixed multiplier.",
                        "Provably Fair algorithm ensures 100% fair rounds.",
                        "Check your fairness by checking the icon in History."
                      ].map((text, i) => (
                        <li key={i} className="flex gap-3 text-[10px] font-medium text-white/60 leading-relaxed">
                           <div className="w-1.5 h-1.5 rounded-full bg-[#f27d26] mt-1 shrink-0" />
                           {text}
                        </li>
                      ))}
                   </ul>
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between bg-[#1b1c1d] px-3 py-1.5 sm:px-4 sm:py-3 rounded-xl sm:rounded-2xl border border-white/5 gap-2 sm:gap-4 shadow-xl overflow-hidden">
        <div className="flex flex-1 items-center gap-2 sm:gap-4 min-w-0">
           <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-0.5 scrollbar-hide no-scrollbar flex-1">
             {history.slice(0, 15).map((h, i) => (
               <div key={h.timestamp?.seconds || i} className={`px-2 py-0.5 sm:px-3 sm:py-1 rounded-full text-[9px] sm:text-[11px] font-black font-mono border whitespace-nowrap transition-all hover:scale-105 cursor-pointer ${h.value >= 10 ? 'bg-pink-500/10 text-pink-500 border-pink-500/20' : h.value >= 2 ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' : 'bg-blue-500/10 text-blue-400 border-blue-500/20'}`}>
                 {h.value.toFixed(2)}x
               </div>
             ))}
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Main Game Stage */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          <div className="relative aspect-[16/9] bg-[#000] rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            {/* Connection Indicator */}
            {!isConnected && (
              <div className="absolute top-4 right-4 bg-red-500/80 px-3 py-1 rounded-full text-[10px] font-black uppercase text-white animate-pulse z-50">
                Reconnecting...
              </div>
            )}
            {isConnected && (
               <div className="absolute top-4 right-4 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full border border-white/10 z-50 backdrop-blur-sm shadow-xl">
                  <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse-red shadow-[0_0_10px_#ef4444]" />
                  <span className="text-[10px] font-black uppercase text-white tracking-[0.15em]">Live</span>
               </div>
            )}

            {/* Background Color Animation */}
            <div className={`absolute inset-0 transition-colors duration-1000 bg-gradient-to-t ${gameState === 'flying' ? getBgColor() : 'from-black'} to-transparent`} />
            
            <div className="absolute inset-0 opacity-10 pointer-events-none">
              <svg className="w-full h-full">
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                </pattern>
                <rect width="100%" height="100%" fill="url(#grid)" />
              </svg>
            </div>

            {/* Stage Text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10">
              <AnimatePresence mode="wait">
                {gameState === 'waiting' ? (
                  <motion.div 
                    key="waiting"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.1 }}
                    className="text-center"
                  >
                    <div className="text-[#F27D26] text-xs font-bold uppercase tracking-[0.3em] mb-2 animate-pulse">Wait for next round</div>
                    <div className="flex flex-col items-center">
                      <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden mb-4">
                        <motion.div 
                          key={`progress-${countdown}`}
                          initial={{ width: '0%' }}
                          animate={{ width: countdown > 0 ? '100%' : '0%' }}
                          transition={{ duration: 10, ease: 'linear' }}
                          className="h-full bg-[#f27d26]"
                        />
                      </div>
                      <div className="text-4xl font-mono font-black text-white">{countdown}s</div>
                    </div>
                  </motion.div>
                ) : gameState === 'flying' ? (
                  <motion.div 
                    key="flying"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="text-center"
                  >
                    <div className="text-7xl sm:text-[10rem] font-black text-white font-mono drop-shadow-[0_0_80px_rgba(255,255,255,0.35)] leading-none">
                      {multiplier.toFixed(2)}<span className="text-4xl sm:text-6xl ml-1">x</span>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    key="crashed"
                    initial={{ scale: 1.2, color: '#fff' }}
                    animate={{ scale: 1, color: '#ef4444' }}
                    className="text-center"
                  >
                    <div className="text-4xl font-black uppercase tracking-widest text-[#ef4444] mb-4">Flew Away!</div>
                    <div className="text-8xl font-mono font-black">
                      {multiplier.toFixed(2)}x
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Plane Animation */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
               {gameState === 'flying' && (
                 <motion.div
                   animate={{ 
                     x: [0, 20, 0, -20, 0], 
                     y: [0, -10, 0, 10, 0],
                     rotate: [-2, 2, -1, 1, -2]
                   }}
                   transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                   className="absolute bottom-20 left-1/2 -translate-x-1/2"
                 >
                   <div className="relative">
                     <Plane className="w-24 h-24 text-[#F27D26] drop-shadow-[0_0_15px_rgba(242,125,38,0.5)]" />
                     {/* Exhaust effect */}
                     <motion.div 
                        animate={{ opacity: [0, 1, 0], scale: [1, 1.5, 1] }}
                        transition={{ duration: 0.5, repeat: Infinity }}
                        className="absolute -left-8 top-1/2 -translate-y-1/2 w-8 h-2 bg-gradient-to-r from-transparent to-[#F27D26]/50 rounded-full"
                     />
                   </div>
                 </motion.div>
               )}
            </div>

            {/* Admin Secret: View Crash Value */}
            {profile?.isAdmin && (
               <div className="absolute top-4 left-4 bg-black/80 px-3 py-1.5 rounded-lg border border-white/10 text-[10px] uppercase font-mono text-purple-400 z-50 flex items-center gap-2">
                 <AlertCircle className="w-3 h-3" /> Next Crash: {crashValue}x
               </div>
            )}
          </div>

          {/* DUAL BETTING PANELS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BetPanel 
              panel={panel1}
              multiplier={multiplier}
              gameState={gameState}
              onAmountChange={(v) => setPanel1(prev => ({ ...prev, amount: v }))}
              onPlaceBet={() => handlePlaceBet(1)}
              onCancelBet={() => handleCancelBet(1)}
              onCashOut={() => handleCashOut(1)}
              onToggleAuto={() => setPanel1(prev => ({ ...prev, isAutoBet: !prev.isAutoBet }))}
              onAutoCashOutChange={(v) => setPanel1(prev => ({ ...prev, autoCashOut: v }))}
            />
            <BetPanel 
              panel={panel2}
              multiplier={multiplier}
              gameState={gameState}
              onAmountChange={(v) => setPanel2(prev => ({ ...prev, amount: v }))}
              onPlaceBet={() => handlePlaceBet(2)}
              onCancelBet={() => handleCancelBet(2)}
              onCashOut={() => handleCashOut(2)}
              onToggleAuto={() => setPanel2(prev => ({ ...prev, isAutoBet: !prev.isAutoBet }))}
              onAutoCashOutChange={(v) => setPanel2(prev => ({ ...prev, autoCashOut: v }))}
            />
          </div>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="bg-[#1b1c1d] border border-white/5 rounded-3xl p-4 sm:p-6 h-full flex flex-col gap-4">
            <div className="flex flex-col gap-4">
               <div className="flex p-1 bg-black/40 rounded-xl border border-white/5">
                 <button 
                   onClick={() => setHistoryTab('all')}
                   className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${historyTab === 'all' ? 'bg-[#424344] text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
                 >
                   All Bets
                 </button>
                 <button 
                   onClick={() => setHistoryTab('previous')}
                   className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${historyTab === 'previous' ? 'bg-[#424344] text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
                 >
                   Previous
                 </button>
                 <button 
                   onClick={() => setHistoryTab('top')}
                   className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${historyTab === 'top' ? 'bg-[#424344] text-white shadow-lg' : 'text-white/30 hover:text-white/50'}`}
                 >
                   Top
                 </button>
               </div>
               
               <div className="flex items-center justify-between text-[10px] font-bold text-white/40 uppercase tracking-widest px-2">
                  <span>{historyTab === 'all' ? 'Bet' : historyTab === 'top' ? 'Rank / Value' : 'Round / Multiplier'}</span>
                  <span>{historyTab === 'all' ? 'Status' : 'Date'}</span>
               </div>
            </div>
            
            <div className="flex-1 space-y-2 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 max-h-[500px]">
               {historyTab === 'all' ? (
                 activeBets.filter(b => b.userId === profile?.uid).map((bet, i) => (
                   <div 
                     key={bet.id || i} 
                     className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:bg-white/5 ${
                       bet.status === 'cashed_out' ? 'bg-[#28a745]/5 border-[#28a745]/10' : 'bg-white/5 border-white/5'
                     }`}
                   >
                     <div className="flex items-center gap-3">
                       <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-[#F27D26]">
                          {(bet.displayName || bet.email || 'P').substring(0, 2).toUpperCase()}
                       </div>
                       <div>
                          <div className="text-xs font-black text-white/80 line-clamp-1 max-w-[80px]">
                            {bet.displayName || (bet.email ? bet.email.split('@')[0] : 'Pilot')}
                          </div>
                          <div className="text-[10px] font-mono text-[#F27D26]">₹{bet.amount}</div>
                       </div>
                     </div>
                     <div className="text-right">
                       {bet.status === 'cashed_out' ? (
                         <div className="flex flex-col items-end">
                            <span className="text-[10px] font-black text-[#28a745] font-mono">{bet.cashoutValue?.toFixed(2)}x</span>
                            <span className="text-[9px] font-black text-white/60 font-mono">₹{bet.winAmount?.toFixed(2)}</span>
                         </div>
                       ) : (
                         <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest italic animate-pulse">Flying...</span>
                       )}
                     </div>
                   </div>
                 ))
               ) : (
                 (historyTab === 'previous' ? history : topHistory).map((h, i) => (
                   <div 
                     key={i} 
                     className={`flex items-center justify-between p-3 rounded-xl border transition-all hover:bg-white/5 ${
                       h.value >= 10 ? 'bg-pink-500/5 border-pink-500/10' : 
                       h.value >= 2 ? 'bg-purple-500/5 border-purple-500/10' :
                       'bg-white/5 border-white/5'
                     }`}
                   >
                     <div className="flex items-center gap-3">
                       <span className="text-[10px] font-mono text-white/20">#{i + 1}</span>
                       <span className={`font-mono font-bold text-sm ${
                         h.value >= 10 ? 'text-pink-500' : 
                         h.value >= 2 ? 'text-purple-400' :
                         'text-white/60'
                       }`}>
                         {h.value.toFixed(2)}x
                       </span>
                     </div>
                     <span className="text-[8px] font-mono text-white/20 uppercase">
                       {h.timestamp ? new Date(h.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                     </span>
                   </div>
                 ))
               )}
               {((historyTab === 'all' ? activeBets : (historyTab === 'previous' ? history : topHistory)).length === 0) && (
                 <div className="text-center py-20 text-white/10 uppercase tracking-widest text-[10px] font-bold italic">
                   {historyTab === 'all' ? 'Waiting for bets...' : 'Gathering flight logs...'}
                 </div>
               )}
            </div>
            
            <div className="mt-auto pt-4 border-t border-white/5 flex items-center justify-between">
               <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Total Win</span>
                  <span className="text-lg font-black text-[#28a745] font-mono">₹{activeBets.reduce((acc, b) => acc + (b.withdrawnAmount || 0), 0).toFixed(2)}</span>
               </div>
               <div className="flex flex-col text-right">
                  <span className="text-[8px] font-bold text-white/20 uppercase tracking-widest">Active Bets</span>
                  <span className="text-lg font-black text-white font-mono">{activeBets.length}</span>
               </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

function BetPanel({ 
  panel, 
  multiplier,
  gameState,
  onAmountChange, 
  onPlaceBet, 
  onCancelBet,
  onCashOut, 
  onToggleAuto, 
  onAutoCashOutChange
}: { 
  panel: any, 
  multiplier: number,
  gameState: string,
  onAmountChange: (v: number) => void, 
  onPlaceBet: () => void, 
  onCancelBet: () => void,
  onCashOut: () => void,
  onToggleAuto: () => void,
  onAutoCashOutChange: (v: number) => void
}) {
  const [activeTab, setActiveTab] = useState<'bet' | 'auto'>('bet');
  const [inputValue, setInputValue] = useState(panel.amount.toString());

  useEffect(() => {
    setInputValue(panel.amount.toString());
  }, [panel.amount]);

  const handleInputChange = (val: string) => {
    setInputValue(val);
    const num = parseInt(val);
    if (!isNaN(num)) {
      onAmountChange(num);
    } else {
      onAmountChange(0);
    }
  };

  return (
    <div className="bg-[#1b1c1d] rounded-xl sm:rounded-2xl p-3 sm:p-4 flex flex-col gap-2 sm:gap-3 border border-white/5">
      <div className="flex bg-black/40 rounded-full p-1 self-center">
        <button 
          onClick={() => setActiveTab('bet')}
          className={`px-6 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'bet' ? 'bg-[#424344] text-white shadow-lg' : 'text-gray-500'}`}
        >
          Bet
        </button>
        <button 
          onClick={() => setActiveTab('auto')}
          className={`px-6 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'auto' ? 'bg-[#424344] text-white shadow-lg' : 'text-gray-500'}`}
        >
          Auto
        </button>
      </div>

      <div className="flex gap-2 sm:gap-3">
        <div className="flex-1 flex flex-col gap-1.5 sm:gap-2">
          <div className="bg-black/40 rounded-lg sm:rounded-xl p-1.5 sm:p-2 flex items-center justify-between border border-white/5">
            <button 
              onClick={() => onAmountChange(Math.max(1, panel.amount - 1))}
              className="p-1 sm:p-1.5 rounded-lg bg-[#424344] text-white hover:bg-white/10 transition-colors"
              disabled={panel.isBetPlaced || panel.isQueued}
            ><Minus className="w-3 h-3"/></button>
            <div className="flex flex-col items-center">
              <input 
                type="text" 
                value={inputValue}
                onChange={(e) => handleInputChange(e.target.value.replace(/[^0-9]/g, ''))}
                className="w-12 sm:w-16 bg-transparent text-center font-bold font-mono outline-none text-base sm:text-lg"
                disabled={panel.isBetPlaced || panel.isQueued}
                placeholder="0"
              />
            </div>
            <button 
              onClick={() => onAmountChange(panel.amount + 1)}
              className="p-1 sm:p-1.5 rounded-lg bg-[#424344] text-white hover:bg-white/10 transition-colors"
              disabled={panel.isBetPlaced || panel.isQueued}
            ><Plus className="w-3 h-3"/></button>
          </div>
          <div className="grid grid-cols-4 sm:grid-cols-2 gap-1.5 sm:gap-2">
            {[10, 50, 100, 500].map(v => (
              <button 
                key={v}
                disabled={panel.isBetPlaced || panel.isQueued}
                onClick={() => onAmountChange(v)}
                className="py-1 rounded-md sm:rounded-lg bg-[#2c2d2e] text-[9px] sm:text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/5 transition-all"
              >{v}</button>
            ))}
          </div>
        </div>

        <div className="w-24 sm:w-32">
          {gameState === 'flying' && panel.isBetPlaced && !panel.hasCashedOut ? (
            <button 
              onClick={onCashOut}
              className="w-full h-full min-h-[60px] sm:min-h-[80px] bg-[#f27d26] hover:bg-[#d66a1a] text-white rounded-xl flex flex-col items-center justify-center p-1 sm:p-2 shadow-[0_4px_20px_rgba(242,125,38,0.3)] border-t border-white/20 active:translate-y-0.5 transition-all text-center leading-tight"
            >
              <div className="text-[10px] sm:text-sm font-black uppercase">Cash Out</div>
              <div className="text-sm sm:text-lg font-black font-mono">{(panel.amount * multiplier).toFixed(2)}</div>
            </button>
          ) : panel.isQueued || (panel.isBetPlaced && (gameState === 'waiting' || gameState === 'crashed')) ? (
              <button 
                disabled={gameState === 'crashed' && !panel.isQueued}
                onClick={onCancelBet}
                className={`w-full h-full min-h-[60px] sm:min-h-[80px] rounded-xl flex flex-col items-center justify-center p-1 sm:p-2 border-t border-white/20 active:translate-y-0.5 transition-all text-center leading-tight
                  ${gameState === 'crashed' && !panel.isQueued ? 'bg-gray-600 opacity-50' : 'bg-[#e91e63] hover:bg-[#d81b60] shadow-[0_4px_20px_rgba(233,30,99,0.3)]'}
                `}
              >
                <div className="text-lg sm:text-xl font-black">Cancel</div>
                <div className="text-[8px] sm:text-[10px] font-bold uppercase opacity-80 mt-0.5 sm:mt-1 leading-none">Waiting...</div>
              </button>
          ) : (
            <button 
              disabled={panel.isBetPlaced && gameState === 'waiting'}
              onClick={onPlaceBet}
              className={`w-full h-full min-h-[60px] sm:min-h-[80px] rounded-xl flex flex-col items-center justify-center p-1 sm:p-2 shadow-lg border-t border-white/20 transition-all active:translate-y-0.5
                ${panel.isBetPlaced && gameState === 'waiting' ? 'bg-gray-600 grayscale opacity-50' : 'bg-gradient-to-b from-[#28a745] to-[#1e7e34] hover:from-[#2ecc71] hover:to-[#27ae60] shadow-[0_4px_20px_rgba(40,167,69,0.3)]'}
              `}
            >
              <div className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-white">Bet</div>
              <div className="text-base sm:text-xl font-black font-mono text-white">₹{panel.amount}</div>
            </button>
          )}
        </div>
      </div>

      {activeTab === 'auto' && (
        <div className="flex flex-col gap-2 pt-2 border-t border-white/5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Repeat className="w-3 h-3" /> Auto Bet
            </span>
            <button 
              onClick={onToggleAuto}
              className={`w-8 h-4 rounded-full relative transition-colors ${panel.isAutoBet ? 'bg-[#28a745]' : 'bg-[#424344]'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${panel.isAutoBet ? 'left-4.5' : 'left-0.5'}`} />
            </button>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1">
              <Zap className="w-3 h-3" /> Auto Cash Out
            </span>
            <div className="flex items-center bg-black/40 rounded-lg px-2 py-1 border border-white/5">
              <input 
                type="number" 
                step="0.01"
                placeholder="0.00"
                value={panel.autoCashOut || ''}
                onChange={(e) => onAutoCashOutChange(parseFloat(e.target.value) || 0)}
                className="w-12 bg-transparent text-right font-bold font-mono outline-none text-xs"
              />
              <span className="text-[10px] ml-1 opacity-40">x</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
