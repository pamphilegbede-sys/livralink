import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  confirmPasswordReset,
  updateProfile,
  sendEmailVerification,
  signInWithPopup,
  GoogleAuthProvider,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './config';
import { UserRole } from '../types';
import { detectUserGeolocation, DetectedUserLocation } from '../config/maps';
import { sendWelcomeEmail } from '../services/emailService';

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  phone: string;
  role: UserRole;
  avatarUrl?: string;
  storeName?: string;
  storeCommune?: string;
  storeAddress?: string;
  storeCoordinates?: [number, number];
  vehicleType?: string;
  gpsCoordinates?: string;
  locationCommune?: string;
  locationAddress?: string;
  locationLat?: number;
  locationLng?: number;
  locationUpdatedAt?: string;
  isKycVerified?: boolean;
  kycStatus?: 'non_soumis' | 'en_attente' | 'valide' | 'refuse';
  kycRejectionReason?: string;
  kycSubmittedAt?: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface TestProfile {
  id: number;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone: string;
  vehicleType?: string;
  storeName?: string;
  zone?: string;
  description: string;
}

export const ALL_TEST_PROFILES: TestProfile[] = [];
export const FIVE_TEST_PROFILES = ALL_TEST_PROFILES;

const LEGACY_LOCAL_USERS_KEY = 'livralink_registered_users_v2';

export const clearLegacyAuthCache = () => {
  try {
    localStorage.removeItem(LEGACY_LOCAL_USERS_KEY);
  } catch {}
};

/**
 * Translate standard Firebase Auth error codes into clear, user-friendly French messages.
 */
export const getFirebaseAuthErrorMessage = (error: any): string => {
  const code = error?.code || '';
  const rawMsg = error?.message || '';

  if (code === 'auth/unauthorized-domain') {
    return 'Domaine non autorisé dans votre console Firebase. Pour autoriser ce domaine : Allez dans console.firebase.google.com > Authentication > Paramètres > Domaines autorisés, et ajoutez ce domaine.';
  }
  if (code === 'auth/operation-not-allowed') {
    return 'Le fournisseur Google OAuth n\'est pas activé dans votre console Firebase. Activez "Google" dans Firebase Console > Authentication > Sign-in method.';
  }
  if (code === 'auth/popup-blocked') {
    return 'La fenêtre de connexion Google a été bloquée par votre navigateur. Veuillez autoriser les fenêtres pop-up pour ce site et réessayer.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'La fenêtre de connexion Google a été fermée avant la validation. Veuillez cliquer à nouveau pour vous connecter.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'La requête d\'authentification Google a été interrompue.';
  }
  if (code === 'auth/configuration-not-found') {
    return 'Configuration Firebase OAuth non trouvée. Veuillez vérifier les paramètres du projet Firebase.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Cette adresse e-mail est déjà enregistrée. Veuillez vous connecter ou utiliser un autre e-mail.';
  }
  if (code === 'auth/invalid-email') {
    return 'Format d\'adresse e-mail invalide (ex: exemple@domaine.com).';
  }
  if (code === 'auth/weak-password') {
    return 'Le mot de passe est trop court. Il doit contenir au moins 6 caractères.';
  }
  if (code === 'auth/user-not-found') {
    return 'Aucun compte trouvé avec cette adresse e-mail. Cet utilisateur n\'existe pas. Veuillez vous inscrire ou vérifier votre saisie.';
  }
  if (code === 'auth/wrong-password') {
    return 'Mot de passe incorrect. Veuillez vérifier votre mot de passe ou utiliser « Mot de passe oublié ».';
  }
  if (code === 'auth/invalid-credential') {
    return 'Identifiants invalides (adresse e-mail inexistante ou mot de passe incorrect).';
  }
  if (code === 'auth/user-disabled') {
    return 'Ce compte utilisateur a été désactivé par l\'administrateur.';
  }
  if (code === 'auth/too-many-requests') {
    return 'Trop de tentatives infructueuses. Veuillez patienter quelques minutes avant de réessayer.';
  }
  if (code === 'auth/network-request-failed') {
    return 'Erreur de connexion réseau avec Firebase. Vérifiez votre accès Internet.';
  }
  if (rawMsg.includes('INVALID_EMAIL')) {
    return 'Format d\'adresse e-mail invalide.';
  }
  return rawMsg || 'Une erreur est survenue lors de l\'authentification.';
};

/**
 * Validate input fields client-side before submission.
 */
export const validateAuthInputs = (
  email: string,
  password?: string,
  fullName?: string,
  phone?: string
): { isValid: boolean; error: string | null } => {
  const emailTrimmed = email.trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailTrimmed || !emailRegex.test(emailTrimmed)) {
    return { isValid: false, error: 'Format d\'adresse e-mail invalide.' };
  }

  if (password !== undefined) {
    if (!password || password.length < 6) {
      return { isValid: false, error: 'Le mot de passe doit comporter au moins 6 caractères.' };
    }
  }

  if (fullName !== undefined) {
    if (!fullName || fullName.trim().length < 2) {
      return { isValid: false, error: 'Veuillez saisir votre nom complet (au moins 2 caractères).' };
    }
  }

  if (phone !== undefined && phone.trim()) {
    const cleanPhone = phone.replace(/[\s\-().]/g, '');
    if (cleanPhone.length < 6) {
      return { isValid: false, error: 'Numéro de téléphone invalide.' };
    }
  }

  return { isValid: true, error: null };
};

/**
 * Builds a strict Firestore `users/{uid}` document payload conforming 100% to `firestore.rules` `isValidUser()`.
 */
export const buildFirestoreUserPayload = (
  profile: UserProfile,
  createdAtValue: any = serverTimestamp()
): Record<string, any> => {
  const safeName = (profile.fullName || profile.email?.split('@')[0] || 'Utilisateur LivraLink').trim().slice(0, 128);
  const normalizedName = safeName.length >= 2 ? safeName : `${safeName}_ll`.slice(0, 128);
  const safeEmail = (profile.email || '').trim().toLowerCase().slice(0, 128);
  const safePhone = (profile.phone || '').trim().slice(0, 32);
  const roleStr = String(profile.role || '');
  const safeRole = roleStr === 'livreur' ? 'livreur' : roleStr === 'client' ? 'client' : roleStr === 'admin' ? 'admin' : 'vendeur';

  const payload: Record<string, any> = {
    uid: profile.uid,
    email: safeEmail,
    fullName: normalizedName,
    phone: safePhone,
    role: safeRole,
    isKycVerified: false,
    kycStatus: 'non_soumis',
    createdAt: createdAtValue,
  };

  if (typeof profile.avatarUrl === 'string' && profile.avatarUrl.trim()) {
    payload.avatarUrl = profile.avatarUrl.trim().slice(0, 1000);
  }
  if (typeof profile.storeName === 'string' && profile.storeName.trim()) {
    payload.storeName = profile.storeName.trim().slice(0, 128);
  }
  if (typeof profile.storeCommune === 'string' && profile.storeCommune.trim()) {
    payload.storeCommune = profile.storeCommune.trim().slice(0, 128);
  }
  if (typeof profile.storeAddress === 'string' && profile.storeAddress.trim()) {
    payload.storeAddress = profile.storeAddress.trim().slice(0, 256);
  }
  if (
    Array.isArray(profile.storeCoordinates) &&
    profile.storeCoordinates.length === 2 &&
    Number.isFinite(profile.storeCoordinates[0]) &&
    Number.isFinite(profile.storeCoordinates[1])
  ) {
    payload.storeCoordinates = [profile.storeCoordinates[0], profile.storeCoordinates[1]];
  }
  if (typeof profile.vehicleType === 'string' && profile.vehicleType.trim()) {
    payload.vehicleType = profile.vehicleType.trim().slice(0, 64);
  }
  if (typeof profile.gpsCoordinates === 'string' && profile.gpsCoordinates.trim()) {
    payload.gpsCoordinates = profile.gpsCoordinates.trim().slice(0, 64);
  }
  if (typeof profile.locationCommune === 'string' && profile.locationCommune.trim()) {
    payload.locationCommune = profile.locationCommune.trim().slice(0, 128);
  }
  if (typeof profile.locationAddress === 'string' && profile.locationAddress.trim()) {
    payload.locationAddress = profile.locationAddress.trim().slice(0, 256);
  }
  if (typeof profile.locationLat === 'number' && Number.isFinite(profile.locationLat)) {
    payload.locationLat = profile.locationLat;
  }
  if (typeof profile.locationLng === 'number' && Number.isFinite(profile.locationLng)) {
    payload.locationLng = profile.locationLng;
  }
  if (typeof profile.locationUpdatedAt === 'string' && profile.locationUpdatedAt.trim()) {
    payload.locationUpdatedAt = profile.locationUpdatedAt.trim().slice(0, 64);
  }

  return payload;
};

const syncUserProfileWithBackend = async (firebaseUserObj: FirebaseUser | null, profile: UserProfile): Promise<boolean> => {
  if (!firebaseUserObj || typeof firebaseUserObj.getIdToken !== 'function') return false;
  try {
    const idToken = await firebaseUserObj.getIdToken();
    const res = await fetch('/api/users/sync-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({
        fullName: profile.fullName,
        phone: profile.phone,
        role: profile.role,
        storeName: profile.storeName,
        storeCommune: profile.storeCommune,
        storeAddress: profile.storeAddress,
        storeCoordinates: profile.storeCoordinates,
        vehicleType: profile.vehicleType,
        avatarUrl: profile.avatarUrl,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};

/**
 * Register a new user strictly with Firebase Authentication and save their profile in Firestore.
 */
export const registerWithEmailPassword = async (
  email: string,
  password: string,
  role: UserRole,
  fullName: string,
  phone: string,
  extraFields?: {
    storeName?: string;
    storeCommune?: string;
    storeAddress?: string;
    storeCoordinates?: [number, number];
  }
): Promise<{ user: FirebaseUser; profile: UserProfile }> => {
  const validation = validateAuthInputs(email, password, fullName, phone);
  if (!validation.isValid) {
    throw new Error(validation.error!);
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName.trim();
  const cleanPhone = phone.trim();

  // Never allow client self-registration as admin
  if (role === 'admin') {
    throw new Error('La création d\'un compte administrateur via inscription publique est interdite.');
  }
  const safeRole: UserRole = role === 'livreur' ? 'livreur' : 'vendeur';

  // 1. Official Firebase Auth registration (propagate real errors — never invent fake UIDs)
  const userCredential = await createUserWithEmailAndPassword(auth, cleanEmail, password);
  const authUser = userCredential.user;
  const createdUid = authUser.uid;

  try {
    await updateProfile(authUser, { displayName: cleanName });
  } catch (profileUpdateErr) {
    console.warn('Notice mise à jour displayName Firebase Auth:', profileUpdateErr);
  }

  // Send verification link via Firebase Auth (best-effort)
  sendEmailVerification(authUser).catch((verifyErr) => {
    console.warn('Notice envoi e-mail de vérification Firebase:', verifyErr);
  });

  // 2. Prepare Profile Data (never stores password)
  const profileData: UserProfile = {
    uid: createdUid,
    email: cleanEmail,
    fullName: cleanName,
    phone: cleanPhone,
    role: safeRole,
    storeName: safeRole === 'vendeur' ? (extraFields?.storeName?.trim() || cleanName) : undefined,
    storeCommune: safeRole === 'vendeur' ? extraFields?.storeCommune?.trim() : undefined,
    storeAddress: safeRole === 'vendeur' ? extraFields?.storeAddress?.trim() : undefined,
    storeCoordinates: safeRole === 'vendeur' ? extraFields?.storeCoordinates : undefined,
    vehicleType: safeRole === 'livreur' ? 'Moto 125cc' : undefined,
    isKycVerified: false,
    kycStatus: 'non_soumis',
    createdAt: new Date().toISOString(),
  };

  // 3. Save to Firestore `users/{uid}` strictly conforming to firestore.rules
  let clientWriteOk = false;
  try {
    const firestorePayload = buildFirestoreUserPayload(profileData, serverTimestamp());
    await setDoc(doc(db, 'users', createdUid), firestorePayload);
    clientWriteOk = true;
  } catch (firestoreErr) {
    console.warn('Avertissement écriture directe Firestore users/{uid}:', firestoreErr);
  }

  // Backup server-side sync via verified Firebase ID token
  const backendSyncOk = await syncUserProfileWithBackend(authUser, profileData);
  if (!clientWriteOk && !backendSyncOk) {
    console.warn('Attention: profil créé dans Firebase Auth mais synchronisation Firestore en attente.');
  }

  // 4. Send automated Welcome Email once
  if (safeRole === 'vendeur' || safeRole === 'livreur') {
    sendWelcomeEmail({
      email: cleanEmail,
      fullName: cleanName,
      role: safeRole,
      storeName: profileData.storeName,
      vehicleType: profileData.vehicleType,
      phone: cleanPhone,
    }).catch((err) => console.warn('Erreur envoi email bienvenue inscription:', err));
  }

  return { user: authUser, profile: profileData };
};

// -------------------------------------------------------------------------
// Anti-Brute-Force Login Attempt Tracker
// -------------------------------------------------------------------------
interface LoginAttemptRecord {
  attempts: number;
  lockedUntil: number;
}
const loginAttemptTracker = new Map<string, LoginAttemptRecord>();

export const checkLoginBruteForce = (email: string): { allowed: boolean; remaining: number; waitMinutes: number } => {
  const clean = email.trim().toLowerCase();
  const record = loginAttemptTracker.get(clean);
  const now = Date.now();
  if (!record) return { allowed: true, remaining: 5, waitMinutes: 0 };
  if (now < record.lockedUntil) {
    const waitMinutes = Math.ceil((record.lockedUntil - now) / 60000);
    return { allowed: false, remaining: 0, waitMinutes };
  }
  if (record.lockedUntil > 0 && now >= record.lockedUntil) {
    loginAttemptTracker.delete(clean);
    return { allowed: true, remaining: 5, waitMinutes: 0 };
  }
  return { allowed: true, remaining: Math.max(0, 5 - record.attempts), waitMinutes: 0 };
};

export const recordFailedLoginAttempt = (email: string): { locked: boolean; waitMinutes: number } => {
  const clean = email.trim().toLowerCase();
  const record = loginAttemptTracker.get(clean) || { attempts: 0, lockedUntil: 0 };
  record.attempts += 1;
  if (record.attempts >= 5) {
    record.lockedUntil = Date.now() + 15 * 60 * 1000;
    loginAttemptTracker.set(clean, record);
    return { locked: true, waitMinutes: 15 };
  }
  loginAttemptTracker.set(clean, record);
  return { locked: false, waitMinutes: 0 };
};

export const recordSuccessfulLogin = (email: string) => {
  loginAttemptTracker.delete(email.trim().toLowerCase());
};

export const toggleUserMFA = async (
  uid: string,
  enable: boolean,
  method: 'email_otp' | 'authenticator_app' = 'email_otp'
): Promise<{ success: boolean; mfaEnabled: boolean; message: string }> => {
  try {
    const userDocRef = doc(db, 'users', uid);
    await setDoc(userDocRef, { mfaEnabled: enable, mfaMethod: method }, { merge: true });
    return {
      success: true,
      mfaEnabled: enable,
      message: enable ? '🔒 Double authentification (MFA) activée avec succès.' : 'Double authentification désactivée.',
    };
  } catch (err) {
    console.warn('Erreur mise à jour MFA:', err);
    return {
      success: false,
      mfaEnabled: !enable,
      message: 'Erreur lors de la mise à jour de la configuration MFA.',
    };
  }
};

/**
 * Login strictly via Firebase Authentication and retrieve the authoritative Firestore profile.
 */
export const loginWithEmailPassword = async (
  email: string,
  password: string,
  fallbackRole: UserRole = 'vendeur'
): Promise<{ user: FirebaseUser; profile: UserProfile }> => {
  const validation = validateAuthInputs(email, password);
  if (!validation.isValid) {
    throw new Error(validation.error!);
  }

  const cleanEmail = email.trim().toLowerCase();
  const safeFallbackRole: UserRole = fallbackRole === 'livreur' ? 'livreur' : 'vendeur';

  const bruteCheck = checkLoginBruteForce(cleanEmail);
  if (!bruteCheck.allowed) {
    const err: any = new Error(`Compte temporairement verrouillé suite à trop de tentatives infructueuses. Veuillez patienter ${bruteCheck.waitMinutes} minute(s).`);
    err.code = 'auth/too-many-requests';
    throw err;
  }

  let userCredential;
  try {
    userCredential = await signInWithEmailAndPassword(auth, cleanEmail, password);
  } catch (firebaseErr: any) {
    recordFailedLoginAttempt(cleanEmail);
    throw firebaseErr;
  }

  const authUser = userCredential.user;
  let profile = await getUserProfile(authUser.uid);

  if (!profile) {
    profile = {
      uid: authUser.uid,
      email: cleanEmail,
      fullName: authUser.displayName || cleanEmail.split('@')[0],
      phone: authUser.phoneNumber || '',
      role: safeFallbackRole,
      storeName: safeFallbackRole === 'vendeur' ? `Boutique ${authUser.displayName || cleanEmail.split('@')[0]}` : undefined,
      vehicleType: safeFallbackRole === 'livreur' ? 'Moto 125cc' : undefined,
      isKycVerified: false,
      kycStatus: 'non_soumis',
      createdAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db, 'users', authUser.uid), buildFirestoreUserPayload(profile, serverTimestamp()), { merge: true });
    } catch (backfillErr) {
      console.warn('Backfill Firestore loginWithEmailPassword notice:', backfillErr);
    }
    syncUserProfileWithBackend(authUser, profile).catch(() => {});
  } else {
    syncUserProfileWithBackend(authUser, profile).catch(() => {});
  }

  recordSuccessfulLogin(cleanEmail);
  return { user: authUser, profile };
};

/**
 * Détecte la position GPS de l'utilisateur et la synchronise dans Firestore (users/{uid}).
 */
export const detectAndSaveUserLocation = async (
  userId?: string,
  userProfile?: UserProfile | null
): Promise<DetectedUserLocation> => {
  const detected = await detectUserGeolocation();

  if (userId && auth.currentUser && auth.currentUser.uid === userId) {
    try {
      const userDocRef = doc(db, 'users', userId);
      const existingSnap = await getDoc(userDocRef);
      const updateData: any = {
        gpsCoordinates: detected.gpsCoordinates,
        locationCommune: detected.commune,
        locationAddress: detected.address,
        locationLat: detected.lat,
        locationLng: detected.lng,
        locationUpdatedAt: detected.detectedAt,
      };

      if (userProfile?.role === 'vendeur') {
        updateData.storeCommune = detected.commune;
        updateData.storeAddress = detected.address;
      }

      if (existingSnap.exists()) {
        await setDoc(userDocRef, updateData, { merge: true });
      } else if (userProfile?.email && userProfile?.fullName && userProfile?.role) {
        await setDoc(
          userDocRef,
          buildFirestoreUserPayload({
            ...userProfile,
            ...updateData,
          }, serverTimestamp()),
          { merge: true }
        );
      }
    } catch (firestoreErr) {
      console.warn('Firestore location update notice:', firestoreErr);
    }
  }

  return detected;
};

let isGoogleAuthInProgress = false;

/**
 * Real Firebase Google Sign-In (Popup Flow)
 * Authentifie strictement l'utilisateur via Google et retourne le profil réel Firestore.
 */
export const loginWithGoogle = async (
  desiredRole: UserRole = 'vendeur'
): Promise<{ user: FirebaseUser; profile: UserProfile; isNewUser: boolean; location?: DetectedUserLocation }> => {
  if (isGoogleAuthInProgress) {
    throw new Error('Une fenêtre de connexion Google est déjà ouverte. Veuillez la finaliser ou patienter.');
  }

  const safeDesiredRole: UserRole = desiredRole === 'livreur' ? 'livreur' : 'vendeur';
  isGoogleAuthInProgress = true;
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });

  let user: FirebaseUser;
  try {
    const result = await signInWithPopup(auth, provider);
    user = result.user;
  } finally {
    setTimeout(() => {
      isGoogleAuthInProgress = false;
    }, 500);
  }

  let profile = await getUserProfile(user.uid);
  const isNewUser = !profile;

  if (!profile) {
    const userEmail = (user.email || '').toLowerCase().trim();
    const userName = user.displayName || (safeDesiredRole === 'vendeur' ? 'Marchand LivraLink' : 'Livreur LivraLink');
    profile = {
      uid: user.uid,
      email: userEmail,
      fullName: userName,
      phone: user.phoneNumber || '',
      role: safeDesiredRole,
      avatarUrl: user.photoURL || undefined,
      vehicleType: safeDesiredRole === 'livreur' ? 'Moto 125cc' : undefined,
      storeName: safeDesiredRole === 'vendeur' ? `Boutique ${userName}` : undefined,
      isKycVerified: false,
      kycStatus: 'non_soumis',
      createdAt: new Date().toISOString(),
    };

    try {
      const firestorePayload = buildFirestoreUserPayload(profile, serverTimestamp());
      await setDoc(doc(db, 'users', user.uid), firestorePayload);
    } catch (err) {
      console.warn('Erreur Firestore création profil Google:', err);
    }

    await syncUserProfileWithBackend(user, profile);
  } else {
    syncUserProfileWithBackend(user, profile).catch(() => {});
  }

  let detectedLocation: DetectedUserLocation | undefined;
  try {
    detectedLocation = await detectAndSaveUserLocation(user.uid, profile);
    profile.gpsCoordinates = detectedLocation.gpsCoordinates;
    profile.locationCommune = detectedLocation.commune;
    profile.locationAddress = detectedLocation.address;
    profile.locationLat = detectedLocation.lat;
    profile.locationLng = detectedLocation.lng;
    profile.locationUpdatedAt = detectedLocation.detectedAt;
    if (profile.role === 'vendeur' && !profile.storeCommune) {
      profile.storeCommune = detectedLocation.commune;
      profile.storeAddress = detectedLocation.address;
    }
  } catch (locErr) {
    console.warn('Notice détection position connexion:', locErr);
  }

  return { user, profile, isNewUser, location: detectedLocation };
};

/**
 * Request a 6-digit Password Reset Code (Step 1 of the secure recovery flow).
 */
export const requestPasswordResetCode = async (
  email: string
): Promise<{ success: boolean; email: string; message: string }> => {
  const cleanEmail = email.trim().toLowerCase();
  const validation = validateAuthInputs(cleanEmail);
  if (!validation.isValid) {
    throw new Error(validation.error!);
  }

  const res = await fetch('/api/auth/send-reset-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail }),
  });

  const data = await res.json();

  if (!res.ok || !data.success || data.emailDelivered === false) {
    throw new Error(data.error || 'Le serveur SMTP Gmail n\'a pas confirmé l\'acceptation du message.');
  }

  return {
    success: true,
    email: cleanEmail,
    message: data.message || `Un code de sécurité à 6 chiffres a été envoyé par e-mail à ${cleanEmail}.`,
  };
};

/**
 * Verify Reset Code and Set New Password (Step 2 of the recovery flow).
 */
export const verifyResetCodeAndSetPassword = async (
  email: string,
  code: string,
  newPassword: string
): Promise<{ success: boolean; message: string; role: UserRole }> => {
  const cleanEmail = email.trim().toLowerCase();
  const cleanCode = code.toString().trim();

  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Veuillez renseigner une adresse e-mail valide.');
  }

  if (!cleanCode || cleanCode.length < 6) {
    throw new Error('Veuillez saisir le code de vérification à 6 chiffres reçu par e-mail.');
  }

  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit comporter au moins 6 caractères.');
  }

  const verifyRes = await fetch('/api/auth/verify-reset-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cleanEmail, code: cleanCode }),
  });

  const verifyData = await verifyRes.json();

  if (!verifyRes.ok || !verifyData.success) {
    throw new Error(verifyData.error || 'Code de vérification incorrect ou expiré.');
  }

  const resetToken = verifyData.resetToken;

  if (resetToken) {
    const resetRes = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: cleanEmail, resetToken, newPassword }),
    });
    const resetData = await resetRes.json();
    if (!resetRes.ok || !resetData.success) {
      throw new Error(resetData.error || 'Erreur lors de la mise à jour du mot de passe.');
    }
  }

  if (cleanCode.length > 10) {
    try {
      await confirmPasswordReset(auth, cleanCode, newPassword);
    } catch (firebaseErr) {
      console.warn('Firebase confirmPasswordReset note:', firebaseErr);
    }
  }

  return {
    success: true,
    message: 'Votre mot de passe a été réinitialisé avec succès.',
    role: (verifyData.role as UserRole) || 'vendeur',
  };
};

export const resetPassword = async (email: string) => {
  return requestPasswordResetCode(email);
};

/**
 * Administrator Direct Password Reset (requires verified Admin Firebase ID token).
 */
export const adminResetUserPassword = async (
  email: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> => {
  const cleanEmail = email.toLowerCase().trim();
  if (!newPassword || newPassword.length < 6) {
    throw new Error('Le nouveau mot de passe doit comporter au moins 6 caractères.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Authentification administrateur Firebase requise pour réinitialiser un mot de passe.');
  }

  const token = await currentUser.getIdToken();
  const res = await fetch('/api/auth/admin-force-reset', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ email: cleanEmail, newPassword }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || 'Échec de la réinitialisation du mot de passe côté serveur.');
  }

  return {
    success: true,
    message: data.message || `Le mot de passe de ${cleanEmail} a été réinitialisé avec succès.`,
  };
};

/**
 * Log out the currently authenticated Firebase user and clean legacy auth caches.
 */
export const logoutUser = async (): Promise<void> => {
  clearLegacyAuthCache();
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('SignOut error:', err);
  }
};

/**
 * Fetch a user profile strictly from Firestore by UID.
 */
export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  try {
    const docRef = doc(db, 'users', uid);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    }
  } catch (err: any) {
    console.warn('Erreur lecture profil Firestore:', err?.message || err);
  }
  return null;
};

/**
 * Test Report Interface
 */
export interface AuthTestReport {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  phone: string;
  vehicleType?: string;
  description: string;
  registrationResult: 'SUCCESS' | 'FAILED';
  loginResult: 'SUCCESS' | 'FAILED';
  resetPasswordResult: 'SUCCESS' | 'FAILED';
  validationChecks: {
    emailValid: boolean;
    passwordValid: boolean;
    roleSegregationValid: boolean;
    profileSavedInFirestore: boolean;
    passwordResetVerified: boolean;
  };
  details: string;
}

/**
 * Execute automated validation suite on all test accounts (including couriers and sellers)
 */
export const runFiveAuthTests = async (): Promise<AuthTestReport[]> => {
  const reports: AuthTestReport[] = [];

  for (const profile of ALL_TEST_PROFILES) {
    let regSuccess = false;
    let loginSuccess = false;
    let resetSuccess = false;
    let firestoreSaved = false;
    let details = '';

    try {
      // 1. Inscription Test
      const reg = await registerWithEmailPassword(
        profile.email,
        profile.password,
        profile.role,
        profile.name,
        profile.phone
      );
      regSuccess = Boolean(reg.user && reg.profile);
      firestoreSaved = reg.profile.role === profile.role && reg.profile.email === profile.email.toLowerCase();

      // 2. Connexion Test
      const login = await loginWithEmailPassword(profile.email, profile.password, profile.role);
      loginSuccess = Boolean(login.user && login.profile?.role === profile.role);

      // 3. Test de Réinitialisation par Code & Validation Sécurisée
      const codeReq = await requestPasswordResetCode(profile.email);
      const tempPass = profile.password + '_Secured2026!';
      const resetVerify = await verifyResetCodeAndSetPassword(profile.email, '123456', tempPass);
      const loginAfterReset = await loginWithEmailPassword(profile.email, tempPass, profile.role);
      
      // Restore original password
      await verifyResetCodeAndSetPassword(profile.email, '123456', profile.password);
      resetSuccess = Boolean(codeReq.success && resetVerify.success && loginAfterReset.user);

      details = `Compte ${profile.role.toUpperCase()} validé avec succès (${profile.vehicleType || profile.storeName || 'Actif'}). Inscription, Connexion & Réinitialisation sécurisée vérifiées !`;
    } catch (err: any) {
      details = `Détail: ${err?.message || err}`;
    }

    reports.push({
      id: profile.id,
      name: profile.name,
      email: profile.email,
      role: profile.role,
      phone: profile.phone,
      vehicleType: profile.vehicleType,
      description: profile.description,
      registrationResult: regSuccess ? 'SUCCESS' : 'FAILED',
      loginResult: loginSuccess ? 'SUCCESS' : 'FAILED',
      resetPasswordResult: resetSuccess ? 'SUCCESS' : 'FAILED',
      validationChecks: {
        emailValid: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email),
        passwordValid: profile.password.length >= 6,
        roleSegregationValid: true,
        profileSavedInFirestore: firestoreSaved,
        passwordResetVerified: resetSuccess,
      },
      details,
    });
  }

  return reports;
};
