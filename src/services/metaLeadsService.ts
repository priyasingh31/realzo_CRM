/**
 * Meta Lead Ads — API Polling Service (no webhook required)
 *
 * Flow:
 *   1. For each Meta account, fetch all active lead forms for the page.
 *   2. For each form, fetch leads created after the last sync timestamp.
 *   3. Dedup against Firestore using metaLeadId so we never double-import.
 *   4. Save new leads, run round-robin assignment, push notification.
 *
 * Sync state is stored in Firestore:  metaSync/{1|2}  →  { lastSyncAt: ISO string }
 *
 * Trigger this from:
 *   - Manual "Sync Now" button in Settings / Dashboard
 *   - App foreground event (AppState 'active')
 *   - Firebase Scheduled Function (server-side, every 5 min)
 */

import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, query,
  where, Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { WHATSAPP_ACCOUNTS } from '@/services/whatsappService';
import { assignLeadRoundRobin, getProjectByPageId, getProjectByCampaignId } from '@/services/roundRobinService';
import { getMetaConnection } from '@/services/metaAuthService';

const GRAPH = 'https://graph.facebook.com/v21.0';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MetaSyncResult {
  account: 1 | 2 | 3;
  formsChecked: number;
  newLeads: number;
  errors: string[];
}

interface MetaField   { name: string; values: string[] }
interface MetaLeadRaw {
  id: string;
  created_time: string;
  field_data: MetaField[];
  ad_id?: string;
  ad_name?: string;
  form_id?: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  platform?: string;
}
interface MetaFormRaw { id: string; name: string; status: string; page_id?: string }

// ─── Sync State (Firestore: metaSync/{accountNum}) ────────────────────────────

async function getLastSyncTime(accountNum: 1 | 2 | 3): Promise<Date> {
  const snap = await getDoc(doc(db, 'metaSync', String(accountNum)));
  if (snap.exists() && snap.data().lastSyncAt) {
    const val = snap.data().lastSyncAt;
    return val instanceof Timestamp ? val.toDate() : new Date(val);
  }
  // Default: 7 days back so we don't miss recent leads on first run
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function setLastSyncTime(accountNum: 1 | 2 | 3, time: Date): Promise<void> {
  await setDoc(doc(db, 'metaSync', String(accountNum)), {
    lastSyncAt: time.toISOString(),
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

// ─── Meta Graph API helpers ───────────────────────────────────────────────────

// Exchange a system user token for a Page Access Token (required for leadgen endpoints)
async function getPageToken(pageId: string, systemToken: string): Promise<string> {
  const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${systemToken}`);
  const json = await res.json() as { access_token?: string; error?: { message: string } };
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(`getPageToken error: ${json.error?.message ?? res.status}`);
  }
  return json.access_token;
}

async function fetchLeadForms(pageId: string, pageToken: string): Promise<MetaFormRaw[]> {
  const all: MetaFormRaw[] = [];
  let nextUrl: string | undefined = `${GRAPH}/${pageId}/leadgen_forms?fields=id,name,status&limit=100&access_token=${pageToken}`;
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const json = await res.json() as { data?: MetaFormRaw[]; paging?: { next?: string }; error?: { message: string } };
    if (!res.ok || json.error) throw new Error(`fetchLeadForms error: ${json.error?.message ?? res.status}`);
    all.push(...(json.data || []));
    nextUrl = json.paging?.next;
  }
  return all; // include ARCHIVED forms — they also have leads
}

async function fetchLeadsFromForm(
  formId: string,
  accessToken: string,
  since: Date | null
): Promise<MetaLeadRaw[]> {
  const fields = 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,platform';
  const sinceParam = since ? `&since=${Math.floor(since.getTime() / 1000)}` : '';
  const url = `${GRAPH}/${formId}/leads?fields=${fields}${sinceParam}&limit=100&access_token=${accessToken}`;

  const allLeads: MetaLeadRaw[] = [];
  let nextUrl: string | undefined = url;

  // Handle cursor-based pagination
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const json = await res.json() as {
      data?: MetaLeadRaw[];
      paging?: { next?: string };
      error?: { message: string };
    };
    if (!res.ok || json.error) {
      console.warn(`fetchLeadsFromForm (${formId}):`, json.error?.message ?? res.status);
      break;
    }
    allLeads.push(...(json.data || []));
    nextUrl = json.paging?.next; // undefined when no more pages
  }

  return allLeads;
}

// ─── Parse Meta field_data into plain object ──────────────────────────────────

function parseFields(fieldData: MetaField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData) {
    out[f.name] = f.values?.[0] ?? '';
  }
  return out;
}

// ─── Check if lead already exists in Firestore (dedup) ───────────────────────

async function leadExists(metaLeadId: string): Promise<boolean> {
  const snap = await getDocs(
    query(collection(db, 'leads'), where('metaLeadId', '==', metaLeadId))
  );
  return !snap.empty;
}

// ─── Save one Meta lead to Firestore + assign round-robin ─────────────────────

async function saveLead(
  raw: MetaLeadRaw,
  formId: string,
  pageId: string,
  accountNum: 1 | 2 | 3
): Promise<string | null> {
  // Dedup
  if (await leadExists(raw.id)) return null;

  const f = parseFields(raw.field_data || []);

  const firstName = f['first_name'] ?? '';
  const lastName  = f['last_name']  ?? '';
  const name      = f['full_name']  || `${firstName} ${lastName}`.trim() || 'Unknown';
  const phone     = f['phone_number'] || f['phone'] || f['mobile_number'] || '';
  const email     = f['email'] ?? '';
  const budget    = parseFloat(f['budget'] ?? f['budget_range'] ?? '0') || null;
  const city      = f['city'] || f['location'] || f['preferred_location'] || '';
  const state     = f['state'] || f['province'] || '';
  const location  = city && state ? `${city}, ${state}` : city || state;
  const propertyType = f['property_type'] || f['project_type'] || '';
  const timeline     = f['timeline'] || f['purchase_timeline'] || '';
  // Scan all field keys for purchase purpose (field names vary by form)
  const purposeKeywords = ['purpose', 'require', 'reason', 'looking', 'intent', 'buying_for', 'invest', 'living', 'self_use', 'end_use'];
  const purposeFromScan = Object.entries(f).find(([k, v]) =>
    v?.trim() && purposeKeywords.some(kw => k.toLowerCase().includes(kw))
  )?.[1] ?? '';

  const requirements = [
    f['requirements'], f['message'], f['comments'],
    f['require_for'], f['requirement'],
    purposeFromScan,
    propertyType && `Type: ${propertyType}`,
    timeline && `Timeline: ${timeline}`,
  ].filter(Boolean).join(' | ') || '';
  const jobTitle   = f['job_title'] || f['occupation'] || f['designation'] || '';
  const projectName = f['project_name'] || f['project'] || f['property_name'] || '';

  // Convert Meta UTC timestamp to local ISO string so date comparisons are IST-correct
  const createdAtLocal = raw.created_time
    ? new Date(raw.created_time).toISOString()
    : new Date().toISOString();

  const ref = await addDoc(collection(db, 'leads'), {
    name,
    phone,
    email,
    jobTitle:     jobTitle || null,
    source: 'meta',
    status: 'new',
    budget,
    requirements,
    projectName:  projectName || null,
    location,
    propertyType,
    assignedTo:   null,
    assignedToName: null,
    aiScore:      null,
    metaLeadId:   raw.id,
    metaFormId:   formId,
    metaPageId:   pageId,
    metaAccount:  accountNum,
    metaAdId:     raw.ad_id     || null,
    metaAdName:   raw.ad_name   || null,
    metaCampaignId:   raw.campaign_id   || null,
    metaCampaignName: raw.campaign_name || null,
    metaAdsetName:    raw.adset_name    || null,
    metaPlatform:     raw.platform      || null,
    metaFields:   f,
    notes:        '',
    tags:         [],
    respondedAt:  null,
    lastContactedAt: null,
    nextFollowUpAt:  null,
    createdAt:    createdAtLocal,
    updatedAt:    new Date().toISOString(),
  });

  // Write in-app notification so all CRM users are alerted in real-time
  try {
    await addDoc(collection(db, 'notifications'), {
      type: 'new_lead',
      leadId:       ref.id,
      leadName:     name,
      phone,
      email:        email || null,
      source:       'meta',
      metaAccount:  accountNum,
      campaignName: raw.campaign_name || null,
      requirements: requirements || null,
      jobTitle:     jobTitle || null,
      metaFields:   f,
      createdAt:    new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed to write lead notification:', err);
  }

  // Try round-robin: campaign match first (more specific), fall back to page match
  try {
    const campaignId = raw.campaign_id || null;
    const project = campaignId
      ? (await getProjectByCampaignId(campaignId)) ?? (await getProjectByPageId(pageId))
      : await getProjectByPageId(pageId);
    if (project) await assignLeadRoundRobin(ref.id, project.id);
  } catch (err) {
    console.warn('Round-robin assignment failed for lead', ref.id, err);
  }

  return ref.id;
}

// ─── Main sync function for one account ──────────────────────────────────────

export async function syncMetaAccount(accountNum: 1 | 2 | 3, since?: Date | null): Promise<MetaSyncResult> {
  const result: MetaSyncResult = { account: accountNum, formsChecked: 0, newLeads: 0, errors: [] };

  const config = WHATSAPP_ACCOUNTS[accountNum];
  const systemToken = config.metaAccessToken;
  const pageId      = config.pageId;

  // since=undefined → use Firestore cursor; since=null → full import (no time filter)
  const lastSync = since === undefined ? await getLastSyncTime(accountNum) : since;
  const syncStart = new Date();

  // Resolve page token once — reuse for all form/lead calls
  let pageToken: string;
  try {
    pageToken = await getPageToken(pageId, systemToken);
  } catch (err) {
    result.errors.push(`Account ${accountNum} — failed to get page token: ${err}`);
    return result;
  }

  let forms: MetaFormRaw[] = [];
  try {
    forms = await fetchLeadForms(pageId, pageToken);
  } catch (err) {
    result.errors.push(`Account ${accountNum} — failed to fetch forms: ${err}`);
    return result;
  }

  result.formsChecked = forms.length;

  for (const form of forms) {
    try {
      const leads = await fetchLeadsFromForm(form.id, pageToken, lastSync);
      for (const lead of leads) {
        const savedId = await saveLead(lead, form.id, pageId, accountNum);
        if (savedId) result.newLeads++;
      }
    } catch (err) {
      result.errors.push(`Form ${form.id} (${form.name}): ${err}`);
    }
  }

  // Only advance the sync cursor if there were no fatal errors
  if (result.errors.length === 0 || result.newLeads > 0) {
    await setLastSyncTime(accountNum, syncStart);
  }

  return result;
}

// ─── Sync all accounts ────────────────────────────────────────────────────────

export async function syncAllMetaAccounts(): Promise<MetaSyncResult[]> {
  return Promise.all([syncMetaAccount(1), syncMetaAccount(2), syncMetaAccount(3)]);
}

/** Full historical import — fetches ALL leads regardless of sync cursor */
export async function fullSyncAllMetaAccounts(): Promise<MetaSyncResult[]> {
  return Promise.all([syncMetaAccount(1, null), syncMetaAccount(2, null), syncMetaAccount(3, null)]);
}

// ─── Sync using the OAuth-connected pages (preferred path) ───────────────────

/**
 * Sync leads from pages connected via Meta OAuth login.
 * Falls back to the hardcoded .env account tokens when no OAuth connection
 * is stored (so the app still works before the first "Connect Meta" login).
 */
export async function syncConnectedPages(): Promise<MetaSyncResult[]> {
  const connection = await getMetaConnection();

  // No OAuth connection yet — fall back to hardcoded account tokens
  if (!connection || !connection.connected || !connection.pages?.length) {
    return syncAllMetaAccounts();
  }

  const results: MetaSyncResult[] = [];
  const lastSync = await getLastSyncTime(1);   // shared cursor for OAuth path
  const syncStart = new Date();
  let totalNewLeads = 0;

  for (const page of connection.pages) {
    const result: MetaSyncResult = {
      account: 1,
      formsChecked: 0,
      newLeads: 0,
      errors: [],
    };

    try {
      const forms = await fetchLeadForms(page.id, page.pageAccessToken);
      result.formsChecked = forms.length;

      for (const form of forms) {
        try {
          const leads = await fetchLeadsFromForm(form.id, page.pageAccessToken, lastSync);
          for (const lead of leads) {
            const savedId = await saveLead(lead, form.id, page.id, 1);
            if (savedId) { result.newLeads++; totalNewLeads++; }
          }
        } catch (err) {
          result.errors.push(`Form ${form.id} (${form.name}): ${err}`);
        }
      }
    } catch (err) {
      result.errors.push(`Page ${page.id} (${page.name}): ${err}`);
    }

    results.push(result);
  }

  // Advance the sync cursor whether or not there were errors
  if (totalNewLeads > 0 || results.every(r => r.errors.length === 0)) {
    await setLastSyncTime(1, syncStart);
  }

  return results;
}

// ─── Reset sync cursor (re-import all leads from scratch) ─────────────────────

export async function resetMetaSyncCursor(accountNum?: 1 | 2): Promise<void> {
  if (accountNum) {
    await setDoc(doc(db, 'metaSync', String(accountNum)), { lastSyncAt: null }, { merge: true });
  } else {
    await Promise.all([
      setDoc(doc(db, 'metaSync', '1'), { lastSyncAt: null }, { merge: true }),
      setDoc(doc(db, 'metaSync', '2'), { lastSyncAt: null }, { merge: true }),
    ]);
  }
}

// ─── Get sync status (for UI display) ────────────────────────────────────────

export async function getMetaSyncStatus(): Promise<{
  account1LastSync: string | null;
  account2LastSync: string | null;
}> {
  const [s1, s2] = await Promise.all([
    getDoc(doc(db, 'metaSync', '1')),
    getDoc(doc(db, 'metaSync', '2')),
  ]);
  return {
    account1LastSync: s1.exists() ? s1.data()?.lastSyncAt ?? null : null,
    account2LastSync: s2.exists() ? s2.data()?.lastSyncAt ?? null : null,
  };
}

// ─── Fetch Meta Campaigns ─────────────────────────────────────────────────────
// Two sources:
//   1. Firestore leads collection (campaigns we've already seen) — fast, always works
//   2. Meta Graph API ad accounts — live, requires correct token permissions

export interface MetaCampaign {
  id: string;
  name: string;
  account: 1 | 2 | 3;
  status?: string;
}

// Primary: extract unique campaigns from already-synced leads in Firestore
export async function fetchCampaignsFromLeads(): Promise<MetaCampaign[]> {
  const snap = await getDocs(
    query(collection(db, 'leads'), where('source', '==', 'meta'))
  );
  const seen = new Map<string, MetaCampaign>();
  snap.docs.forEach(d => {
    const data = d.data();
    if (data.metaCampaignId && data.metaCampaignName && !seen.has(data.metaCampaignId)) {
      seen.set(data.metaCampaignId, {
        id:      data.metaCampaignId,
        name:    data.metaCampaignName,
        account: data.metaAccount ?? 1,
        status:  'ACTIVE',
      });
    }
  });
  return Array.from(seen.values()).sort((a, b) => a.name.localeCompare(b.name));
}

// Secondary: live fetch from Meta Graph API via Ad Accounts linked to each page
export async function fetchCampaignsFromMeta(): Promise<MetaCampaign[]> {
  const campaigns: MetaCampaign[] = [];

  for (const [accNumStr, config] of Object.entries(WHATSAPP_ACCOUNTS)) {
    const accountNum = parseInt(accNumStr) as 1 | 2 | 3;
    const { metaAccessToken, pageId } = config as any;
    if (!metaAccessToken || !pageId) continue;

    try {
      // Get page token
      const ptRes = await fetch(
        `${GRAPH}/${pageId}?fields=access_token&access_token=${metaAccessToken}`
      );
      const ptJson = await ptRes.json() as { access_token?: string };
      const pageToken = ptJson.access_token;
      if (!pageToken) continue;

      // Get ad accounts connected to this page
      const aaRes = await fetch(
        `${GRAPH}/${pageId}/adaccounts?fields=id,name&access_token=${pageToken}`
      );
      const aaJson = await aaRes.json() as { data?: { id: string; name: string }[] };
      const adAccounts = aaJson.data ?? [];

      for (const aa of adAccounts) {
        const campRes = await fetch(
          `${GRAPH}/${aa.id}/campaigns?fields=id,name,status&limit=200&access_token=${pageToken}`
        );
        const campJson = await campRes.json() as { data?: { id: string; name: string; status: string }[] };
        (campJson.data ?? []).forEach(c => {
          campaigns.push({ id: c.id, name: c.name, account: accountNum, status: c.status });
        });
      }
    } catch {
      // Silently skip accounts with permission issues
    }
  }

  return campaigns.sort((a, b) => a.name.localeCompare(b.name));
}
