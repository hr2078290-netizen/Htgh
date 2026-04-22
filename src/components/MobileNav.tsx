import React from 'react';
import { NavLink } from 'react-router-dom';
import { Diamond, Wallet, User, History, Users } from 'lucide-react';

export default function MobileNav() {
  return (
    <div className="sm:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[90%] max-w-sm">
      <div className="bg-[#1b1c1d]/90 backdrop-blur-xl border border-white/10 rounded-2xl px-6 py-3 flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        <NavLink 
          to="/play" 
          className={({ isActive }) => `flex flex-col items-center gap-1 transition-all ${isActive ? 'text-[#f27d26] scale-110' : 'text-white/40'}`}
        >
          <Diamond className="w-5 h-5 flex-shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-tighter">Play</span>
        </NavLink>
        
        <NavLink 
          to="/deposit" 
          className={({ isActive }) => `flex flex-col items-center gap-1 transition-all ${isActive ? 'text-green-500 scale-110' : 'text-white/40'}`}
        >
          <Wallet className="w-5 h-5 flex-shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-tighter">Deposit</span>
        </NavLink>
        
        <NavLink 
          to="/profile" 
          className={({ isActive }) => `flex flex-col items-center gap-1 transition-all ${isActive ? 'text-[#f27d26] scale-110' : 'text-white/40'}`}
        >
          <User className="w-5 h-5 flex-shrink-0" />
          <span className="text-[9px] font-bold uppercase tracking-tighter">Profile</span>
        </NavLink>
      </div>
    </div>
  );
}
