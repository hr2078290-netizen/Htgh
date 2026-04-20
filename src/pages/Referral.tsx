import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { Users, Copy, CheckCircle2, TrendingUp, DollarSign, Wallet } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Referral() {
  const { profile } = useAuth();
  const [referredUsers, setReferredUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!profile) return;

    const fetchReferredData = async () => {
      try {
        // Step 1: Fetch all users referred by current user
        const q = query(collection(db, 'users'), where('referredBy', '==', profile.uid));
        const userSnap = await getDocs(q);
        
        const users = userSnap.docs.map(doc => ({
          uid: doc.id,
          email: doc.data().email,
          totalDeposited: 0
        }));

        if (users.length === 0) {
          setReferredUsers([]);
          setLoading(false);
          return;
        }

        // Step 2: For each user, fetch their total confirmed deposits
        const updatedUsers = await Promise.all(users.map(async (u) => {
          const dq = query(
            collection(db, 'deposits'), 
            where('userId', '==', u.uid),
            where('status', '==', 'confirmed')
          );
          const dSnap = await getDocs(dq);
          const total = dSnap.docs.reduce((acc, d) => acc + (d.data().amount || 0), 0);
          return { ...u, totalDeposited: total };
        }));

        setReferredUsers(updatedUsers);
      } catch (err) {
        console.error("Error fetching referral data:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchReferredData();
  }, [profile]);

  const copyReferralLink = () => {
    if (!profile) return;
    const link = `${window.location.origin}/register?ref=${profile.referralCode}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-10 px-4 space-y-6 sm:space-y-8 pb-24">
      <div className="text-center">
        <h1 className="text-3xl sm:text-4xl font-black italic uppercase italic tracking-tighter">Referral <span className="text-[#F27D26]">Program</span></h1>
        <p className="text-white/40 text-xs sm:text-sm mt-1 uppercase tracking-widest font-medium">Invite friends & earn rewards together</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
        {/* Referral Earnings Card */}
        <div className="bg-[#1b1c1d] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 bg-[#28a745]/5 blur-3xl rounded-full group-hover:bg-[#28a745]/10 transition-colors" />
          <div className="w-12 h-12 rounded-xl bg-[#28a745]/10 flex items-center justify-center mb-2">
            <TrendingUp className="w-6 h-6 text-[#28a745]" />
          </div>
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Total Earnings</div>
          <div className="text-4xl font-mono font-black text-white">₹{profile.referralEarnings?.toFixed(2) || '0.00'}</div>
          <div className="text-[10px] font-bold text-[#28a745] uppercase tracking-widest mt-1">Ready to use</div>
        </div>

        {/* Total Referrals Card */}
        <div className="bg-[#1b1c1d] border border-white/5 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-2 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 bg-[#F27D26]/5 blur-3xl rounded-full group-hover:bg-[#F27D26]/10 transition-colors" />
          <div className="w-12 h-12 rounded-xl bg-[#F27D26]/10 flex items-center justify-center mb-2">
            <Users className="w-6 h-6 text-[#F27D26]" />
          </div>
          <div className="text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Total Referrals</div>
          <div className="text-4xl font-mono font-black text-white">{referredUsers.length}</div>
          <div className="text-[10px] font-bold text-[#F27D26] uppercase tracking-widest mt-1">Friends joined</div>
        </div>
      </div>

      {/* Referral Link Copy */}
      <div className="bg-[#1b1c1d] border border-white/5 rounded-2xl p-6 space-y-4">
        <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
          <Copy className="w-3.5 h-3.5 text-[#F27D26]" /> Share your link
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 bg-black/40 border border-white/10 px-4 py-3 rounded-xl font-mono text-sm text-white/70 overflow-hidden text-ellipsis whitespace-nowrap">
            {`${window.location.origin}/register?ref=${profile.referralCode}`}
          </div>
          <button 
            onClick={copyReferralLink}
            className={`px-8 py-3 rounded-xl font-black uppercase tracking-widest transition-all active:scale-95 flex items-center justify-center gap-2 ${copied ? 'bg-green-500 text-black' : 'bg-[#F27D26] text-white hover:bg-[#ff8c3a]'}`}
          >
            {copied ? (
              <><CheckCircle2 className="w-5 h-5" /> Copied!</>
            ) : (
              <><Copy className="w-5 h-5" /> Copy Link</>
            )}
          </button>
        </div>
      </div>

      {/* Referred Users List */}
      <div className="bg-[#1b1c1d] border border-white/5 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-xs font-black uppercase tracking-widest">My Referrals</h3>
          <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">{referredUsers.length} Users</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-black/20 text-[9px] font-bold uppercase text-white/30">
              <tr>
                <th className="px-6 py-4">User ID</th>
                <th className="px-6 py-4 text-right">Deposited</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={2} className="px-6 py-20 text-center text-white/20 font-black uppercase tracking-widest text-[10px] animate-pulse">Loading data...</td>
                </tr>
              ) : referredUsers.length > 0 ? (
                referredUsers.map((u, i) => (
                  <tr key={u.uid} className="hover:bg-white/5 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                         <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-[#F27D26]">
                            {u.email.substring(0, 2).toUpperCase()}
                         </div>
                         <div>
                            <div className="text-xs font-black text-white/80">{u.email.split('@')[0]}</div>
                            <div className="text-[10px] font-mono text-white/20">ID: {u.uid.substring(0, 8)}</div>
                         </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <span className="text-sm font-mono font-black text-[#28a745]">₹{u.totalDeposited.toFixed(2)}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={2} className="px-6 py-20 text-center text-white/10 uppercase tracking-widest text-[10px] font-bold italic">No referrals yet. Start sharing to earn!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
