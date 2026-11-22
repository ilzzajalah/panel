import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  getDocFromServer, 
  setDoc, 
  collection, 
  getDocs, 
  query, 
  where,
  deleteDoc,
  onSnapshot 
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// CRITICAL: Initialize Firestore with firestoreDatabaseId as specified in SKILL.md
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export const SUPER_ADMIN_EMAIL = 'rizramadhan975@gmail.com';
export const ADMIN_EMAILS = [SUPER_ADMIN_EMAIL, 'admin@aetherpanel.com'];

export function isUserAdmin(email?: string | null): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

// Error Handling conforming to SKILL.md
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Connection test on boot
export async function testFirebaseConnection(): Promise<boolean> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log('[Firebase] Connection verified with Firestore database:', firebaseConfig.firestoreDatabaseId);
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('[Firebase] Client is offline or database initializing.');
    }
    return false;
  }
}

// Google Sign-In with popup
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const isAdmin = isUserAdmin(user.email);
    const userRef = doc(db, 'users', user.uid);

    try {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0],
        photoURL: user.photoURL || '',
        role: isAdmin ? 'ADMIN' : 'USER',
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // If super admin, ensure entry in admins collection
      if (isAdmin) {
        await setDoc(doc(db, 'admins', user.uid), {
          email: user.email,
          role: 'ADMIN',
          addedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err) {
      console.warn('[Firebase] Could not sync user doc, proceeding with session:', err);
    }

    return {
      user: {
        id: user.uid,
        name: user.displayName || user.email?.split('@')[0],
        email: user.email,
        role: isAdmin ? 'ADMIN' : 'USER',
        photoURL: user.photoURL
      }
    };
  } catch (err: any) {
    console.error('[Firebase] Google sign-in failed:', err);
    throw err;
  }
}

// Firebase Sign Out
export async function signOutFirebase() {
  await signOut(auth);
}
