import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore, setLogLevel, doc, getDocFromServer } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';
import appletConfig from '../../firebase-applet-config.json';

// Silence non-critical network / offline timeout warnings in preview environments
try {
  setLogLevel('silent');
} catch {}

// Firebase configuration from provisioned project or environment variables
export const firebaseConfig = {
  apiKey: (appletConfig as any)?.apiKey || import.meta.env?.VITE_FIREBASE_API_KEY || 'AIzaSyCtWzkQ0shbK9X_cf8Wi8UMyrXKRFWNmwg',
  authDomain: (appletConfig as any)?.authDomain || import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0654978401.firebaseapp.com',
  projectId: (appletConfig as any)?.projectId || import.meta.env?.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0654978401',
  storageBucket: (appletConfig as any)?.storageBucket || import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0654978401.firebasestorage.app',
  messagingSenderId: (appletConfig as any)?.messagingSenderId || import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || '246764611458',
  appId: (appletConfig as any)?.appId || import.meta.env?.VITE_FIREBASE_APP_ID || '1:246764611458:web:0a0b8caabbf011afb0519b',
  measurementId: (appletConfig as any)?.measurementId || import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || '',
};

// Initialize Firebase singleton
let firebaseApp: FirebaseApp;
if (!getApps().length) {
  try {
    firebaseApp = initializeApp(firebaseConfig);
  } catch (err) {
    console.error('Erreur d\'initialisation Firebase:', err);
    firebaseApp = initializeApp(firebaseConfig, 'LIVRALINK_APP');
  }
} else {
  firebaseApp = getApp();
}

export const app = firebaseApp;
export const auth: Auth = getAuth(app);

// Initialize Firestore with experimentalForceLongPolling to ensure resilient connection across iframe/sandbox proxies
const firestoreDbId = (appletConfig as any)?.firestoreDatabaseId;
let firestoreDb: Firestore;

try {
  firestoreDb = initializeFirestore(
    app,
    {
      experimentalForceLongPolling: true,
    },
    firestoreDbId && firestoreDbId !== '(default)' ? firestoreDbId : undefined
  );
} catch {
  firestoreDb = getFirestore(
    app,
    firestoreDbId && firestoreDbId !== '(default)' ? firestoreDbId : undefined
  );
}

export const db: Firestore = firestoreDb;
export const storage: FirebaseStorage = getStorage(app);

// Validate Connection to Firestore asynchronously without blocking app render
async function testFirestoreConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firestore operating in offline/resilient cache mode.');
    }
  }
}
testFirestoreConnection();

// Helper to check if project credentials have been configured
export const isCustomFirebaseConfigured = (): boolean => {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
};
