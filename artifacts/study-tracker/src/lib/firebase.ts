import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAZGUkLUQ61bEyIvnp-NEYSrNF8xzxYKzA",
  authDomain: "studytraker-ef123.firebaseapp.com",
  projectId: "studytraker-ef123",
  storageBucket: "studytraker-ef123.firebasestorage.app",
  messagingSenderId: "19815454438",
  appId: "1:19815454438:web:0fa92d6250ed3df2ff0d27"
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
