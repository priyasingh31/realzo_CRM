import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updatePassword,
  sendPasswordResetEmail,
  User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, COLLECTIONS } from '@/config/firebase';
import { User } from '@/types';

// ─── Sign In ─────────────────────────────────────────────────────────────────
export async function signIn(email: string, password: string): Promise<User> {
  const { user: fbUser } = await signInWithEmailAndPassword(auth, email, password);
  const userData = await getUserProfile(fbUser.uid);
  if (!userData) throw new Error('User profile not found. Contact your administrator.');

  // Update last active
  await updateDoc(doc(db, COLLECTIONS.USERS, fbUser.uid), {
    lastActive: serverTimestamp(),
  });

  return userData;
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────
export async function logOut(): Promise<void> {
  await signOut(auth);
}

// ─── Get User Profile ─────────────────────────────────────────────────────────
export async function getUserProfile(uid: string): Promise<User | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.USERS, uid));
  if (!snap.exists()) return null;
  return { uid, ...snap.data() } as User;
}

// ─── Create User Profile (admin only — via Cloud Function) ───────────────────
export async function createUserProfile(uid: string, data: Omit<User, 'uid'>): Promise<void> {
  await setDoc(doc(db, COLLECTIONS.USERS, uid), {
    ...data,
    createdAt: new Date().toISOString(),
  });
}

// ─── Auth State Observer ──────────────────────────────────────────────────────
export function subscribeToAuthState(
  callback: (user: User | null) => void
): () => void {
  return onAuthStateChanged(auth, async (fbUser: FirebaseUser | null) => {
    if (!fbUser) {
      callback(null);
      return;
    }
    const profile = await getUserProfile(fbUser.uid);
    callback(profile);
  });
}

// ─── Password Reset ───────────────────────────────────────────────────────────
export async function requestPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email);
}

// ─── Change Password ──────────────────────────────────────────────────────────
export async function changePassword(newPassword: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not authenticated');
  await updatePassword(user, newPassword);
}

// ─── Update Profile ───────────────────────────────────────────────────────────
export async function updateUserProfile(
  uid: string,
  data: Partial<Omit<User, 'uid' | 'email' | 'role'>>
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.USERS, uid), {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}
