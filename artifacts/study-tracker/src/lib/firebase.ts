import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import {
  initializeFirestore,
  getFirestore,
  memoryLocalCache,
  enableNetwork,
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

// ─── Firestore reconnection on tab visibility ────────────────────────────────
// When the user navigates away (PDF window, another site, etc.) the browser
// can suspend the Firestore WebSocket. On return, `enableNetwork` explicitly
// wakes it back up so listeners and writes resume immediately without a page
// reload.
//
// The listener is registered once on a module-level symbol so Vite HMR
// re-executions don't stack up multiple copies of the same handler.
const _VIS_KEY = '__studytrack_vis_handler__';
if (typeof document !== 'undefined' && !(window as any)[_VIS_KEY]) {
  const handler = () => {
    if (document.visibilityState === 'visible') {
      enableNetwork(db).catch(() => {
        // Silently ignore — the SDK retries automatically.
      });
    }
  };
  (window as any)[_VIS_KEY] = handler;
  document.addEventListener('visibilitychange', handler);
}

// ─── HMR: force a full page reload when this module changes ─────────────────
// firebase.ts holds singleton state that cannot be partially hot-swapped —
// re-executing the module while Firestore listeners are still alive causes
// "INTERNAL ASSERTION FAILED: Unexpected state (ID: da08)".
// Declining HMR here tells Vite to do a full refresh instead, which cleanly
// re-initialises the SDK from scratch.
if (import.meta.hot) {
  import.meta.hot.decline();
}
