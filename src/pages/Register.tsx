import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { Plane, Mail, Lock, UserPlus, Eye, EyeOff, Users } from 'lucide-react';
import { UserProfile } from '../types';

export default function Register() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [referralCodeInput, setReferralCodeInput] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) return setError('Passwords do not match');
    setLoading(true);
    setError('');
    try {
      // Check referral if provided
      let referredByUid = '';
      if (referralCodeInput) {
        const q = query(collection(db, 'users'), where('referralCode', '==', referralCodeInput.toUpperCase()));
        const snap = await getDocs(q);
        if (snap.empty) {
          setError('Invalid referral code');
          setLoading(false);
          return;
        }
        referredByUid = snap.docs[0].id;
      }

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const u = userCredential.user;

      // Create profile manually here because we want to include referral info
      const newProfile: UserProfile = {
        uid: u.uid,
        email: u.email || '',
        balance: 0,
        referralBalance: 0,
        isAdmin: u.email === 'hr2078290@gmail.com', // Auto-grant admin for user request
        status: 'active',
        createdAt: serverTimestamp(),
        referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
        referralEarnings: 0,
        referredBy: referredByUid || null
      };

      await setDoc(doc(db, 'users', u.uid), newProfile);
      
      // Navigate to login as requested (user will be signed out so they can log in manually)
      await auth.signOut();
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <div className="w-full max-w-md p-8 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xl">
        <div className="flex flex-col items-center mb-8">
          <Plane className="w-12 h-12 text-[#F27D26] transform -rotate-45 mb-4" />
          <h1 className="text-3xl font-bold tracking-tight">Join the Club</h1>
          <p className="text-white/40 text-sm mt-1 uppercase tracking-widest font-medium">Create your pilot account</p>
        </div>

        {error && <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg mb-6 text-sm">{error}</div>}

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-white/40 tracking-wider">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-[#F27D26]/50 focus:bg-white/10 transition-all font-mono"
                placeholder="pilot@aviator.club"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-white/40 tracking-wider">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-12 outline-none focus:border-[#F27D26]/50 focus:bg-white/10 transition-all font-mono"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-white/40 tracking-wider">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-12 outline-none focus:border-[#F27D26]/50 focus:bg-white/10 transition-all font-mono"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40 hover:text-white transition-colors"
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase text-white/40 tracking-wider">Referral Code (Optional)</label>
            <div className="relative">
              <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="text"
                value={referralCodeInput}
                onChange={(e) => setReferralCodeInput(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-10 pr-4 outline-none focus:border-[#F27D26]/50 focus:bg-white/10 transition-all font-mono uppercase"
                placeholder="ABC123"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#F27D26] hover:bg-[#ff8c3a] disabled:opacity-50 text-white font-bold py-4 rounded-xl shadow-lg shadow-[#F27D26]/20 transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2 mt-4"
          >
            {loading ? 'Creating account...' : <><UserPlus className="w-5 h-5" /> Sign Up</>}
          </button>
        </form>

        <p className="text-center mt-6 text-sm text-white/40 italic">
          Already a member? <Link to="/login" className="text-[#F27D26] hover:underline font-bold not-italic">Login instead</Link>
        </p>
      </div>
    </div>
  );
}
