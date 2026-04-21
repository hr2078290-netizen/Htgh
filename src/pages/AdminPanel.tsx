import { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc, collection, query, orderBy, getDocs, getDoc, setDoc, increment, where, limit } from 'firebase/firestore';
import { Settings, Users, Wallet, Check, X, AlertCircle, TrendingUp, ShieldCheck, Share2, Lock, Plane, Camera, Upload, Search, History } from 'lucide-react';
import { GameSettings, DepositRequest, WithdrawalRequest, UserProfile, GameHistoryEntry } from '../types';
import { useAuth } from '../lib/AuthContext';

export default function AdminPanel() {
  const { profile } = useAuth();
  const [settings, setSettings] = useState<GameSettings>({ nextCrashValue: 1.5, currentUpiId: '', currentQrCode: '', depositBonusPercentage: 0 });
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [activeTab, setActiveTab] = useState<'settings' | 'deposits' | 'withdrawals' | 'users' | 'live' | 'referrals'>('settings');
  const [activeBets, setActiveBets] = useState<any[]>([]);
  const [history, setHistory] = useState<GameHistoryEntry[]>([]);
  const [localNextValue, setLocalNextValue] = useState<string>('');

  // Secret Admin Logic
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminId, setAdminId] = useState('');
  const [adminPass, setAdminPass] = useState('');
  const [roundNumber, setRoundNumber] = useState(1);
  const [currentMultiplier, setCurrentMultiplier] = useState(1.0);

  const handleAdminLogin = (e: any) => {
    e.preventDefault();
    if (adminId === 'JaiKhatuShyamji' && adminPass === 'Honey@musicTH') {
      setIsAdminLoggedIn(true);
      localStorage.setItem('adminAuth', 'true');
    } else {
      alert('Invalid Admin Credentials');
    }
  };

  // Sync game state from SSE Stream (Solves Quota Error)
  useEffect(() => {
    const eventSource = new EventSource('/api/game/stream');

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (!data) return;

      setSettings(prev => ({
        ...prev,
        gameState: data.status,
        startTime: data.startTime,
        nextTransitionTime: data.nextTransitionTime,
        countdownEndTime: data.countdownEndTime,
        lastFinalValue: data.lastFinalValue,
        nextCrashValue: data.nextCrashValue,
        isManualMode: data.isManualMode,
        manualOverrideNextValue: data.manualOverrideNextValue
      }));
      
      setRoundNumber(data.currentRound);
      setCurrentMultiplier(data.multiplier);
      setActiveBets(data.activeBets || []);
      setHistory(data.history || []);
      
      // Update local if empty (sync)
      if (data.nextCrashValue !== undefined) {
        setLocalNextValue(prev => (prev === '' ? String(data.nextCrashValue) : prev));
      }
    };

    const unsubDeposits = onSnapshot(query(collection(db, 'deposits'), orderBy('timestamp', 'desc')), (snap) => {
      const d: DepositRequest[] = [];
      snap.forEach(docSnap => d.push({ id: docSnap.id, ...docSnap.data() } as DepositRequest));
      setDeposits(d);
    });

    const unsubWithdrawals = onSnapshot(query(collection(db, 'withdrawals'), orderBy('timestamp', 'desc')), (snap) => {
      const w: WithdrawalRequest[] = [];
      snap.forEach(docSnap => w.push({ id: docSnap.id, ...docSnap.data() } as WithdrawalRequest));
      setWithdrawals(w);
    });

    const unsubUsers = onSnapshot(query(collection(db, 'users'), orderBy('createdAt', 'desc')), (snap) => {
      const u: UserProfile[] = [];
      snap.forEach(docSnap => u.push(docSnap.data() as UserProfile));
      setAllUsers(u);
    });

    return () => {
      eventSource.close();
      unsubDeposits();
      unsubWithdrawals();
      unsubUsers();
    };
  }, []);

  const updateSettings = async (field: string, value: any) => {
    try {
      // 1. Update In-Memory via API (Fast & Quota-Free)
      await fetch('/api/admin/game-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field, value })
      });

      // 2. Also persist to Firestore for reboot persistence (Slow & Quota-Heavy, but rare)
      await updateDoc(doc(db, 'settings', 'config'), { [field]: value }).catch(() => {});
    } catch (e) {
      console.error("Config update error:", e);
    }
  };

  const handleImageUpload = (e: any, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1024 * 1024) { // 1MB limit for Firestore
        alert('File size too large. Please use an image under 1MB.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        updateSettings(field, reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDepositAction = async (deposit: DepositRequest, status: 'approved' | 'rejected') => {
    if (!deposit.id) return;
    try {
      await updateDoc(doc(db, 'deposits', deposit.id), { status });
      if (status === 'approved') {
        const bonusAmount = (deposit.amount * (settings.depositBonusPercentage || 0)) / 100;
        const totalCredit = deposit.amount + bonusAmount;
        
        await updateDoc(doc(db, 'users', deposit.userId), {
          balance: increment(totalCredit)
        });

        // Referral logic: 20% to referrer
        const userDoc = await getDoc(doc(db, 'users', deposit.userId));
        if (userDoc.exists()) {
          const userData = userDoc.data() as UserProfile;
          if (userData.referredBy) {
            const referralBonus = deposit.amount * 0.20;
            await updateDoc(doc(db, 'users', userData.referredBy), {
              referralBalance: increment(referralBonus),
              referralEarnings: increment(referralBonus)
            });
          }
        }
      }
    } catch (e) { console.error(e); }
  };

  const handleWithdrawalAction = async (withdrawal: WithdrawalRequest, status: 'approved' | 'rejected') => {
    if (!withdrawal.id) return;
    try {
      await updateDoc(doc(db, 'withdrawals', withdrawal.id), { status });
      if (status === 'rejected') {
        // Refund if rejected
        await updateDoc(doc(db, 'users', withdrawal.userId), {
          balance: increment(withdrawal.amount)
        });
      }
    } catch (e) { console.error(e); }
  };

  const toggleBan = async (user: UserProfile) => {
    const newStatus = user.status === 'active' ? 'banned' : 'active';
    await updateDoc(doc(db, 'users', user.uid), { status: newStatus });
  };

  const toggleAdmin = async (user: UserProfile) => {
    const newAdmin = !user.isAdmin;
    await updateDoc(doc(db, 'users', user.uid), { isAdmin: newAdmin });
    // Also update admins collection for rules
    if (newAdmin) {
      await setDoc(doc(db, 'admins', user.uid), { uid: user.uid });
    } else {
      // We don't have a direct delete tool here easily, but we can set to false or use a field 
      // but the rules check 'exists()'. Better to manage via console or just inform.
    }
  };

  const renderLogin = () => (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-blue-900/20 via-transparent to-transparent" />
        <div className="grid grid-cols-12 h-full gap-4 p-4">
          {Array.from({ length: 144 }).map((_, i) => (
             <div key={i} className="w-1 h-1 bg-white/10 rounded-full" />
          ))}
        </div>
      </div>

      <div className="w-full max-w-sm bg-black border border-white/10 rounded-[2.5rem] p-10 shadow-[0_0_100px_rgba(30,58,138,0.2)] relative overflow-hidden backdrop-blur-3xl">
        <div className="absolute -top-20 -right-20 w-40 h-40 bg-blue-500/10 blur-[80px]" />
        <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-blue-500/10 blur-[80px]" />
        
        <div className="text-center mb-10 relative z-10">
          <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-3xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-blue-500/40 transform rotate-3 hover:rotate-6 transition-transform">
             <ShieldCheck className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-white mb-2">Even Vessis Login</h2>
          <p className="text-white/40 text-[10px] font-bold tracking-widest leading-loose">USE YOUR USERNAME AND PASSWORD TO LOGIN</p>
        </div>

        <form onSubmit={handleAdminLogin} className="space-y-6 relative z-10">
          <div className="space-y-2">
            <div className="relative group">
              <Users className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="text" required
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white/10 transition-all text-white placeholder:text-white/10"
                placeholder="Manager ID"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <div className="relative group">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 group-focus-within:text-blue-500 transition-colors" />
              <input 
                type="password" required
                value={adminPass}
                onChange={(e) => setAdminPass(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-sm font-bold outline-none focus:border-blue-500 focus:bg-white/10 transition-all text-white font-mono placeholder:text-white/10"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest py-4 rounded-2xl shadow-[0_8px_30px_rgba(37,99,235,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2 group">
            Sign In <Check className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
          
          <div className="text-center">
            <button type="button" className="text-blue-500/40 hover:text-blue-500 text-[10px] font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-1 mx-auto">
               <AlertCircle className="w-3 h-3" /> Forgot Password?
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (!isAdminLoggedIn && profile?.email !== 'hr2078290@gmail.com') {
    return renderLogin();
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row items-center justify-between border-b border-white/10 pb-6 gap-6">
        <div>
          <h1 className="text-4xl font-black italic uppercase tracking-tighter">Control <span className="text-purple-500">Center</span></h1>
          <p className="text-white/40 text-sm font-medium uppercase tracking-widest mt-1">Global Game Administrative Override</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
           <button onClick={() => setActiveTab('settings')} className={`p-3 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-purple-500 text-white shadow-lg shadow-purple-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
             <Settings className="w-5 h-5 sm:w-6 sm:h-6"/>
           </button>
           <button onClick={() => setActiveTab('deposits')} className={`p-3 rounded-xl transition-all relative ${activeTab === 'deposits' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
             <Wallet className="w-5 h-5 sm:w-6 sm:h-6"/>
             {deposits.filter(d => d.status === 'pending').length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">!</span>}
           </button>
           <button onClick={() => setActiveTab('withdrawals')} className={`p-3 rounded-xl transition-all relative ${activeTab === 'withdrawals' ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
             <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6"/>
             {withdrawals.filter(w => w.status === 'pending').length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center font-bold">!</span>}
           </button>
           <button onClick={() => setActiveTab('live')} className={`p-3 rounded-xl transition-all ${activeTab === 'live' ? 'bg-red-500 text-white shadow-lg shadow-red-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
             <AlertCircle className="w-5 h-5 sm:w-6 sm:h-6"/>
           </button>
           <button onClick={() => setActiveTab('referrals')} className={`p-3 rounded-xl transition-all ${activeTab === 'referrals' ? 'bg-pink-500 text-white shadow-lg shadow-pink-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
             <Share2 className="w-5 h-5 sm:w-6 sm:h-6"/>
           </button>
           <button onClick={() => setActiveTab('users')} className={`p-3 rounded-xl transition-all ${activeTab === 'users' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
             <Users className="w-5 h-5 sm:w-6 sm:h-6"/>
           </button>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-3xl p-8 min-h-[60vh]">
        {activeTab === 'settings' && (
          <div className="max-w-xl space-y-8">
              <div className="space-y-4">
                <div className="flex bg-white/5 rounded-2xl p-1 gap-1">
                  <button 
                    onClick={() => updateSettings('isManualMode', false)}
                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${!settings.isManualMode ? 'bg-purple-600 text-white shadow-lg' : 'text-white/40 hover:bg-white/5'}`}
                  >
                    Random Mode
                  </button>
                  <button 
                    onClick={() => updateSettings('isManualMode', true)}
                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${settings.isManualMode ? 'bg-blue-600 text-white shadow-lg' : 'text-white/40 hover:bg-white/5'}`}
                  >
                    Manual Mode
                  </button>
                </div>

                {settings.gameState === 'flying' && (
                  <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div>
                       <div className="text-[10px] font-bold text-red-500 uppercase tracking-widest mb-1">Game is Flying!</div>
                       <div className="text-4xl font-black text-white font-mono">{currentMultiplier.toFixed(2)}<span className="text-red-500 text-2xl">x</span></div>
                    </div>
                    <button 
                      onClick={async () => {
                        const safetyVal = Math.floor(currentMultiplier * 100) / 100;
                        await updateSettings('nextCrashValue', safetyVal);
                        await updateSettings('manualOverrideNextValue', safetyVal);
                        alert(`Signal sent! Game will crash shortly at ~${safetyVal}x`);
                      }}
                      className="bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-xl font-black uppercase tracking-widest shadow-xl shadow-red-600/30 flex items-center gap-2 group active:scale-95 transition-all"
                    >
                      <Plane className="w-5 h-5 group-hover:-translate-y-1 group-hover:translate-x-1 transition-transform" /> Manual Crash Now
                    </button>
                  </div>
                )}

                <label className="text-xs font-bold uppercase text-white/40 tracking-widest flex items-center justify-between">
                  <div className="flex items-center gap-2"><AlertCircle className="w-4 h-4" /> Next Crash Multiplier (Any Value)</div>
                  <div className="flex items-center gap-4">
                    {settings.manualOverrideNextValue && (
                      <div className="text-[10px] bg-red-500/20 text-red-500 px-3 py-1 rounded-full border border-red-500/20 animate-pulse font-bold flex items-center gap-1">
                        <Lock className="w-3 h-3" /> Upcoming Manual Override: {settings.manualOverrideNextValue}x
                      </div>
                    )}
                    {!settings.isManualMode && (
                      <div className="text-[10px] bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full border border-blue-500/20 font-bold flex items-center gap-1">
                        <TrendingUp className="w-3 h-3" /> Next Random: {settings.nextCrashValue}x
                      </div>
                    )}
                    <div className="text-[10px] text-white/30 uppercase tracking-widest flex items-center gap-1.5 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                      <Users className="w-3 h-3 text-purple-400" /> {activeBets.length} Active Bets
                    </div>
                  </div>
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input 
                      type="text"
                      value={localNextValue}
                      onChange={(e) => setLocalNextValue(e.target.value.replace(/[^0-9.]/g, ''))}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 pr-20 text-5xl font-mono font-bold text-purple-400 outline-none focus:border-purple-500/50"
                      placeholder="1.00"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-2xl font-bold text-white/20">X</span>
                  </div>
                  <button 
                    onClick={() => {
                      const val = parseFloat(localNextValue);
                      if (!isNaN(val) && val >= 1.01) {
                        updateSettings('nextCrashValue', val);
                        updateSettings('manualOverrideNextValue', val); // New field for server to pick up
                        alert(`Multiplier set to ${val}x`);
                        setLocalNextValue(''); // Reset local to sync next round
                      }
                    }}
                    className="px-8 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest rounded-2xl py-6 shadow-lg shadow-purple-600/20 active:scale-95 transition-all"
                  >
                    Apply Now
                  </button>
                </div>

                <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-xl space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-purple-400 font-bold uppercase text-xs tracking-widest">
                      <Users className="w-4 h-4" /> Live Bets Round {roundNumber}
                    </div>
                    <span className="text-2xl font-black text-white font-mono">{activeBets.length}</span>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-purple-500/20">
                    <div className="flex items-center gap-2 text-white/40 font-bold uppercase text-[10px] tracking-widest">
                      Total Bet Amount
                    </div>
                    <span className="text-xl font-black text-blue-400 font-mono">₹{activeBets.reduce((acc, b) => acc + (b.amount || 0), 0).toFixed(2)}</span>
                  </div>
                </div>
                
                {activeBets.length > 0 && settings.gameState === 'flying' && (
                  <div className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-2">
                    <div className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-2 px-1">Detailed Bet List (Flying)</div>
                    {activeBets.map(bet => (
                      <div key={bet.id} className="flex items-center justify-between text-xs font-mono border-b border-white/5 pb-2 last:border-0">
                         <div className="text-white/60 truncate w-32">{bet.email}</div>
                         <div className="font-bold text-[#F27D26]">₹{bet.amount}</div>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex flex-wrap gap-2 pt-2">
                   {[1.1, 1.5, 2.0, 5.0, 10.0, 25.0, 50.0, 100.0].map(val => (
                     <button 
                       key={val}
                       onClick={() => updateSettings('nextCrashValue', val)}
                       className={`px-4 py-2 rounded-lg text-xs font-bold font-mono transition-all border ${settings.nextCrashValue === val ? 'bg-purple-500 text-white border-purple-400 shadow-lg shadow-purple-500/30' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10 hover:text-white'}`}
                     >
                       {val.toFixed(2)}x
                     </button>
                   ))}
                </div>
                <div className="bg-black/20 p-4 rounded-xl space-y-2 border border-white/5">
                   <p className="text-[10px] text-white/60 font-medium uppercase tracking-wider">Mode Guide:</p>
                   <p className="text-[10px] text-white/30 italic uppercase tracking-wider">• <span className="text-purple-400 font-bold">Random Mode:</span> Game results are calculated automatically after each round. (Realistic)</p>
                   <p className="text-[10px] text-white/30 italic uppercase tracking-wider">• <span className="text-blue-400 font-bold">Manual Mode:</span> Game results strictly follow the value you enter above. It will not change automatically for the next round. (Controlled)</p>
                </div>

                <div className="pt-4">
                   <button 
                     onClick={async () => {
                       if (confirm('Are you sure you want to force reset the game state?')) {
                         await updateSettings('gameState', 'waiting');
                         await updateSettings('countdownEndTime', new Date(Date.now() + 10000));
                         await updateSettings('startTime', null);
                       }
                     }}
                     className="w-full py-3 rounded-xl bg-red-500/10 text-red-500 border border-red-500/20 text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all"
                   >
                     Force Emergency Reset Game
                   </button>
                </div>
                
                <div className="pt-6 border-t border-white/5 space-y-4">
                  <label className="text-xs font-bold uppercase text-white/40 tracking-widest flex items-center gap-2">
                    Deposit Bonus Percentage (%)
                  </label>
                  <input 
                    type="number" 
                    value={settings.depositBonusPercentage}
                    onChange={(e) => updateSettings('depositBonusPercentage', parseInt(e.target.value) || 0)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none font-mono text-sm"
                  />
                  <p className="text-[10px] text-white/30 italic uppercase tracking-wider">This bonus is automatically added to the user's balance upon deposit approval.</p>
                </div>
              </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-6 border-t border-white/5">
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-white/40">Manual UPI ID</label>
                  <input 
                    type="text" 
                    value={settings.currentUpiId}
                    onChange={(e) => updateSettings('currentUpiId', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-4 outline-none font-mono text-sm"
                    placeholder="example@upi"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase text-white/40">Upload QR Code Image</label>
                  <label className="flex flex-col items-center justify-center w-full h-32 bg-white/5 border-2 border-dashed border-white/10 rounded-xl cursor-pointer hover:bg-white/10 transition-all overflow-hidden group">
                     {settings.currentQrCode ? (
                       <img src={settings.currentQrCode} className="w-full h-full object-contain opacity-50 group-hover:opacity-100 transition-opacity" referrerPolicy="no-referrer" />
                     ) : (
                       <div className="flex flex-col items-center justify-center pt-5 pb-6">
                         <Upload className="w-8 h-8 text-white/20 mb-2" />
                         <p className="text-[10px] text-white/40 font-bold uppercase tracking-widest">Click to upload QR</p>
                       </div>
                     )}
                     <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'currentQrCode')} />
                  </label>
                  <input 
                    type="text" 
                    value={settings.currentQrCode}
                    onChange={(e) => updateSettings('currentQrCode', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl p-3 outline-none font-mono text-[10px] text-white/20"
                    placeholder="Or paste URL here"
                  />
                </div>
             </div>
          </div>
        )}

        {activeTab === 'deposits' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6"><Wallet className="text-green-500"/> Pending Deposits</h2>
            {deposits.length === 0 && <div className="text-center py-20 text-white/20 uppercase tracking-widest font-bold">No Deposit Requests</div>}
            <div className="grid grid-cols-1 gap-4">
              {deposits.map(d => (
                <div key={d.id} className="flex flex-col sm:flex-row items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl gap-4">
                  <div className="flex-1">
                    <div className="text-xs text-white/40 font-mono mb-1">{d.userId}</div>
                    <div className="text-2xl font-black text-green-500">₹{d.amount}</div>
                    <div className="text-xs uppercase font-bold tracking-widest mt-1">TXN: <span className="text-white/60">{d.transactionId}</span></div>
                    {d.proofUrl && (
                      <div className="mt-3 flex items-end gap-3">
                        <div>
                          <div className="text-[8px] uppercase font-bold text-white/20 mb-1">Payment Proof:</div>
                          <div className="relative group w-32 h-32">
                            <img src={d.proofUrl} className="w-full h-full object-cover rounded-lg border border-white/10" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg">
                               <Search className="w-8 h-8 text-white" />
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                           <a 
                             href={d.proofUrl} 
                             target="_blank" 
                             className="text-[10px] font-bold uppercase tracking-widest bg-blue-500/10 text-blue-400 border border-blue-500/20 px-3 py-1.5 rounded-lg hover:bg-blue-500 hover:text-white transition-all flex items-center gap-1.5"
                           >
                             <Share2 className="w-3 h-3" /> View Large
                           </a>
                           <a 
                             href={d.proofUrl} 
                             download={`proof-${d.transactionId}.png`}
                             className="text-[10px] font-bold uppercase tracking-widest bg-white/5 text-white/40 border border-white/10 px-3 py-1.5 rounded-lg hover:bg-white/10 hover:text-white transition-all flex items-center gap-1.5"
                           >
                             <TrendingUp className="w-3 h-3 transform rotate-180" /> Download
                           </a>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {d.status === 'pending' ? (
                      <>
                        <button onClick={() => handleDepositAction(d, 'approved')} className="bg-green-500 py-3 px-6 rounded-xl font-bold flex items-center gap-2"><Check className="w-5 h-5"/> Approve</button>
                        <button onClick={() => handleDepositAction(d, 'rejected')} className="bg-white/10 py-3 px-6 rounded-xl font-bold flex items-center gap-2 hover:bg-red-500/20 text-red-500 transition-colors"><X className="w-5 h-5"/> Reject</button>
                      </>
                    ) : (
                      <span className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest ${d.status === 'approved' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{d.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'withdrawals' && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6"><TrendingUp className="text-yellow-500"/> Withdrawal Requests</h2>
            {withdrawals.length === 0 && <div className="text-center py-20 text-white/20 uppercase tracking-widest font-bold">No Withdrawal Requests</div>}
            <div className="grid grid-cols-1 gap-4">
              {withdrawals.map(w => (
                <div key={w.id} className="flex flex-col sm:flex-row items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl gap-4">
                    <div className="flex-1">
                       <div className="text-xs text-white/40 font-mono mb-1">{w.userId}</div>
                       <div className="text-2xl font-black text-yellow-500">₹{w.amount}</div>
                       {w.details ? (
                         <div className="mt-2 p-3 bg-black/40 rounded-xl space-y-1 text-[10px] font-mono border border-white/5 uppercase">
                           <div className="text-yellow-500/60 flex justify-between">NAME: <span className="text-white">{w.details.fullName}</span></div>
                           <div className="text-blue-400/60 flex justify-between">PHONE: <span className="text-white">{w.details.phone}</span></div>
                           <div className="text-green-500/60 flex justify-between">UPI: <span className="text-white">{w.details.upiId}</span></div>
                         </div>
                       ) : (
                         <div className="text-xs uppercase font-bold tracking-widest mt-1">UPI ID: <span className="text-white/60">{w.upiId}</span></div>
                       )}
                    </div>
                  <div className="flex gap-2">
                    {w.status === 'pending' ? (
                      <>
                        <button onClick={() => handleWithdrawalAction(w, 'approved')} className="bg-yellow-500 text-black py-3 px-6 rounded-xl font-bold flex items-center gap-2"><Check className="w-5 h-5"/> Mark Paid</button>
                        <button onClick={() => handleWithdrawalAction(w, 'rejected')} className="bg-white/10 py-3 px-6 rounded-xl font-bold flex items-center gap-2 hover:bg-red-500/20 text-red-500 transition-colors"><X className="w-5 h-5"/> Reject & Refund</button>
                      </>
                    ) : (
                      <span className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest ${w.status === 'approved' ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'}`}>{w.status}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'live' && (
           <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <h2 className="text-xl font-bold flex items-center gap-2"><AlertCircle className="text-red-500"/> Live Round Monitoring</h2>
                <div className="flex items-center gap-4">
                   {settings.gameState === 'flying' && (
                     <div className="bg-red-500 text-white font-black font-mono px-6 py-2 rounded-xl text-3xl shadow-lg shadow-red-500/30 animate-pulse">
                       {currentMultiplier.toFixed(2)}x
                     </div>
                   )}
                   <div className="bg-red-500/10 border border-red-500/20 px-4 py-2 rounded-xl text-red-500 font-bold font-mono">
                     {activeBets.length} Active Bets
                   </div>
                </div>
              </div>

              {settings.gameState === 'flying' && (
                <div className="bg-white/5 border border-white/10 p-4 rounded-2xl flex items-center justify-between">
                   <div className="text-white/40 text-xs font-bold uppercase tracking-widest">Immediate Management:</div>
                   <button 
                      onClick={async () => {
                        const safetyVal = Math.floor(currentMultiplier * 100) / 100;
                        await updateSettings('nextCrashValue', safetyVal);
                        await updateSettings('manualOverrideNextValue', safetyVal);
                        alert(`Crash command sent for round ${roundNumber}`);
                      }}
                      className="bg-red-600 hover:bg-red-500 text-white text-[10px] font-black px-6 py-2 rounded-lg uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-red-600/20"
                   >
                     Force Crash Current Round
                   </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {settings.gameState === 'flying' ? (
                  activeBets.map(bet => (
                    <div key={bet.id} className="bg-white/5 border border-white/10 p-5 rounded-2xl relative overflow-hidden group">
                       <div className="absolute top-0 right-0 w-16 h-16 bg-red-500/5 blur-2xl group-hover:bg-red-500/10 transition-all" />
                       <div className="text-[10px] font-mono text-white/30 truncate mb-1">{bet.email}</div>
                       <div className="text-2xl font-black text-white">₹{bet.amount}</div>
                       <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold tracking-widest bg-white/10 px-2 py-0.5 rounded">Panel {bet.panel}</span>
                          <span className="text-[10px] font-mono text-white/20 capitalize italic">Realtime bet</span>
                       </div>
                    </div>
                  ))
                ) : (
                  <div className="col-span-full py-20 text-center opacity-20 uppercase tracking-[0.4em] font-black text-4xl">
                    {settings.gameState === 'waiting' ? 'Waiting for takeoff...' : 'Round Crashed'}
                  </div>
                )}
                {settings.gameState === 'flying' && activeBets.length === 0 && (
                  <div className="col-span-full py-20 text-center opacity-20 uppercase tracking-[0.4em] font-black text-4xl">
                    No active bets flying
                  </div>
                )}
              </div>

              <div className="mt-8">
                <h3 className="text-sm font-bold uppercase text-white/40 tracking-widest mb-4 flex items-center gap-2">
                  <History className="w-4 h-4" /> Recent Round Results
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                  {history.map((round, i) => (
                    <div key={i} className="bg-white/5 border border-white/10 p-3 rounded-xl flex flex-col items-center justify-center gap-1 group hover:border-purple-500/50 transition-all">
                      <span className={`text-sm font-black font-mono ${round.value >= 2 ? 'text-purple-400' : 'text-blue-400'}`}>
                        {round.value.toFixed(2)}x
                      </span>
                      <span className="text-[8px] text-white/20 font-bold uppercase">Round {round.round}</span>
                    </div>
                  ))}
                  {history.length === 0 && (
                    <div className="col-span-full py-10 text-center text-white/10 uppercase text-[10px] font-bold tracking-widest border border-dashed border-white/10 rounded-2xl">
                      No results history found
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 p-6 bg-red-500/5 border border-red-500/10 rounded-3xl">
                <div className="flex items-center gap-3 mb-2 text-red-400">
                  <ShieldCheck className="w-5 h-5" />
                  <h3 className="font-bold uppercase tracking-wider text-sm">Revenue Risk Control</h3>
                </div>
                <p className="text-xs text-white/40 leading-relaxed">
                  Total Exposure: <span className="text-white font-bold font-mono">₹{activeBets.reduce((acc, b) => acc + b.amount, 0).toFixed(2)}</span>. 
                  Adjust the <span className="text-purple-400 font-bold">Next Crash Multiplier</span> in Settings to manage round outcome.
                </p>
              </div>
           </div>
        )}

        {activeTab === 'referrals' && (
          <div className="space-y-6">
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6"><Share2 className="text-pink-500"/> Referral Management</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-white/5 text-[10px] uppercase font-bold text-white/40 tracking-[0.2em]">
                    <th className="pb-4">User</th>
                    <th className="pb-4">Referral Code</th>
                    <th className="pb-4">Sub-Users</th>
                    <th className="pb-4">Total Earnings</th>
                    <th className="pb-4">Current Bonus</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {allUsers.map(u => {
                    const subUsersCount = allUsers.filter(user => user.referredBy === u.uid).length;
                    return (
                      <tr key={u.uid} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                        <td className="py-4">
                           <div className="font-bold">{u.email}</div>
                           <div className="text-[10px] font-mono text-white/30">{u.uid}</div>
                        </td>
                        <td className="py-4">
                           <code className="bg-white/5 px-2 py-1 rounded text-pink-500 font-bold">{u.referralCode}</code>
                        </td>
                        <td className="py-4">
                           <div className="flex items-center gap-2">
                             <Users className="w-3 h-3 text-blue-400" />
                             <span className="font-bold">{subUsersCount}</span>
                           </div>
                        </td>
                        <td className="py-4 font-mono font-bold text-green-500">₹{u.referralEarnings?.toFixed(2) || '0.00'}</td>
                        <td className="py-4 font-mono font-bold text-pink-400">₹{u.referralBalance?.toFixed(2) || '0.00'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
           <div className="overflow-x-auto">
             <table className="w-full text-left">
               <thead>
                 <tr className="border-b border-white/5 text-[10px] uppercase font-bold text-white/40 tracking-[0.2em]">
                   <th className="pb-4">Email / ID</th>
                   <th className="pb-4">Balance</th>
                   <th className="pb-4">Status</th>
                   <th className="pb-4 text-right">Actions</th>
                 </tr>
               </thead>
               <tbody className="text-sm">
                 {allUsers.map(u => (
                   <tr key={u.uid} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                     <td className="py-4">
                        <div className="font-bold">{u.email}</div>
                        <div className="text-[10px] font-mono text-white/30">{u.uid}</div>
                     </td>
                     <td className="py-4 font-mono font-bold text-[#F27D26]">₹{u.balance.toFixed(2)}</td>
                     <td className="py-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-widest ${u.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                          {u.status}
                        </span>
                     </td>
                     <td className="py-4 text-right space-x-2">
                        <button 
                          onClick={async () => {
                            if(confirm(`Add 5,000 INR to ${u.email}?`)) {
                              await updateDoc(doc(db, 'users', u.uid), { balance: increment(5000) });
                              alert('Balance added!');
                            }
                          }}
                          className="p-2 rounded bg-green-500/10 hover:bg-green-500 text-green-500 hover:text-white transition-all font-bold uppercase text-[10px]"
                        >
                          +5k
                        </button>
                        <button onClick={() => toggleBan(u)} className="p-2 rounded bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500 transition-all font-bold uppercase text-[10px]">
                          {u.status === 'active' ? 'Ban' : 'Unban'}
                        </button>
                        <button onClick={() => toggleAdmin(u)} className={`p-2 rounded transition-all font-bold uppercase text-[10px] ${u.isAdmin ? 'bg-purple-500 text-white' : 'bg-white/5 text-white/40 hover:bg-purple-500/20'}`}>
                          {u.isAdmin ? 'Admin' : 'Make Admin'}
                        </button>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        )}
      </div>
    </div>
  );
}
