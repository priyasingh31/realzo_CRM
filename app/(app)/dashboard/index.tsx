import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native';
import { useResponsive, webContainer } from '@/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { format } from 'date-fns';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, formatCurrency } from '@/constants/theme';
import {
  getAdminDashboardMetrics, getSalesDashboardMetrics, getAllManagersSummary,
} from '@/services/analyticsService';
import { AdminDashboardMetrics, SalesDashboardMetrics } from '@/types';
import { fullSyncAllMetaAccounts, syncAllMetaAccounts } from '@/services/metaLeadsService';

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const role = user?.role;
  if (role === 'admin' || role === 'mis') return <AdminDashboard />;
  if (role === 'manager') return <ManagerDashboard />;
  return <SalesDashboard />;
}

// ─── SALES DASHBOARD ──────────────────────────────────────────────────────────
function SalesDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { metricColWidth } = useResponsive();
  const [metrics, setMetrics] = useState<SalesDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!user?.uid) return;
    try { setMetrics(await getSalesDashboardMetrics(user.uid)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, [user?.uid]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <LinearGradient colors={[Colors.navy, '#1A2F45']} style={styles.salesHeader}>
        <View>
          <Text style={styles.greeting}>{greeting},</Text>
          <Text style={styles.userName}>{user?.displayName?.split(' ')[0]} 👋</Text>
          <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMM d')}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.avatarBtn}>
          <Text style={styles.avatarLetter}>{user?.displayName?.charAt(0)}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={webContainer}>
          {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : <>
            {(metrics?.missedFollowUps ?? 0) > 0 && (
              <TouchableOpacity style={styles.alertBanner} onPress={() => router.push({ pathname: '/leads', params: { filter: 'missed' } })}>
                <Ionicons name="warning-outline" size={18} color={Colors.white} />
                <Text style={styles.alertText}>{metrics!.missedFollowUps} missed follow-up{metrics!.missedFollowUps > 1 ? 's' : ''} — tap to view</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.white} />
              </TouchableOpacity>
            )}
            <View style={styles.grid}>
              <MetricCard icon="add-circle"   label="New Today"    value={metrics?.myLeadsToday ?? 0}     color={Colors.primary} cardWidth={metricColWidth} onPress={() => router.push({ pathname: '/leads', params: { filter: 'today' } })} />
              <MetricCard icon="calendar"     label="Follow-ups"   value={metrics?.pendingFollowUps ?? 0} color="#F59E0B"        cardWidth={metricColWidth} onPress={() => router.push({ pathname: '/leads', params: { filter: 'followup' } })} />
              <MetricCard icon="home"         label="Visits Today" value={metrics?.todayVisits ?? 0}      color="#8B5CF6"        cardWidth={metricColWidth} onPress={() => router.push({ pathname: '/leads', params: { filter: 'visits' } })} />
              <MetricCard icon="alert-circle" label="Missed"       value={metrics?.missedFollowUps ?? 0}  color={Colors.danger}  cardWidth={metricColWidth} onPress={() => router.push({ pathname: '/leads', params: { filter: 'missed' } })} />
            </View>
            <LinearGradient colors={[Colors.primary, '#0E7A55']} style={styles.monthCard}>
              <View>
                <Text style={styles.monthLabel}>This Month</Text>
                <Text style={styles.monthValue}>{metrics?.closedThisMonth ?? 0} Closures</Text>
                <Text style={styles.monthSub}>Revenue: {formatCurrency(metrics?.totalRevenue ?? 0)}</Text>
              </View>
              <Ionicons name="trophy-outline" size={48} color="rgba(255,255,255,0.25)" />
            </LinearGradient>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Assigned Leads</Text>
              <Text style={styles.totalValue}>{metrics?.totalAssigned ?? 0}</Text>
            </View>
            <Text style={styles.sectionTitle}>Quick Actions</Text>
            <View style={styles.quickActions}>
              <QuickAction icon="add"               label="New Lead"  color={Colors.primary} onPress={() => router.push('/leads/new')} />
              <QuickAction icon="call"              label="Call Log"  color="#8B5CF6"        onPress={() => router.push('/leads')} />
              <QuickAction icon="calendar-outline"  label="Schedule"  color="#F59E0B"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'followup' } })} />
              <QuickAction icon="chatbubble-outline" label="WhatsApp" color="#25D366"        onPress={() => router.push('/leads')} />
            </View>
          </>}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { metricColWidth, sourceColBasis } = useResponsive();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [managers, setManagers] = useState<Awaited<ReturnType<typeof getAllManagersSummary>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const load = async (withSync = false, fullSync = false) => {
    if (withSync) {
      // fire-and-forget background sync — no UI notification
      (fullSync ? fullSyncAllMetaAccounts() : syncAllMetaAccounts()).catch(console.error);
    }
    try {
      const [m, mgrs] = await Promise.all([
        getAdminDashboardMetrics(),
        getAllManagersSummary(),
      ]);
      setMetrics(m);
      setManagers(mgrs);
    } catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(true, true); }, []); // full import on mount

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <LinearGradient colors={[Colors.navy, '#1A2F45']} style={styles.adminHeader}>
        <View>
          <Text style={styles.greeting}>Admin Dashboard</Text>
          <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMM d yyyy')}</Text>
        </View>
        <TouchableOpacity style={styles.roiBadge} onPress={() => router.push('/settings')} activeOpacity={0.8}>
          <Ionicons name="person-circle-outline" size={18} color={Colors.white} />
          <Text style={styles.roiValue} numberOfLines={1}>{user?.displayName?.split(' ')[0] ?? 'Admin'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={webContainer}>
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : <>
          <View style={styles.grid}>
            <MetricCard icon="people"       label="Total Leads"   value={metrics?.totalLeads ?? 0}  color={Colors.primary}  cardWidth={metricColWidth} onPress={() => router.push('/leads')} />
            <MetricCard icon="add-circle"   label="Today's Leads" value={metrics?.leadsToday ?? 0}  color="#8B5CF6"         cardWidth={metricColWidth} onPress={() => router.push({ pathname: '/leads', params: { filter: 'today' } })} />
            <MetricCard icon="calendar"     label="Follow-ups"   value={metrics?.todayFollowUps ?? 0}           color="#F59E0B"          cardWidth={metricColWidth} />
            <MetricCard icon="home"         label="Visits"       value={metrics?.todayVisits ?? 0}              color="#06B6D4"          cardWidth={metricColWidth} />
          </View>
          <View style={styles.wideRow}>
            <LinearGradient colors={[Colors.primary, '#0E7A55']} style={[styles.wideCard, { marginRight: 6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wideLabel}>Conversion Rate</Text>
                <Text style={styles.wideValue}>{metrics?.conversionRate ?? 0}%</Text>
                <Text style={styles.wideSub}>{metrics?.totalClosed ?? 0} closed deals</Text>
              </View>
              <Ionicons name="trending-up-outline" size={34} color="rgba(255,255,255,0.22)" />
            </LinearGradient>
            <LinearGradient colors={['#7C3AED', '#5B21B6']} style={[styles.wideCard, { marginLeft: 6 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wideLabel}>CPL</Text>
                <Text style={styles.wideValue}>₹{metrics?.cpl ?? 0}</Text>
                <Text style={styles.wideSub}>Cost Per Lead</Text>
              </View>
              <Ionicons name="analytics-outline" size={34} color="rgba(255,255,255,0.22)" />
            </LinearGradient>
          </View>
          {(metrics?.missedFollowUps ?? 0) > 0 && (
            <TouchableOpacity style={styles.alertBanner} onPress={() => router.push({ pathname: '/leads', params: { filter: 'missed' } })}>
              <Ionicons name="warning-outline" size={18} color={Colors.white} />
              <Text style={styles.alertText}>{metrics?.missedFollowUps} missed follow-ups across team</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.white} />
            </TouchableOpacity>
          )}
          <Text style={styles.sectionTitle}>Leads by Source</Text>
          <View style={styles.sourceCards}>
            <SourceCard label="Meta Acc 1" icon="logo-facebook"  value={metrics?.metaAccount1 ?? 0} color="#1877F2" cardBasis={sourceColBasis} />
            <SourceCard label="Meta Acc 2" icon="logo-facebook"  value={metrics?.metaAccount2 ?? 0} color="#1565C0" cardBasis={sourceColBasis} />
            <SourceCard label="Meta Acc 3" icon="logo-facebook"  value={metrics?.metaAccount3 ?? 0} color="#0D47A1" cardBasis={sourceColBasis} />
            <SourceCard label="Google"     icon="logo-google"    value={metrics?.leadsBySource?.google ?? 0}    color="#EA4335" cardBasis={sourceColBasis} />
            <SourceCard label="Uploaded"   icon="cloud-upload"   value={metrics?.leadsBySource?.uploaded ?? 0}  color="#F59E0B" cardBasis={sourceColBasis} />
            <SourceCard label="WhatsApp"   icon="logo-whatsapp"  value={metrics?.leadsBySource?.whatsapp ?? 0}  color="#25D366" cardBasis={sourceColBasis} />
          </View>
          {/* Admin quick action — manage all users */}
          <TouchableOpacity
            style={styles.manageUsersCard}
            onPress={() => router.push('/team/users' as any)}
            activeOpacity={0.85}
          >
            <View style={styles.manageUsersIcon}>
              <Ionicons name="people" size={22} color={Colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.manageUsersTitle}>Manage Users</Text>
              <Text style={styles.manageUsersSub}>Add, edit &amp; view credentials for all roles</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.gray400} />
          </TouchableOpacity>

          <Text style={styles.sectionTitle}>Managers</Text>
          {managers.map(mgr => (
            <TouchableOpacity
              key={mgr.uid}
              style={styles.managerRow}
              onPress={() => router.push({ pathname: '/team/[managerId]', params: { managerId: mgr.uid } })}
              activeOpacity={0.8}
            >
              <View style={styles.mgrAvatar}><Text style={styles.mgrAvatarText}>{mgr.displayName.charAt(0)}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mgrName}>{mgr.displayName}</Text>
                <Text style={styles.mgrSub}>{mgr.region} · {mgr.totalAgents} agents</Text>
              </View>
              <Stat label="leads"  value={mgr.totalLeads}  />
              <Stat label="closed" value={mgr.closures}    color={Colors.primary} />
              <Ionicons name="chevron-forward" size={16} color={Colors.gray400} style={{ marginLeft: 4 }} />
            </TouchableOpacity>
          ))}
        </>}
        </View>{/* webContainer */}
      </ScrollView>
    </View>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setMetrics(await getAdminDashboardMetrics(user?.uid)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useEffect(() => { load(); }, [user?.uid]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <LinearGradient colors={[Colors.navy, '#1A2F45']} style={styles.adminHeader}>
        <View>
          <Text style={styles.greeting}>Manager Dashboard</Text>
          <Text style={styles.userName}>{user?.displayName}</Text>
          <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMM d')}</Text>
        </View>
        <View style={styles.roiBadge}>
          <Text style={styles.roiLabel}>Conv.</Text>
          <Text style={styles.roiValue}>{metrics?.conversionRate ?? 0}%</Text>
        </View>
      </LinearGradient>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
        showsVerticalScrollIndicator={false}
      >
        {loading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} /> : <>
          <View style={styles.grid}>
            <MetricCard icon="people"       label="Total Leads"  value={metrics?.totalLeads ?? 0}      color={Colors.primary} onPress={() => router.push('/leads')} />
            <MetricCard icon="calendar"     label="Follow-ups"   value={metrics?.todayFollowUps ?? 0}  color="#F59E0B" />
            <MetricCard icon="home"         label="Visits"       value={metrics?.todayVisits ?? 0}     color="#06B6D4" />
            <MetricCard icon="alert-circle" label="Missed"       value={metrics?.missedFollowUps ?? 0} color={Colors.danger} />
          </View>
          <View style={styles.wideRow}>
            <LinearGradient colors={[Colors.primary, '#0E7A55']} style={[styles.wideCard, { marginRight: 6 }]}>
              <Text style={styles.wideLabel}>Closed</Text>
              <Text style={styles.wideValue}>{metrics?.totalClosed ?? 0}</Text>
              <Text style={styles.wideSub}>{metrics?.conversionRate ?? 0}% rate</Text>
            </LinearGradient>
            <LinearGradient colors={['#7C3AED', '#5B21B6']} style={[styles.wideCard, { marginLeft: 6 }]}>
              <Text style={styles.wideLabel}>Revenue</Text>
              <Text style={styles.wideValue}>{formatCurrency(metrics?.totalRevenue ?? 0)}</Text>
              <Text style={styles.wideSub}>Team total</Text>
            </LinearGradient>
          </View>
          <TouchableOpacity style={styles.teamBtn} onPress={() => router.push('/team')} activeOpacity={0.85}>
            <Ionicons name="people-circle-outline" size={20} color={Colors.white} />
            <Text style={styles.teamBtnText}>View My Team Performance</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.white} />
          </TouchableOpacity>
        </>}
      </ScrollView>
    </View>
  );
}

// ─── Reusable components ──────────────────────────────────────────────────────
function MetricCard({ icon, label, value, color, onPress, cardWidth }: { icon: string; label: string; value: number; color: string; onPress?: () => void; cardWidth?: string | number }) {
  return (
    <TouchableOpacity style={[styles.metricCard, cardWidth !== undefined && { width: cardWidth as any }]} onPress={onPress} activeOpacity={onPress ? 0.8 : 1}>
      <View style={[styles.metricIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
function SourceCard({ label, icon, value, color, cardBasis }: { label: string; icon: string; value: number; color: string; cardBasis?: string }) {
  return (
    <View style={[styles.sourceCard, { borderLeftColor: color }, cardBasis !== undefined && { flexBasis: cardBasis as any }]}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={styles.sourceValue}>{value}</Text>
      <Text style={styles.sourceLabel}>{label}</Text>
    </View>
  );
}
function QuickAction({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.qaIcon, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon as any} size={22} color={color} />
      </View>
      <Text style={styles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={[styles.statVal, color ? { color } : {}]}>{value}</Text>
      <Text style={styles.statLbl}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { flex: 1 },
  salesHeader: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  adminHeader: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  greeting: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginBottom: 2 },
  userName: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white, marginBottom: 4 },
  dateText: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)' },
  avatarBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarLetter: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.white },
  roiBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: Radius.full, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm },
  roiLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)' },
  roiValue: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.danger, marginHorizontal: Spacing.base, marginTop: Spacing.md, padding: Spacing.md, borderRadius: Radius.lg },
  alertText: { flex: 1, color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: Spacing.base, paddingTop: Spacing.md, gap: Spacing.sm },
  metricCard: { backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.md, alignItems: 'flex-start', borderWidth: 1, borderColor: Colors.gray100 },
  metricIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.sm },
  metricValue: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.navy },
  metricLabel: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 2 },
  monthCard: { marginHorizontal: Spacing.base, marginTop: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.lg, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monthLabel: { fontSize: FontSize.sm, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  monthValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  monthSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Spacing.base, marginTop: Spacing.base, backgroundColor: Colors.white, padding: Spacing.md, borderRadius: Radius.lg },
  totalLabel: { fontSize: FontSize.sm, color: Colors.gray600 },
  totalValue: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.navy },
  syncingBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#1877F2', marginHorizontal: Spacing.base, marginTop: Spacing.sm, borderRadius: Radius.md, paddingHorizontal: Spacing.md, paddingVertical: 8 },
  syncingText: { fontSize: FontSize.xs, color: Colors.white, fontWeight: FontWeight.medium },
  sectionTitle: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold, color: Colors.gray400, textTransform: 'uppercase', letterSpacing: 1, marginHorizontal: Spacing.base, marginTop: Spacing.lg, marginBottom: Spacing.sm },
  quickActions: { flexDirection: 'row', justifyContent: 'space-around', marginHorizontal: Spacing.base, backgroundColor: Colors.white, borderRadius: Radius.xl, padding: Spacing.md },
  qaBtn: { alignItems: 'center', gap: 6 },
  qaIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  qaLabel: { fontSize: 10, fontWeight: FontWeight.semibold, color: Colors.gray600 },
  wideRow: { flexDirection: 'row', marginHorizontal: Spacing.base, marginTop: Spacing.sm, gap: Spacing.sm },
  wideCard: { flex: 1, borderRadius: Radius.xl, padding: Spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 90 },
  wideLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  wideValue: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.white },
  wideSub: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  sourceCards: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: Spacing.base, gap: Spacing.sm },
  sourceCard: { flexBasis: '30%', flexGrow: 1, backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.sm, alignItems: 'center', gap: 4, borderLeftWidth: 3, borderWidth: 1, borderColor: Colors.gray100 },
  sourceValue: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  sourceLabel: { fontSize: 10, color: Colors.gray500 },
  manageUsersCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, borderRadius: Radius.xl, padding: Spacing.md, gap: Spacing.md, borderWidth: 1, borderColor: Colors.primary + '30' },
  manageUsersIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center' },
  manageUsersTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy },
  manageUsersSub: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 2 },
  managerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white, marginHorizontal: Spacing.base, marginBottom: Spacing.sm, borderRadius: Radius.lg, padding: Spacing.md, gap: Spacing.sm, borderWidth: 1, borderColor: Colors.gray100 },
  mgrAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  mgrAvatarText: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.primary },
  mgrName: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy },
  mgrSub: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 1 },
  statBox: { alignItems: 'center', minWidth: 44 },
  statVal: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },
  statLbl: { fontSize: 10, color: Colors.gray500 },
  teamBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, marginHorizontal: Spacing.base, marginTop: Spacing.lg, padding: Spacing.md, borderRadius: Radius.xl },
  teamBtnText: { color: Colors.white, fontWeight: FontWeight.semibold, fontSize: FontSize.base },
});
