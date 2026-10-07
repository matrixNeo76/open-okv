import { initializeApp, getApps, getApp } from "firebase/app";
import { 
  getAuth, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut as fbSignOut, 
  onAuthStateChanged,
  signInAnonymously,
  User 
} from "firebase/auth";
import { 
  getFirestore, 
  collection, 
  doc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  getDocs,
  getDoc,
  getDocFromServer,
  setDoc,
  writeBatch,
  disableNetwork,
  enableNetwork,
  setLogLevel,
  Firestore
} from "firebase/firestore";
import firebaseConfig from "../../firebase-applet-config.json";

// Initialize Firebase
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Google Workspace Scopes
export const WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly"
];

WORKSPACE_SCOPES.forEach(scope => {
  googleProvider.addScope(scope);
});

// Google Workspace Access Token Management with session caching & expiration
const TOKEN_STORAGE_KEY = "vault_gdrive_access_token";
const TOKEN_EXPIRY_KEY = "vault_gdrive_token_expiry";

let cachedGoogleAccessToken: string | null = null;

export const setGoogleAccessToken = (token: string | null, expiresInSeconds: number = 3500) => {
  cachedGoogleAccessToken = token;
  if (typeof window !== "undefined" && window.sessionStorage) {
    if (token) {
      const expiresAt = Date.now() + expiresInSeconds * 1000;
      sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
      sessionStorage.setItem(TOKEN_EXPIRY_KEY, expiresAt.toString());
    } else {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    }
  }
};

export const getGoogleAccessToken = (): string | null => {
  if (cachedGoogleAccessToken) {
    return cachedGoogleAccessToken;
  }
  if (typeof window !== "undefined" && window.sessionStorage) {
    const storedToken = sessionStorage.getItem(TOKEN_STORAGE_KEY);
    const storedExpiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
    if (storedToken && storedExpiry) {
      const expiresAt = parseInt(storedExpiry, 10);
      if (Date.now() < expiresAt) {
        cachedGoogleAccessToken = storedToken;
        return storedToken;
      } else {
        sessionStorage.removeItem(TOKEN_STORAGE_KEY);
        sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
      }
    }
  }
  return null;
};

export const hasValidGoogleToken = (): boolean => {
  return getGoogleAccessToken() !== null;
};

export const clearGoogleAccessToken = () => {
  setGoogleAccessToken(null);
};

// Silence noisy internal backoff logs and quota warnings from the Firestore client
try {
  setLogLevel("silent");
} catch {
  // Ignore
}

// Initialize Firestore with custom database ID if defined
const customDbId = (firebaseConfig as any).firestoreDatabaseId;
export const db: Firestore = customDbId 
  ? getFirestore(app, customDbId)
  : getFirestore(app);

export {
  GoogleAuthProvider,
  signInWithPopup,
  fbSignOut,
  onAuthStateChanged,
  signInAnonymously,
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocs,
  getDoc,
  getDocFromServer,
  setDoc,
  writeBatch,
  disableNetwork,
  enableNetwork
};

export type { User };
