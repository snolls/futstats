import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, CACHE_SIZE_UNLIMITED } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};
// Singleton para la App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Singleton para la Base de Datos con configuración "Anti-Bloqueo"
// 1. experimentalForceLongPolling: Evita bloqueos de WebSockets por antivirus.
// 2. ignoreUndefinedProperties: Evita errores tontos de datos.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  ignoreUndefinedProperties: true,
});

const auth = getAuth(app);

export { app, db, auth };