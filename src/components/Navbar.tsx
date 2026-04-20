import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/AuthContext';
import { auth } from '../lib/firebase';
import { Plane, LogOut, User, Wallet, ShieldAlert, Plus, History } from 'lucide-react';

export default function Navbar() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login');
  };

  if (!user) return null;

  return (
    <nav className="border-b border-white/10 bg-[#0a0502]/80 backdrop-blur-md sticky top-0 z-50">
      <div className="w-full max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <Plane className="w-8 h-8 text-[#F27D26] transform -rotate-45 group-hover:scale-110 transition-transform" />
          <span className="text-xl font-bold tracking-tighter uppercase italic">Aviator<span className="text-[#F27D26]">Club</span></span>
        </Link>
        
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center gap-2 sm:gap-4 text-[10px] sm:text-sm font-bold uppercase tracking-wider">
            { (profile?.isAdmin || profile?.email === 'hr2078290@gmail.com') && (
              <Link to="/admin" className="px-3 py-1.5 rounded-lg bg-white/5 text-white/50 hover:bg-white/10 transition-all flex items-center gap-1.5 border border-white/5">
                <ShieldAlert className="w-3.5 h-3.5" /> <span className="hidden sm:inline italic">Admin Control</span>
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2 sm:gap-4 border-l border-white/10 pl-3 sm:pl-6">
            <div className="text-right">
              <div className="text-[8px] sm:text-[10px] uppercase text-white/40 font-bold tracking-widest leading-tight">Total Balance</div>
              <div className="text-[#F27D26] font-mono font-bold leading-none text-xs sm:text-base">₹{((profile?.balance || 0) + (profile?.referralBalance || 0)).toFixed(2)}</div>
            </div>
            <Link to="/profile" className="p-2 rounded-full hover:bg-white/5 transition-colors">
              <User className="w-5 h-5 text-white/70" />
            </Link>
            <button 
              onClick={handleLogout}
              className="p-2 rounded-full hover:bg-red-500/10 text-red-500/70 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}
