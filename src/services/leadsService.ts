import {
  collection, doc, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  QueryConstraint, writeBatch,
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db, COLLECTIONS } from '@/config/firebase';
import { Lead, LeadActivity, CreateLeadForm, LeadStatus, LeadSource, UserRole } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toLead = (id: string, data: Record<string, unknown>): Lead => ({
  id,
  ...(data as Omit<Lead, 'id'>),
  createdAt: data.createdAt instanceof Timestamp
    ? data.createdAt.toDate().toISOString()
    : (data.createdAt as string),
  updatedAt: data.updatedAt instanceof Timestamp
    ? data.updatedAt.toDate().toISOString()
    : (data.updatedAt as string),
});

// ─── Fetch Leads ─────────────────────────────────────────────────────────────
export async function fetchLeads(options?: {
  agentId?: string;
  role?: UserRole;
  status?: LeadStatus;
  source?: LeadSource;
  limitCount?: number;
}): Promise<Lead[]> {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];

  if (options?.role === 'sales' && options?.agentId) {
    constraints.unshift(where('assignedTo', '==', options.agentId));
  }
  if (options?.status) {
    constraints.push(where('status', '==', options.status));
  }
  if (options?.limitCount) {
    constraints.push(limit(options.limitCount));
  }

  const snap = await getDocs(query(collection(db, COLLECTIONS.LEADS), ...constraints));
  return snap.docs.map((d) => toLead(d.id, d.data() as Record<string, unknown>));
}

// ─── Get Single Lead ──────────────────────────────────────────────────────────
export async function getLead(id: string): Promise<Lead | null> {
  const snap = await getDoc(doc(db, COLLECTIONS.LEADS, id));
  if (!snap.exists()) return null;
  return toLead(id, snap.data() as Record<string, unknown>);
}

// ─── Create Lead ─────────────────────────────────────────────────────────────
export async function createLead(data: CreateLeadForm, agentId: string): Promise<string> {
  const ref = await addDoc(collection(db, COLLECTIONS.LEADS), {
    ...data,
    status: 'new' as LeadStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    assignedTo: (data as any).assignedTo || agentId,
  });
  return ref.id;
}

// ─── Update Lead ─────────────────────────────────────────────────────────────
export async function updateLead(id: string, data: Partial<Lead>): Promise<void> {
  const { id: _id, ...rest } = data;
  await updateDoc(doc(db, COLLECTIONS.LEADS, id), {
    ...rest,
    updatedAt: serverTimestamp(),
  });
}

// ─── Update Lead Status ───────────────────────────────────────────────────────
export async function updateLeadStatus(id: string, status: LeadStatus, existingClosureDate?: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  await updateDoc(doc(db, COLLECTIONS.LEADS, id), {
    status,
    updatedAt: serverTimestamp(),
    ...(status === 'contacted' ? { lastContactedAt: serverTimestamp() } : {}),
    // Stamp closureDate the first time a lead is marked closed_won
    ...(status === 'closed_won' && !existingClosureDate ? { closureDate: today } : {}),
  });
}

// ─── Delete Lead ──────────────────────────────────────────────────────────────
export async function deleteLead(id: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTIONS.LEADS, id));
}

// ─── Realtime Listener ────────────────────────────────────────────────────────
export function subscribeToLeads(
  agentId: string,
  role: UserRole,
  callback: (leads: Lead[]) => void
): () => void {
  const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc'), limit(100)];
  if (role === 'sales') {
    constraints.unshift(where('assignedTo', '==', agentId));
  }

  return onSnapshot(
    query(collection(db, COLLECTIONS.LEADS), ...constraints),
    (snap) => {
      callback(snap.docs.map((d) => toLead(d.id, d.data() as Record<string, unknown>)));
    }
  );
}

// ─── Activities ───────────────────────────────────────────────────────────────
export async function fetchLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.LEAD_ACTIVITIES(leadId)),
      orderBy('createdAt', 'desc')
    )
  );
  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
    createdAt: d.data().createdAt instanceof Timestamp
      ? d.data().createdAt.toDate().toISOString()
      : d.data().createdAt,
  } as LeadActivity));
}

export async function addLeadActivity(
  leadId: string,
  activity: Omit<LeadActivity, 'id' | 'leadId' | 'createdAt'>
): Promise<void> {
  await addDoc(collection(db, COLLECTIONS.LEAD_ACTIVITIES(leadId)), {
    ...activity,
    leadId,
    createdAt: serverTimestamp(),
  });
  await updateDoc(doc(db, COLLECTIONS.LEADS, leadId), {
    updatedAt: serverTimestamp(),
    lastContactedAt: serverTimestamp(),
  });
}

// ─── Assign Lead ──────────────────────────────────────────────────────────────
export async function assignLead(
  leadId: string,
  agentId: string,
  agentName: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTIONS.LEADS, leadId), {
    assignedTo: agentId,
    assignedToName: agentName,
    updatedAt: serverTimestamp(),
  });
}

// ─── Smart Column Mapping ─────────────────────────────────────────────────────
// Aliases normalized: lowercase, spaces/underscores/hyphens stripped before matching.
// Spec: name/full name/client name/names | phone/mobile/contact/phones/contacts | email/mail/emails
const COLUMN_ALIASES: Record<string, string[]> = {
  name:  ['name', 'names', 'fullname', 'clientname', 'clientnames', 'customername',
          'leadname', 'personname', 'contactname', 'fname', 'firstname', 'customer'],
  phone: ['phone', 'phones', 'mobile', 'mobiles', 'contact', 'contacts',
          'phonenumber', 'mobilenumber', 'tel', 'telephone', 'contactnumber',
          'cell', 'phone1', 'contact1', 'mobile1'],
  email: ['email', 'emails', 'mail', 'mails', 'emailaddress', 'emailid'],
  notes: ['note', 'remark', 'remarks', 'comment', 'comments', 'description', 'info'],
  source:['leadsource', 'origin', 'campaign'],
};

const normalizeColumnName = (col: string): string => {
  const normalized = col.toLowerCase().trim().replace(/[\s_-]+/g, '');

  // 1. Exact key match (e.g. "phone" → "phone")
  if (normalized in COLUMN_ALIASES) return normalized;

  // 2. Exact alias match (e.g. "mobile" → "phone", "fullname" → "name")
  for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
    if (aliases.includes(normalized)) return key;
  }

  // 3. Substring fallback — column header CONTAINS the key word
  //    e.g. "mobilephone" → contains "phone" → phone
  //    Guard: minimum 4 chars in key to avoid false positives (e.g. "notes" won't match "no")
  for (const key of Object.keys(COLUMN_ALIASES)) {
    if (key.length >= 4 && normalized.includes(key)) return key;
  }

  return '';
};

export interface RawLeadData {
  name?: string;
  phone?: string;
  email?: string;
  notes?: string;
  source?: string;
  [key: string]: string | undefined;
}

export interface ParseLeadFileResult {
  leads: RawLeadData[];
  detectedHeaders: string[];  // raw column names from the file
  mappedHeaders: string[];    // which ones we recognised
  totalRows: number;          // rows before filtering
}

// ─── Parse Excel / CSV File ───────────────────────────────────────────────────
// `data` is either a base64 string (native) or an ArrayBuffer (web).
export const parseLeadFile = (
  data: string | ArrayBuffer,
  fileName: string,
): ParseLeadFileResult => {
  try {
    const type = typeof data === 'string' ? 'base64' : 'array';
    const workbook = XLSX.read(data, { type, cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });

    if (jsonData.length === 0) {
      return { leads: [], detectedHeaders: [], mappedHeaders: [], totalRows: 0 };
    }

    // Collect headers from first row
    const rawHeaders = Object.keys(jsonData[0]);
    const mappedHeaders: string[] = [];
    rawHeaders.forEach(h => {
      const mapped = normalizeColumnName(h);
      if (mapped && !mappedHeaders.includes(mapped)) mappedHeaders.push(mapped);
    });

    const mappedData: RawLeadData[] = jsonData.map(row => {
      const mapped: RawLeadData = {};
      for (const [rawKey, value] of Object.entries(row)) {
        const strVal = String(value ?? '').trim();
        if (!strVal) continue;
        const key = normalizeColumnName(rawKey);
        if (key) (mapped as Record<string, string>)[key] = strVal;
      }
      return mapped;
    });

    const leads = mappedData.filter(row =>
      (row.name && row.name.length >= 2) || (row.phone && row.phone.replace(/\D/g, '').length >= 5)
    );

    return { leads, detectedHeaders: rawHeaders, mappedHeaders, totalRows: jsonData.length };
  } catch (error) {
    console.error('[parseLeadFile] Error:', error);
    return { leads: [], detectedHeaders: [], mappedHeaders: [], totalRows: 0 };
  }
};

// ─── Bulk Create Leads ────────────────────────────────────────────────────────
// All uploaded leads go into the main `leads` collection tagged with:
//   source       — 'uploaded' | 'google' | etc. (set by admin)
//   uploadBatchId — unique ID grouping all rows from one upload session
//   uploadedBy    — UID of the admin who imported
//   assignedTo    — UID of the sales person selected at import time
// Because `assignedTo` is set, only that sales person sees these leads in
// their filtered views; admins/managers see all leads regardless.

export interface BulkImportResult {
  successCount: number;
  failedCount: number;
  errors: string[];
  uploadBatchId: string;
}

const VALID_SOURCES: LeadSource[] = [
  'meta', 'google', 'uploaded', 'whatsapp', 'referral', 'website', 'facebook', 'manual',
];

export const bulkCreateLeads = async (
  leads: RawLeadData[],
  assignedToId: string,
  defaultSource: LeadSource = 'uploaded',
  assignedToName?: string,
  uploadedById?: string,
  uploadedByName?: string,
): Promise<BulkImportResult> => {
  const uploadBatchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nowISO = new Date().toISOString(); // ISO string — safe to render immediately without round-trip
  const leadsRef = collection(db, COLLECTIONS.LEADS);

  const result: BulkImportResult = {
    successCount: 0, failedCount: 0, errors: [], uploadBatchId,
  };

  // Firestore batch: max 500 writes per commit — chunk at 400 to stay safe
  const CHUNK_SIZE = 400;
  for (let start = 0; start < leads.length; start += CHUNK_SIZE) {
    const chunk = leads.slice(start, start + CHUNK_SIZE);
    const batch = writeBatch(db);

    for (let i = 0; i < chunk.length; i++) {
      const lead = chunk[i];
      const rowNum = start + i + 1;

      const name  = lead.name?.trim() ?? '';
      const phone = (lead.phone ?? '').replace(/[^\d+\-\s()]/g, '').trim();
      const digits = phone.replace(/\D/g, '');

      if (name.length < 2) {
        result.failedCount++;
        result.errors.push(`Row ${rowNum}: name too short ("${name}")`);
        continue;
      }
      if (digits.length < 5) {
        result.failedCount++;
        result.errors.push(`Row ${rowNum}: invalid phone ("${phone}")`);
        continue;
      }

      const rawSource = (lead.source as LeadSource) ?? defaultSource;
      const finalSource = VALID_SOURCES.includes(rawSource) ? rawSource : defaultSource;

      const docRef = doc(leadsRef);
      batch.set(docRef, {
        name,
        phone,
        email:          lead.email || null,
        source:         finalSource,
        notes:          lead.notes  || null,
        status:         'new',
        assignedTo:     assignedToId,
        assignedToName: assignedToName ?? null,
        uploadBatchId,
        uploadedBy:     uploadedById   ?? null,
        uploadedByName: uploadedByName ?? null,
        createdAt: nowISO,
        updatedAt: nowISO,
      });
      result.successCount++;
    }

    await batch.commit();
  }

  return result;
};
