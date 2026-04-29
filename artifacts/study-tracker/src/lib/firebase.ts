import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyAZGUkLUQ61bEyIvnp-NEYSrNF8xzxYKzA",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "studytraker-ef123.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "studytraker-ef123",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "studytraker-ef123.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "19815454438",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:19815454438:web:0fa92d6250ed3df2ff0d27",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Enable Firestore offline persistence (IndexedDB) with multi-tab support.
// Falls back gracefully if the browser doesn't support IndexedDB.
let firestore;
try {
  firestore = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  // Re-init without persistence if browser blocks IndexedDB
  // eslint-disable-next-line no-console
  console.warn('[firebase] persistent cache disabled:', e);
  firestore = initializeFirestore(app, {});
}

export const db = firestore;
export const storage = getStorage(app);
export default app;
