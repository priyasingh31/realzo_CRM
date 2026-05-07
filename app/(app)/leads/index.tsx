import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Modal, ScrollView,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, isValid } from 'date-fns';

// Safely convert Firestore Timestamp OR ISO string → Date, returns null on failure
function toDate(val: unknown): Date | null {
  if (!val) return null;
  // Firestore Timestamp object
  if (typeof val === 'object' && val !== null && 'toDate' in val && typeof (val as any).toDate === 'function') {
    return (val as any).toDate();
  }
  const d = new Date(val as string);
  return isValid(d) ? d : null;
}

function safeFormatDate(val: unknown, fmt: string, fallback = ''): string {
  const d = toDate(val);
  return d ? format(d, fmt) : fallback;
}
import { collection, query, where, onSnapshot, orderBy, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@/store/authStore';
import { sendLocalNotification } from '@/services/notificationService';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { isWeb, WEB_MAX_WIDTH } from '@/utils/responsive';
import { Lead, LeadSource, LeadStatus, LeadComment } from '@/types';

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; bg: string }> = {
  new:                   { label: 'New',            color: '#64748B', bg: '#F1F5F9' },
  assigned:              { label: 'Assigned',        color: '#7C3AED', bg: '#EDE9FE' },
  contacted:             { label: 'Contacted',       color: '#2563EB', bg: '#DBEAFE' },
  interested:            { label: 'Interested',      color: '#059669', bg: '#D1FAE5' },
  not_interested:        { label: 'Not Interested',  color: '#DC2626', bg: '#FEE2E2' },
  follow_up:             { label: 'Follow Up',       color: '#D97706', bg: '#FEF3C7' },
  site_visit_scheduled:  { label: 'Visit Scheduled', color: '#0891B2', bg: '#CFFAFE' },
  site_visit_done:       { label: 'Visit Done',      color: '#0D9488', bg: '#CCFBF1' },
  negotiation:           { label: 'Negotiation',     color: '#EA580C', bg: '#FFEDD5' },
  closed_won:            { label: 'Closed Won',      color: '#16A34A', bg: '#DCFCE7' },
  dead:                  { label: 'Dead',            color: '#6B7280', bg: '#F3F4F6' },
  invalid:               { label: 'Invalid',         color: '#9CA3AF', bg: '#F9FAFB' },
  qualified:             { label: 'Qualified',        color: '#0D9488', bg: '#CCFBF1' },
  rnr:                   { label: 'RNR',             color: '#F43F5E', bg: '#FFE4E6' },
  switch_off:            { label: 'Switch Off',      color: '#6366F1', bg: '#EEF2FF' },
};

type SourceFilterKey = LeadSource | 'all' | 'meta_1' | 'meta_2' | 'meta_3';

const SOURCE_FILTERS_AGENT: Array<{ key: SourceFilterKey; label: string; icon: string; color: string }> = [
  { key: 'all',      label: 'All',      icon: 'apps-outline',  color: Colors.navy },
  { key: 'meta',     label: 'Meta',     icon: 'logo-facebook', color: '#1877F2' },
  { key: 'google',   label: 'Google',   icon: 'logo-google',   color: '#EA4335' },
  { key: 'uploaded', label: 'Uploaded', icon: 'cloud-upload',  color: '#F59E0B' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
];

const SOURCE_FILTERS_ADMIN: Array<{ key: SourceFilterKey; label: string; icon: string; color: string }> = [
  { key: 'all',      label: 'All',      icon: 'apps-outline',  color: Colors.navy },
  { key: 'meta',     label: 'Meta',     icon: 'logo-facebook', color: '#1877F2' },
  { key: 'google',   label: 'Google',   icon: 'logo-google',   color: '#EA4335' },
  { key: 'uploaded', label: 'Uploaded', icon: 'cloud-upload',  color: '#F59E0B' },
  { key: 'whatsapp', label: 'WhatsApp', icon: 'logo-whatsapp', color: '#25D366' },
];

export default function LeadsScreen() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ filter?: string }>();

  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<SourceFilterKey>('all');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'all' | 'unassigned'>('all');
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [showCRMModal, setShowCRMModal] = useState(false);

  const role    = user?.role;
  const isAdmin = role === 'admin' || role === 'manager';
  const isRootAdmin = role === 'admin';
  const sourceFilters = isRootAdmin ? SOURCE_FILTERS_ADMIN : SOURCE_FILTERS_AGENT;

  // ── Subscribe to leads ──────────────────────────────────────────────────────
  useEffect(() => {
    let q;
    if (isAdmin) {
      q = role === 'manager'
        ? query(collection(db, 'leads'), where('managerId', '==', user?.uid), orderBy('createdAt', 'desc'))
        : query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'leads'), where('assignedTo', '==', user?.uid), orderBy('createdAt', 'desc'));
    }

    const unsub = onSnapshot(q, snap => {
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    });
    return () => unsub();
  }, [user?.uid, role]);

  // ── Apply quick filter from params ─────────────────────────────────────────
  useEffect(() => {
    if (params.filter === 'followup') {
      setStatusFilter('follow_up');
    } else if (params.filter === 'visits') {
      setStatusFilter('site_visit_scheduled');
    } else {
      // 'today', 'missed', and no filter: status filter is 'all',
      // narrowing is done by the date-based filter logic below
      setStatusFilter('all');
    }
  }, [params.filter]);

  // ── Meta account resolution (must be defined before filtered) ─────────────
  const resolveMetaAcc = (l: Lead): 1 | 2 | 3 | null => {
    if (l.metaAccount) return l.metaAccount;
    if (l.metaPageId === '1018805394651044') return 1;
    if (l.metaPageId === '968440359693058') return 2;
    if (l.metaPageId === '337675829430214') return 3;
    return null;
  };

  // ── Filter leads ───────────────────────────────────────────────────────────
  const filtered = leads.filter(lead => {
    const matchSearch = !search ||
      lead.name.toLowerCase().includes(search.toLowerCase()) ||
      lead.phone.includes(search) ||
      (lead.assignedToName || '').toLowerCase().includes(search.toLowerCase()) ||
      (lead.metaCampaignName || '').toLowerCase().includes(search.toLowerCase());

    // Source filter — handles meta_1 / meta_2 breakdowns
    let matchSource = false;
    if      (sourceFilter === 'all')      matchSource = true;
    else if (sourceFilter === 'meta_1')   matchSource = lead.source === 'meta' && resolveMetaAcc(lead) === 1;
    else if (sourceFilter === 'meta_2')   matchSource = lead.source === 'meta' && resolveMetaAcc(lead) === 2;
    else if (sourceFilter === 'meta_3')   matchSource = lead.source === 'meta' && resolveMetaAcc(lead) === 3;
    else                                  matchSource = lead.source === sourceFilter;

    // Status filter — includes special 'unassigned' for admin
    let matchStatus = false;
    if      (statusFilter === 'all')        matchStatus = true;
    else if (statusFilter === 'unassigned') matchStatus = !lead.assignedTo && lead.status === 'new';
    else                                    matchStatus = lead.status === statusFilter;

    // Date-based quick filters from navigation params
    const today = format(new Date(), 'yyyy-MM-dd');
    if (params.filter === 'today') {
      const leadDate = safeFormatDate(lead.createdAt, 'yyyy-MM-dd');
      if (leadDate !== today) return false;
    }
    if (params.filter === 'missed') {
      const fupStr = safeFormatDate(lead.followUpDate, 'yyyy-MM-dd');
      if (!fupStr || fupStr >= today) return false;
      if (['closed_won', 'dead', 'invalid'].includes(lead.status)) return false;
    }
    // 'visits' and 'followup' are handled entirely by statusFilter above

    return matchSearch && matchSource && matchStatus;
  });
  const metaAcc1Count    = isRootAdmin ? leads.filter(l => l.source === 'meta' && resolveMetaAcc(l) === 1).length : 0;
  const metaAcc2Count    = isRootAdmin ? leads.filter(l => l.source === 'meta' && resolveMetaAcc(l) === 2).length : 0;
  const metaAcc3Count    = isRootAdmin ? leads.filter(l => l.source === 'meta' && resolveMetaAcc(l) === 3).length : 0;
  const unassignedCount  = isRootAdmin ? leads.filter(l => !l.assignedTo && l.status === 'new').length : 0;

  const openCRM = (lead: Lead) => {
    setSelectedLead(lead);
    setShowCRMModal(true);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>

      {/* ── Fixed header — never shrinks ── */}
      <View style={styles.stickyTop}>
        {/* Title bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Leads</Text>
            <Text style={styles.headerSub}>{filtered.length} of {leads.length} leads</Text>
          </View>
          {(isAdmin || role === 'sales') && (
            <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/leads/new')}>
              <Ionicons name="add" size={22} color={Colors.white} />
            </TouchableOpacity>
          )}
        </View>

        {/* Admin: Meta Account Summary Bar */}
        {isRootAdmin && (
          <View style={styles.metaSummary}>
            <TouchableOpacity
              style={[styles.metaSummaryItem, sourceFilter === 'meta_1' && styles.metaSummaryItemActive]}
              onPress={() => setSourceFilter(f => f === 'meta_1' ? 'all' : 'meta_1')}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-facebook" size={13} color="#1877F2" />
              <Text style={styles.metaSummaryLabel}>Acc 1</Text>
              <Text style={styles.metaSummaryCount}>{metaAcc1Count}</Text>
            </TouchableOpacity>
            <View style={styles.metaSummaryDivider} />
            <TouchableOpacity
              style={[styles.metaSummaryItem, sourceFilter === 'meta_2' && styles.metaSummaryItemActive]}
              onPress={() => setSourceFilter(f => f === 'meta_2' ? 'all' : 'meta_2')}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-facebook" size={13} color="#0B5ED7" />
              <Text style={styles.metaSummaryLabel}>Acc 2</Text>
              <Text style={styles.metaSummaryCount}>{metaAcc2Count}</Text>
            </TouchableOpacity>
            <View style={styles.metaSummaryDivider} />
            <TouchableOpacity
              style={[styles.metaSummaryItem, sourceFilter === 'meta_3' && styles.metaSummaryItemActive]}
              onPress={() => setSourceFilter(f => f === 'meta_3' ? 'all' : 'meta_3')}
              activeOpacity={0.8}
            >
              <Ionicons name="logo-facebook" size={13} color="#0353A4" />
              <Text style={styles.metaSummaryLabel}>Acc 3</Text>
              <Text style={styles.metaSummaryCount}>{metaAcc3Count}</Text>
            </TouchableOpacity>
            <View style={styles.metaSummaryDivider} />
            <TouchableOpacity
              style={[styles.metaSummaryItem, statusFilter === 'unassigned' && styles.metaSummaryItemActive]}
              onPress={() => { setSourceFilter('all'); setStatusFilter(f => f === 'unassigned' ? 'all' : 'unassigned'); }}
              activeOpacity={0.8}
            >
              <Ionicons name="person-remove-outline" size={13} color={Colors.warning} />
              <Text style={styles.metaSummaryLabel}>Unassigned</Text>
              <Text style={[styles.metaSummaryCount, unassignedCount > 0 && { color: Colors.warning }]}>{unassignedCount}</Text>
            </TouchableOpacity>
            <View style={styles.metaSummaryDivider} />
            <View style={styles.metaSummaryItem}>
              <Ionicons name="people-outline" size={13} color={Colors.primary} />
              <Text style={styles.metaSummaryLabel}>Total</Text>
              <Text style={styles.metaSummaryCount}>{leads.length}</Text>
            </View>
          </View>
        )}

        {/* Search */}
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search name, phone"
            value={search}
            onChangeText={setSearch}
            placeholderTextColor={Colors.gray400}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        </View>

        {/* Source Filter Tabs — hidden for sales */}
        {role !== 'sales' && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.sourceTabs}
            contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: Spacing.sm, alignItems: 'center' }}
          >
            {sourceFilters.map(f => (
              <TouchableOpacity
                key={f.key}
                style={[styles.sourceTab, sourceFilter === f.key && { backgroundColor: f.color, borderColor: f.color }]}
                onPress={() => setSourceFilter(prev => prev === f.key ? 'all' : f.key)}
                activeOpacity={0.8}
              >
                <Ionicons name={f.icon as any} size={13} color={sourceFilter === f.key ? Colors.white : f.color} />
                <Text style={[styles.sourceTabText, sourceFilter === f.key && { color: Colors.white }]}>{f.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Status Filter Chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statusChips}
          contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: 6, alignItems: 'center' }}
        >
          <TouchableOpacity
            style={[styles.chip, statusFilter === 'all' && styles.chipActive]}
            onPress={() => setStatusFilter('all')}
          >
            <Text style={[styles.chipText, statusFilter === 'all' && styles.chipTextActive]}>All</Text>
          </TouchableOpacity>
          {isRootAdmin && (
            <TouchableOpacity
              style={[styles.chip, statusFilter === 'unassigned' && { backgroundColor: Colors.warning, borderColor: Colors.warning }]}
              onPress={() => setStatusFilter(s => s === 'unassigned' ? 'all' : 'unassigned')}
            >
              <Text style={[styles.chipText, statusFilter === 'unassigned' && { color: Colors.white }]}>
                Unassigned{unassignedCount > 0 ? ` (${unassignedCount})` : ''}
              </Text>
            </TouchableOpacity>
          )}
          {(['new','assigned','contacted','interested','follow_up','site_visit_scheduled','not_interested','rnr','switch_off','dead','invalid','closed_won'] as LeadStatus[]).map(s => (
            <TouchableOpacity
              key={s}
              style={[styles.chip, statusFilter === s && { backgroundColor: STATUS_CONFIG[s].color, borderColor: STATUS_CONFIG[s].color }]}
              onPress={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            >
              <Text style={[styles.chipText, statusFilter === s && { color: Colors.white }]}>{STATUS_CONFIG[s].label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Active filter indicator */}
        {(sourceFilter !== 'all' || statusFilter !== 'all' || search) && (
          <View style={styles.activeFilterBar}>
            <Text style={styles.activeFilterText}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              {sourceFilter !== 'all' ? ` · ${sourceFilter}` : ''}
              {statusFilter !== 'all' ? ` · ${typeof statusFilter === 'string' ? statusFilter.replace(/_/g, ' ') : statusFilter}` : ''}
            </Text>
            <TouchableOpacity onPress={() => { setSourceFilter('all'); setStatusFilter('all'); setSearch(''); }}>
              <Text style={styles.clearFilterText}>Clear all</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* ── Scrollable lead list — takes all remaining space ── */}
      <View style={isWeb ? { flex: 1, maxWidth: WEB_MAX_WIDTH, width: '100%', alignSelf: 'center' } : { flex: 1 }}>
        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={l => l.id}
            contentContainerStyle={{ paddingBottom: insets.bottom + 80, paddingHorizontal: Spacing.base, paddingTop: Spacing.sm }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<EmptyState sourceFilter={sourceFilter} />}
            renderItem={({ item }) => (
              <LeadRow
                lead={item}
                onPress={() => router.push({ pathname: '/leads/[id]', params: { id: item.id } })}
                onCRM={() => openCRM(item)}
              />
            )}
          />
        )}
      </View>

      {/* CRM Action Modal */}
      {selectedLead && (
        <CRMModal
          lead={selectedLead}
          visible={showCRMModal}
          onClose={() => { setShowCRMModal(false); setSelectedLead(null); }}
          currentUserId={user?.uid ?? ''}
          currentUserName={user?.displayName ?? ''}
          currentUserRole={user?.role ?? 'sales'}
        />
      )}
    </View>
  );
}

const META_PAGE_LABELS: Record<string, string> = {
  '1018805394651044': 'Page 1',
  '968440359693058':  'Page 2',
  '337675829430214':  'Page 3',
};

// ─── Lead Row ─────────────────────────────────────────────────────────────────
function LeadRow({ lead, onPress, onCRM }: { lead: Lead; onPress: () => void; onCRM: () => void }) {
  const cfg = STATUS_CONFIG[lead.status] ?? STATUS_CONFIG.new;
  const { user: currentUser } = useAuthStore();
  const isSalesUser = currentUser?.role === 'sales';
  const sourceColor: Record<string, string> = {
    meta: '#1877F2', google: '#EA4335', uploaded: '#F59E0B', whatsapp: '#25D366',
    referral: Colors.primary, website: '#8B5CF6',
  };
  const accColors: Record<number, string> = { 1: '#1877F2', 2: '#0B5ED7', 3: '#0353A4' };
  const acc = lead.metaAccount ?? 2;
  const srcColor = lead.source === 'meta'
    ? (accColors[acc] ?? '#1877F2')
    : (sourceColor[lead.source] ?? Colors.gray400);

  const sourceIcon = lead.source === 'meta'     ? 'logo-facebook'
                   : lead.source === 'google'   ? 'logo-google'
                   : lead.source === 'whatsapp' ? 'logo-whatsapp'
                   : 'cloud-upload';

  const pageName = lead.metaPageId ? META_PAGE_LABELS[lead.metaPageId] : null;

  return (
    <View style={styles.leadCard}>
      <TouchableOpacity style={styles.leadMain} onPress={onPress} activeOpacity={0.8}>
        {/* Avatar */}
        <View style={[styles.leadAvatar, { backgroundColor: srcColor + '20' }]}>
          <Text style={[styles.leadAvatarText, { color: srcColor }]}>{lead.name.charAt(0).toUpperCase()}</Text>
        </View>

        <View style={{ flex: 1 }}>
          {/* Row 1: Name + status */}
          <View style={styles.leadTopRow}>
            <Text style={styles.leadName} numberOfLines={1}>{lead.name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: cfg.bg }]}>
              <Text style={[styles.statusText, { color: cfg.color }]}>{cfg.label}</Text>
            </View>
          </View>

          {/* Row 2: Phone + follow-up date */}
          <View style={styles.leadPhoneRow}>
            <Text style={styles.leadPhone}>{lead.phone}</Text>
            {lead.followUpDate ? (
              <Text style={[styles.followUpText, !!lead.followUpDate && lead.followUpDate < format(new Date(), 'yyyy-MM-dd') && { color: Colors.danger }]}>
                {'📅 ' + safeFormatDate(lead.followUpDate, 'MMM d')}
              </Text>
            ) : null}
          </View>

          {/* Row 3: Source + campaign */}
          <View style={styles.leadMeta}>
            {/* Source tag — hidden for sales */}
            {!isSalesUser && (
              <View style={[styles.sourceTag, { borderColor: srcColor }]}>
                <Ionicons name={sourceIcon} size={10} color={srcColor} />
                <Text style={[styles.sourceTagText, { color: srcColor }]}>
                  {lead.source === 'meta'
                    ? `Meta Acc ${acc}${pageName ? ` · ${pageName}` : ''}`
                    : lead.source}
                </Text>
              </View>
            )}

            {lead.metaCampaignName ? (
              <View style={styles.campaignRow}>
                <Ionicons name="megaphone-outline" size={10} color="#7C3AED" />
                <Text style={styles.campaignTag} numberOfLines={1}>{lead.metaCampaignName}</Text>
              </View>
            ) : null}

            {!lead.assignedTo && lead.status === 'new' && (
              <View style={styles.unassignedBadge}>
                <Ionicons name="person-remove-outline" size={10} color={Colors.warning} />
                <Text style={styles.unassignedText}>Unassigned</Text>
              </View>
            )}
          </View>

          {/* Row 4: Agent + project (only if present) */}
          {(lead.assignedToName || lead.projectName) ? (
            <View style={styles.agentRow}>
              {lead.assignedToName ? (
                <>
                  <Ionicons name="person-outline" size={10} color={Colors.gray400} />
                  <Text style={styles.agentTag} numberOfLines={1}>{lead.assignedToName}</Text>
                </>
              ) : null}
              {lead.projectName ? (
                <Text style={styles.projectTag} numberOfLines={1}>{lead.projectName}</Text>
              ) : null}
            </View>
          ) : null}
        </View>
      </TouchableOpacity>

      {/* CRM quick action */}
      <TouchableOpacity style={styles.crmBtn} onPress={onCRM} activeOpacity={0.8}>
        <Ionicons name="create-outline" size={18} color={Colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

// ─── CRM Modal ────────────────────────────────────────────────────────────────
function CRMModal({
  lead, visible, onClose, currentUserId, currentUserName, currentUserRole,
}: {
  lead: Lead;
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
  currentUserName: string;
  currentUserRole: string;
}) {
  const [comments, setComments] = useState<LeadComment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [status, setStatus] = useState<LeadStatus>(lead.status);
  const [followUpDate, setFollowUpDate] = useState(lead.followUpDate ?? '');
  const [visitDate, setVisitDate] = useState(lead.visitDate ?? '');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!visible) return;
    setStatus(lead.status);
    setFollowUpDate(lead.followUpDate ?? '');
    setVisitDate(lead.visitDate ?? '');
    const unsub = onSnapshot(
      query(collection(db, 'leads', lead.id, 'comments'), orderBy('createdAt', 'desc')),
      snap => setComments(snap.docs.map(d => ({ id: d.id, ...d.data() } as LeadComment)))
    );
    return () => unsub();
  }, [visible, lead.id]);

  const saveComment = async () => {
    if (!newComment.trim()) return;
    await addDoc(collection(db, 'leads', lead.id, 'comments'), {
      leadId: lead.id,
      authorId: currentUserId,
      authorName: currentUserName,
      authorRole: currentUserRole,
      text: newComment.trim(),
      createdAt: new Date().toISOString(),
    });
    setNewComment('');
  };

  const saveChanges = async () => {
    setSaving(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const updates: Partial<Lead> = {
        status,
        followUpDate: followUpDate || null,
        visitDate: visitDate || null,
        updatedAt: new Date().toISOString(),
        ...(status === 'closed_won' && !lead.closureDate ? { closureDate: today } : {}),
      };
      await updateDoc(doc(db, 'leads', lead.id), updates as Record<string, unknown>);

      if (status !== lead.status) {
        const oldLabel = STATUS_CONFIG[lead.status]?.label ?? lead.status;
        const newLabel = STATUS_CONFIG[status]?.label ?? status;

        await addDoc(collection(db, 'leads', lead.id, 'activities'), {
          type: 'status_change',
          description: `Status changed from ${oldLabel} to ${newLabel}`,
          performedBy: currentUserId,
          performedByName: currentUserName,
          createdAt: new Date().toISOString(),
        });

        // Notify the sales person who made the change
        if (currentUserRole === 'sales') {
          // Local notification — immediate, works in foreground and Expo Go
          sendLocalNotification(
            '✅ Lead Status Updated',
            `${lead.name}: ${oldLabel} → ${newLabel}`,
            { type: 'status_change', leadId: lead.id },
            'general'
          ).catch(console.error);

          // Firestore notification record (shows in Notifications tab)
          addDoc(collection(db, 'notifications'), {
            title: 'Lead Status Updated',
            body: `You changed ${lead.name}'s status to ${newLabel}`,
            type: 'status_change',
            leadId: lead.id,
            userId: currentUserId,
            read: false,
            createdAt: serverTimestamp(),
          }).catch(console.error);

        }
      }
      onClose();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={modal.container}>
          {/* Header */}
          <View style={modal.header}>
            <View>
              <Text style={modal.title}>{lead.name}</Text>
              <Text style={modal.sub}>{lead.phone} · {lead.source}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modal.closeBtn}>
              <Ionicons name="close" size={22} color={Colors.gray600} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
            {/* Status Selector */}
            <Text style={modal.sectionLabel}>Status</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={modal.statusRow}>
              {(Object.keys(STATUS_CONFIG) as LeadStatus[]).map(s => {
                const cfg = STATUS_CONFIG[s];
                const active = status === s;
                return (
                  <TouchableOpacity
                    key={s}
                    style={[modal.statusChip, { backgroundColor: active ? cfg.color : cfg.bg }]}
                    onPress={() => setStatus(s)}
                    activeOpacity={0.8}
                  >
                    <Text style={[modal.statusChipText, { color: active ? Colors.white : cfg.color }]}>{cfg.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Follow-up Date */}
            <View style={modal.dateRow}>
              <View style={{ flex: 1 }}>
                <Text style={modal.sectionLabel}>Follow-up Date</Text>
                <TextInput
                  style={modal.dateInput}
                  placeholder="YYYY-MM-DD"
                  value={followUpDate}
                  onChangeText={setFollowUpDate}
                  placeholderTextColor={Colors.gray400}
                />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={modal.sectionLabel}>Visit Date</Text>
                <TextInput
                  style={modal.dateInput}
                  placeholder="YYYY-MM-DD"
                  value={visitDate}
                  onChangeText={setVisitDate}
                  placeholderTextColor={Colors.gray400}
                />
              </View>
            </View>

            {/* Save button */}
            <TouchableOpacity style={modal.saveBtn} onPress={saveChanges} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={Colors.white} size="small" /> : <Text style={modal.saveBtnText}>Save Changes</Text>}
            </TouchableOpacity>

            {/* Comments */}
            <Text style={modal.sectionLabel}>Comments ({comments.length})</Text>
            {comments.map(c => (
              <View key={c.id} style={modal.commentCard}>
                <View style={modal.commentHeader}>
                  <Text style={modal.commentAuthor}>{c.authorName}</Text>
                  <Text style={modal.commentRole}>{c.authorRole}</Text>
                  <Text style={modal.commentTime}>{safeFormatDate(c.createdAt, 'MMM d, HH:mm')}</Text>
                </View>
                <Text style={modal.commentText}>{c.text}</Text>
              </View>
            ))}

            <View style={{ height: 80 }} />
          </ScrollView>

          {/* Comment Input */}
          <View style={modal.inputRow}>
            <TextInput
              ref={inputRef}
              style={modal.commentInput}
              placeholder="Add a comment..."
              value={newComment}
              onChangeText={setNewComment}
              multiline
              placeholderTextColor={Colors.gray400}
            />
            <TouchableOpacity style={modal.sendBtn} onPress={saveComment} disabled={!newComment.trim()} activeOpacity={0.8}>
              <Ionicons name="send" size={18} color={newComment.trim() ? Colors.white : Colors.gray400} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function EmptyState({ sourceFilter }: { sourceFilter: string }) {
  return (
    <View style={styles.empty}>
      <Ionicons name="people-outline" size={52} color={Colors.gray300} />
      <Text style={styles.emptyTitle}>No leads found</Text>
      <Text style={styles.emptySub}>
        {sourceFilter !== 'all' ? `No ${sourceFilter} leads match your filters` : 'No leads match the selected filters'}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  // Fixed top section — sizes to content, never squishes
  stickyTop: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.sm, backgroundColor: Colors.navy },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  addBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, marginHorizontal: Spacing.base, marginVertical: Spacing.sm, paddingHorizontal: Spacing.md, borderRadius: Radius.lg, gap: 8, borderWidth: 1, borderColor: Colors.gray200 },
  searchInput: { flex: 1, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.gray800, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } as any : {}) },
  // Horizontal filter rows — fixed height, never flex-shrink
  sourceTabs: { flexShrink: 0, paddingVertical: Spacing.xs },
  sourceTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200 },
  sourceTabText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray700 },
  statusChips: { flexShrink: 0, paddingVertical: Spacing.xs },
  chip: { paddingHorizontal: Spacing.md, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.gray50, borderWidth: 1, borderColor: Colors.gray200 },
  chipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  chipText: { fontSize: FontSize.xs, color: Colors.gray600, fontWeight: FontWeight.medium },
  chipTextActive: { color: Colors.white },
  // Active filter indicator bar
  activeFilterBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: 6, backgroundColor: Colors.primaryLight },
  activeFilterText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },
  clearFilterText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.bold },
  // Meta account summary bar (admin only)
  metaSummary: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray50, marginHorizontal: Spacing.base, marginTop: Spacing.sm, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray200, overflow: 'hidden' },
  metaSummaryItem: { flex: 1, alignItems: 'center', paddingVertical: 9, gap: 2 },
  metaSummaryItemActive: { backgroundColor: Colors.primaryLight },
  metaSummaryDivider: { width: 1, height: 32, backgroundColor: Colors.gray200 },
  metaSummaryLabel: { fontSize: 9, color: Colors.gray500, fontWeight: FontWeight.medium },
  metaSummaryCount: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy },

  leadCard: { flexDirection: 'row', alignItems: 'stretch', backgroundColor: Colors.white, borderRadius: Radius.lg, marginBottom: Spacing.sm, overflow: 'hidden', borderWidth: 1, borderColor: Colors.gray100 },
  leadMain: { flex: 1, flexDirection: 'row', paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, gap: Spacing.sm },
  leadAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', marginTop: 2 },
  leadAvatarText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  leadTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  leadName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy, flex: 1, marginRight: 6 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: Radius.full, flexShrink: 0 },
  statusText: { fontSize: 10, fontWeight: FontWeight.semibold },
  leadPhoneRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  leadPhone: { fontSize: FontSize.xs, color: Colors.gray500 },
  leadMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginBottom: 3 },
  sourceTag: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, borderWidth: 1 },
  sourceTagText: { fontSize: 10, fontWeight: FontWeight.medium },
  unassignedBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: Colors.warningLight, borderWidth: 1, borderColor: Colors.warning },
  unassignedText: { fontSize: 10, color: Colors.warning, fontWeight: FontWeight.semibold },
  projectTag: { fontSize: 10, color: Colors.gray500, backgroundColor: Colors.gray100, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, flexShrink: 1 },
  campaignRow: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE' },
  campaignTag: { fontSize: 10, color: '#7C3AED', fontWeight: FontWeight.medium, maxWidth: 120 },
  agentRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  agentTag: { fontSize: 10, color: Colors.gray400, flexShrink: 1 },
  followUpText: { fontSize: 10, color: Colors.primary, flexShrink: 0 },
  crmBtn: { width: 42, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primaryLight },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray500 },
  emptySub: { fontSize: FontSize.sm, color: Colors.gray400, textAlign: 'center', paddingHorizontal: 40 },
});

const modal = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', padding: Spacing.base, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  sub: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 2 },
  closeBtn: { padding: 6 },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: Spacing.base, marginTop: Spacing.md, marginBottom: 8 },
  statusRow: { paddingHorizontal: Spacing.base, gap: 8, paddingBottom: 4 },
  statusChip: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full },
  statusChipText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  dateRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, marginTop: 4 },
  dateInput: { borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, color: Colors.gray800 },
  saveBtn: { marginHorizontal: Spacing.base, marginTop: Spacing.md, backgroundColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 13, alignItems: 'center' },
  saveBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
  commentCard: { marginHorizontal: Spacing.base, marginBottom: Spacing.sm, backgroundColor: Colors.gray50, borderRadius: Radius.lg, padding: Spacing.md },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  commentAuthor: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.navy },
  commentRole: { fontSize: 10, color: Colors.primary, backgroundColor: Colors.primaryLight, paddingHorizontal: 5, paddingVertical: 1, borderRadius: Radius.full },
  commentTime: { fontSize: 10, color: Colors.gray400, marginLeft: 'auto' },
  commentText: { fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 20 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: Spacing.base, borderTopWidth: 1, borderTopColor: Colors.gray100, gap: Spacing.sm, backgroundColor: Colors.white },
  commentInput: { flex: 1, borderWidth: 1, borderColor: Colors.gray200, borderRadius: Radius.lg, paddingHorizontal: Spacing.md, paddingVertical: 10, fontSize: FontSize.sm, maxHeight: 100, color: Colors.gray800 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
});
