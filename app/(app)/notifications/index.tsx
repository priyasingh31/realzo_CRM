import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator,
  ToastAndroid, Platform, Share,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { Lead } from '@/types';

const TEN_MIN_MS   = 10 * 60 * 1000;
const DAY_MS       = 24 * 60 * 60 * 1000;

const META_PAGE_ACC: Record<string, 1 | 2 | 3> = {
  '1018805394651044': 1,
  '968440359693058':  2,
  '337675829430214':  3,
};

function resolveMetaAcc(l: Lead): 1 | 2 | 3 | null {
  if (l.metaAccount) return l.metaAccount;
  if (l.metaPageId) return META_PAGE_ACC[l.metaPageId] ?? null;
  return null;
}

function sourceLabel(l: Lead): string {
  if (l.source === 'meta') {
    const acc = resolveMetaAcc(l);
    return acc ? `Meta Acc ${acc}` : 'Meta';
  }
  if (l.source === 'google')   return 'Google Ads';
  if (l.source === 'whatsapp') return 'WhatsApp';
  if (l.source === 'uploaded') return 'Uploaded';
  return l.source ?? 'Unknown';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return 'Just now'; // clock skew guard
  const mins  = Math.max(1, Math.floor(diff / 60000));
  const hours = Math.floor(mins / 60);
  const days  = Math.floor(hours / 24);
  if (days > 0)  return `${days}d ago`;
  if (hours > 0) return `${hours}h ${mins % 60}m ago`;
  return `${mins}m ago`;
}

function staleMins(l: Lead): number {
  const ref = l.updatedAt ?? l.createdAt;
  return Math.max(0, Math.floor((Date.now() - new Date(ref).getTime()) / 60000));
}

const ACC_COLORS: Record<number, string> = { 1: '#1877F2', 2: '#0B5ED7', 3: '#0353A4' };
function sourceColor(l: Lead): string {
  if (l.source === 'meta') return ACC_COLORS[resolveMetaAcc(l) ?? 2] ?? '#1877F2';
  if (l.source === 'google')   return '#EA4335';
  if (l.source === 'whatsapp') return '#25D366';
  return Colors.gray400;
}

// Field keys that are already mapped to top-level fields — skip in extras
const KNOWN_META_KEYS = new Set([
  'full_name','first_name','last_name','phone_number','phone','mobile_number',
  'email','budget','budget_range','city','location','preferred_location',
  'state','province','property_type','project_type','timeline','purchase_timeline',
  'requirements','message','comments','require_for','requirement',
  'job_title','occupation','designation','project_name','project','property_name',
  'campaign_name','campaign',
]);

function pickMetaField(lead: Lead, ...keys: string[]): string {
  const mf = lead.metaFields ?? {};
  for (const k of keys) {
    if (mf[k] && mf[k].trim()) return mf[k].trim();
  }
  return '';
}

// Fuzzy scan: find the first metaField whose KEY contains any of the given substrings
function pickMetaFieldByKeyword(lead: Lead, ...keywords: string[]): string {
  const mf = lead.metaFields ?? {};
  for (const [k, v] of Object.entries(mf)) {
    if (!v?.trim()) continue;
    const kl = k.toLowerCase();
    if (keywords.some(kw => kl.includes(kw))) return v.trim();
  }
  return '';
}

function buildCopyText(lead: Lead): string {
  const mf = lead.metaFields ?? {};

  // Resolve each field: prefer top-level → exact metaField key → keyword scan across all keys
  const requireFor =
    lead.requirements?.trim() ||
    pickMetaField(lead, 'require_for', 'requirement', 'requirements', 'message', 'comments', 'what_do_you_require', 'looking_for') ||
    pickMetaFieldByKeyword(lead, 'purpose', 'require', 'reason', 'looking', 'intent', 'use', 'buying_for', 'invest', 'living', 'self_use', 'end_use');

  const jobTitle =
    lead.jobTitle?.trim() ||
    pickMetaField(lead, 'job_title', 'occupation', 'designation', 'profession');

  const campaignName =
    lead.metaCampaignName?.trim() ||
    pickMetaField(lead, 'campaign_name', 'campaign');

  // Build the standard block
  const lines = [
    `name: ${lead.name}`,
    `gmail: ${lead.email || pickMetaField(lead, 'email') || 'Na'}`,
    `phone: ${lead.phone}`,
    `require for: ${requireFor || 'Na'}`,
    `Job Title: ${jobTitle || 'Na'}`,
    `campaign name: ${campaignName || 'Na'}`,
  ];

  // Append any extra Meta form fields that weren't captured above
  const extras = Object.entries(mf)
    .filter(([k, v]) => !KNOWN_META_KEYS.has(k) && v?.trim())
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v.trim()}`);

  if (extras.length) {
    lines.push('', ...extras);
  }

  return lines.join('\n');
}

async function copyLead(lead: Lead): Promise<void> {
  const text = buildCopyText(lead);
  if (Platform.OS === 'web') {
    try {
      await (navigator as any).clipboard.writeText(text);
    } catch {
      // web fallback: create a temporary textarea
      const el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
    }
  } else {
    // On Android/iOS: Share opens the native sheet where user can tap "Copy"
    // We resolve immediately so the button shows "Copied" feedback
    Share.share({ message: text });
  }
}

type TabKey = 'new' | 'missed';

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router  = useRouter();
  const { user } = useAuthStore();

  const [leads, setLeads]   = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<TabKey>('new');

  const role    = user?.role;
  const isAdmin = role === 'admin' || role === 'manager';

  // ── Single leads subscription — both tabs derive from it ──────────────────
  useEffect(() => {
    if (!user?.uid) return;
    const q = isAdmin
      ? role === 'manager'
        ? query(collection(db, 'leads'), where('managerId', '==', user.uid), orderBy('createdAt', 'desc'))
        : query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'leads'), where('assignedTo', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsub = onSnapshot(q, snap => {
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user?.uid, role]);

  const { newLeads, missedLeads } = useMemo(() => {
    const now = Date.now();

    const newLeads = leads
      .filter(l => now - new Date(l.createdAt).getTime() < DAY_MS)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const missedLeads = leads
      .filter(l => {
        if (!l.assignedTo) return false;
        // Exclude only terminal statuses — follow_up, negotiation etc. can still be missed
        if (['closed_won', 'dead', 'invalid'].includes(l.status)) return false;
        const ref = l.updatedAt ?? l.createdAt;
        return now - new Date(ref).getTime() > TEN_MIN_MS;
      })
      .sort((a, b) => {
        const aRef = a.updatedAt ?? a.createdAt;
        const bRef = b.updatedAt ?? b.createdAt;
        return new Date(aRef).getTime() - new Date(bRef).getTime();
      });

    return { newLeads, missedLeads };
  }, [leads]);

  const list = tab === 'new' ? newLeads : missedLeads;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Text style={styles.headerSub}>Real-time lead alerts</Text>
      </View>

      {/* Tab switcher */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, tab === 'new' && styles.tabActive]}
          onPress={() => setTab('new')}
          activeOpacity={0.8}
        >
          <Ionicons name="flash-outline" size={14} color={tab === 'new' ? Colors.white : Colors.gray500} />
          <Text style={[styles.tabText, tab === 'new' && styles.tabTextActive]}>New Leads</Text>
          {newLeads.length > 0 && (
            <View style={[styles.tabBadge, tab === 'new' && styles.tabBadgeActive]}>
              <Text style={[styles.tabBadgeText, tab === 'new' && { color: Colors.primary }]}>{newLeads.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, tab === 'missed' && styles.tabMissedActive]}
          onPress={() => setTab('missed')}
          activeOpacity={0.8}
        >
          <Ionicons name="warning-outline" size={14} color={tab === 'missed' ? Colors.white : Colors.gray500} />
          <Text style={[styles.tabText, tab === 'missed' && styles.tabTextActive]}>Missed</Text>
          {missedLeads.length > 0 && (
            <View style={[styles.tabBadge, tab === 'missed' && styles.tabBadgeMissedActive]}>
              <Text style={[styles.tabBadgeText, tab === 'missed' && { color: Colors.danger }]}>{missedLeads.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator color={Colors.primary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={list}
          keyExtractor={l => l.id + tab}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: insets.bottom + 80 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<EmptyState tab={tab} />}
          renderItem={({ item: lead }) =>
            tab === 'new'
              ? <NewLeadCard lead={lead as Lead} onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })} />
              : <MissedLeadCard lead={lead as Lead} onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })} />
          }
        />
      )}
    </View>
  );
}

// ─── New Lead Card ─────────────────────────────────────────────────────────────
function NewLeadCard({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const sc  = sourceColor(lead);
  const src = sourceLabel(lead);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const text = buildCopyText(lead);
    if (Platform.OS === 'web') {
      try { await (navigator as any).clipboard.writeText(text); } catch {}
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } else {
      Share.share({ message: text });
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left accent */}
      <View style={[styles.cardAccent, { backgroundColor: Colors.success }]} />

      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: Colors.success + '18' }]}>
        <Ionicons name="person-add-outline" size={20} color={Colors.success} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Row 1: name + time */}
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{lead.name}</Text>
          <Text style={styles.cardTime}>{timeAgo(lead.createdAt)}</Text>
        </View>

        {/* Row 2: source tag + campaign */}
        <View style={styles.cardRow}>
          <View style={[styles.sourceTag, { borderColor: sc }]}>
            <Ionicons
              name={lead.source === 'google' ? 'logo-google' : lead.source === 'whatsapp' ? 'logo-whatsapp' : 'logo-facebook'}
              size={10} color={sc}
            />
            <Text style={[styles.sourceTagText, { color: sc }]}>{src}</Text>
          </View>
          {lead.metaCampaignName ? (
            <View style={styles.campaignTag}>
              <Ionicons name="megaphone-outline" size={10} color="#7C3AED" />
              <Text style={styles.campaignText} numberOfLines={1}>{lead.metaCampaignName}</Text>
            </View>
          ) : null}
        </View>

        {/* Row 3: property enquiry */}
        {lead.requirements ? (
          <View style={styles.cardRow}>
            <Ionicons name="home-outline" size={11} color={Colors.gray400} />
            <Text style={styles.cardSub} numberOfLines={1}>{lead.requirements}</Text>
          </View>
        ) : null}

        {/* Row 4: phone */}
        <View style={styles.cardRow}>
          <Ionicons name="call-outline" size={11} color={Colors.gray400} />
          <Text style={styles.cardSub}>{lead.phone}</Text>
        </View>

        {/* Copy button */}
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.8}>
          <Ionicons name={copied ? 'checkmark-outline' : 'copy-outline'} size={13} color={copied ? Colors.success : Colors.primary} />
          <Text style={[styles.copyBtnText, copied && { color: Colors.success }]}>
            {copied ? 'Copied!' : 'Copy Lead'}
          </Text>
        </TouchableOpacity>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.gray300} style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

// ─── Missed Lead Card ──────────────────────────────────────────────────────────
function MissedLeadCard({ lead, onPress }: { lead: Lead; onPress: () => void }) {
  const sc  = sourceColor(lead);
  const src = sourceLabel(lead);
  const mins = staleMins(lead);
  const agentName = lead.assignedToName ?? 'Unassigned';
  const urgency = mins > 60 ? Colors.danger : Colors.warning;
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    copyLead(lead); // don't await on native — Share opens a sheet; on web it's instant
    if (Platform.OS === 'web') {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      {/* Left accent */}
      <View style={[styles.cardAccent, { backgroundColor: urgency }]} />

      {/* Icon */}
      <View style={[styles.iconWrap, { backgroundColor: urgency + '18' }]}>
        <Ionicons name="warning-outline" size={20} color={urgency} />
      </View>

      <View style={{ flex: 1 }}>
        {/* Row 1: lead name + staleness */}
        <View style={styles.cardTopRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>{lead.name}</Text>
          <View style={[styles.staleBadge, { backgroundColor: urgency + '18' }]}>
            <Ionicons name="time-outline" size={10} color={urgency} />
            <Text style={[styles.staleText, { color: urgency }]}>
              {mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`} ago
            </Text>
          </View>
        </View>

        {/* Row 2: agent who missed it */}
        <View style={styles.cardRow}>
          <Ionicons name="person-outline" size={11} color={Colors.gray500} />
          <Text style={styles.agentLabel}>
            <Text style={{ color: urgency, fontWeight: FontWeight.semibold }}>{agentName}</Text>
            {' hasn\'t updated this lead'}
          </Text>
        </View>

        {/* Row 3: source */}
        <View style={styles.cardRow}>
          <View style={[styles.sourceTag, { borderColor: sc }]}>
            <Ionicons
              name={lead.source === 'google' ? 'logo-google' : lead.source === 'whatsapp' ? 'logo-whatsapp' : 'logo-facebook'}
              size={10} color={sc}
            />
            <Text style={[styles.sourceTagText, { color: sc }]}>{src}</Text>
          </View>
          {lead.metaCampaignName ? (
            <View style={styles.campaignTag}>
              <Ionicons name="megaphone-outline" size={10} color="#7C3AED" />
              <Text style={styles.campaignText} numberOfLines={1}>{lead.metaCampaignName}</Text>
            </View>
          ) : null}
        </View>

        {/* Row 4: property enquiry */}
        {lead.requirements ? (
          <View style={styles.cardRow}>
            <Ionicons name="home-outline" size={11} color={Colors.gray400} />
            <Text style={styles.cardSub} numberOfLines={1}>{lead.requirements}</Text>
          </View>
        ) : null}

        {/* Row 5: phone */}
        <View style={styles.cardRow}>
          <Ionicons name="call-outline" size={11} color={Colors.gray400} />
          <Text style={styles.cardSub}>{lead.phone}</Text>
        </View>

        {/* Copy button */}
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy} activeOpacity={0.8}>
          <Ionicons name={copied ? 'checkmark-outline' : 'copy-outline'} size={13} color={copied ? Colors.success : Colors.primary} />
          <Text style={[styles.copyBtnText, copied && { color: Colors.success }]}>
            {copied ? 'Copied!' : 'Copy Lead'}
          </Text>
        </TouchableOpacity>
      </View>

      <Ionicons name="chevron-forward" size={16} color={Colors.gray300} style={{ alignSelf: 'center' }} />
    </TouchableOpacity>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <View style={styles.empty}>
      <Ionicons
        name={tab === 'new' ? 'notifications-outline' : 'checkmark-circle-outline'}
        size={52}
        color={Colors.gray300}
      />
      <Text style={styles.emptyTitle}>
        {tab === 'new' ? 'No new leads today' : 'No missed leads'}
      </Text>
      <Text style={styles.emptySub}>
        {tab === 'new'
          ? 'New leads from the last 24 hours will appear here'
          : 'All assigned leads have been responded to within 10 minutes'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.gray50 },
  header:      { backgroundColor: Colors.navy, paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.base },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub:   { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.55)', marginTop: 2 },

  tabs: {
    flexDirection: 'row', backgroundColor: Colors.white,
    paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm,
    gap: Spacing.sm, borderBottomWidth: 1, borderBottomColor: Colors.gray100,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: Radius.lg,
    backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200,
  },
  tabActive:       { backgroundColor: Colors.navy, borderColor: Colors.navy },
  tabMissedActive: { backgroundColor: Colors.danger, borderColor: Colors.danger },
  tabText:         { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray500 },
  tabTextActive:   { color: Colors.white },
  tabBadge:        { backgroundColor: Colors.primaryLight, borderRadius: 9, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  tabBadgeActive:  { backgroundColor: Colors.white },
  tabBadgeMissedActive: { backgroundColor: Colors.white },
  tabBadgeText:    { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary },

  card: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.white, borderRadius: Radius.lg,
    marginBottom: Spacing.sm, overflow: 'hidden',
    borderWidth: 1, borderColor: Colors.gray100,
    gap: Spacing.sm, paddingRight: Spacing.md, paddingVertical: Spacing.md,
  },
  cardAccent: { width: 4, alignSelf: 'stretch' },
  iconWrap:   { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  cardTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  cardTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy, flex: 1, marginRight: 6 },
  cardTime:   { fontSize: 10, color: Colors.gray400, flexShrink: 0 },
  cardRow:    { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 4 },
  cardSub:    { fontSize: FontSize.xs, color: Colors.gray500, flex: 1 },

  sourceTag:     { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  sourceTagText: { fontSize: 10, fontWeight: FontWeight.medium },
  campaignTag:   { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', flex: 1 },
  campaignText:  { fontSize: 10, color: '#7C3AED', fontWeight: FontWeight.medium, flex: 1 },

  staleBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  staleText:  { fontSize: 10, fontWeight: FontWeight.bold },
  agentLabel: { fontSize: FontSize.xs, color: Colors.gray600, flex: 1 },

  copyBtn:     { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, backgroundColor: Colors.primaryLight, paddingHorizontal: 10, paddingVertical: 5, borderRadius: Radius.full },
  copyBtnText: { fontSize: 11, color: Colors.primary, fontWeight: FontWeight.semibold },

  empty:      { alignItems: 'center', paddingTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray500 },
  emptySub:   { fontSize: FontSize.sm, color: Colors.gray400, textAlign: 'center', lineHeight: 20 },
});
