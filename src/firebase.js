// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your Firebase config goes here — get it from:
// Firebase Console → Your Project → Project Settings → Your apps → Config
const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_AUTH_DOMAIN",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_STORAGE_BUCKET",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
