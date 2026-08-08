import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// HMR-safe singleton: during Vite hot-module-replacement the module is
// re-executed, so Firebase would throw "App '[DEFAULT]' already exists" and
// "initializeFirestore() has already been called" if we blindly re-initialize.
// Check whether the app / Firestore already exist before creating new ones.
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

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
let firestore;
try {
  // First call on this app instance — configure with memory cache.
  firestore = initializeFirestore(app, { localCache: memoryLocalCache() });
} catch {
  // HMR re-execution: Firestore is already initialized, just reuse it.
  firestore = getFirestore(app);
}

export const db = firestore;
export const storage = getStorage(app);
export default app;

// Firestore manages its own network reconnect when a mobile browser suspends
// and resumes a tab. Calling enableNetwork() from a visibility handler can
// race with the SDK's own online-state transition and has caused intermittent
// "INTERNAL ASSERTION FAILED" crashes on mobile browsers. Do not force a second
// network transition here; listeners and pending writes reconnect automatically.

// Firebase keeps singleton state outside the module, so partially replacing
// this module during Vite HMR can leave old Firestore listeners attached to
// new SDK objects. Ask Vite to reload the page for this module instead.
if (import.meta.hot) {
  (import.meta.hot as any).decline?.();
}
