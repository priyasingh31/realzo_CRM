import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, formatCurrency } from '@/constants/theme';
import { getAgentPerformance, getAgentMonthlyTrend } from '@/services/analyticsService';
import { AgentPerformance } from '@/types';

const MONTH_PRESETS = [
  { label: 'This Month', from: startOfMonth(new Date()),          to: endOfMonth(new Date()) },
  { label: 'Last Month', from: startOfMonth(subMonths(new Date(), 1)), to: endOfMonth(subMonths(new Date(), 1)) },
  { label: '3 Months',   from: startOfMonth(subMonths(new Date(), 2)), to: endOfMonth(new Date()) },
  { label: '6 Months',   from: startOfMonth(subMonths(new Date(), 5)), to: endOfMonth(new Date()) },
  { label: 'All Time',   from: undefined,                             to: undefined },
];

export default function AgentDetailScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [agent, setAgent] = useState<AgentPerformance | null>(null);
  const [trend, setTrend] = useState<Array<{ month: string; leads: number; closures: number; revenue: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [periodIdx, setPeriodIdx] = useState(0);

  const load = async () => {
    if (!agentId) return;
    const preset = MONTH_PRESETS[periodIdx];
    try {
      const [perf, monthly] = await Promise.all([
        getAgentPerformance(agentId, preset.from, preset.to),
        getAgentMonthlyTrend(agentId, 6),
      ]);
      setAgent(perf);
      setTrend(monthly);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { load(); }, [agentId, periodIdx]);

  if (!agentId) return null;

  const responseColor = (agent?.responseRate ?? 0) >= 80 ? Colors.primary : (agent?.responseRate ?? 0) >= 50 ? '#F59E0B' : Colors.danger;
  const maxLeads = Math.max(...trend.map(t => t.leads), 1);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={Colors.white} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>{agent?.displayName ?? '...'}</Text>
          <Text style={styles.headerSub}>{agent?.email}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : !agent ? null : (
          <>
            {/* Period selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.periodScroll}
              contentContainerStyle={{ paddingHorizontal: Spacing.base, gap: 8, paddingVertical: 10 }}>
              {MONTH_PRESETS.map((p, i) => (
                <TouchableOpacity
                  key={p.label}
                  style={[styles.periodBtn, periodIdx === i && styles.periodBtnActive]}
                  onPress={() => setPeriodIdx(i)}
                >
                  <Text style={[styles.periodBtnText, periodIdx === i && { color: Colors.white }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* Profile card */}
            <View style={styles.profileCard}>
              <View style={styles.profileAvatar}>
                <Text style={styles.profileAvatarText}>{agent.displayName.charAt(0)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profileName}>{agent.displayName}</Text>
                {agent.phone && <Text style={styles.profilePhone}>📞 {agent.phone}</Text>}
                {agent.region && <Text style={styles.profileRegion}>📍 {agent.region}</Text>}
                {agent.lastActive && (
                  <Text style={styles.profileActive}>Last active: {format(new Date(agent.lastActive), 'MMM d, yyyy')}</Text>
                )}
              </View>
              <View style={[styles.responseCircle, { borderColor: responseColor }]}>
                <Text style={[styles.responseVal, { color: responseColor }]}>{agent.responseRate}%</Text>
                <Text style={styles.responseLbl}>Response</Text>
              </View>
            </View>

            {/* Performance metrics */}
            <Text style={styles.sectionTitle}>Performance — {MONTH_PRESETS[periodIdx].label}</Text>
            <View style={styles.kpiGrid}>
              <KPIBox label="Total Leads"    value={agent.totalLeads}     icon="people"       color={Colors.navy} />
              <KPIBox label="Interested"     value={agent.interested}     icon="thumbs-up"    color={Colors.primary} />
              <KPIBox label="Not Interested" value={agent.notInterested}  icon="thumbs-down"  color={Colors.danger} />
              <KPIBox label="EOICustomer"           value={agent.EOICustomer}           icon="skull-outline" color={Colors.gray400} />
              <KPIBox label="Invalid"        value={agent.invalid}        icon="ban-outline"  color={Colors.gray300} />
              <KPIBox label="Site Visits"    value={agent.siteVisits}     icon="home"         color="#8B5CF6" />
            </View>

            {/* Lead source breakdown */}
            <Text style={styles.sectionTitle}>Leads by Source</Text>
            <View style={styles.sourceGrid}>
              <SourceBox label="Meta"     value={agent.leadsFromMeta}     icon="logo-facebook" color="#1877F2" total={agent.totalLeads} />
              <SourceBox label="Google"   value={agent.leadsFromGoogle}   icon="logo-google"   color="#EA4335" total={agent.totalLeads} />
              <SourceBox label="Uploaded" value={agent.leadsFromUploaded} icon="cloud-upload"  color="#F59E0B" total={agent.totalLeads} />
            </View>

            {/* Closure summary */}
            <View style={styles.closureCard}>
              <Ionicons name="trophy" size={32} color="#F59E0B" />
              <View>
                <Text style={styles.closureTitle}>{agent.closures} Closures</Text>
                <Text style={styles.closureRevenue}>{formatCurrency(agent.revenue)} Revenue</Text>
                <Text style={styles.closureConv}>
                  {agent.totalLeads > 0 ? Math.round((agent.closures / agent.totalLeads) * 100) : 0}% conversion rate
                </Text>
              </View>
            </View>

            {/* Monthly trend bar chart */}
            <Text style={styles.sectionTitle}>Monthly Trend (Last 6 Months)</Text>
            <View style={styles.trendCard}>
              <View style={styles.trendBars}>
                {trend.map(t => (
                  <View key={t.month} style={styles.trendCol}>
                    <Text style={styles.trendCount}>{t.leads}</Text>
                    <View style={styles.barWrap}>
                      <View style={[styles.bar, {
                        height: Math.max(4, (t.leads / maxLeads) * 80),
                        backgroundColor: Colors.primary,
                      }]} />
                      {t.closures > 0 && (
                        <View style={[styles.bar, {
                          height: Math.max(4, (t.closures / maxLeads) * 80),
                          backgroundColor: '#F59E0B',
                          marginTop: 2,
                        }]} />
                      )}
                    </View>
                    <Text style={styles.trendMonth}>{format(new Date(t.month + '-01'), 'MMM')}</Text>
                    {t.closures > 0 && <Text style={styles.trendClosure}>★{t.closures}</Text>}
                  </View>
                ))}
              </View>
              <View style={styles.trendLegend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: Colors.primary }]} />
                  <Text style={styles.legendText}>Leads</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
                  <Text style={styles.legendText}>Closures</Text>
                </View>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Reusable components ──────────────────────────────────────────────────────
function KPIBox({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <View style={styles.kpiBox}>
      <View style={[styles.kpiIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={18} color={color} />
      </View>
      <Text style={[styles.kpiValue, { color }]}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function SourceBox({ label, value, icon, color, total }: { label: string; value: number; icon: string; color: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={[styles.sourceBox, { borderTopColor: color }]}>
      <Ionicons name={icon as any} size={20} color={color} />
      <Text style={[styles.sourceVal, { color }]}>{value}</Text>
      <Text style={styles.sourceLbl}>{label}</Text>
      <Text style={styles.sourcePct}>{pct}%</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  header: { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, gap: Spacing.sm },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },

  periodScroll: { backgroundColor: Colors.white, borderBottomWidth: 1, borderBottomColor: Colors.gray100 },
  periodBtn: { paddingHorizontal: Spacing.md, paddingVertical: 7, borderRadius: Radius.full, backgroundColor: Colors.gray100 },
  periodBtnActive: { backgroundColor: Colors.primary },
  periodBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray600 },

  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, margin: Spacing.base, borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.md },
  profileAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  profileAvatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  profileName: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },
  profilePhone: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 2 },
  profileRegion: { fontSize: FontSize.xs, color: Colors.gray400 },
  profileActive: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 2 },
  responseCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
  responseVal: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
  responseLbl: { fontSize: 9, color: Colors.gray500 },

  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5, marginHorizontal: Spacing.base, marginTop: Spacing.lg, marginBottom: Spacing.sm },

  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: Spacing.base, gap: Spacing.sm },
  kpiBox: { width: '30%', flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 4 },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  kpiLabel: { fontSize: 10, color: Colors.gray500, textAlign: 'center' },

  sourceGrid: { flexDirection: 'row', marginHorizontal: Spacing.base, gap: Spacing.sm },
  sourceBox: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.md, alignItems: 'center', gap: 4, borderTopWidth: 3 },
  sourceVal: { fontSize: FontSize.xl, fontWeight: FontWeight.bold },
  sourceLbl: { fontSize: FontSize.xs, color: Colors.gray500 },
  sourcePct: { fontSize: FontSize.xs, color: Colors.gray400 },

  closureCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg, backgroundColor: Colors.navy, marginHorizontal: Spacing.base, borderRadius: Radius.xl, padding: Spacing.lg },
  closureTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  closureRevenue: { fontSize: FontSize.base, color: '#F59E0B', fontWeight: FontWeight.semibold, marginTop: 4 },
  closureConv: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 4 },

  trendCard: { backgroundColor: Colors.white, marginHorizontal: Spacing.base, borderRadius: Radius.xl, padding: Spacing.base },
  trendBars: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', height: 120 },
  trendCol: { alignItems: 'center', gap: 4, flex: 1 },
  trendCount: { fontSize: 10, color: Colors.gray600, fontWeight: FontWeight.semibold },
  barWrap: { alignItems: 'center' },
  bar: { width: 24, borderRadius: 4 },
  trendMonth: { fontSize: 10, color: Colors.gray500 },
  trendClosure: { fontSize: 9, color: '#F59E0B', fontWeight: FontWeight.bold },
  trendLegend: { flexDirection: 'row', justifyContent: 'center', gap: Spacing.lg, marginTop: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendText: { fontSize: FontSize.xs, color: Colors.gray500 },
});
