import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Plane, Zap, ShieldCheck, Trophy, ArrowRight, Wallet, Users } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#050505] text-white flex flex-col pt-4 sm:pt-10">
      {/* Hero Section */}
      <div className="max-w-6xl mx-auto px-6 py-8 sm:py-12 flex flex-col items-center text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#f27d26] to-[#ff4e00] flex items-center justify-center shadow-[0_0_30px_rgba(242,125,38,0.4)] mb-6 sm:mb-8"
        >
          <Plane className="w-8 h-8 sm:w-10 sm:h-10 text-white transform -rotate-12" />
        </motion.div>

        <motion.h1 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-4xl sm:text-6xl md:text-8xl font-black italic tracking-tighter uppercase mb-4"
        >
          AVITED <span className="text-[#f27d26]">CLUB</span>
        </motion.h1>

        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-base sm:text-lg md:text-xl text-white/50 max-w-2xl mb-8 sm:mb-12 font-medium"
        >
          Experience the most advanced Aviator game. High-speed action, real-time payouts, and ultimate rewards.
        </motion.p>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-3 sm:gap-4 w-full sm:w-auto"
        >
          <button 
            onClick={() => navigate('/play')}
            className="px-6 py-4 sm:px-10 sm:py-5 rounded-xl sm:rounded-2xl bg-[#f27d26] hover:bg-[#ff8c3a] text-white font-black uppercase italic tracking-widest text-base sm:text-lg shadow-[0_10px_40px_rgba(242,125,38,0.3)] transition-all active:scale-95 flex items-center justify-center gap-3 group"
          >
            Play Aviator Now
            <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 group-hover:translate-x-1 transition-transform" />
          </button>
          
          {!user && (
            <button 
              onClick={() => navigate('/login')}
              className="px-6 py-4 sm:px-10 sm:py-5 rounded-xl sm:rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white font-black uppercase tracking-widest text-base sm:text-lg transition-all active:scale-95"
            >
              Sign In
            </button>
          )}
        </motion.div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-6 py-10 sm:py-20 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          <div className="p-6 sm:p-8 rounded-2xl sm:rounded-3xl bg-[#1b1c1d] border border-white/5 flex flex-col gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-purple-500/10 flex items-center justify-center">
              <Zap className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500" />
            </div>
            <h3 className="text-lg sm:text-xl font-bold uppercase italic">Fast Payouts</h3>
            <p className="text-white/40 text-[13px] sm:text-sm leading-relaxed">Instant withdrawals and real-time balance updates. No waiting for your winnings.</p>
          </div>

          <div className="p-8 rounded-3xl bg-[#1b1c1d] border border-white/5 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-blue-500" />
            </div>
            <h3 className="text-xl font-bold uppercase italic">Secure Banking</h3>
            <p className="text-white/40 text-sm leading-relaxed">Top-tier security protocols for every transaction. Your funds are always safe with us.</p>
          </div>

          <div className="p-8 rounded-3xl bg-[#1b1c1d] border border-white/5 flex flex-col gap-4">
            <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-green-500" />
            </div>
            <h3 className="text-xl font-bold uppercase italic">Daily rewards</h3>
            <p className="text-white/40 text-sm leading-relaxed">Participate in daily tournaments and win exclusive bonuses and multipliers.</p>
          </div>
        </div>
      </div>

      {/* Footer-like CTA */}
      <div className="mt-auto bg-[#1b1c1d] border-t border-white/5 py-12">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-3">
             <div className="p-2 rounded-lg bg-[#f27d26]">
               <Plane className="w-5 h-5 text-white" />
             </div>
             <span className="text-xl font-black italic tracking-tighter uppercase">AVITED CLUB</span>
          </div>
          
          <div className="flex items-center gap-6">
             <Link to="/play" className="text-sm font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Game</Link>
             <Link to="/deposit" className="text-sm font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Deposit</Link>
             <Link to="/profile" className="text-sm font-bold uppercase tracking-widest text-white/40 hover:text-white transition-colors">Profile</Link>
          </div>
          
          <div className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
            © 2026 AVITED CLUB. ALL RIGHTS RESERVED.
          </div>
        </div>
      </div>
    </div>
  );
}
