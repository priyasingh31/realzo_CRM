import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc,
  query, where, orderBy, limit, serverTimestamp, Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, COLLECTIONS } from '@/config/firebase';
import { Property, PropertyFormData, PropertyStatus, PropertyType } from '@/types';

const toProperty = (id: string, data: Record<string, unknown>): Property => ({
  id,
  ...(data as Omit<Property, 'id'>),
  createdAt: data.createdAt instanceof Timestamp
    ? data.createdAt.toDate().toISOString()
    : (data.createdAt as string),
  updatedAt: data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate().toISOString()
    : (data.updatedAt as string),
});

// ─── Fetch Properties ─────────────────────────────────────────────────────────
export async function fetchProperties(options?: {
  status?: PropertyStatus;
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  limitCount?: number;
}): Promise<Property[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

  if (options?.status) {
    constraints.unshift(where('status', '==', options.status));
  }
  if (options?.type) {
    constraints.unshift(where('type', '==', options.type));
  }
  if (options?.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  const snap = await getDocs(query(collection(db, COLLECTIONS.PROPERTIES), ...constraints));
  return snap.docs.map((d) => toProperty(d.id, d.data() as Record<string, unknown>));
}

// ─── Get Single Property ──────────────────────────────────────────────────────
export async function getProperty(id: string): Promise<Property | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.PROPERTIES, id));
  if (!snap.exists()) return null;
  return toProperty(id, snap.data() as Record<string, unknown>);
}

// ─── Create Property ──────────────────────────────────────────────────────────
export async function createProperty(
  data: PropertyFormData,
  agentId: string
): Promise<string> {
  const ref_ = await addDoc(collection(db, COLLECTIONS.PROPERTIES), {
    ...data,
    status: 'available' as PropertyStatus,
    images: [],
    agentId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref_.id;
}

// ─── Update Property ──────────────────────────────────────────────────────────
export async function updateProperty(
  id: string,
  data: Partial<Property>
): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.PROPERTIES, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

// ─── Update Property Status ───────────────────────────────────────────────────
export async function updatePropertyStatus(
  id: string,
  status: PropertyStatus
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.PROPERTIES, id), {
    status,
    updatedAt: serverTimestamp(),
  });
}

// ─── Upload Property Image ────────────────────────────────────────────────────
export async function uploadPropertyImage(
  propertyId: string,
  uri: string
): Promise<string> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const storageRef = ref(storage, `properties/${propertyId}/${Date.now()}.jpg`);
  await uploadBytes(storageRef, blob);
  const url = await getDownloadURL(storageRef);
  return url;
}

// ─── Add Image to Property ────────────────────────────────────────────────────
export async function addPropertyImage(propertyId: string, imageUrl: string): Promise<void> {
  const property = await getProperty(propertyId);
  if (!property) throw new Error('Property not found');
  await updateDoc(doc(db, COLLECTIONS.PROPERTIES, propertyId), {
    images: [...(property.images ?? []), imageUrl],
    updatedAt: serverTimestamp(),
  });
}

// ─── Search Properties ────────────────────────────────────────────────────────
export async function searchAvailableProperties(
  budget: number,
  location?: string
): Promise<Property[]> {
  const constraints: QueryConstraint[] = [
    where('status', '==', 'available'),
    where('price', '<=', budget * 1.1),
    orderBy('price', 'asc'),
    limit(10),
  ];

  const snap = await getDocs(query(collection(db, COLLECTIONS.PROPERTIES), ...constraints));
  const props = snap.docs.map((d) => toProperty(d.id, d.data() as Record<string, unknown>));

  if (location) {
    return props.filter((p) =>
      p.location.toLowerCase().includes(location.toLowerCase())
    );
  }
  return props;
}
