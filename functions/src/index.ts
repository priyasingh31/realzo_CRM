import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as nodemailer from 'nodemailer';
import cors from 'cors';

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();
const corsHandler = cors({ origin: true });

// ─── COLLECTIONS ──────────────────────────────────────────────────────────────
const COLLECTIONS = {
  LEADS: 'leads',
  DEALS: 'deals',
  PROPERTIES: 'properties',
  USERS: 'users',
  NOTIFICATIONS: 'notifications',
};

// ─── ACCOUNT CONFIG — All 3 Meta accounts ────────────────────────────────────
const META_ACCOUNTS = {
  1: {
    label: 'Account 1',
    systemToken: 'EAANYRO9zZA44BRG2TIblrLUSeuMv5Gc875FzZCc0lAxNrJwpCi2cSHPPjpRnQJX9J7k5zBGhJTYWjGYTpp8VL6XacHABFKaZBhxD38QW0N5GZB7prVTLS2vsCHEZCC0HJZCTQ9ZAGaSO9fGrQ0qHkdGyZCXgkNZAPVvjxIxPEmN7MxCJf60QHZAlYwsNrgbIw5fAZDZD',
    pageId: '1018805394651044',
    waAccessToken: 'EAANYRO9zZA44BRAhTJuegy1mRzUTxgA9fbMZA0ZB1roZAJJ5UwINiFQ69SR0kXm8GsnKUVrWN5EOAd3otP1mU3F9frSaJBVR8skZAapV4ZB8XYBUb04ktTLPKZBIFx5VXuc3fSy41jbxYYwsVQPYUx13aW6i7H8hjiYEUWPvfYCu4jrEXV8AIJ6xEJ0AOjdkwZDZD',
    phoneNumberId: '1132168796636153',
    waVerifyToken: 'relazo_wa_verify_acc1',
  },
  2: {
    label: 'Account 2',
    systemToken: 'EAAY4aFUbg1cBReyuvZAIggEueFZBZAUcsvJJxER6oRMPc3tTQjQ6N1T0jBIMoTZBonWnU3neztKIYMHifbr2jxSXwVR8s8VRY3AlFd8QJPsyPTu2TA9hfPUq7GgAEu8v8AR8fDU0Ul3BVsPBN8x7njlUJY1VJcb8JZArE58N1oAhhFwlR8VM3caqhzWwc4PHCMwZDZD',
    pageId: '968440359693058',
    waAccessToken: 'EAAY4aFUbg1cBROa0lZBAgNTc5LPW2b3g4hkWGAwcVzZCIk8tXNy4OUACXABCf3pp6zVwN9Pk14dmmlh4Ge7G81CI3TVNyZCFtPRP7kbO3NtvyklvtlJhZA8c4SLtRqzqVvZCEAGkEynrZCCrt7FgUvswf32Y5xfst9jnxCFGBaBYfzPSGrNzU2fP9nzAsDY4QtiwZDZD',
    phoneNumberId: '1034962913036449',
    waVerifyToken: 'relazo_wa_verify_acc2',
  },
  3: {
    label: 'Account 3',
    systemToken: 'EAAviFIzxrcIBRd7oxq9Domk5oAlshAPWwuV320kxACDBrBFXur4NshIdnKLoZBG6dI3kR36uOxalhkL14KTFmoEcOOsSbdx6vIZCjwZCVhTVImazizZBkTA4x87spO6a4FheCTfaU1iNOmqIAaGYyWdVYsnZBnfNW7imSMnUjTqbg3RGL9ryhkLSXNsqsEQZDZD',
    pageId: '337675829430214',
    waAccessToken: '',
    phoneNumberId: '',
    waVerifyToken: '',
  },
} as const;

const META_ACCOUNT_2 = META_ACCOUNTS[2]; // keep for WhatsApp webhook compat

// ─── MODULE-LEVEL HELPERS ────────────────────────────────────────────────────

async function getAdminManagerTokens(): Promise<string[]> {
  const [adminSnap, managerSnap] = await Promise.all([
    db.collection(COLLECTIONS.USERS).where('role', '==', 'admin').where('isActive', '==', true).get(),
    db.collection(COLLECTIONS.USERS).where('role', '==', 'manager').where('isActive', '==', true).get(),
  ]);
  const tokens: string[] = [];
  for (const d of [...adminSnap.docs, ...managerSnap.docs]) {
    const t = d.data().pushToken;
    if (t && !tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

// Returns push tokens for ALL active CRM users
async function getAllUserTokens(): Promise<string[]> {
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('isActive', '==', true)
    .get();
  const tokens: string[] = [];
  for (const d of snap.docs) {
    const t = d.data().pushToken;
    if (t && !tokens.includes(t)) tokens.push(t);
  }
  return tokens;
}

async function sendPushBatch(messages: object[]): Promise<void> {
  if (!messages.length) return;
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
}

async function assignRoundRobin(
  leadId: string,
  leadName: string,
  leadPhone: string,
  accountNum: 1 | 2,
  projectDoc: admin.firestore.DocumentSnapshot
): Promise<void> {
  const project = projectDoc.data()!;
  const { salesPersonIds = [], roundRobinIndex = 0 } = project;
  if (!salesPersonIds.length) return;

  const idx = roundRobinIndex % salesPersonIds.length;
  const uid = salesPersonIds[idx];
  const userSnap = await db.collection(COLLECTIONS.USERS).doc(uid).get();
  if (!userSnap.exists) return;

  const salesUser = userSnap.data()!;
  const escalateAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.runTransaction(async (tx) => {
    tx.update(projectDoc.ref, { roundRobinIndex: idx + 1 });
    tx.update(db.collection(COLLECTIONS.LEADS).doc(leadId), {
      assignedTo: uid,
      assignedToName: salesUser.displayName || '',
      managerId: project.managerId || null,
      status: 'assigned',
      respondedAt: null,
      escalateAt: admin.firestore.Timestamp.fromDate(escalateAt),
      updatedAt: new Date().toISOString(),
    });
  });

  if (salesUser.pushToken) {
    await sendPushBatch([{
      to: salesUser.pushToken,
      title: '🔔 New Lead Assigned to You!',
      body: `${leadName}${leadPhone ? ` (${leadPhone})` : ''} — Respond within 10 min!`,
      data: { type: 'lead_assigned', leadId },
      sound: 'lead_alert.wav',
      priority: 'high',
      channelId: 'new_leads',
    }]);
  }

  if (project.managerId) {
    const managerSnap = await db.collection(COLLECTIONS.USERS).doc(project.managerId).get();
    const manager = managerSnap.data();
    if (manager?.pushToken && manager.pushToken !== salesUser.pushToken) {
      await sendPushBatch([{
        to: manager.pushToken,
        title: '📋 Lead Assigned',
        body: `${leadName} assigned to ${salesUser.displayName || 'Sales'} (Account ${accountNum})`,
        data: { type: 'lead_assigned', leadId },
        sound: 'default',
        priority: 'high',
        channelId: 'new_leads',
      }]);
    }
  }
}

// ─── ON LEAD ASSIGNED — START 10-MINUTE ESCALATION TIMER ────────────────────
export const onLeadAssigned = functions.firestore
  .document('leads/{leadId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (!after) return;

    const leadId = context.params.leadId;

    // Trigger when lead gets newly assigned (assignedTo set, respondedAt = null)
    const justAssigned =
      after.assignedTo &&
      after.respondedAt === null &&
      (!before || !before.assignedTo || before.assignedTo !== after.assignedTo);

    if (!justAssigned) return;

    // Store escalation deadline (10 minutes from now)
    const escalateAt = new Date(Date.now() + 10 * 60 * 1000);
    await change.after.ref.update({ escalateAt: admin.firestore.Timestamp.fromDate(escalateAt) });

    console.log(`Escalation scheduled for lead ${leadId} at ${escalateAt.toISOString()}`);
  });

// ─── SHARED META SYNC HELPERS ────────────────────────────────────────────────

const GRAPH = 'https://graph.facebook.com/v21.0';

async function getLastSync(accountNum: number): Promise<Date> {
  const snap = await db.collection('metaSync').doc(String(accountNum)).get();
  if (snap.exists && snap.data()?.lastSyncAt) return new Date(snap.data()!.lastSyncAt);
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
}

async function setLastSync(accountNum: number, time: Date): Promise<void> {
  await db.collection('metaSync').doc(String(accountNum)).set(
    { lastSyncAt: time.toISOString(), updatedAt: new Date().toISOString() },
    { merge: true }
  );
}

// Get a real Page Access Token using multiple fallback strategies
async function getPageToken(pageId: string, userToken: string): Promise<string> {
  // Strategy 1: /me/accounts — most reliable, returns true page tokens for all pages the user manages
  try {
    let nextUrl: string | undefined =
      `${GRAPH}/me/accounts?fields=id,name,access_token&limit=200&access_token=${userToken}`;
    while (nextUrl) {
      const res = await fetch(nextUrl);
      const json = await res.json() as { data?: Array<{ id: string; name: string; access_token: string }>; paging?: { next?: string }; error?: { message: string } };
      if (!json.error && json.data) {
        const page = json.data.find(p => p.id === pageId);
        if (page?.access_token) {
          console.log(`[getPageToken] Found page "${page.name}" via /me/accounts`);
          return page.access_token;
        }
        nextUrl = json.paging?.next;
      } else {
        console.warn(`[getPageToken] /me/accounts error: ${json.error?.message}`);
        break;
      }
    }
  } catch (e) {
    console.warn('[getPageToken] /me/accounts failed:', e);
  }

  // Strategy 2: direct /{pageId}?fields=access_token exchange
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${userToken}`);
    const json = await res.json() as { access_token?: string; error?: { message: string } };
    if (!json.error && json.access_token) {
      console.log(`[getPageToken] Got token via /{pageId}?fields=access_token`);
      return json.access_token;
    }
    console.warn(`[getPageToken] direct exchange failed: ${json.error?.message}`);
  } catch (e) {
    console.warn('[getPageToken] direct exchange threw:', e);
  }

  // Strategy 3: use the token as-is (works if it's already a page token or system user token with direct page access)
  console.warn(`[getPageToken] Falling back to raw token for page ${pageId}`);
  return userToken;
}

// Fetch ALL forms regardless of status (ACTIVE, ARCHIVED, DELETED all can have leads)
async function fetchForms(pageId: string, pageToken: string): Promise<Array<{ id: string; name: string; status: string; leads_count?: number }>> {
  const all: Array<{ id: string; name: string; status: string; leads_count?: number }> = [];
  let nextUrl: string | undefined =
    `${GRAPH}/${pageId}/leadgen_forms?fields=id,name,status,leads_count&limit=100&access_token=${pageToken}`;

  while (nextUrl) {
    const res = await fetch(nextUrl);
    const json = await res.json() as { data?: any[]; paging?: { next?: string }; error?: { message: string } };
    if (!res.ok || json.error) throw new Error(json.error?.message ?? String(res.status));
    all.push(...(json.data || []));
    nextUrl = json.paging?.next;
  }
  return all;
}

// Fetch leads from a form — since=null means fetch ALL leads (no time filter)
async function fetchLeadsFromForm(
  formId: string,
  pageToken: string,
  since: Date | null
): Promise<Array<{ id: string; created_time: string; field_data: Array<{ name: string; values: string[] }>; ad_id?: string; ad_name?: string; campaign_id?: string; campaign_name?: string; adset_name?: string }>> {
  const fields = 'id,created_time,field_data,ad_id,ad_name,campaign_id,campaign_name,adset_id,adset_name,platform';
  const all: any[] = [];

  // Build URL — only add time filter if since is provided
  let startUrl = `${GRAPH}/${formId}/leads?fields=${fields}&limit=100&access_token=${pageToken}`;
  if (since) {
    startUrl += `&since=${Math.floor(since.getTime() / 1000)}`;
  }

  let nextUrl: string | undefined = startUrl;
  while (nextUrl) {
    const res = await fetch(nextUrl);
    const json = await res.json() as { data?: any[]; paging?: { next?: string }; error?: { message: string } };
    if (!res.ok || json.error) {
      console.warn(`fetchLeadsFromForm (${formId}):`, json.error?.message ?? res.status);
      break;
    }
    all.push(...(json.data || []));
    nextUrl = json.paging?.next;
  }
  return all;
}

function parseMetaFields(fieldData: Array<{ name: string; values: string[] }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fieldData || []) out[f.name] = f.values?.[0] ?? '';
  return out;
}

async function leadExists(metaLeadId: string): Promise<boolean> {
  const snap = await db.collection(COLLECTIONS.LEADS).where('metaLeadId', '==', metaLeadId).limit(1).get();
  return !snap.empty;
}

async function getProjectByPageId(pageId: string): Promise<admin.firestore.DocumentSnapshot | null> {
  const snap = await db.collection('projects')
    .where('metaPageId', '==', pageId)
    .where('isActive', '==', true)
    .limit(1).get();
  return snap.empty ? null : snap.docs[0];
}

async function saveLead(
  raw: { id: string; created_time: string; field_data: Array<{ name: string; values: string[] }>; ad_id?: string; ad_name?: string; campaign_id?: string; campaign_name?: string; adset_name?: string },
  formId: string,
  pageId: string,
  accountNum: 1 | 2 | 3
): Promise<string | null> {
  if (await leadExists(raw.id)) return null;

  const f = parseMetaFields(raw.field_data);

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
  const requirements = [
    f['requirements'], f['message'], f['comments'],
    propertyType && `Type: ${propertyType}`,
    timeline && `Timeline: ${timeline}`,
  ].filter(Boolean).join(' | ') || '';

  const leadRef = db.collection(COLLECTIONS.LEADS).doc();
  await leadRef.set({
    id:             leadRef.id,
    name, phone, email,
    source:         'meta',
    status:         'new',
    budget,
    requirements,
    location,
    propertyType,
    assignedTo:     null,
    assignedToName: null,
    aiScore:        null,
    metaLeadId:     raw.id,
    metaFormId:     formId,
    metaPageId:     pageId,
    metaAccount:    accountNum,
    metaAdId:       raw.ad_id       || null,
    metaAdName:     raw.ad_name     || null,
    metaCampaignId:   raw.campaign_id   || null,
    metaCampaignName: raw.campaign_name || null,
    metaAdsetName:    raw.adset_name    || null,
    notes:          '',
    tags:           [],
    respondedAt:    null,
    lastContactedAt: null,
    nextFollowUpAt:  null,
    createdAt:      new Date(raw.created_time).toISOString(),
    updatedAt:      new Date().toISOString(),
  });

  return leadRef.id;
}

async function processMetaAccount(
  accountNum: 1 | 2 | 3,
  since?: Date | null  // undefined = use Firestore cursor, null = full import (no time filter)
): Promise<{ newLeads: number; skipped: number; forms: number; errors: string[] }> {
  const account = META_ACCOUNTS[accountNum];
  const syncStart = new Date();
  let newLeads = 0, skipped = 0;
  const errors: string[] = [];

  // undefined → use cursor; null → no filter (full import); Date → specific cutoff
  const sinceDate = since === undefined ? await getLastSync(accountNum) : since;

  // Step 1: Exchange system token → page access token
  let pageToken: string;
  try {
    pageToken = await getPageToken(account.pageId, account.systemToken);
    console.log(`[${account.label}] Page token obtained`);
  } catch (err) {
    const msg = `${account.label}: page token failed — ${err}`;
    console.error(msg);
    return { newLeads: 0, skipped: 0, forms: 0, errors: [msg] };
  }

  // Step 2: Fetch ALL forms (no status filter — ARCHIVED forms also have leads)
  let forms: Array<{ id: string; name: string; status: string; leads_count?: number }>;
  try {
    forms = await fetchForms(account.pageId, pageToken);
    console.log(`[${account.label}] Found ${forms.length} forms:`, forms.map(f => `${f.name}(${f.status},${f.leads_count ?? '?'}leads)`).join(', '));
  } catch (err) {
    const msg = `${account.label}: fetch forms failed — ${err}`;
    console.error(msg);
    return { newLeads: 0, skipped: 0, forms: 0, errors: [msg] };
  }

  // Step 3: For each form, fetch leads and save to Firestore
  for (const form of forms) {
    try {
      const leads = await fetchLeadsFromForm(form.id, pageToken, sinceDate);
      console.log(`[${account.label}] Form "${form.name}" (${form.status}): ${leads.length} leads fetched`);

      for (const lead of leads) {
        const savedId = await saveLead(lead, form.id, account.pageId, accountNum);
        if (!savedId) { skipped++; continue; }
        newLeads++;

        // Extract name/phone for notifications
        const fields = parseMetaFields(lead.field_data || []);
        const name  = fields['full_name'] || `${fields['first_name'] ?? ''} ${fields['last_name'] ?? ''}`.trim() || 'Lead';
        const phone = fields['phone_number'] || fields['phone'] || fields['mobile_number'] || '';

        // Notify admins + managers (best-effort, don't fail sync)
        getAdminManagerTokens().then(tokens => {
          if (tokens.length) sendPushBatch(tokens.map(token => ({
            to: token,
            title: '🔔 New Lead from Facebook!',
            body: `${name} (${phone || 'no phone'}) — ${account.label}`,
            data: { type: 'new_lead', leadId: savedId },
            sound: 'lead_alert.wav', priority: 'high', channelId: 'new_leads',
          }))).catch(e => console.warn('Push failed:', e));
        }).catch(() => {});

        // Round-robin assignment (best-effort)
        getProjectByPageId(account.pageId).then(projectDoc => {
          if (projectDoc) assignRoundRobin(savedId, name, phone, accountNum as 1 | 2, projectDoc)
            .catch(e => console.warn('Assignment failed:', e));
        }).catch(() => {});

        // In-app notification record
        db.collection(COLLECTIONS.NOTIFICATIONS).add({
          title: `New Lead — ${account.label}`,
          body:  `${name} (${phone || 'no phone'})`,
          type:  'new_lead',
          leadId: savedId,
          read:  false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    } catch (err) {
      const msg = `Form "${form.name}" (${form.id}): ${err}`;
      console.error(`[${account.label}]`, msg);
      errors.push(msg);
    }
  }

  // Always advance the sync cursor so the next scheduled run is incremental
  if (!errors.length || newLeads > 0) {
    await setLastSync(accountNum, syncStart);
  }

  console.log(`[${account.label}] Done: ${newLeads} new, ${skipped} dupes, ${errors.length} errors`);
  return { newLeads, skipped, forms: forms.length, errors };
}

// ─── SCHEDULED: POLL META LEAD ADS API (every 1 minute) ──────────────────────
export const syncMetaLeads = functions.pubsub
  .schedule('every 1 minutes')
  .onRun(async () => {
    console.log('[syncMetaLeads] Polling all 3 Meta accounts...');
    const [r1, r2, r3] = await Promise.all([
      processMetaAccount(1),
      processMetaAccount(2),
      processMetaAccount(3),
    ]);
    console.log(
      `[syncMetaLeads] Done.`,
      `Acc1: ${r1.newLeads} leads${r1.errors.length ? ` (errors: ${r1.errors.join('; ')})` : ''}`,
      `Acc2: ${r2.newLeads} leads${r2.errors.length ? ` (errors: ${r2.errors.join('; ')})` : ''}`,
      `Acc3: ${r3.newLeads} leads${r3.errors.length ? ` (errors: ${r3.errors.join('; ')})` : ''}`,
    );
  });

// ─── SCHEDULED: CHECK UNANSWERED LEADS (runs every 2 minutes) ────────────────
export const checkUnansweredLeads = functions.pubsub
  .schedule('every 2 minutes')
  .onRun(async () => {
    const now = admin.firestore.Timestamp.now();

    // Find leads past their escalation time that haven't been responded to
    const snap = await db.collection(COLLECTIONS.LEADS)
      .where('respondedAt', '==', null)
      .where('escalateAt', '<=', now)
      .where('status', '==', 'assigned')
      .get();

    if (snap.empty) return;

    console.log(`Found ${snap.size} unanswered leads to escalate`);

    for (const leadDoc of snap.docs) {
      const lead = leadDoc.data();
      await escalateLead(leadDoc.id, lead);
    }
  });

async function escalateLead(leadId: string, lead: admin.firestore.DocumentData) {
  const { assignedTo, assignedToName, managerId, name: leadName } = lead;

  // Gather push tokens
  const tokensToNotify: string[] = [];

  // 1. Sales person token
  if (assignedTo) {
    const salesDoc = await db.collection(COLLECTIONS.USERS).doc(assignedTo).get();
    if (salesDoc.exists && salesDoc.data()?.pushToken) {
      tokensToNotify.push(salesDoc.data()!.pushToken);
    }
  }

  // 2. Manager token
  if (managerId) {
    const managerDoc = await db.collection(COLLECTIONS.USERS).doc(managerId).get();
    if (managerDoc.exists && managerDoc.data()?.pushToken) {
      tokensToNotify.push(managerDoc.data()!.pushToken);
    }
  }

  // 3. All admins
  const adminSnap = await db.collection(COLLECTIONS.USERS)
    .where('role', '==', 'admin')
    .where('isActive', '==', true)
    .get();
  for (const adminDoc of adminSnap.docs) {
    const token = adminDoc.data()?.pushToken;
    if (token && !tokensToNotify.includes(token)) tokensToNotify.push(token);
  }

  // Send Expo push notifications
  if (tokensToNotify.length > 0) {
    const messages = tokensToNotify.map(token => ({
      to: token,
      title: '⚠️ Lead Not Responded!',
      body: `${assignedToName || 'Sales'} hasn't contacted ${leadName} in 10 minutes`,
      data: { type: 'lead_escalation', leadId },
      sound: 'escalation_alert.wav',
      priority: 'high' as const,
      channelId: 'escalations',
    }));

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      });
      const result = await response.json() as { data: Array<{ status: string }> };
      console.log(`Escalation push sent for lead ${leadId}:`, result.data?.map(d => d.status));
    } catch (err) {
      console.error('Push send error:', err);
    }
  }

  // Log escalation activity
  await db.collection(COLLECTIONS.LEADS).doc(leadId)
    .collection('activities').add({
      type: 'escalation',
      description: `Lead escalated — ${assignedToName} did not respond within 10 minutes`,
      performedBy: 'system',
      performedByName: 'System',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

  // Create Firestore notification for manager + admin
  await db.collection(COLLECTIONS.NOTIFICATIONS).add({
    title: '⚠️ Lead Not Responded',
    body: `${assignedToName} hasn't contacted ${leadName} in 10+ minutes`,
    type: 'lead_escalation',
    leadId,
    assignedAgent: assignedTo,
    managerId: managerId || null,
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Mark lead as escalated (remove escalateAt so it doesn't fire again)
  await db.collection(COLLECTIONS.LEADS).doc(leadId).update({
    escalateAt: admin.firestore.FieldValue.delete(),
    status: 'assigned', // stays assigned but escalated
    escalatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`Lead ${leadId} escalated. Notified ${tokensToNotify.length} users.`);
}

// ─── DIAGNOSE META — step-by-step check of token, forms, and leads ───────────
export const diagnoseMeta = functions.https.onCall(async (_data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const results: Record<string, any> = {};

  for (const num of [1, 2, 3] as const) {
    const account = META_ACCOUNTS[num];
    const accResult: any = { label: account.label, pageId: account.pageId };

    // Step 1: check /me/accounts
    try {
      const meRes = await fetch(`${GRAPH}/me/accounts?fields=id,name,access_token&limit=200&access_token=${account.systemToken}`);
      const meJson = await meRes.json() as any;
      if (meJson.error) {
        accResult.meAccountsError = meJson.error.message;
      } else {
        accResult.meAccountsPages = (meJson.data || []).map((p: any) => ({ id: p.id, name: p.name, hasToken: !!p.access_token }));
        accResult.pageFoundInAccounts = (meJson.data || []).some((p: any) => p.id === account.pageId);
      }
    } catch (e) { accResult.meAccountsError = String(e); }

    // Step 2: get page token
    try {
      const pageToken = await getPageToken(account.pageId, account.systemToken);
      accResult.pageTokenOk = true;
      accResult.pageTokenPrefix = pageToken.substring(0, 20) + '...';

      // Step 3: fetch forms
      const formsRes = await fetch(
        `${GRAPH}/${account.pageId}/leadgen_forms?fields=id,name,status,leads_count&limit=50&access_token=${pageToken}`
      );
      const formsJson = await formsRes.json() as any;
      if (formsJson.error) {
        accResult.formsError = formsJson.error.message;
        accResult.formsErrorCode = formsJson.error.code;
      } else {
        accResult.forms = (formsJson.data || []).map((f: any) => ({
          id: f.id, name: f.name, status: f.status, leadsCount: f.leads_count ?? 0,
        }));
        accResult.totalForms = accResult.forms.length;

        // Step 4: sample leads from first form
        if (accResult.forms.length > 0) {
          const firstForm = accResult.forms[0];
          const leadsRes = await fetch(
            `${GRAPH}/${firstForm.id}/leads?fields=id,created_time,field_data&limit=3&access_token=${pageToken}`
          );
          const leadsJson = await leadsRes.json() as any;
          if (leadsJson.error) {
            accResult.sampleLeadsError = leadsJson.error.message;
          } else {
            accResult.sampleLeads = (leadsJson.data || []).map((l: any) => ({
              id: l.id, created_time: l.created_time,
              fields: Object.fromEntries((l.field_data || []).map((f: any) => [f.name, f.values?.[0]])),
            }));
          }
        }
      }
    } catch (e) {
      accResult.pageTokenOk = false;
      accResult.pageTokenError = String(e);
    }

    results[`account${num}`] = accResult;
  }

  return { success: true, diagnosis: results };
});

// ─── MANUAL SYNC TRIGGER — full historical import, no time filter ─────────────
export const triggerMetaSync = functions.https.onCall(async (_data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const userDoc = await db.collection(COLLECTIONS.USERS).doc(context.auth.uid).get();
  const role = userDoc.data()?.role;
  if (!['admin', 'manager'].includes(role)) {
    throw new functions.https.HttpsError('permission-denied', 'Only admins or managers can trigger sync');
  }

  console.log('[triggerMetaSync] Starting full import (no time filter) for all 3 accounts...');

  // Pass null as since → fetch ALL leads regardless of date
  const [r1, r2, r3] = await Promise.all([
    processMetaAccount(1, null),
    processMetaAccount(2, null),
    processMetaAccount(3, null),
  ]);

  const results = {
    account1: { newLeads: r1.newLeads, skipped: r1.skipped, forms: r1.forms, errors: r1.errors },
    account2: { newLeads: r2.newLeads, skipped: r2.skipped, forms: r2.forms, errors: r2.errors },
    account3: { newLeads: r3.newLeads, skipped: r3.skipped, forms: r3.forms, errors: r3.errors },
  };

  const totalNew = r1.newLeads + r2.newLeads + r3.newLeads;
  console.log(`[triggerMetaSync] Complete. Total new: ${totalNew}`, JSON.stringify(results));
  return { success: true, totalNew, results };
});

// ─── SEND EXPO PUSH (callable — server-side token safety) ────────────────────
export const sendPushNotification = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const { token, title, body, notifData, channelId = 'general' } = data as {
    token: string; title: string; body: string;
    notifData?: Record<string, unknown>; channelId?: string;
  };

  const message = { to: token, title, body, data: notifData || {}, channelId, sound: 'default', priority: 'high' };

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });

  const result = await response.json();
  return { success: true, result };
});

// ─── MARK LEAD RESPONDED (sales person opens / contacts lead) ────────────────
export const markLeadResponded = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const { leadId } = data as { leadId: string };
  if (!leadId) throw new functions.https.HttpsError('invalid-argument', 'leadId required');

  const leadRef = db.collection(COLLECTIONS.LEADS).doc(leadId);
  const snap = await leadRef.get();
  if (!snap.exists) throw new functions.https.HttpsError('not-found', 'Lead not found');

  const lead = snap.data()!;
  if (lead.assignedTo !== context.auth.uid) {
    // Allow managers/admins to mark too
    const userDoc = await db.collection(COLLECTIONS.USERS).doc(context.auth.uid).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'manager'].includes(role)) {
      throw new functions.https.HttpsError('permission-denied', 'Only assigned sales or admins can mark responded');
    }
  }

  await leadRef.update({
    respondedAt: new Date().toISOString(),
    respondedBy: context.auth.uid,
    escalateAt: admin.firestore.FieldValue.delete(),
    status: lead.status === 'assigned' ? 'contacted' : lead.status,
    updatedAt: new Date().toISOString(),
  });

  return { success: true };
});

// ─── ROUND-ROBIN ASSIGN (called after Meta webhook creates lead) ──────────────
export const assignLeadToSales = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const { leadId, projectId } = data as { leadId: string; projectId: string };

  const projectRef = db.collection('projects').doc(projectId);
  const projectSnap = await projectRef.get();
  if (!projectSnap.exists) throw new functions.https.HttpsError('not-found', 'Project not found');

  const project = projectSnap.data()!;
  const { salesPersonIds, roundRobinIndex = 0 } = project;

  if (!salesPersonIds?.length) throw new functions.https.HttpsError('failed-precondition', 'No sales persons in project');

  const nextIndex = roundRobinIndex % salesPersonIds.length;
  const assignedUid = salesPersonIds[nextIndex];

  const userDoc = await db.collection(COLLECTIONS.USERS).doc(assignedUid).get();
  const salesPerson = userDoc.data();

  // Update project index
  await projectRef.update({ roundRobinIndex: nextIndex + 1 });

  // Assign lead
  const escalateAt = new Date(Date.now() + 10 * 60 * 1000);
  await db.collection(COLLECTIONS.LEADS).doc(leadId).update({
    assignedTo: assignedUid,
    assignedToName: salesPerson?.displayName || '',
    managerId: project.managerId || null,
    status: 'assigned',
    respondedAt: null,
    escalateAt: admin.firestore.Timestamp.fromDate(escalateAt),
    updatedAt: new Date().toISOString(),
  });

  // Push notification to sales person
  if (salesPerson?.pushToken) {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: salesPerson.pushToken,
        title: '🔔 New Lead Assigned!',
        body: `New lead from ${(await db.collection(COLLECTIONS.LEADS).doc(leadId).get()).data()?.source || 'unknown source'}`,
        data: { type: 'lead_assigned', leadId },
        sound: 'lead_alert.wav',
        priority: 'high',
        channelId: 'new_leads',
      }),
    });
  }

  return { success: true, assignedTo: assignedUid, assignedToName: salesPerson?.displayName };
});

// ─── CREATE USER (Admin only — callable) ─────────────────────────────────────
export const createUser = functions.https.onCall(async (data, context) => {
  // Verify caller is admin
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can create users');
  }

  const { email, password, displayName, role, phone, region, managerId } = data as {
    email: string; password: string; displayName: string;
    role: 'admin' | 'manager' | 'mis' | 'sales';
    phone?: string; region?: string; managerId?: string | null;
  };

  if (!email || !password || !displayName || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'email, password, displayName, role are required');
  }
  if (!['admin', 'manager', 'mis', 'sales'].includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'role must be admin, manager, mis, or sales');
  }

  try {
    const fbUser = await admin.auth().createUser({
      email,
      password,
      displayName,
      emailVerified: false,
    });

    // Set custom claims
    await admin.auth().setCustomUserClaims(fbUser.uid, { role });

    // Create Firestore profile — store passwordPlain so admin can view credentials
    await db.collection(COLLECTIONS.USERS).doc(fbUser.uid).set({
      uid:          fbUser.uid,
      email,
      displayName,
      role,
      phone:        phone || '',
      region:       region || '',
      managerId:    managerId || null,
      assignedLeads: 0,
      isActive:     true,
      pushToken:    null,
      passwordPlain: password,   // stored for admin visibility only
      createdAt:    new Date().toISOString(),
      lastActive:   null,
    });

    console.log(`User created: ${email} [${role}] uid=${fbUser.uid}`);
    return { success: true, uid: fbUser.uid };
  } catch (err: any) {
    if (err.code === 'auth/email-already-exists') {
      throw new functions.https.HttpsError('already-exists', 'A user with this email already exists');
    }
    throw new functions.https.HttpsError('internal', err.message);
  }
});

// ─── UPDATE USER PASSWORD (Admin only — callable) ────────────────────────────
export const updateUserPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can update passwords');
  }

  const { uid, newPassword } = data as { uid: string; newPassword: string };
  if (!uid || !newPassword || newPassword.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'uid and newPassword (min 6 chars) required');
  }

  await admin.auth().updateUser(uid, { password: newPassword });
  await db.collection(COLLECTIONS.USERS).doc(uid).update({ passwordPlain: newPassword });

  return { success: true };
});

// ─── UPDATE USER ROLE (Admin only — callable) ─────────────────────────────────
export const updateUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can update roles');
  }

  const { uid, role, managerId } = data as { uid: string; role: 'admin' | 'manager' | 'mis' | 'sales'; managerId?: string | null };

  if (!uid || !role) throw new functions.https.HttpsError('invalid-argument', 'uid and role are required');
  if (!['admin', 'manager', 'mis', 'sales'].includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Invalid role');
  }
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot change your own role');
  }

  await admin.auth().setCustomUserClaims(uid, { role });
  const updateData: Record<string, any> = { role, updatedAt: new Date().toISOString() };
  if (managerId !== undefined) updateData.managerId = managerId;
  await db.collection(COLLECTIONS.USERS).doc(uid).update(updateData);

  return { success: true };
});

// ─── DEACTIVATE USER (Admin only — callable) ──────────────────────────────────
export const deactivateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');

  const callerDoc = await db.collection(COLLECTIONS.USERS).doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    throw new functions.https.HttpsError('permission-denied', 'Only admins can deactivate users');
  }

  const { uid, disabled } = data as { uid: string; disabled: boolean };
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  if (uid === context.auth.uid) {
    throw new functions.https.HttpsError('failed-precondition', 'Cannot deactivate yourself');
  }

  await admin.auth().updateUser(uid, { disabled });
  await db.collection(COLLECTIONS.USERS).doc(uid).update({
    isActive: !disabled,
    updatedAt: new Date().toISOString(),
  });

  return { success: true };
});

// ─── EMAIL SERVICE (Gmail SMTP) ───────────────────────────────────────────────
export const sendEmail = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const { to, subject, html, text } = req.body;

      if (!to || !subject || (!html && !text)) {
        res.status(400).json({ error: 'Missing required fields: to, subject, html/text' });
        return;
      }

      const gmailUser = functions.config().gmail?.user || 'realhubbmktg@gmail.com';
      const gmailPass = functions.config().gmail?.pass || 'ycjb tkuu vuko bkeu';

      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: gmailUser, pass: gmailPass },
      });

      const info = await transporter.sendMail({
        from: `"Relazo CRM" <${gmailUser}>`,
        to,
        subject,
        html,
        text,
      });

      res.status(200).json({ success: true, messageId: info.messageId });
    } catch (error) {
      console.error('sendEmail error:', error);
      res.status(500).json({ error: 'Failed to send email' });
    }
  });
});

// ─── SEND WHATSAPP (server-side, keeps tokens secure) ────────────────────────
export const sendWhatsApp = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      const { to, message, accountNum = 1 } = req.body as {
        to: string;
        message: string;
        accountNum?: 1 | 2;
      };

      if (!to || !message) {
        res.status(400).json({ error: 'Missing required fields: to, message' });
        return;
      }

      const account = META_ACCOUNTS[2];
      const url = `https://graph.facebook.com/v21.0/${account.phoneNumberId}/messages`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${account.waAccessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: message },
        }),
      });

      const data = await response.json() as { messages?: Array<{ id: string }>; error?: { message: string } };

      if (!response.ok) {
        res.status(400).json({ success: false, error: data.error?.message });
        return;
      }

      res.status(200).json({ success: true, messageId: data.messages?.[0]?.id, account: accountNum });
    } catch (error) {
      console.error('sendWhatsApp error:', error);
      res.status(500).json({ error: 'Failed to send WhatsApp message' });
    }
  });
});

// ─── WHATSAPP WEBHOOK — ACCOUNT 2 ────────────────────────────────────────────
export const whatsappWebhook2 = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    await handleWhatsAppWebhook(req, res, META_ACCOUNT_2.waVerifyToken, 2);
  });
});

export const whatsappWebhook = functions.https.onRequest((req, res) => {
  corsHandler(req, res, async () => {
    await handleWhatsAppWebhook(req, res, META_ACCOUNT_2.waVerifyToken, 2);
  });
});

async function handleWhatsAppWebhook(
  req: functions.https.Request,
  res: any,
  verifyToken: string,
  accountNum: 1 | 2
) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.status(403).json({ error: 'Forbidden' });
    }
    return;
  }

  if (req.method === 'POST') {
    try {
      const body = req.body;

      if (body.object === 'whatsapp_business_account') {
        for (const entry of body.entry || []) {
          for (const change of entry.changes || []) {
            if (change.field === 'messages') {
              const value = change.value;
              for (const message of value.messages || []) {
                await processIncomingWhatsApp(message, value.contacts?.[0], accountNum);
              }
            }
          }
        }
      }

      res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error(`whatsappWebhook${accountNum} error:`, error);
      res.status(500).json({ error: 'Internal error' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}

async function processIncomingWhatsApp(
  message: {
    from: string;
    id: string;
    type: string;
    text?: { body: string };
    timestamp: string;
  },
  contact: { profile: { name: string }; wa_id: string } | undefined,
  accountNum: 1 | 2
) {
  const phone = '+' + message.from;
  const text = message.text?.body || '';
  const senderName = contact?.profile?.name || phone;

  const leadsSnap = await db.collection(COLLECTIONS.LEADS)
    .where('phone', '==', phone)
    .limit(1)
    .get();

  if (!leadsSnap.empty) {
    const leadDoc = leadsSnap.docs[0];
    await leadDoc.ref.collection('activities').add({
      type: 'whatsapp',
      description: `Incoming WhatsApp (Account ${accountNum}): "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`,
      performedBy: 'system',
      metadata: { messageId: message.id, direction: 'incoming', account: accountNum },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    await leadDoc.ref.update({
      lastContactedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`WhatsApp (Acc ${accountNum}) message logged for lead:`, leadDoc.id);
  } else {
    const leadRef = db.collection(COLLECTIONS.LEADS).doc();
    await leadRef.set({
      id: leadRef.id,
      name: senderName,
      phone,
      email: '',
      source: 'whatsapp',
      status: 'new',
      budget: null,
      requirements: text,
      location: '',
      assignedAgent: null,
      aiScore: null,
      notes: `First contact via WhatsApp Account ${accountNum}: "${text}"`,
      tags: [],
      metaAccount: accountNum,
      lastContactedAt: admin.firestore.FieldValue.serverTimestamp(),
      nextFollowUpAt: null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`New lead from WhatsApp Acc ${accountNum}:`, leadRef.id, senderName);
  }
}

// ─── ON LEAD CREATED — AUTO SCORE WITH GEMINI ─────────────────────────────────
// ─── ON NOTIFICATION CREATED — Push to ALL users (background safe) ───────────
// Triggers whenever the client writes to the 'notifications' collection
// (e.g. after a new Meta lead is synced). Sends Expo push to every active user
// so the alert fires even when the app is killed.
export const onNewNotification = functions.firestore
  .document('notifications/{notifId}')
  .onCreate(async (snap) => {
    const n = snap.data();
    if (n.type !== 'new_lead') return; // only handle new lead alerts

    const src = n.metaAccount ? `Meta Acc ${n.metaAccount}` : (n.source ?? 'New Lead');
    const bodyParts = [n.campaignName, n.requirements || n.phone].filter(Boolean);
    const body = bodyParts.join(' · ') || n.phone || '';

    try {
      const tokens = await getAllUserTokens();
      if (!tokens.length) return;

      // Expo push API accepts max 100 messages per request — chunk if needed
      const chunks: string[][] = [];
      for (let i = 0; i < tokens.length; i += 100) chunks.push(tokens.slice(i, i + 100));

      for (const chunk of chunks) {
        await sendPushBatch(chunk.map(token => ({
          to: token,
          title: `🔔 New Lead: ${n.leadName ?? 'Unknown'}`,
          body: `${src} · ${body}`,
          data: { type: 'new_lead', leadId: n.leadId },
          sound: 'default',
          priority: 'high',
          channelId: 'new_leads',
        })));
      }
      console.log(`[onNewNotification] Pushed to ${tokens.length} users`);
    } catch (err) {
      console.error('[onNewNotification] Push failed:', err);
    }
  });

export const onLeadCreated = functions.firestore
  .document('leads/{leadId}')
  .onCreate(async (snap, context) => {
    const lead = snap.data();
    const leadId = context.params.leadId;

    try {
      const geminiKey = functions.config().gemini?.key;
      if (!geminiKey) {
        await snap.ref.update({ aiScore: 50 });
        return;
      }

      const prompt = `Score this real estate lead from 0-100. Return ONLY JSON: {"score": number, "reason": "brief reason"}

Lead:
- Name: ${lead.name}
- Source: ${lead.source}
- Budget: ${lead.budget ? 'AED ' + Number(lead.budget).toLocaleString() : 'Not specified'}
- Location: ${lead.location || 'Not specified'}
- Requirements: ${lead.requirements || 'Not specified'}
- Phone: ${lead.phone ? 'Yes' : 'No'}
- Email: ${lead.email ? 'Yes' : 'No'}
- Meta Account: ${lead.metaAccount || 'N/A'}

Scoring: Higher budget=higher score, specific requirements=higher score, complete contact=higher score.`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 200 },
          }),
        }
      );

      const data = await response.json() as {
        candidates?: Array<{ content: { parts: Array<{ text: string }> } }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);

      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { score?: number; reason?: string };
        const score = Math.min(100, Math.max(0, parsed.score || 50));
        await snap.ref.update({ aiScore: score, aiScoreReason: parsed.reason || '' });
        console.log(`Lead ${leadId} scored: ${score}`);
      } else {
        await snap.ref.update({ aiScore: 50 });
      }
    } catch (error) {
      console.error('onLeadCreated AI scoring error:', error);
      await snap.ref.update({ aiScore: 50 });
    }
  });

// ─── ON DEAL STAGE CHANGED — NOTIFICATION ────────────────────────────────────
export const onDealUpdated = functions.firestore
  .document('deals/{dealId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();

    if (before.stage !== after.stage) {
      try {
        let leadName = 'Unknown';
        if (after.leadId) {
          const leadSnap = await db.collection(COLLECTIONS.LEADS).doc(after.leadId).get();
          if (leadSnap.exists) leadName = leadSnap.data()?.name || 'Unknown';
        }

        await db.collection(COLLECTIONS.NOTIFICATIONS).add({
          title: 'Deal Stage Updated',
          body: `${after.title} (${leadName}) moved to ${String(after.stage).replace(/_/g, ' ')}`,
          type: 'deal_update',
          dealId: context.params.dealId,
          read: false,
          assignedAgent: after.assignedAgent || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (error) {
        console.error('onDealUpdated notification error:', error);
      }
    }
  });

// ─── SCHEDULED: FOLLOW-UP REMINDERS (every 6 hours) ─────────────────────────
export const checkFollowUps = functions.pubsub
  .schedule('every 6 hours')
  .onRun(async () => {
    try {
      const now = admin.firestore.Timestamp.now();
      const sixHoursLater = admin.firestore.Timestamp.fromDate(
        new Date(Date.now() + 6 * 60 * 60 * 1000)
      );

      const leadsSnap = await db.collection(COLLECTIONS.LEADS)
        .where('nextFollowUpAt', '>=', now)
        .where('nextFollowUpAt', '<=', sixHoursLater)
        .where('status', 'not-in', ['closed', 'lost'])
        .get();

      const batch = db.batch();
      let count = 0;

      for (const doc of leadsSnap.docs) {
        const lead = doc.data();
        const notifRef = db.collection(COLLECTIONS.NOTIFICATIONS).doc();
        batch.set(notifRef, {
          title: 'Follow-up Reminder',
          body: `Time to follow up with ${lead.name}`,
          type: 'follow_up',
          leadId: doc.id,
          assignedAgent: lead.assignedAgent || null,
          read: false,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        count++;
      }

      if (count > 0) {
        await batch.commit();
        console.log(`Created ${count} follow-up notifications`);
      }
    } catch (error) {
      console.error('checkFollowUps error:', error);
    }
  });
