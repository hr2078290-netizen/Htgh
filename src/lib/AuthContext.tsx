import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, serverTimestamp, updateDoc, runTransaction } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from '../types';

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  updateLocalBalance: (newBalance: number) => void;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  profile: null, 
  loading: true,
  refreshProfile: async () => {},
  updateLocalBalance: () => {}
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
            let needsUpdate = false;
            const updatePayload: any = {};

            // Force admin for the user request email
            if (u.email === 'hr2078290@gmail.com' && !data.isAdmin) {
              updatePayload.isAdmin = true;
              needsUpdate = true;
            }

            // Ensure referral code exists for legacy users
            if (!data.referralCode) {
              updatePayload.referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
              updatePayload.referralBalance = data.referralBalance ?? 0;
              updatePayload.referralEarnings = data.referralEarnings ?? 0;
              needsUpdate = true;
            }

            // Ensure numericId exists for legacy users
            if (!data.numericId) {
              try {
                const nextId = await runTransaction(db, async (transaction) => {
                  const statsRef = doc(db, 'settings', 'stats');
                  const statsSnap = await transaction.get(statsRef);
                  let currentId = 251500;
                  if (statsSnap.exists()) {
                    currentId = (statsSnap.data().lastNumericId || 251500) + 1;
                  }
                  transaction.set(statsRef, { lastNumericId: currentId }, { merge: true });
                  return currentId;
                });
                updatePayload.numericId = nextId;
                needsUpdate = true;
              } catch (e) {
                console.error("Error generating legacy numericId:", e);
              }
            }

            if (needsUpdate) {
              await updateDoc(profileRef, updatePayload);
            }

            setProfile(data);
            setLoading(false);
          } else {
            // New user registration
            try {
              const numericId = await runTransaction(db, async (transaction) => {
                const statsRef = doc(db, 'settings', 'stats');
                const statsSnap = await transaction.get(statsRef);
                let currentId = 251500;
                if (statsSnap.exists()) {
                  currentId = (statsSnap.data().lastNumericId || 251500) + 1;
                }
                transaction.set(statsRef, { lastNumericId: currentId }, { merge: true });
                return currentId;
              });

              const newProfile: UserProfile = {
                uid: u.uid,
                email: u.email || '',
                balance: 50000, 
                referralBalance: 0,
                isAdmin: u.email === 'hr2078290@gmail.com', 
                status: 'active',
                createdAt: serverTimestamp(),
                referralCode: Math.random().toString(36).substring(2, 8).toUpperCase(),
                referralEarnings: 0,
                numericId
              };
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

  const updateLocalBalance = (newBalance: number) => {
    setProfile(prev => prev ? { ...prev, balance: newBalance } : null);
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, refreshProfile, updateLocalBalance }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
