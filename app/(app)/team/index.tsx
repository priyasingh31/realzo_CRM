import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, formatCurrency } from '@/constants/theme';
import { getManagerTeamPerformance, getAllManagersSummary } from '@/services/analyticsService';
import { AgentPerformance } from '@/types';

export default function TeamScreen() {
  const { user } = useAuthStore();
  const role = user?.role;

  if (role === 'admin') return <AdminTeamView />;
  if (role === 'manager') return <ManagerTeamView managerId={user!.uid} managerName={user!.displayName} />;
  return null;
}

// ─── ADMIN: Shows all managers, click → their agents ─────────────────────────
function AdminTeamView() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [managers, setManagers] = useState<Awaited<ReturnType<typeof getAllManagersSummary>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setManagers(await getAllManagersSummary()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, []);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Team Overview</Text>
          <Text style={styles.headerSub}>{managers.length} managers</Text>
        </View>
        <TouchableOpacity
          style={styles.manageUsersBtn}
          onPress={() => router.push('/team/users' as any)}
        >
          <Ionicons name="people" size={16} color={Colors.white} />
          <Text style={styles.manageUsersBtnText}>Manage Users</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
          managers.map(mgr => (
            <TouchableOpacity
              key={mgr.uid}
              style={styles.mgrCard}
              onPress={() => router.push({ pathname: '/team/[managerId]', params: { managerId: mgr.uid } })}
              activeOpacity={0.85}
            >
              <View style={styles.mgrTop}>
                <View style={styles.mgrAvatar}>
                  <Text style={styles.mgrAvatarText}>{mgr.displayName.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mgrName}>{mgr.displayName}</Text>
                  <Text style={styles.mgrEmail}>{mgr.email}</Text>
                  {mgr.region && <Text style={styles.mgrRegion}>📍 {mgr.region}</Text>}
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
              </View>

              <View style={styles.mgrStats}>
                <StatPill label="Agents"  value={mgr.totalAgents} color={Colors.navy} />
                <StatPill label="Leads"   value={mgr.totalLeads}  color="#7C3AED" />
                <StatPill label="Closed"  value={mgr.closures}    color={Colors.primary} />
                <View style={styles.revPill}>
                  <Text style={styles.revValue}>{formatCurrency(mgr.revenue)}</Text>
                  <Text style={styles.revLabel}>Revenue</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ─── MANAGER: Shows their sales agents ───────────────────────────────────────
export function ManagerTeamView({ managerId, managerName }: { managerId: string; managerName: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [agents, setAgents] = useState<AgentPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState<'leads' | 'closures' | 'revenue'>('leads');

  const load = async () => {
    try { setAgents(await getManagerTeamPerformance(managerId)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, [managerId]);

  const sorted = [...agents].sort((a, b) => {
    if (sortBy === 'leads')    return b.totalLeads - a.totalLeads;
    if (sortBy === 'closures') return b.closures - a.closures;
    return b.revenue - a.revenue;
  });

  // Team totals
  const totals = agents.reduce((acc, a) => ({
    leads: acc.leads + a.totalLeads,
    closures: acc.closures + a.closures,
    revenue: acc.revenue + a.revenue,
    meta: acc.meta + a.leadsFromMeta,
    google: acc.google + a.leadsFromGoogle,
    uploaded: acc.uploaded + a.leadsFromUploaded,
  }), { leads: 0, closures: 0, revenue: 0, meta: 0, google: 0, uploaded: 0 });

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{managerName}'s Team</Text>
        <Text style={styles.headerSub}>{agents.length} sales persons</Text>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : (
          <>
            {/* Team summary bar */}
            <View style={styles.summaryBar}>
              <SummaryItem label="Total Leads" value={totals.leads} />
              <SummaryItem label="Closures"    value={totals.closures} color={Colors.primary} />
              <SummaryItem label="Revenue"     value={formatCurrency(totals.revenue)} color="#7C3AED" isText />
            </View>

            {/* Source breakdown */}
            <View style={styles.sourceRow}>
              <SourceBit label="Meta"     value={totals.meta}     color="#1877F2" />
              <SourceBit label="Google"   value={totals.google}   color="#EA4335" />
              <SourceBit label="Uploaded" value={totals.uploaded} color="#F59E0B" />
            </View>

            {/* Sort toggle */}
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>Sort by:</Text>
              {(['leads', 'closures', 'revenue'] as const).map(s => (
                <TouchableOpacity
                  key={s}
                  style={[styles.sortBtn, sortBy === s && styles.sortBtnActive]}
                  onPress={() => setSortBy(s)}
                >
                  <Text style={[styles.sortBtnText, sortBy === s && { color: Colors.white }]}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Agent cards */}
            {sorted.map((agent, idx) => (
              <TouchableOpacity
                key={agent.uid}
                style={styles.agentCard}
                onPress={() => router.push({ pathname: '/team/agent/[agentId]', params: { agentId: agent.uid } })}
                activeOpacity={0.85}
              >
                <View style={styles.agentTop}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankText}>#{idx + 1}</Text>
                  </View>
                  <View style={styles.agentAvatar}>
                    <Text style={styles.agentAvatarText}>{agent.displayName.charAt(0)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.agentName}>{agent.displayName}</Text>
                    <Text style={styles.agentEmail}>{agent.email}</Text>
                    {agent.region && <Text style={styles.agentRegion}>📍 {agent.region}</Text>}
                  </View>
                  <View style={styles.responseRate}>
                    <Text style={[styles.responseVal, { color: agent.responseRate >= 80 ? Colors.primary : agent.responseRate >= 50 ? '#F59E0B' : Colors.danger }]}>
                      {agent.responseRate}%
                    </Text>
                    <Text style={styles.responseLbl}>response</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
                </View>

                {/* Stats grid */}
                <View style={styles.agentStatsGrid}>
                  <AgentStat label="Total"    value={agent.totalLeads}     />
                  <AgentStat label="Meta"     value={agent.leadsFromMeta}  color="#1877F2" />
                  <AgentStat label="Google"   value={agent.leadsFromGoogle} color="#EA4335" />
                  <AgentStat label="Uploaded" value={agent.leadsFromUploaded} color="#F59E0B" />
                </View>
                <View style={styles.agentStatsGrid}>
                  <AgentStat label="Interested"    value={agent.interested}    color={Colors.primary} />
                  <AgentStat label="Not Interested" value={agent.notInterested} color={Colors.danger} />
                  <AgentStat label="EOICustomer"          value={agent.EOICustomer}          color={Colors.gray400} />
                  <AgentStat label="Invalid"       value={agent.invalid}       color={Colors.gray300} />
                </View>
                <View style={styles.agentBottom}>
                  <View style={styles.agentClosureBox}>
                    <Ionicons name="trophy-outline" size={14} color={Colors.primary} />
                    <Text style={styles.agentClosureText}>{agent.closures} closures · {formatCurrency(agent.revenue)}</Text>
                  </View>
                  <Text style={styles.visitText}>🏠 {agent.siteVisits} site visits</Text>
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Reusable components ──────────────────────────────────────────────────────
function StatPill({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={[styles.statPillVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statPillLbl}>{label}</Text>
    </View>
  );
}
function SummaryItem({ label, value, color, isText }: { label: string; value: number | string; color?: string; isText?: boolean }) {
  return (
    <View style={styles.summaryItem}>
      <Text style={[styles.summaryVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.summaryLbl}>{label}</Text>
    </View>
  );
}
function SourceBit({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={[styles.sourceBit, { borderColor: color }]}>
      <Text style={[styles.sourceBitVal, { color }]}>{value}</Text>
      <Text style={styles.sourceBitLbl}>{label}</Text>
    </View>
  );
}
function AgentStat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.agentStatBox}>
      <Text style={[styles.agentStatVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.agentStatLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  header: { backgroundColor: Colors.navy, flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md },
  headerTitle: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  headerSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  manageUsersBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: 8, borderRadius: 20 },
  manageUsersBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.white },

  mgrCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, marginBottom: Spacing.md, overflow: 'hidden' },
  mgrTop: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.md },
  mgrAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  mgrAvatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.primary },
  mgrName: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },
  mgrEmail: { fontSize: FontSize.xs, color: Colors.gray500 },
  mgrRegion: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 2 },
  mgrStats: { flexDirection: 'row', backgroundColor: Colors.gray50, padding: Spacing.md, gap: Spacing.sm },
  statPill: { flex: 1, alignItems: 'center' },
  statPillVal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  statPillLbl: { fontSize: 10, color: Colors.gray500 },
  revPill: { flex: 1.5, alignItems: 'center' },
  revValue: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: '#7C3AED' },
  revLabel: { fontSize: 10, color: Colors.gray500 },

  summaryBar: { flexDirection: 'row', backgroundColor: Colors.white, margin: Spacing.base, borderRadius: Radius.xl, padding: Spacing.md },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryVal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  summaryLbl: { fontSize: 10, color: Colors.gray500, marginTop: 2 },

  sourceRow: { flexDirection: 'row', gap: Spacing.sm, marginHorizontal: Spacing.base, marginBottom: Spacing.sm },
  sourceBit: { flex: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', borderWidth: 1.5 },
  sourceBitVal: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },
  sourceBitLbl: { fontSize: 10, color: Colors.gray500 },

  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: Spacing.base, marginBottom: Spacing.sm, gap: 6 },
  sortLabel: { fontSize: FontSize.xs, color: Colors.gray500, marginRight: 4 },
  sortBtn: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200 },
  sortBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  sortBtnText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray600 },

  agentCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, marginHorizontal: Spacing.base, marginBottom: Spacing.md, overflow: 'hidden' },
  agentTop: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: Spacing.sm },
  rankBadge: { width: 26, height: 26, borderRadius: 13, backgroundColor: Colors.navy, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontSize: 10, fontWeight: FontWeight.bold, color: Colors.white },
  agentAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  agentAvatarText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primary },
  agentName: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy },
  agentEmail: { fontSize: FontSize.xs, color: Colors.gray500 },
  agentRegion: { fontSize: 10, color: Colors.gray400 },
  responseRate: { alignItems: 'center', minWidth: 48 },
  responseVal: { fontSize: FontSize.base, fontWeight: FontWeight.bold },
  responseLbl: { fontSize: 10, color: Colors.gray500 },

  agentStatsGrid: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: Colors.gray100 },
  agentStatBox: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  agentStatVal: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },
  agentStatLbl: { fontSize: 10, color: Colors.gray500 },

  agentBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, backgroundColor: Colors.gray50, borderTopWidth: 1, borderTopColor: Colors.gray100 },
  agentClosureBox: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  agentClosureText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.primary },
  visitText: { fontSize: FontSize.xs, color: Colors.gray500 },
});
