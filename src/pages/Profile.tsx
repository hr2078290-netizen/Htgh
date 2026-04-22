import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, limit, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Diamond, Calendar, Shield, Wallet, Users, Plus, History, ArrowDownLeft, ArrowUpRight, Clock, Zap, User, Edit2, Check, ShieldAlert, Share2, Copy } from 'lucide-react';

export default function Profile() {
  const { profile, user } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(true);
  const [isEditingName, setIsEditingName] = useState(false);
  const [newName, setNewName] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  useEffect(() => {
    if (profile) {
      setNewName(profile.displayName || profile.email.split('@')[0]);
    }
  }, [profile]);

  const handleUpdateName = async () => {
    if (!profile || !newName.trim()) return;
    setIsSavingName(true);
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        displayName: newName.trim()
      });
      setIsEditingName(false);
    } catch (e) {
      console.error("Error updating name:", e);
    } finally {
      setIsSavingName(false);
    }
  };

  useEffect(() => {
    if (!profile) return;

    // Fetch deposits
    const qDeposits = query(
      collection(db, 'deposits'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    // Fetch withdrawals
    const qWithdrawals = query(
      collection(db, 'withdrawals'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );

    const unsubDeposits = onSnapshot(qDeposits, (snap) => {
      const deps = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'deposit' }));
      setTransactions(prev => {
        const others = prev.filter(t => t.type !== 'deposit');
        return [...others, ...deps].sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      });
      setLoadingTransactions(false);
    });

    const unsubWithdrawals = onSnapshot(qWithdrawals, (snap) => {
      const withs = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'withdrawal' }));
      setTransactions(prev => {
        const others = prev.filter(t => t.type !== 'withdrawal');
        return [...others, ...withs].sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      });
      setLoadingTransactions(false);
    });

    return () => {
      unsubDeposits();
      unsubWithdrawals();
    };
  }, [profile]);

  if (!profile) return null;

  return (
    <div className="max-w-7xl mx-auto py-10 px-4">
      <div className="bg-[#1b1c1d] border border-white/10 rounded-[1rem] overflow-hidden shadow-2xl relative">
        <Link 
          to="/play" 
          className="absolute top-4 left-4 z-20 bg-black/40 hover:bg-black/60 backdrop-blur-md border border-white/10 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest text-white/70 hover:text-white transition-all flex items-center gap-2"
        >
          <ArrowDownLeft className="w-4 h-4 rotate-45" /> Back to Game
        </Link>
        {/* Header/Cover */}
        <div className="h-24 bg-gradient-to-r from-[#F27D26] to-[#e91e63] opacity-30 relative">
        </div>

        <div className="px-3 sm:px-8 pb-6 -mt-8 relative z-10">
          <div className="flex flex-col md:flex-row items-center md:items-end gap-3 mb-6 text-center md:text-left">
            <div className="w-16 h-16 rounded-[1.2rem] bg-[#0a0604] border-[4px] border-[#1b1c1d] overflow-hidden flex items-center justify-center shadow-xl">
               <Diamond className="w-8 h-8 text-[#F27D26] drop-shadow-[0_0_15px_rgba(242,125,38,0.5)]" />
            </div>
            <div className="flex-1 pb-1">
               <div className="flex items-center justify-center md:justify-start gap-2">
                 {isEditingName ? (
                   <div className="flex items-center gap-2">
                     <input 
                       value={newName}
                       onChange={(e) => setNewName(e.target.value)}
                       className="bg-black/40 border border-[#F27D26]/50 rounded-lg px-3 py-1 text-white text-xl font-black italic uppercase italic tracking-tighter w-48 outline-none"
                       placeholder="Enter Name"
                       maxLength={16}
                     />
                     <button 
                       disabled={isSavingName}
                       onClick={handleUpdateName}
                       className="p-2 rounded-lg bg-green-500 hover:bg-green-600 text-black transition-all"
                     >
                       <Check className="w-4 h-4" />
                     </button>
                     <button 
                       onClick={() => setIsEditingName(false)}
                       className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all uppercase text-[8px] font-black"
                     >
                       Esc
                     </button>
                   </div>
                 ) : (
                   <>
                     <h1 className="text-2xl font-black tracking-tighter uppercase italic text-white leading-tight">
                       {profile.displayName || profile.email.split('@')[0]}
                     </h1>
                     <button 
                       onClick={() => setIsEditingName(true)}
                       className="p-1 text-white/20 hover:text-[#F27D26] transition-colors"
                     >
                       <Edit2 className="w-3.5 h-3.5" />
                     </button>
                   </>
                 )}
               </div>
               <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-white/40 text-[8px] font-bold uppercase tracking-widest mt-0.5">
                 <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                    <Shield className="w-2.5 h-2.5 text-[#F27D26]"/> {profile.isAdmin ? 'Admin' : 'Member'}
                 </span>
                 <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                    <User className="w-2.5 h-2.5 text-blue-400"/> ID: {profile.numericId || '---'}
                 </span>
                 <span className="flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded-full border border-white/5">
                    <Calendar className="w-2.5 h-2.5 text-purple-400"/> Joined {new Date(profile.createdAt?.seconds * 1000 || Date.now()).toLocaleDateString()}
                 </span>
               </div>
            </div>
            
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex flex-col items-center justify-center min-w-[140px] backdrop-blur-sm">
               <div className="text-[8px] uppercase text-white/30 font-bold mb-0.5 tracking-[0.2em]">Balance</div>
               <div className="text-2xl font-mono font-black text-[#F27D26]">₹{profile.balance.toFixed(2)}</div>
               <div className={`text-[8px] font-black uppercase tracking-[0.2em] mt-0.5 ${profile.status === 'active' ? 'text-green-500' : 'text-red-500'}`}>{profile.status}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {profile.isAdmin && (
              <Link to="/admin" className="flex items-center justify-between p-4 rounded-xl bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition-all group relative overflow-hidden">
                <div className="relative z-10">
                  <div className="text-[8px] font-black uppercase text-purple-500 tracking-widest mb-0.5">Control Center</div>
                  <div className="text-base font-black text-white uppercase italic">Admin Panel</div>
                </div>
                <div className="p-2.5 rounded-lg bg-purple-500 text-white shadow-lg shadow-purple-500/30 group-hover:scale-110 transition-transform relative z-10">
                  <Diamond className="w-4 h-4" />
                </div>
              </Link>
            )}
            
            <Link to="/deposit" className="flex items-center justify-between p-4 rounded-xl bg-green-500/10 border border-green-500/20 hover:bg-green-500/20 transition-all group relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-[8px] font-black uppercase text-green-500 tracking-widest mb-0.5">Cash In</div>
                <div className="text-base font-black text-white uppercase italic">Deposit</div>
              </div>
              <div className="p-2.5 rounded-lg bg-green-500 text-white shadow-lg shadow-green-500/30 group-hover:scale-110 transition-transform relative z-10">
                <Wallet className="w-4 h-4" />
              </div>
            </Link>
            
            <Link to="/withdrawal" className="flex items-center justify-between p-4 rounded-xl bg-[#e91e63]/10 border border-[#e91e63]/20 hover:bg-[#e91e63]/20 transition-all group relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-[8px] font-black uppercase text-[#e91e63] tracking-widest mb-0.5">Cash Out</div>
                <div className="text-base font-black text-white uppercase italic">Withdraw</div>
              </div>
              <div className="p-2.5 rounded-lg bg-[#e91e63] text-white shadow-lg shadow-[#e91e63]/30 group-hover:scale-110 transition-transform relative z-10">
                <Plus className="w-4 h-4" />
              </div>
            </Link>

            <Link to="/transactions" className="flex items-center justify-between p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-all group relative overflow-hidden">
              <div className="relative z-10">
                <div className="text-[8px] font-black uppercase text-blue-500 tracking-widest mb-0.5">Passbook</div>
                <div className="text-base font-black text-white uppercase italic">History</div>
              </div>
              <div className="p-2.5 rounded-lg bg-blue-500 text-white shadow-lg shadow-blue-500/30 group-hover:scale-110 transition-transform relative z-10">
                <History className="w-4 h-4" />
              </div>
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
             {/* Referral & Account Info */}
             <div className="space-y-4">
                <div className="bg-gradient-to-br from-purple-500/10 to-blue-500/10 border border-white/5 rounded-xl p-4 relative overflow-hidden group">
                   <h3 className="text-[9px] font-bold uppercase tracking-widest mb-3 flex items-center gap-2">
                      <Users className="w-3 h-3 text-purple-500" /> Referral
                   </h3>
                   <div className="space-y-4">
                      <div className="flex flex-col gap-3">
                         <div>
                            <div className="text-[8px] text-white/40 uppercase font-bold mb-1">Referral Link</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg font-mono font-bold text-[10px] text-pink-400 truncate">
                                https://{window.location.host}/register?ref={profile.referralCode}
                              </div>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(`https://${window.location.host}/register?ref=${profile.referralCode}`);
                                  alert('Link copied!');
                                }}
                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                         </div>
                         <div>
                            <div className="text-[8px] text-white/40 uppercase font-bold mb-1">My Promo Code</div>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-white/5 border border-white/10 px-3 py-1.5 rounded-lg font-mono font-bold text-base text-purple-400">
                                {profile.referralCode}
                              </div>
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(profile.referralCode || '');
                                  alert('Code copied!');
                                }}
                                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors border border-white/10"
                              >
                                <Plus className="w-3 h-3 rotate-45" />
                              </button>
                            </div>
                         </div>
                      </div>
                      <div className="flex justify-between items-end">
                         <div>
                            <div className="text-[8px] text-white/40 uppercase font-bold mb-0.5">Earnings</div>
                            <div className="text-xl font-mono font-bold text-green-500">₹{profile.referralEarnings?.toFixed(2) || '0.00'}</div>
                         </div>
                      </div>
                   </div>
                </div>
             </div>

             <div className="space-y-4">
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col justify-between">
                   <div>
                      <h3 className="text-[9px] font-bold uppercase tracking-widest mb-3">Account</h3>
                      <div className="space-y-2">
                         <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-[8px] text-white/40 uppercase font-bold">Email</span>
                            <span className="text-[9px] font-mono text-white/60 truncate max-w-[100px]">{profile.email}</span>
                         </div>
                         <div className="flex justify-between items-center py-1.5 border-b border-white/5">
                            <span className="text-[8px] text-white/40 uppercase font-bold">Role</span>
                            <span className="text-[9px] font-bold uppercase text-purple-400">{profile.isAdmin ? 'Admin' : 'User'}</span>
                         </div>
                      </div>
                   </div>

                   <a 
                     href="https://t.me/Jalwa369deposit" 
                     target="_blank" 
                     rel="noopener noreferrer"
                     className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-all font-black uppercase text-[8px] tracking-widest group"
                   >
                     <Zap className="w-3 h-3 group-hover:rotate-12 transition-transform" /> Fast Deposit Support
                   </a>
                </div>
             </div>
          </div>
        </div>
      </div>
    </div>
  );
}
