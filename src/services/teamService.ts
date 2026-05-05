/**
 * Team / User Management Service
 * All write operations (create, role-change, deactivate) route through
 * Firebase Cloud Functions so the Admin SDK is never exposed client-side.
 */

import { collection, getDocs, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db } from '@/config/firebase';
import { User, UserRole } from '@/types';

const fns = getFunctions();

// ─── Callable function references ────────────────────────────────────────────
const _createUser    = httpsCallable<CreateUserPayload,  { success: boolean; uid: string; resetLink: string }>(fns, 'createUser');
const _updateRole    = httpsCallable<UpdateRolePayload,  { success: boolean }>(fns, 'updateUserRole');
const _deactivateUser = httpsCallable<DeactivatePayload, { success: boolean }>(fns, 'deactivateUser');

export interface CreateUserPayload {
  email: string;
  password: string;
  displayName: string;
  role: UserRole;
  phone?: string;
  region?: string;
}

export interface UpdateRolePayload {
  uid: string;
  role: UserRole;
}

export interface DeactivatePayload {
  uid: string;
  disabled: boolean;
}

// ─── Fetch all team members ───────────────────────────────────────────────────
export async function fetchTeamMembers(): Promise<User[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), orderBy('createdAt', 'desc'))
  );
  return snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
}

// ─── Fetch sales users only ───────────────────────────────────────────────────────
// Single-field where('role') needs no composite index.
// isActive filter and sort are done client-side to avoid index requirements.
export async function fetchSalesUsers(): Promise<User[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'sales'))
  );
  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() } as User))
    .filter(u => u.isActive !== false)  // exclude explicitly deactivated users
    .sort((a, b) => (a.displayName ?? '').localeCompare(b.displayName ?? ''));
}

// ─── Real-time team subscription ─────────────────────────────────────────────
export function subscribeToTeam(callback: (members: User[]) => void): () => void {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, snap => {
    const members = snap.docs.map(d => ({ uid: d.id, ...d.data() } as User));
    callback(members);
  });
}

// ─── Create a new team member (admin only) ───────────────────────────────────
export async function createTeamMember(payload: CreateUserPayload): Promise<{ uid: string; resetLink: string }> {
  const result = await _createUser(payload);
  return { uid: result.data.uid, resetLink: result.data.resetLink };
}

// ─── Update role (admin only) ─────────────────────────────────────────────────
export async function updateMemberRole(uid: string, role: UserRole): Promise<void> {
  await _updateRole({ uid, role });
}

// ─── Toggle active/inactive (admin only) ─────────────────────────────────────
export async function setMemberActive(uid: string, active: boolean): Promise<void> {
  await _deactivateUser({ uid, disabled: !active });
}
