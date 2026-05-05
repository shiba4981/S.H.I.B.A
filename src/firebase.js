import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyA5-KskOE-bLPGgrGvO8auXyuM1hRMgBrg",
  authDomain: "remotemonitor-5dccd.firebaseapp.com",
  projectId: "remotemonitor-5dccd",
  storageBucket: "remotemonitor-5dccd.firebasestorage.app",
  messagingSenderId: "277440007198",
  appId: "1:277440007198:web:b3957b2bcbac54d593b20f",
  measurementId: "G-XRBJGK9B9Q",
  // IMPORTANT: Add this line manually
  databaseURL: "https://remotemonitor-5dccd-default-rtdb.asia-southeast1.firebasedatabase.app" 
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Export the database so App.js can use it
export const db = getDatabase(app);

// This connects your project to the Email Login service
export const auth = getAuth(app);