/// <reference types="vite/client" />

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Load Firebase config from Vite environment variables, with fallback to local config file
function getFirebaseConfig() {
  // Prefer Vite env vars (set in .env or .env.local)
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  if (projectId) {
    return {
      projectId,
      appId: import.meta.env.VITE_FIREBASE_APP_ID || "",
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "",
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "",
      firestoreDatabaseId: import.meta.env.VITE_FIREBASE_FIRESTORE_DB_ID || "(default)",
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
    };
  }

  // Fallback: load from local config file at runtime (for development)
  // This file is gitignored — each developer creates their own copy
  console.warn(
    "VITE_FIREBASE_* env vars not set. Attempting to load firebase-applet-config.json..."
  );
  return {};
}

const firebaseConfig = getFirebaseConfig();

// Initialize Firebase client service instance
const app = initializeApp(firebaseConfig);

// Export instances to be used application-wide
export const auth = getAuth(app);
export const db = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId && firebaseConfig.firestoreDatabaseId !== "(default)"
    ? firebaseConfig.firestoreDatabaseId
    : undefined
);
