// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your Firebase config goes here — get it from:
// Firebase Console → Your Project → Project Settings → Your apps → Config
const firebaseConfig = {
  apiKey: "AIzaSyC2KDfjaX0DHbx-7A41RPkOIn2tjGKw9aw",
  authDomain: "lookinggoodzak.firebaseapp.com",
  projectId: "lookinggoodzak",
  storageBucket: "lookinggoodzak.firebasestorage.app",
  messagingSenderId: "272264214974",
  appId: "1:272264214974:web:42823c6ce32eb9c14e61ef"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
