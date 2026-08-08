import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  updatePassword,
  sendPasswordResetEmail,
  signInWithRedirect,
  setPersistence,
  browserLocalPersistence,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '@/lib/firebase';

export interface AppUser {
  id: string;
  name: string;
  email: string;
  photoURL?: string;
}

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (name: string, email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (name: string, currentPass: string, newPass?: string) => Promise<void>;
  updateProfilePhoto: (file: File) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  error: string;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Compress image to base64 using canvas (max ~30KB for Firestore)
async function compressImageToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const SIZE = 240; // px — small enough for Firestore (< 30KB)
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d')!;
        // Centre-crop to square
        const ratio = Math.max(SIZE / img.width, SIZE / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Load custom photo from Firestore profile doc
async function loadPhotoFromFirestore(uid: string): Promise<string | undefined> {
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'profile', 'main'));
    if (snap.exists()) return snap.data().photoBase64 as string | undefined;
  } catch { /* Firestore not enabled yet, ignore */ }
  return undefined;
}

function mapFirebaseUser(fbUser: FirebaseUser): AppUser {
  return {
    id: fbUser.uid,
    name: fbUser.displayName || fbUser.email?.split('@')[0] || 'User',
    email: fbUser.email || '',
    photoURL: fbUser.photoURL || undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let active = true;

    // Make the persistence mode explicit. This prevents an auth result from
    // disappearing on mobile when the browser suspends or recreates the tab.
    // Authentication must not wait for Firestore or a profile document.
    const startAuth = async () => {
      try {
        await setPersistence(auth, browserLocalPersistence);
      } catch (persistenceError) {
        // Some privacy-focused browsers reject local persistence. Firebase can
        // still authenticate in session memory, so continue instead of making
        // the login screen unusable.
        console.warn('[auth] local persistence unavailable; using session auth', persistenceError);
      }

      if (!active) return;
      unsubscribe = onAuthStateChanged(auth, fbUser => {
        // Keep this callback synchronous. Starting a Firestore read here can
        // overlap the SDK's auth-token transition and has caused intermittent
        // Firestore INTERNAL ASSERTION FAILED errors on mobile browsers.
        setUser(prev => {
          if (!fbUser) return prev === null ? prev : null;
          const next = mapFirebaseUser(fbUser);
          // Keep the same object reference on token refreshes so all
          // user-scoped data providers do not unnecessarily tear down and
          // recreate their listeners.
          if (
            prev &&
            prev.id === next.id &&
            prev.name === next.name &&
            prev.email === next.email &&
            prev.photoURL === next.photoURL
          ) return prev;
          return next;
        });
        setLoading(false);
      });
    };

    startAuth().catch(authError => {
      console.error('[auth] failed to initialise Firebase Auth', authError);
      if (active) {
        setUser(null);
        setLoading(false);
        setError('loginError');
      }
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, []);

  // A profile photo is optional metadata. Load it after auth has settled so a
  // Firestore outage/assertion can never turn a successful login into a failed
  // auth transition.
  useEffect(() => {
    if (!user) return;
    let active = true;
    loadPhotoFromFirestore(user.id).then(photo => {
      if (!active || !photo) return;
      setUser(prev => {
        if (!prev || prev.id !== user.id || prev.photoURL === photo) return prev;
        return { ...prev, photoURL: photo };
      });
    });
    return () => { active = false; };
  }, [user?.id]);

  const clearError = () => setError('');

  const login = async (email: string, pass: string) => {
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e: any) {
      const code = e.code || '';
      if (code === 'auth/user-not-found' || code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setError('loginFailed');
      } else if (code === 'auth/too-many-requests') {
        setError('tooManyRequests');
      } else {
        setError('loginError');
      }
      throw e;
    }
  };

  const register = async (name: string, email: string, pass: string) => {
    setError('');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      // Creating the Firebase account is the important operation. A profile
      // update can fail independently on a flaky mobile connection; do not
      // report registration as failed after the account was already created.
      try {
        await firebaseUpdateProfile(cred.user, { displayName: name });
      } catch (profileError) {
        console.warn('[auth] account created but display-name update failed', profileError);
      }
      setUser({ ...mapFirebaseUser(cred.user), name });
    } catch (e: any) {
      const code = e.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('emailTaken');
      } else if (code === 'auth/weak-password') {
        setError('weakPassword');
      } else {
        setError('registerError');
      }
      throw e;
    }
  };

  const signInWithGoogle = async () => {
    setError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e: any) {
      const code = e.code || '';
      // Popup windows are frequently blocked on Android WebView/in-app
      // browsers. Redirect is the reliable fallback and returns through the
      // same onAuthStateChanged path when the app is opened again.
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError('googleSignInFailed');
      }
      throw e;
    }
  };

  const resetPassword = async (email: string) => {
    setError('');
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e: any) {
      setError('resetPasswordFailed');
      throw e;
    }
  };

  const logout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const updateProfile = async (name: string, currentPass: string, newPass?: string) => {
    const fbUser = auth.currentUser;
    if (!fbUser || !fbUser.email) return;
    const cred = EmailAuthProvider.credential(fbUser.email, currentPass);
    await reauthenticateWithCredential(fbUser, cred);
    await firebaseUpdateProfile(fbUser, { displayName: name });
    if (newPass) await updatePassword(fbUser, newPass);
    setUser(prev => prev ? { ...prev, name } : prev);
  };

  const updateProfilePhoto = async (file: File) => {
    const fbUser = auth.currentUser;
    if (!fbUser) throw new Error('Not authenticated');

    // Compress to ~30KB base64 then store in Firestore (free, no Storage needed)
    const base64 = await compressImageToBase64(file);
    await setDoc(
      doc(db, 'users', fbUser.uid, 'profile', 'main'),
      { photoBase64: base64 },
      { merge: true }
    );
    setUser(prev => prev ? { ...prev, photoURL: base64 } : prev);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, updateProfilePhoto, signInWithGoogle, resetPassword, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
