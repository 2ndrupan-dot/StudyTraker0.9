import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { initializeFirestore, memoryLocalCache } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Use memory-only cache — no IndexedDB persistence.
//
// Why: The persistent IndexedDB cache accumulates over time and can get into a
// stuck state where setDoc() resolves after writing to local IndexedDB but the
// server sync is silently blocked. Clearing browser cache fixes it because it
// resets IndexedDB — but that means the local cache was the problem.
//
// This app already writes everything to localStorage before every Firestore
// call (as a primary offline backup), so the IndexedDB cache is redundant.
// Switching to memoryLocalCache means:
//   • Writes go directly to the Firestore server (no IndexedDB intermediary).
//   • If a write fails, it fails visibly instead of silently sitting in cache.
//   • No IndexedDB corruption or accumulation is possible.
//   • Real-time onSnapshot still works normally for cross-device sync.
//   • Offline reads fall back to localStorage (already implemented).
const firestore = initializeFirestore(app, {
  localCache: memoryLocalCache(),
});

export const db = firestore;
export const storage = getStorage(app);
export default app;
