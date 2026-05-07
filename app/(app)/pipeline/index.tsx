import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Redirect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, formatCurrency } from '@/constants/theme';
import { Lead } from '@/types';

// ─── Pipeline stages mapped from lead statuses ────────────────────────────────
const PIPELINE_STAGES = [
  {
    key: 'interested',
    label: 'Interested',
    icon: 'hand-left-outline',
    color: '#059669',
    statuses: ['interested'],
    description: 'Lead has expressed interest',
  },
  {
    key: 'follow_up',
    label: 'Follow Up',
    icon: 'call-outline',
    color: '#D97706',
    statuses: ['follow_up', 'contacted'],
    description: 'Active follow-ups in progress',
  },
  {
    key: 'site_visit',
    label: 'Site Visit',
    icon: 'car-outline',
    color: '#0891B2',
    statuses: ['site_visit_scheduled', 'site_visit_done'],
    description: 'Property visits scheduled/done',
  },
  {
    key: 'negotiation',
    label: 'Negotiation',
    icon: 'cash-outline',
    color: '#EA580C',
    statuses: ['negotiation'],
    description: 'Pricing & terms being finalized',
  },
  {
    key: 'closed_won',
    label: 'Closed Won',
    icon: 'trophy-outline',
    color: '#16A34A',
    statuses: ['closed_won'],
    description: 'Deal successfully closed',
  },
] as const;

const SOURCE_COLORS: Record<string, string> = {
  meta: '#1877F2', google: '#EA4335', whatsapp: '#25D366',
  uploaded: '#F59E0B', referral: '#8B5CF6', website: '#3B82F6',
};

export default function PipelineScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuthStore();

  if (user?.role === 'sales') return <Redirect href="/dashboard" />;

  const [leads, setLeads]         = useState<Lead[]>([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState<string | null>(null);

  const isAdmin = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, snap => {
      setLeads(snap.docs.map(d => ({ id: d.id, ...d.data() } as Lead)));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [user?.uid]);

  // Group leads by pipeline stage
  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage.key] = leads.filter(l => (stage.statuses as readonly string[]).includes(l.status));
    return acc;
  }, {} as Record<string, Lead[]>);

  // Total estimated value (budget) of active pipeline
  const totalValue = leads
    .filter(l => !['dead', 'invalid', 'not_interested'].includes(l.status) && l.budget)
    .reduce((sum, l) => sum + (l.budget ?? 0), 0);

  const visibleStages = selected
    ? PIPELINE_STAGES.filter(s => s.key === selected)
    : PIPELINE_STAGES;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Deal Pipeline</Text>
          <Text style={styles.headerSub}>
            {totalValue > 0 ? `${formatCurrency(totalValue)} potential value` : 'Track leads through your sales funnel'}
          </Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/leads/new' as any)} activeOpacity={0.8}>
          <Ionicons name="add" size={20} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* Stage Summary Bar */}
      <View style={styles.summaryBar}>
        {PIPELINE_STAGES.map(stage => {
          const count = grouped[stage.key]?.length ?? 0;
          const isActive = selected === stage.key;
          return (
            <TouchableOpacity
              key={stage.key}
              onPress={() => setSelected(isActive ? null : stage.key)}
              style={[styles.summaryItem, isActive && { backgroundColor: stage.color + '18' }]}
              activeOpacity={0.75}
            >
              <View style={[styles.stageDot, { backgroundColor: stage.color }]} />
              <Text style={[styles.summaryCount, { color: stage.color }]}>{count}</Text>
              <Text style={styles.summaryLabel} numberOfLines={1}>{stage.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.kanban}
          contentContainerStyle={[styles.kanbanContent, { paddingBottom: insets.bottom + 120 }]}
        >
          {visibleStages.map(stage => {
            const stageLeads = grouped[stage.key] ?? [];
            const stageValue = stageLeads.filter(l => l.budget).reduce((s, l) => s + (l.budget ?? 0), 0);

            return (
              <View key={stage.key} style={styles.column}>
                {/* Column Header */}
                <View style={[styles.columnHeader, { borderTopColor: stage.color }]}>
                  <View style={styles.columnHeaderLeft}>
                    <Ionicons name={stage.icon as any} size={14} color={stage.color} />
                    <Text style={styles.columnTitle}>{stage.label}</Text>
                    <View style={[styles.countBadge, { backgroundColor: stage.color + '20' }]}>
                      <Text style={[styles.countBadgeText, { color: stage.color }]}>{stageLeads.length}</Text>
                    </View>
                  </View>
                  {stageValue > 0 && (
                    <Text style={[styles.stageValue, { color: stage.color }]}>{formatCurrency(stageValue)}</Text>
                  )}
                </View>

                {/* Lead Cards */}
                <ScrollView showsVerticalScrollIndicator={false} style={styles.columnScroll} nestedScrollEnabled>
                  {stageLeads.length === 0 ? (
                    <View style={styles.emptyColumn}>
                      <Ionicons name={stage.icon as any} size={24} color={Colors.gray200} />
                      <Text style={styles.emptyColumnText}>No leads</Text>
                    </View>
                  ) : stageLeads.map(lead => (
                    <TouchableOpacity
                      key={lead.id}
                      style={styles.leadCard}
                      onPress={() => router.push({ pathname: '/leads/[id]', params: { id: lead.id } })}
                      activeOpacity={0.85}
                    >
                      {/* Source accent */}
                      <View style={[styles.cardAccent, { backgroundColor: SOURCE_COLORS[lead.source] ?? Colors.gray300 }]} />

                      <View style={styles.cardBody}>
                        {/* Name + budget */}
                        <View style={styles.cardTopRow}>
                          <Text style={styles.cardName} numberOfLines={1}>{lead.name}</Text>
                          {lead.budget ? (
                            <Text style={styles.cardBudget}>{formatCurrency(lead.budget)}</Text>
                          ) : null}
                        </View>

                        {/* Phone */}
                        <Text style={styles.cardPhone}>{lead.phone}</Text>

                        {/* Requirements */}
                        {lead.requirements ? (
                          <Text style={styles.cardReq} numberOfLines={1}>{lead.requirements}</Text>
                        ) : null}

                        {/* Campaign + agent */}
                        <View style={styles.cardFooter}>
                          {lead.metaCampaignName ? (
                            <View style={styles.campaignPill}>
                              <Ionicons name="megaphone-outline" size={9} color="#7C3AED" />
                              <Text style={styles.campaignText} numberOfLines={1}>{lead.metaCampaignName}</Text>
                            </View>
                          ) : null}
                          {lead.assignedToName ? (
                            <View style={styles.agentPill}>
                              <Ionicons name="person-outline" size={9} color={Colors.gray400} />
                              <Text style={styles.agentText} numberOfLines={1}>{lead.assignedToName.split(' ')[0]}</Text>
                            </View>
                          ) : (
                            <View style={styles.unassignedPill}>
                              <Text style={styles.unassignedText}>Unassigned</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </TouchableOpacity>
                  ))}

                  {/* Add new lead button */}
                  <TouchableOpacity
                    style={styles.addCardBtn}
                    onPress={() => router.push('/leads/new' as any)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="add" size={15} color={Colors.gray400} />
                    <Text style={styles.addCardText}>Add lead</Text>
                  </TouchableOpacity>
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* ── Purpose Description ── */}
      <View style={[styles.purposeBar, { paddingBottom: insets.bottom + 65 }]}>
        <Ionicons name="information-circle-outline" size={13} color={Colors.gray400} />
        <Text style={styles.purposeText}>
          The pipeline tracks active leads from <Text style={styles.purposeBold}>Interested</Text> → <Text style={styles.purposeBold}>Follow Up</Text> → <Text style={styles.purposeBold}>Site Visit</Text> → <Text style={styles.purposeBold}>Negotiation</Text> → <Text style={styles.purposeBold}>Closed Won</Text>. Tap any card to open the lead. Tap a column to filter. Budget values shown are estimated deal sizes.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:     { flex: 1, backgroundColor: Colors.gray50 },
  centered:   { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header:      { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.sm },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub:   { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  addBtn:      { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },

  summaryBar:  { flexDirection: 'row', backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100, paddingVertical: Spacing.xs, paddingHorizontal: Spacing.xs },
  summaryItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.xs, borderRadius: Radius.sm },
  stageDot:    { width: 7, height: 7, borderRadius: 4, marginBottom: 3 },
  summaryCount:{ fontSize: FontSize.base, fontWeight: FontWeight.bold },
  summaryLabel:{ fontSize: 9, color: Colors.gray500, textAlign: 'center', marginTop: 1 },

  kanban:        { flex: 1 },
  kanbanContent: { paddingHorizontal: Spacing.sm, paddingTop: Spacing.md, flexDirection: 'row', alignItems: 'flex-start' },

  column:       { width: 230, marginRight: Spacing.sm, backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray100, maxHeight: 560, overflow: 'hidden' },
  columnHeader: { borderTopWidth: 3, padding: Spacing.md, backgroundColor: Colors.white, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  columnHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  columnTitle:  { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy },
  countBadge:   { paddingHorizontal: 6, paddingVertical: 1, borderRadius: Radius.full },
  countBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  stageValue:   { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  columnScroll: { flex: 1, padding: Spacing.sm },

  emptyColumn:     { alignItems: 'center', paddingVertical: Spacing.xl, opacity: 0.5 },
  emptyColumnText: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 6 },

  leadCard:    { backgroundColor: Colors.gray50, borderRadius: Radius.md, marginBottom: Spacing.xs, borderWidth: 1, borderColor: Colors.gray100, flexDirection: 'row', overflow: 'hidden' },
  cardAccent:  { width: 3, flexShrink: 0 },
  cardBody:    { flex: 1, padding: Spacing.sm },
  cardTopRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  cardName:    { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy, flex: 1, marginRight: 4 },
  cardBudget:  { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.primary, flexShrink: 0 },
  cardPhone:   { fontSize: FontSize.xs, color: Colors.gray500, marginBottom: 3 },
  cardReq:     { fontSize: FontSize.xs, color: Colors.gray600, marginBottom: 4, fontStyle: 'italic' },
  cardFooter:  { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  campaignPill:{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#F5F3FF', paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  campaignText:{ fontSize: 9, color: '#7C3AED', fontWeight: FontWeight.medium, maxWidth: 80 },
  agentPill:   { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: Colors.gray100, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  agentText:   { fontSize: 9, color: Colors.gray500 },
  unassignedPill: { backgroundColor: Colors.warningLight, paddingHorizontal: 5, paddingVertical: 2, borderRadius: Radius.full },
  unassignedText: { fontSize: 9, color: Colors.warning, fontWeight: FontWeight.medium },

  addCardBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: Colors.gray200, borderRadius: Radius.md, marginTop: Spacing.xs },
  addCardText: { fontSize: FontSize.xs, color: Colors.gray400 },

  // Purpose description bar at bottom
  purposeBar:  { backgroundColor: Colors.white, borderTopWidth: 1, borderTopColor: Colors.gray100, paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, flexDirection: 'row', alignItems: 'flex-start', gap: 6, position: 'absolute', bottom: 0, left: 0, right: 0 },
  purposeText: { flex: 1, fontSize: 10, color: Colors.gray400, lineHeight: 15 },
  purposeBold: { color: Colors.gray600, fontWeight: FontWeight.semibold },
});
