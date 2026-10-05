import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { initializeFirestore, Firestore } from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

// Firebase configuration from provisioned project or environment variables
export const firebaseConfig = {
  apiKey: (appletConfig as any)?.apiKey || import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyCtWzkQ0shbK9X_cf8Wi8UMyrXKRFWNmwg',
  authDomain: (appletConfig as any)?.authDomain || import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'gen-lang-client-0654978401.firebaseapp.com',
  projectId: (appletConfig as any)?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || 'gen-lang-client-0654978401',
  storageBucket: (appletConfig as any)?.storageBucket || import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'gen-lang-client-0654978401.firebasestorage.app',
  messagingSenderId: (appletConfig as any)?.messagingSenderId || import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '246764611458',
  appId: (appletConfig as any)?.appId || import.meta.env.VITE_FIREBASE_APP_ID || '1:246764611458:web:0a0b8caabbf011afb0519b',
  measurementId: (appletConfig as any)?.measurementId || import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || '',
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

// Initialize Firestore with auto-detect long polling to prevent 10s timeout in iframe/sandboxed environments
const firestoreDbId = (appletConfig as any)?.firestoreDatabaseId;
export const db: Firestore = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firestoreDbId && firestoreDbId !== '(default)' ? firestoreDbId : undefined
);

// Helper to check if project credentials have been configured
export const isCustomFirebaseConfigured = (): boolean => {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId);
};

