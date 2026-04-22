import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true,
  refreshProfile: async () => {} 
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | null = null;
    
    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (u) {
        const profileRef = doc(db, 'users', u.uid);
        unsubscribeProfile = onSnapshot(profileRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data() as UserProfile;
            // Ensure referral code exists for legacy users
            if (!data.referralCode) {
              const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              await updateDoc(profileRef, {
                referralCode,
                referralBalance: data.referralBalance ?? 0,
                referralEarnings: data.referralEarnings ?? 0
              });
            }
            setProfile(data);
            setLoading(false);
          } else {
            const newProfile: UserProfile = {
              uid: u.uid,
              email: u.email || '',
              balance: 50000, // Give starter balance for testing
              referralBalance: 0,
              isAdmin: u.email === 'hr2078290@gmail.com', // Auto-grant admin for user request
              status: 'active',
              createdAt: serverTimestamp(),
              referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
              referralEarnings: 0
            };
            try {
              await setDoc(profileRef, newProfile);
            } catch (err) {
              console.error("Error creating profile:", err);
            }
          }
        });
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const refreshProfile = async () => {
    if (user) {
      const profileRef = doc(db, 'users', user.uid);
      const docSnap = await getDoc(profileRef);
      if (docSnap.exists()) {
        setProfile(docSnap.data() as UserProfile);
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
