import React, { useState } from 'react';
import { db } from '../lib/firebase';
import { useAuth } from '../lib/AuthContext';
import { addDoc, collection, serverTimestamp, updateDoc, doc, increment } from 'firebase/firestore';
import { TrendingUp, Wallet, AlertCircle, Check } from 'lucide-react';

export default function Withdrawal() {
  const { user, profile } = useAuth();
  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [upiConfirm, setUpiConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const [withdrawDetails, setWithdrawDetails] = useState({
    fullName: '',
    phone: '',
    upiId: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    const withdrawAmount = parseFloat(amount);
    
    if (withdrawAmount > profile.balance) {
      alert('Insufficient balance');
      return;
    }

    if (withdrawDetails.phone.length !== 10) {
      alert('Mobile number must be exactly 10 digits');
      return;
    }

    if (withdrawDetails.upiId !== upiConfirm) {
      alert('UPI IDs do not match');
      return;
    }

    setLoading(true);
    try {
      // Deduct balance immediately
      await updateDoc(doc(db, 'users', user.uid), {
        balance: increment(-withdrawAmount)
      });

      await addDoc(collection(db, 'withdrawals'), {
        userId: user.uid,
        userEmail: user.email,
        amount: withdrawAmount,
        upiId: withdrawDetails.upiId,
        details: withdrawDetails,
        status: 'pending',
        timestamp: serverTimestamp()
      });
      
      setSuccess(true);
      setAmount('');
      setWithdrawDetails({ fullName: '', phone: '', upiId: '' });
      setUpiConfirm('');
    } catch (e) {
      alert('Failed to submit request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-black italic uppercase tracking-tighter">Fast <span className="text-yellow-500">Withdraw</span></h1>
        <p className="text-white/40 text-[10px] sm:text-xs mt-1 uppercase tracking-widest font-bold">Withdraw your winnings via UPI instantly</p>
      </div>

      <div className="bg-[#1b1c1d] border border-white/10 rounded-3xl p-6 sm:p-8 relative overflow-hidden">
        {success ? (
          <div className="text-center py-6">
            <div className="bg-yellow-500 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-black" />
            </div>
            <h3 className="text-xl font-bold">Request Submitted</h3>
            <p className="text-white/40 text-sm mt-3 font-medium uppercase tracking-widest">Winnings will be credited to your account within 30 minutes.</p>
            <button onClick={() => setSuccess(false)} className="mt-8 text-yellow-500 font-bold uppercase text-xs tracking-[0.2em] border-b border-yellow-500/50">New Withdrawal</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-gradient-to-br from-[#f27d26]/10 to-transparent p-5 rounded-2xl border border-white/5 flex items-center justify-between">
               <div>
                  <div className="text-[10px] font-bold uppercase text-white/40 tracking-widest mb-1">Withdrawable balance</div>
                  <div className="text-2xl font-black text-white italic">₹{profile?.balance?.toFixed(2) || '0.00'}</div>
                  <div className="text-[8px] text-white/30 uppercase tracking-tighter mt-1 italic">Note: Referral commission (₹{profile?.referralBalance?.toFixed(2) || '0.00'}) is for gameplay only.</div>
               </div>
               <Wallet className="w-8 h-8 text-white/10" />
            </div>

            <div className="space-y-4">
               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest ml-1">Full Name</label>
                 <input 
                   type="text" required
                   value={withdrawDetails.fullName}
                   onChange={(e) => setWithdrawDetails({...withdrawDetails, fullName: e.target.value})}
                   className="w-full bg-[#050505]/50 border border-white/10 rounded-xl p-4 text-sm font-bold outline-none focus:border-yellow-500/50 transition-all"
                   placeholder="Enter legal name"
                 />
               </div>

               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest ml-1">Mobile Number (10 Digits)</label>
                 <input 
                   type="tel" required
                   pattern="[0-9]{10}"
                   maxLength={10}
                   value={withdrawDetails.phone}
                   onChange={(e) => setWithdrawDetails({...withdrawDetails, phone: e.target.value.replace(/\D/g, '')})}
                   className="w-full bg-[#050505]/50 border border-white/10 rounded-xl p-4 text-sm font-bold outline-none focus:border-yellow-500/50 transition-all font-mono"
                   placeholder="99XXXXXXXX"
                 />
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest ml-1">UPI ID</label>
                   <input 
                     type="text" required
                     value={withdrawDetails.upiId}
                     onChange={(e) => setWithdrawDetails({...withdrawDetails, upiId: e.target.value})}
                     className="w-full bg-[#050505]/50 border border-white/10 rounded-xl p-4 text-sm font-bold outline-none focus:border-yellow-500/50 transition-all"
                     placeholder="example@ybl"
                   />
                 </div>
                 <div className="space-y-1.5">
                   <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest ml-1">Confirm UPI ID</label>
                   <input 
                     type="text" required
                     value={upiConfirm}
                     onChange={(e) => setUpiConfirm(e.target.value)}
                     className="w-full bg-[#050505]/50 border border-white/10 rounded-xl p-4 text-sm font-bold outline-none focus:border-yellow-500/50 transition-all"
                     placeholder="Confirm UPI ID"
                   />
                 </div>
               </div>

               <div className="space-y-1.5">
                 <label className="text-[10px] font-bold uppercase text-white/40 tracking-widest ml-1">Withdrawal Amount (₹)</label>
                 <input 
                   type="number" required min="100"
                   value={amount}
                   onChange={(e) => setAmount(e.target.value)}
                   className="w-full bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 text-xl font-mono font-bold text-yellow-500 outline-none focus:border-yellow-500 transition-all"
                   placeholder="Min ₹100"
                 />
               </div>
            </div>

            <button 
              disabled={loading || !amount || withdrawDetails.phone.length !== 10}
              type="submit" 
              className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:grayscale disabled:opacity-30 text-black font-black uppercase tracking-widest py-4 sm:py-5 rounded-2xl shadow-lg shadow-yellow-500/20 transition-all active:scale-95 flex items-center justify-center gap-2 mt-4"
            >
              <TrendingUp className="w-5 h-5" /> {loading ? 'Processing...' : 'Submit Withdrawal'}
            </button>

            <ul className="space-y-2 pt-6 border-t border-white/5">
              <li className="flex items-start gap-2 text-[10px] text-white/30 italic">
                <span className="w-1 h-1 rounded-full bg-yellow-500 shrink-0 mt-1.5" />
                Withdraw time: 00:10 - 23:50
              </li>
              <li className="flex items-start gap-2 text-[10px] text-white/30 italic">
                <span className="w-1 h-1 rounded-full bg-yellow-500 shrink-0 mt-1.5" />
                Ensure all details match your bank record to avoid rejection.
              </li>
            </ul>
          </form>
        )}
      </div>
    </div>
  );
}
