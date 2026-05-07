/**
 * Analytics Service
 * Computes dashboard metrics, agent performance, and ROI for Admin/Manager views.
 */

import {
  collection, query, where, getDocs, limit,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import {
  AdminDashboardMetrics, AgentPerformance,
  SalesDashboardMetrics, LeadStatus, LeadSource,
} from '@/types';
import { startOfMonth, subMonths, format } from 'date-fns';
import { WHATSAPP_ACCOUNTS } from '@/services/whatsappService';

const GRAPH = 'https://graph.facebook.com/v21.0';

// ─── Fetch helper with retry ──────────────────────────────────────────────────
async function fetchWithRetry(url: string, retries = 2): Promise<any> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.error) return data;
      if (i === retries) return data;
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return { error: 'Failed after retries' };
}

// ─── Meta Lead Ads API — total leads count (direct, no Firestore) ─────────────
// Uses system user token directly on the page — no /me/accounts needed.
export interface MetaLeadsCountResult {
  count: number;
  account1: number;
  account2: number;
  account3: number;
  errors: string[];
}

export async function getMetaLeadsCount(): Promise<MetaLeadsCountResult> {
  const accountNums: Array<1 | 2 | 3> = [1, 2, 3];
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
  const errors: string[] = [];

  for (const num of accountNums) {
    const { metaAccessToken: token, pageId, label } = WHATSAPP_ACCOUNTS[num];
    if (!token) { errors.push(`${label}: No access token`); continue; }

    // Exchange system user token for page access token
    const pageTokenData = await fetchWithRetry(
      `${GRAPH}/${pageId}?fields=access_token&access_token=${token}`
    ) as { access_token?: string; error?: { message: string; code?: number } };

    if (pageTokenData.error || !pageTokenData.access_token) {
      const msg = pageTokenData.error?.message ?? 'Could not get page access token';
      console.error(`[getMetaLeadsCount] ${label} page token error:`, msg);
      errors.push(`${label}: ${msg}`);
      continue;
    }

    const pageToken = pageTokenData.access_token;
    let nextUrl: string | undefined =
      `${GRAPH}/${pageId}/leadgen_forms?fields=id,leads_count&limit=100&access_token=${pageToken}`;

    while (nextUrl) {
      const json = await fetchWithRetry(nextUrl) as {
        data?: Array<{ id: string; leads_count?: number }>;
        paging?: { next?: string };
        error?: { message: string; code?: number };
      };
      if (json.error) {
        console.error(`[getMetaLeadsCount] ${label} forms error:`, json.error.message, 'code:', json.error.code);
        errors.push(`${label}: ${json.error.message}`);
        break;
      }
      for (const form of json.data ?? []) counts[num] += form.leads_count ?? 0;
      nextUrl = json.paging?.next;
    }
  }

  return {
    count: counts[1] + counts[2] + counts[3],
    account1: counts[1],
    account2: counts[2],
    account3: counts[3],
    errors,
  };
}

// ─── Admin / Manager dashboard metrics ───────────────────────────────────────
export async function getAdminDashboardMetrics(
  managerId?: string   // if provided, scoped to this manager's team
): Promise<AdminDashboardMetrics> {
  const leadsRef = collection(db, 'leads');

  // Base query — all or manager-scoped
  const baseSnap = await getDocs(
    managerId
      ? query(leadsRef, where('managerId', '==', managerId))
      : leadsRef
  );
  const allLeads = baseSnap.docs.map(d => d.data());

  const today = new Date();
  const todayStr = format(today, 'yyyy-MM-dd');

  // Normalize Firestore Timestamp OR ISO string → local 'yyyy-MM-dd'
  function toLocalDateStr(val: any): string | null {
    if (!val) return null;
    try {
      const d = typeof val.toDate === 'function' ? val.toDate() : new Date(val);
      return format(d, 'yyyy-MM-dd');
    } catch { return null; }
  }

  let totalLeads = 0, leadsToday = 0, todayFollowUps = 0,
      todayVisits = 0, missedFollowUps = 0, totalClosed = 0, totalRevenue = 0;
  let metaAccount1 = 0, metaAccount2 = 0, metaAccount3 = 0;

  const leadsBySource: Partial<Record<LeadSource, number>> = {};
  const leadsByStatus: Partial<Record<LeadStatus, number>> = {};

  for (const lead of allLeads) {
    totalLeads++;

    // Created today — handles Firestore Timestamp and ISO string (Meta UTC → IST)
    if (toLocalDateStr(lead.createdAt) === todayStr) leadsToday++;

    // Follow-ups: all active follow_up status leads
    if (lead.status === 'follow_up') todayFollowUps++;

    // Visits: all site_visit_scheduled leads
    if (lead.status === 'site_visit_scheduled') todayVisits++;

    // Missed: assigned leads not updated in >10 min
    // Uses new Date(ref) exactly like the notifications page so counts always match
    if (lead.assignedTo && !['closed_won', 'dead', 'invalid'].includes(lead.status)) {
      const ref = lead.updatedAt ?? lead.createdAt;
      const refMs = new Date(ref as any).getTime();
      if (!isNaN(refMs) && Date.now() - refMs > 10 * 60 * 1000) missedFollowUps++;
    }

    // Closures
    if (lead.status === 'closed_won') {
      totalClosed++;
      totalRevenue += lead.closureValue || 0;
    }

    // Group by source
    if (lead.source) {
      leadsBySource[lead.source as LeadSource] = (leadsBySource[lead.source as LeadSource] || 0) + 1;
    }

    // Meta per-account breakdown from Firestore (metaAccount field set at sync time)
    if (lead.source === 'meta') {
      const acc = Number(lead.metaAccount);
      if (acc === 1) metaAccount1++;
      else if (acc === 3) metaAccount3++;
      else metaAccount2++; // default: account 2 (or unset legacy leads)
    }

    // Group by status
    if (lead.status) {
      leadsByStatus[lead.status as LeadStatus] = (leadsByStatus[lead.status as LeadStatus] || 0) + 1;
    }
  }

  const metaLeads = leadsBySource['meta'] || 0;
  const googleLeads = leadsBySource['google'] || 0;
  const paidLeads = metaLeads + googleLeads;
  const estimatedAdSpend = (metaLeads * 150) + (googleLeads * 200); // ₹ per lead estimate
  const roi = estimatedAdSpend > 0 ? Math.round((totalRevenue / estimatedAdSpend) * 100) : 0;
  const conversionRate = totalLeads > 0 ? Math.round((totalClosed / totalLeads) * 100) : 0;
  const cpl = paidLeads > 0 ? Math.round(estimatedAdSpend / paidLeads) : 0; // Cost Per Lead (₹)

  return {
    totalLeads, leadsToday, todayFollowUps, todayVisits,
    missedFollowUps, totalClosed, totalRevenue,
    roi, conversionRate, cpl, leadsBySource, leadsByStatus,
    metaAccount1, metaAccount2, metaAccount3,
  };
}

// ─── Sales person dashboard metrics ──────────────────────────────────────────
export async function getSalesDashboardMetrics(salesUid: string): Promise<SalesDashboardMetrics> {
  const snap = await getDocs(
    query(collection(db, 'leads'), where('assignedTo', '==', salesUid))
  );
  const leads = snap.docs.map(d => d.data());

  const today = format(new Date(), 'yyyy-MM-dd');
  let myLeadsToday = 0, pendingFollowUps = 0, todayVisits = 0,
      missedFollowUps = 0, totalAssigned = 0, closedThisMonth = 0, totalRevenue = 0;

  // Helper to convert Firestore Timestamp or string to 'yyyy-MM-dd' format
  function toDateStr(val: any): string | null {
    if (!val) return null;
    try {
      const d = typeof val.toDate === 'function' ? val.toDate() : new Date(val);
      return format(d, 'yyyy-MM-dd');
    } catch { return null; }
  }

  for (const lead of leads) {
    totalAssigned++;
    
    const createdDateStr = toDateStr(lead.createdAt);
    if (createdDateStr === today) myLeadsToday++;
    
    // Follow-ups: all active follow_up status leads (matches what the leads page shows)
    if (lead.status === 'follow_up') pendingFollowUps++;

    // Visits: all site_visit_scheduled leads (matches the leads page visit filter)
    if (lead.status === 'site_visit_scheduled') todayVisits++;

    // Missed: assigned leads not updated in >10 min
    // Uses new Date(ref) exactly like the notifications page so counts always match
    if (lead.assignedTo && !['closed_won', 'dead', 'invalid'].includes(lead.status)) {
      const ref = lead.updatedAt ?? lead.createdAt;
      const refMs = new Date(ref as any).getTime();
      if (!isNaN(refMs) && Date.now() - refMs > 10 * 60 * 1000) missedFollowUps++;
    }
    
    if (lead.status === 'closed_won') {
      closedThisMonth++;
      totalRevenue += lead.closureValue || 0;
    }
  }

  return { myLeadsToday, pendingFollowUps, todayVisits, missedFollowUps, totalAssigned, closedThisMonth, totalRevenue };
}

// ─── Agent performance stats ─────────────────────────────────────────────────
export async function getAgentPerformance(
  agentUid: string,
  fromDate?: Date,
  toDate?: Date
): Promise<AgentPerformance> {
  // Get user profile
  const userSnap = await getDocs(
    query(collection(db, 'users'), where('uid', '==', agentUid), limit(1))
  );
  const user = userSnap.empty ? { displayName: 'Unknown', email: '', phone: '', region: '' } : userSnap.docs[0].data();

  // Get leads
  let q = query(collection(db, 'leads'), where('assignedTo', '==', agentUid));
  const snap = await getDocs(q);
  let leads = snap.docs.map(d => d.data());

  // Filter by date range if provided
  if (fromDate && toDate) {
    const from = format(fromDate, 'yyyy-MM-dd');
    const to = format(toDate, 'yyyy-MM-dd');
    leads = leads.filter(l => l.createdAt >= from && l.createdAt <= to);
  }

  let leadsFromMeta = 0, leadsFromGoogle = 0, leadsFromUploaded = 0;
  let interested = 0, notInterested = 0, dead = 0, invalid = 0;
  let siteVisits = 0, closures = 0, revenue = 0;
  let respondedCount = 0;

  for (const lead of leads) {
    if (lead.source === 'meta') leadsFromMeta++;
    else if (lead.source === 'google') leadsFromGoogle++;
    else if (lead.source === 'uploaded') leadsFromUploaded++;

    if (lead.status === 'interested') interested++;
    else if (lead.status === 'not_interested') notInterested++;
    else if (lead.status === 'dead') dead++;
    else if (lead.status === 'invalid') invalid++;

    if (['site_visit_scheduled', 'site_visit_done'].includes(lead.status)) siteVisits++;

    if (lead.status === 'closed_won') {
      closures++;
      revenue += lead.closureValue || 0;
    }

    if (lead.respondedAt) respondedCount++;
  }

  const responseRate = leads.length > 0 ? Math.round((respondedCount / leads.length) * 100) : 0;

  return {
    uid: agentUid,
    displayName: user.displayName,
    email: user.email,
    phone: user.phone,
    region: user.region,
    managerId: user.managerId,
    totalLeads: leads.length,
    leadsFromMeta, leadsFromGoogle, leadsFromUploaded,
    interested, notInterested, dead, invalid,
    siteVisits, closures, revenue, responseRate,
    lastActive: user.lastActive,
  };
}

// ─── Get all agents under a manager ──────────────────────────────────────────
export async function getManagerTeamPerformance(
  managerId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<AgentPerformance[]> {
  const snap = await getDocs(
    query(collection(db, 'users'), where('managerId', '==', managerId), where('role', '==', 'sales'))
  );
  const agents = snap.docs.map(d => d.data());

  const results = await Promise.all(
    agents.map(a => getAgentPerformance(a.uid, fromDate, toDate))
  );
  return results;
}

// ─── Get monthly trend for agent (last N months) ─────────────────────────────
export async function getAgentMonthlyTrend(
  agentUid: string,
  months = 6
): Promise<Array<{ month: string; leads: number; closures: number; revenue: number }>> {
  const snap = await getDocs(
    query(collection(db, 'leads'), where('assignedTo', '==', agentUid))
  );
  const leads = snap.docs.map(d => d.data());

  const trend: Record<string, { leads: number; closures: number; revenue: number }> = {};

  // Initialise last N months
  for (let i = months - 1; i >= 0; i--) {
    const monthKey = format(subMonths(new Date(), i), 'yyyy-MM');
    trend[monthKey] = { leads: 0, closures: 0, revenue: 0 };
  }

  for (const lead of leads) {
    const monthKey = lead.createdAt?.substring(0, 7);
    if (!monthKey || !trend[monthKey]) continue;
    trend[monthKey].leads++;
    if (lead.status === 'closed_won') {
      trend[monthKey].closures++;
      trend[monthKey].revenue += lead.closureValue || 0;
    }
  }

  return Object.entries(trend).map(([month, data]) => ({ month, ...data }));
}

// ─── Get all managers with summary ───────────────────────────────────────────
export async function getAllManagersSummary(): Promise<Array<{
  uid: string; displayName: string; email: string; region?: string;
  totalAgents: number; totalLeads: number; closures: number; revenue: number;
}>> {
  const managersSnap = await getDocs(
    query(collection(db, 'users'), where('role', '==', 'manager'))
  );

  const results = await Promise.all(
    managersSnap.docs.map(async (mDoc) => {
      const manager = mDoc.data();
      // Count agents
      const agentsSnap = await getDocs(
        query(collection(db, 'users'), where('managerId', '==', mDoc.id))
      );
      // Count leads under manager
      const leadsSnap = await getDocs(
        query(collection(db, 'leads'), where('managerId', '==', mDoc.id))
      );
      const leads = leadsSnap.docs.map(d => d.data());
      const closures = leads.filter(l => l.status === 'closed_won').length;
      const revenue = leads.filter(l => l.status === 'closed_won').reduce((s, l) => s + (l.closureValue || 0), 0);

      return {
        uid: mDoc.id,
        displayName: manager.displayName,
        email: manager.email,
        region: manager.region,
        totalAgents: agentsSnap.size,
        totalLeads: leads.length,
        closures,
        revenue,
      };
    })
  );
  return results;
}

// ─── Lead Category Counts (Followup Categories) ───────────────────────────────
export interface LeadCategoryMetrics {
  prospects: number;      // status: 'contacted'
  rnr: number;           // status: 'rnr' or 'switch_off'
  invalid: number;       // status: 'invalid'
}

export async function getLeadCategoryMetrics(salesUid: string): Promise<LeadCategoryMetrics> {
  const snap = await getDocs(
    query(collection(db, 'leads'), where('assignedTo', '==', salesUid))
  );
  const leads = snap.docs.map(d => d.data());

  const prospects = leads.filter(l => l.status === 'contacted').length;
  const rnr = leads.filter(l => l.status === 'rnr' || l.status === 'switch_off').length;
  const invalid = leads.filter(l => l.status === 'invalid').length;

  return { prospects, rnr, invalid };
}
