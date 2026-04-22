import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, History, TrendingUp, Clock, ShieldCheck } from 'lucide-react';
import { BetHistoryEntry } from '../types';
import { useAuth } from '../lib/AuthContext';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const getNetworkConfig = () => {
  const protocol = window.location.protocol;
  const domain = window.location.host;
  return {
    apiBase: `${protocol}//${domain}/api`
  };
};

export default function HistoryModal({ isOpen, onClose }: HistoryModalProps) {
  const { profile } = useAuth();
  const [history, setHistory] = useState<BetHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && profile?.uid) {
      fetchHistory();
    }
  }, [isOpen, profile?.uid]);

  const fetchHistory = async () => {
    setLoading(true);
    const config = getNetworkConfig();
    try {
      const res = await fetch(`${config.apiBase}/game/my-history?userId=${profile?.uid}`);
      const data = await res.json();
      if (data.history) {
        setHistory(data.history);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200]"
          />
          <motion.div 
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-2xl bg-[#1b1c1d] rounded-[2.5rem] border border-white/10 shadow-2xl z-[201] overflow-hidden flex flex-col max-h-[85vh] m-4"
          >
            {/* Header */}
            <div className="p-8 border-b border-white/5 flex items-center justify-between bg-gradient-to-r from-indigo-500/10 to-transparent">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-500/20 rounded-2xl">
                  <History className="w-6 h-6 text-indigo-400" />
                </div>
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tight italic">My <span className="text-indigo-400">History</span></h2>
                  <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Showing your last 50 games</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-all"
              >
                <X className="w-6 h-6 text-white/40" />
              </button>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-3 custom-scrollbar">
              {loading ? (
                <div className="py-20 flex flex-col items-center gap-4">
                   <div className="w-10 h-10 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Loading History...</span>
                </div>
              ) : history.length === 0 ? (
                <div className="py-20 text-center space-y-4">
                   <TrendingUp className="w-12 h-12 text-white/5 mx-auto" />
                   <p className="text-white/40 font-bold uppercase text-[10px] tracking-[0.2em]">No bets played yet</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {history.map((entry, idx) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.05 }}
                      key={entry.timestamp} 
                      className="bg-black/40 border border-white/5 rounded-2xl p-4 flex items-center justify-between hover:border-white/10 transition-all group"
                    >
                      <div className="flex items-center gap-4">
                         <div className={`p-3 rounded-xl ${entry.status === 'won' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {entry.status === 'won' ? <TrendingUp className="w-5 h-5" /> : <div className="p-0.5"><Clock className="w-4 h-4" /></div>}
                         </div>
                         <div>
                            <div className="flex items-center gap-2">
                               <span className="text-sm font-black uppercase tracking-tight">{entry.game}</span>
                               <span className="text-[9px] font-bold text-white/20 uppercase tracking-widest">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                               <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-black text-white/40 uppercase">Bet</span>
                                  <span className="text-[11px] font-mono font-bold text-white">₹{entry.bet.toFixed(2)}</span>
                               </div>
                               <div className="w-1 h-1 rounded-full bg-white/5" />
                               <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] font-black text-white/40 uppercase">Mines</span>
                                  <span className="text-[11px] font-mono font-bold text-white">{entry.mines || 3}</span>
                               </div>
                            </div>
                         </div>
                      </div>

                      <div className="text-right">
                         <div className={`text-lg font-black font-mono tracking-tighter ${entry.status === 'won' ? 'text-green-500' : 'text-white/20'}`}>
                            {entry.status === 'won' ? `+₹${entry.payout.toFixed(2)}` : `-₹${entry.bet.toFixed(2)}`}
                         </div>
                         <div className={`text-[10px] font-black uppercase tracking-widest ${entry.status === 'won' ? 'text-green-500/40' : 'text-red-500/40'}`}>
                            {entry.status === 'won' ? `${entry.multiplier}x` : 'Lost'}
                         </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 bg-black/40 border-t border-white/5 flex items-center justify-center gap-3">
               <ShieldCheck className="w-4 h-4 text-green-500/40" />
               <span className="text-[8px] font-black uppercase tracking-[0.3em] text-white/20">All results are provably fair</span>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
