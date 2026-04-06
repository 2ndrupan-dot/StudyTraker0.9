import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile as firebaseUpdateProfile,
  updatePassword,
  EmailAuthProvider,
  reauthenticateWithCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useLocation } from 'wouter';

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
  const [, setLocation] = useLocation();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async fbUser => {
      if (fbUser) {
        const appUser = mapFirebaseUser(fbUser);
        // Try to load profile photo stored in Firestore
        const photo = await loadPhotoFromFirestore(fbUser.uid);
        if (photo) appUser.photoURL = photo;
        setUser(appUser);
      } else {
        setUser(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const clearError = () => setError('');

  const login = async (email: string, pass: string) => {
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, pass);
      setLocation('/today');
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
      await firebaseUpdateProfile(cred.user, { displayName: name });
      setUser({ id: cred.user.uid, name, email });
      setLocation('/today');
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

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setLocation('/auth');
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
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile, updateProfilePhoto, error, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
