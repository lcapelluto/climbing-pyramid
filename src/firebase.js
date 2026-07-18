import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { initializeFirestore, persistentLocalCache } from "firebase/firestore";

// Safe to keep in client code — this is a public identifier, not a secret.
// Access control lives in firestore.rules, not in hiding this object.
const firebaseConfig = {
  apiKey: "AIzaSyDr8rEVahnW-mh79udquhv1-b3P-xW4ezM",
  authDomain: "climbing-pyramid-76fe4.firebaseapp.com",
  projectId: "climbing-pyramid-76fe4",
  storageBucket: "climbing-pyramid-76fe4.firebasestorage.app",
  messagingSenderId: "237561956352",
  appId: "1:237561956352:web:5a4ac22dddba39391970e5",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// persistentLocalCache turns on offline support: reads/writes work with no
// connection and Firestore syncs automatically once you're back online.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache(),
});
