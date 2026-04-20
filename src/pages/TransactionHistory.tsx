import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { db } from '../lib/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { History, ArrowDownLeft, ArrowUpRight, Clock, ChevronLeft, Calendar, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function TransactionHistory() {
  const { profile } = useAuth();
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'deposit' | 'withdrawal'>('all');

  useEffect(() => {
    if (!profile) return;

    // Fetch deposits
    const qDeposits = query(
      collection(db, 'deposits'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc')
    );

    // Fetch withdrawals
    const qWithdrawals = query(
      collection(db, 'withdrawals'),
      where('userId', '==', profile.uid),
      orderBy('timestamp', 'desc')
    );

    const unsubDeposits = onSnapshot(qDeposits, (snap) => {
      const deps = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'deposit' }));
      setTransactions(prev => {
        const others = prev.filter(t => t.type !== 'deposit');
        return [...others, ...deps].sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      });
      setLoading(false);
    });

    const unsubWithdrawals = onSnapshot(qWithdrawals, (snap) => {
      const withs = snap.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'withdrawal' }));
      setTransactions(prev => {
        const others = prev.filter(t => t.type !== 'withdrawal');
        return [...others, ...withs].sort((a: any, b: any) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
      });
      setLoading(false);
    });

    return () => {
      unsubDeposits();
      unsubWithdrawals();
    };
  }, [profile]);

  const filteredTransactions = transactions.filter(t => {
    if (filter === 'all') return true;
    return t.type === filter;
  });

  if (!profile) return null;

  return (
    <div className="max-w-4xl mx-auto py-10 px-4">
      <div className="flex items-center gap-4 mb-8">
        <Link to="/profile" className="p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all">
          <ChevronLeft className="w-6 h-6 text-white" />
        </Link>
        <div>
          <h1 className="text-3xl font-black uppercase italic text-white flex items-center gap-3">
            <History className="w-8 h-8 text-[#F27D26]" /> Transaction History
          </h1>
          <p className="text-white/40 text-xs font-bold uppercase tracking-widest mt-1">Full statement of your flight expenses and top-ups</p>
        </div>
      </div>

      <div className="bg-[#1b1c1d] border border-white/10 rounded-[2rem] p-8 shadow-2xl">
        <div className="flex flex-col sm:flex-row items-center justify-between mb-8 gap-4 pb-6 border-b border-white/5">
          <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
            <button 
              onClick={() => setFilter('all')}
              className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === 'all' ? 'bg-[#F27D26] text-white shadow-lg shadow-[#F27D26]/20' : 'text-white/40 hover:text-white/60'}`}
            >
              All Logs
            </button>
            <button 
              onClick={() => setFilter('deposit')}
              className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === 'deposit' ? 'bg-green-500 text-white shadow-lg shadow-green-500/20' : 'text-white/40 hover:text-white/60'}`}
            >
              Deposits
            </button>
            <button 
              onClick={() => setFilter('withdrawal')}
              className={`px-6 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${filter === 'withdrawal' ? 'bg-[#e91e63] text-white shadow-lg shadow-[#e91e63]/20' : 'text-white/40 hover:text-white/60'}`}
            >
              Withdrawals
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-white/30">
            <Filter className="w-4 h-4" /> Filtered: {filteredTransactions.length} items
          </div>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-8 h-8 border-4 border-white/10 border-t-[#F27D26] rounded-full animate-spin" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-white/20">Syncing flight logs...</span>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="p-6 bg-white/5 rounded-full">
                <Clock className="w-12 h-12 text-white/10" />
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">No matching transactions found</div>
            </div>
          ) : (
            filteredTransactions.map((tx) => (
              <div key={tx.id} className="group bg-[#0a0604]/40 hover:bg-white/5 border border-white/5 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between transition-all gap-4">
                <div className="flex items-center gap-6">
                  <div className={`p-4 rounded-2xl ${tx.type === 'deposit' ? 'bg-green-500/10 text-green-500' : 'bg-[#e91e63]/10 text-[#e91e63]'}`}>
                    {tx.type === 'deposit' ? <ArrowDownLeft className="w-8 h-8" /> : <ArrowUpRight className="w-8 h-8" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <span className="text-xs font-black uppercase tracking-[0.1em] text-white">
                        {tx.type === 'deposit' ? 'Wallet Top-up' : 'Earnings Payout'}
                      </span>
                      <span className={`text-[8px] px-2 py-0.5 rounded-full font-bold uppercase border ${
                        tx.status === 'approved' ? 'bg-green-500/10 text-green-500 border-green-500/20' : 
                        tx.status === 'rejected' ? 'bg-red-500/10 text-red-500 border-red-500/20' : 
                        'bg-yellow-500/10 text-yellow-500 border-yellow-500/20'
                      }`}>
                        {tx.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-[10px] text-white/30 font-bold uppercase tracking-widest">
                      <div className="flex items-center gap-1.5 border-r border-white/10 pr-4">
                        <Calendar className="w-3 h-3" />
                        {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleDateString() : 'N/A'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3" />
                        {tx.timestamp?.seconds ? new Date(tx.timestamp.seconds * 1000).toLocaleTimeString() : 'Pending...'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between md:flex-col md:items-end md:justify-center border-t md:border-t-0 border-white/5 pt-4 md:pt-0">
                  <div className={`text-3xl font-mono font-black ${tx.type === 'deposit' ? 'text-green-500' : 'text-[#e91e63]'}`}>
                    {tx.type === 'deposit' ? '+' : '-'}₹{tx.amount}
                  </div>
                  <div className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">
                    TXN_ID: {tx.transactionId || tx.id.substring(0, 12).toUpperCase()}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
