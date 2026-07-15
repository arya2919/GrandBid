import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { completeGoogleRedirect, getUserDocument } from '../lib/auth';
import LoadingScreen from '../components/LoadingScreen';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubscribe;

    const initialiseAuth = async () => {
      try {
        await completeGoogleRedirect();
      } catch {
        // The normal auth listener below still restores any existing session.
      }

      unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      
      if (user) {
        try {
          // Get user data from Firestore
          const userData = await getUserDocument(user.uid);
          setUserData(userData);
        } catch {
          // A signed-in user may be temporarily unable to reach Firestore.
          // Keep the auth session active and let the next auth-state refresh retry.
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      
      setLoading(false);
      });
    };

    initialiseAuth();

    return () => unsubscribe?.();
  }, []);

  const value = {
    currentUser,
    userData,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {loading ? <LoadingScreen /> : children}
    </AuthContext.Provider>
  );
};
