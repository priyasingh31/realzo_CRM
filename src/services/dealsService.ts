import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, onSnapshot, serverTimestamp, Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { db, COLLECTIONS } from '@/config/firebase';
import { Deal, DealFormData, DealStage, UserRole } from '@/types';

const toDeal = (id: string, data: Record<string, unknown>): Deal => ({
  id,
  ...(data as Omit<Deal, 'id'>),
  createdAt: data.createdAt instanceof Timestamp
    ? data.createdAt.toDate().toISOString()
    : (data.createdAt as string),
  updatedAt: data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate().toISOString()
    : (data.updatedAt as string),
});

// ─── Fetch Deals ──────────────────────────────────────────────────────────────
export async function fetchDeals(options?: {
  agentId?: string;
  role?: UserRole;
  stage?: DealStage;
}): Promise<Deal[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
  if (options?.role === 'sales' && options?.agentId) {
    constraints.unshift(where('agentId', '==', options.agentId));
  }
  if (options?.stage) {
    constraints.push(where('stage', '==', options.stage));
  }

  const snap = await getDocs(query(collection(db, COLLECTIONS.DEALS), ...constraints));
  return snap.docs.map((d) => toDeal(d.id, d.data() as Record<string, unknown>));
}

// ─── Get Single Deal ──────────────────────────────────────────────────────────
export async function getDeal(id: string): Promise<Deal | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.DEALS, id));
  if (!snap.exists()) return null;
  return toDeal(id, snap.data() as Record<string, unknown>);
}

// ─── Create Deal ──────────────────────────────────────────────────────────────
export async function createDeal(
  data: DealFormData,
  agentId: string,
  agentName: string
): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.DEALS), {
    ...data,
    agentId,
    agentName,
    probability: getStageProbability(data.stage),
    stageHistory: [{ stage: data.stage, changedAt: new Date().toISOString(), changedBy: agentId }],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

// ─── Update Deal Stage ────────────────────────────────────────────────────────
export async function updateDealStage(
  id: string,
  stage: DealStage,
  changedBy: string
): Promise<void> {
  const deal = await getDeal(id);
  if (!deal) throw new Error('Deal not found');

  const stageHistory = [
    ...(deal.stageHistory || []),
    { stage, changedAt: new Date().toISOString(), changedBy },
  ];

  await updateDoc(doc(db, COLLECTIONS.DEALS, id), {
    stage,
    probability: getStageProbability(stage),
    stageHistory,
    updatedAt: serverTimestamp(),
  });
}

// ─── Update Deal ──────────────────────────────────────────────────────────────
export async function updateDeal(id: string, data: Partial<Deal>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.DEALS, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

// ─── Realtime Listener ────────────────────────────────────────────────────────
export function subscribeToDeals(
  agentId: string,
  role: UserRole,
  callback: (deals: Deal[]) => void
): () => void {
  const constraints: QueryConstraint[] = [orderBy('updatedAt', 'desc')];
  if (role === 'sales') {
    constraints.unshift(where('agentId', '==', agentId));
  }

  return onSnapshot(
    query(collection(db, COLLECTIONS.DEALS), ...constraints),
    (snap) => callback(snap.docs.map((d) => toDeal(d.id, d.data() as Record<string, unknown>)))
  );
}

// ─── Stage Probability Map ────────────────────────────────────────────────────
function getStageProbability(stage: DealStage): number {
  const map: Record<DealStage, number> = {
    new: 10,
    contacted: 25,
    site_visit: 50,
    negotiation: 75,
    Booked: 100,
    closed_lost: 0,
  };
  return map[stage];
}
