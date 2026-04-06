import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

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
export const db = getFirestore(app);
export default app;
