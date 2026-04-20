import React from 'react';
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import GamePage from "./pages/GamePage";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Profile from "./pages/Profile";
import Deposit from "./pages/Deposit";
import Withdrawal from "./pages/Withdrawal";
import Referral from "./pages/Referral";
import TransactionHistory from "./pages/TransactionHistory";
import AdminPanel from "./pages/AdminPanel";
import Navbar from "./components/Navbar";
import MobileNav from "./components/MobileNav";

function ProtectedRoute({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !profile?.isAdmin && profile?.email !== 'hr2078290@gmail.com') return <Navigate to="/" />;
  if (profile?.status === 'banned') return <div className="min-h-screen bg-[#050505] flex items-center justify-center text-red-500">Your account has been banned.</div>;

  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-[#050505] text-[#E4E3E0] font-sans selection:bg-[#F27D26] selection:text-white pb-20 sm:pb-0">
        <main className="w-full max-w-7xl mx-auto px-0 sm:px-4 py-0 sm:py-8">
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/play" element={<ProtectedRoute><GamePage /></ProtectedRoute>} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
            <Route path="/deposit" element={<ProtectedRoute><Deposit /></ProtectedRoute>} />
            <Route path="/referral" element={<ProtectedRoute><Referral /></ProtectedRoute>} />
            <Route path="/withdrawal" element={<ProtectedRoute><Withdrawal /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><TransactionHistory /></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPanel /></ProtectedRoute>} />
          </Routes>
        </main>
        <MobileNav />
      </div>
    </AuthProvider>
  );
}
