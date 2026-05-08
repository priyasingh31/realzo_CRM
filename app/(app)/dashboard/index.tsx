import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  RefreshControl, ActivityIndicator, Platform,
} from 'react-native';
import { useResponsive, webContainer } from '@/utils/responsive';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
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
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isMobile } = useResponsive();
  const [metrics, setMetrics] = useState<SalesDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const load = async () => {
    if (!user?.uid) return;
    try { setMetrics(await getSalesDashboardMetrics(user.uid)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [user?.uid]));

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = user?.displayName?.split(' ')[0] ?? '';
  const firstLetter = user?.displayName?.charAt(0)?.toUpperCase() ?? '?';
  const missed = metrics?.missedFollowUps ?? 0;

  // Web header rendered outside ScrollView so the profile dropdown isn't clipped
  const profileMenu = !isMobile && (
    <View style={sStyles.webHeader}>
      <View>
        <Text style={sStyles.webGreeting}>{greeting}, {firstName} 👋</Text>
        <Text style={sStyles.webDate}>{format(new Date(), 'EEEE, MMMM d')}</Text>
      </View>
      <View style={sStyles.webHeaderRight}>
        {/* Bell */}
        <TouchableOpacity
          style={sStyles.webIconBtn}
          onPress={() => router.push({ pathname: '/notifications', params: { tab: 'missed' } })}
          activeOpacity={0.7}
        >
          <Ionicons name="notifications-outline" size={19} color={Colors.gray500} />
          {missed > 0 && (
            <View style={sStyles.notifDot}>
              <Text style={sStyles.notifDotText}>{missed > 99 ? '99+' : missed}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Profile button + dropdown */}
        <View style={sStyles.profileMenuWrap}>
          <TouchableOpacity
            style={sStyles.profileMenuBtn}
            onPress={() => setShowProfileMenu(v => !v)}
            activeOpacity={0.85}
          >
            <View style={sStyles.profileInitialsCircle}>
              <Text style={sStyles.profileInitialsText}>
                {(user?.displayName ?? '')
                  .split(' ').filter(Boolean).slice(0, 2)
                  .map(n => n[0].toUpperCase()).join('')}
              </Text>
            </View>
            <Ionicons name="chevron-down" size={13} color={Colors.gray500} />
          </TouchableOpacity>

          {showProfileMenu && (
            <>
              <TouchableOpacity
                style={sStyles.menuBackdrop}
                onPress={() => setShowProfileMenu(false)}
                activeOpacity={1}
              />
              <View style={sStyles.profileDropdown}>
                <View style={sStyles.dropdownHeader}>
                  <Text style={sStyles.signedInAs}>Signed in as</Text>
                  <Text style={sStyles.dropdownName}>{user?.displayName}</Text>
                  <Text style={sStyles.dropdownEmail}>{user?.email}</Text>
                </View>
                <View style={sStyles.dropdownDivider} />
                <TouchableOpacity
                  style={sStyles.dropdownItem}
                  onPress={() => { setShowProfileMenu(false); router.push('/settings'); }}
                  activeOpacity={0.75}
                >
                  <Text style={sStyles.dropdownItemText}>Profile</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={sStyles.dropdownItem}
                  onPress={() => { setShowProfileMenu(false); logout(); }}
                  activeOpacity={0.75}
                >
                  <Text style={[sStyles.dropdownItemText, { color: Colors.danger }]}>Sign Out</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.screen}>
      {/* ── Mobile Header ── */}
      {isMobile && (
        <LinearGradient colors={[Colors.navy, '#1A2F45']} style={[sStyles.mobileHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={sStyles.hamburgerBtn} onPress={() => router.push('/settings')} activeOpacity={0.7}>
            <Ionicons name="menu-outline" size={24} color={Colors.white} />
          </TouchableOpacity>
          <View style={sStyles.mobileHeaderCenter}>
            <Text style={sStyles.headerGreeting}>{greeting}, {firstName} 👋</Text>
            <Text style={sStyles.headerDate}>{format(new Date(), 'EEEE, MMMM d')}</Text>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={sStyles.avatarCircle} activeOpacity={0.8}>
            <Text style={sStyles.avatarLetterText}>{firstLetter}</Text>
          </TouchableOpacity>
        </LinearGradient>
      )}

      {/* ── Web Header outside ScrollView so dropdown isn't clipped ── */}
      {profileMenu}

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: Platform.OS === 'web' ? 24 : insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={webContainer}>
          {loading ? <ActivityIndicator color={Colors.primary} style={styles.loader} /> : <>

            {/* ── Missed follow-ups banner ── */}
            {missed > 0 && (
              <TouchableOpacity
                style={sStyles.alertBanner}
                onPress={() => router.push({ pathname: '/notifications', params: { tab: 'missed' } })}
                activeOpacity={0.85}
              >
                <View style={sStyles.alertIconWrap}>
                  <Ionicons name="warning" size={15} color="#B45309" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={sStyles.alertText}>{missed} missed follow-up{missed > 1 ? 's' : ''} — tap to review</Text>
                  <Text style={sStyles.alertSub}>Tap to review</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B45309" />
              </TouchableOpacity>
            )}

            {/* ── Today's Overview ── */}
            <SectionLabel title="Today's Overview" />
            {isMobile ? (
              <View style={sStyles.metricGridMobile}>
                <View style={sStyles.metricRow}>
                  <SalesMetricCard label="New Today"  value={metrics?.myLeadsToday ?? 0}     icon="person-add-outline" color={Colors.primary} onPress={() => router.push({ pathname: '/leads', params: { filter: 'today' } })} />
                  <SalesMetricCard label="Follow-ups" value={metrics?.pendingFollowUps ?? 0} icon="calendar-outline"   color="#F59E0B"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'followup' } })} />
                </View>
                <View style={sStyles.metricRow}>
                  <SalesMetricCard label="Visits" value={metrics?.todayVisits ?? 0}     icon="home-outline"  color="#8B5CF6"      onPress={() => router.push({ pathname: '/leads', params: { filter: 'visits' } })} />
                  <SalesMetricCard label="Missed" value={missed}                         icon="time-outline"  color={Colors.danger} onPress={() => router.push({ pathname: '/notifications', params: { tab: 'missed' } })} />
                </View>
              </View>
            ) : (
              <View style={sStyles.metricGridWeb}>
                <SalesMetricCard label="New Today"  value={metrics?.myLeadsToday ?? 0}     icon="person-add-outline" color={Colors.primary} onPress={() => router.push({ pathname: '/leads', params: { filter: 'today' } })} />
                <SalesMetricCard label="Follow-ups" value={metrics?.pendingFollowUps ?? 0} icon="calendar-outline"   color="#F59E0B"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'followup' } })} />
                <SalesMetricCard label="Visits"     value={metrics?.todayVisits ?? 0}      icon="home-outline"       color="#8B5CF6"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'visits' } })} />
                <SalesMetricCard label="Missed"     value={missed}                          icon="time-outline"       color={Colors.danger}  onPress={() => router.push({ pathname: '/notifications', params: { tab: 'missed' } })} />
              </View>
            )}

            {/* ── Total Closures + Total Assigned ── */}
            <View style={[sStyles.bigRow, isMobile && sStyles.bigRowMobile]}>
              <LinearGradient colors={[Colors.primary, '#0A7A52']} style={[sStyles.closuresCard, isMobile && sStyles.closuresCardFull]}>
                <View style={{ flex: 1 }}>
                  <Text style={sStyles.closuresLabel}>Total Closures</Text>
                  <Text style={sStyles.closuresValue}>{metrics?.closedThisMonth ?? 0}</Text>
                  <Text style={sStyles.closuresSub}>Booked</Text>
                </View>
                <Ionicons name="trophy-outline" size={44} color="rgba(255,255,255,0.2)" />
              </LinearGradient>

              <View style={[sStyles.assignedCard, isMobile && sStyles.assignedCardFull]}>
                <View style={{ flex: 1 }}>
                  <Text style={sStyles.assignedLabel}>Total Assigned</Text>
                  <Text style={sStyles.assignedValue}>{metrics?.totalAssigned ?? 0}</Text>
                </View>
                <View style={sStyles.assignedIconWrap}>
                  <Ionicons name="people-outline" size={22} color={Colors.primary} />
                </View>
              </View>
            </View>

            {/* ── Quick Actions ── */}
            <SectionLabel title="Quick Actions" />
            <View style={sStyles.quickCard}>
              <SalesQuickAction icon="person-add-outline" label="New Lead"  color={Colors.primary} onPress={() => router.push('/leads/new')} />
              <SalesQuickAction icon="call-outline"       label="Follow-ups" color="#8B5CF6"       onPress={() => router.push({ pathname: '/leads', params: { filter: 'followup' } })} />
              <SalesQuickAction icon="calendar-outline"   label="Visits"    color="#F59E0B"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'visits' } })} />
              <SalesQuickAction icon="logo-whatsapp"      label="WhatsApp"  color="#25D366"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'today' } })} />
            </View>

          </>}
        </View>
      </ScrollView>
    </View>
  );
}

function SalesMetricCard({ label, value, icon, color, onPress }: {
  label: string; value: number; icon: string; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={sStyles.metricCard} onPress={onPress} activeOpacity={onPress ? 0.75 : 1}>
      <View style={sStyles.metricTop}>
        <Text style={sStyles.metricLabel}>{label}</Text>
        <View style={[sStyles.metricIconWrap, { backgroundColor: color + '18' }]}>
          <Ionicons name={icon as any} size={18} color={color} />
        </View>
      </View>
      <Text style={sStyles.metricValue}>{value}</Text>
    </TouchableOpacity>
  );
}

function SalesQuickAction({ icon, label, color, onPress }: {
  icon: string; label: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={sStyles.qaBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[sStyles.qaIcon, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={24} color={color} />
      </View>
      <Text style={sStyles.qaLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

// ─── ADMIN DASHBOARD ──────────────────────────────────────────────────────────
function AdminDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isMobile, sourceColBasis } = useResponsive();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [managers, setManagers] = useState<Awaited<ReturnType<typeof getAllManagersSummary>>>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (withSync = false, fullSync = false) => {
    if (withSync) {
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
  useFocusEffect(useCallback(() => { load(true, false); }, []));

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[Colors.navy, '#1A2F45']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>ADMIN</Text>
          </View>
          <Text style={styles.userName}>Overview</Text>
          <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMM d yyyy')}</Text>
        </View>
        <TouchableOpacity onPress={() => router.push('/settings')} style={styles.avatarBtn} activeOpacity={0.8}>
          <Text style={styles.avatarLetter}>{user?.displayName?.charAt(0)?.toUpperCase() ?? 'A'}</Text>
        </TouchableOpacity>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(true); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={webContainer}>
          {loading ? <ActivityIndicator color={Colors.primary} style={styles.loader} /> : <>

            {/* Metrics */}
            <SectionLabel title="Today's Overview" />
            <MetricGrid isMobile={isMobile}>
              <MetricCard icon="people-outline"       label="Total Leads"   value={metrics?.totalLeads ?? 0}      color={Colors.primary} onPress={() => router.push('/leads')} />
              <MetricCard icon="add-circle-outline"   label="Today's Leads" value={metrics?.leadsToday ?? 0}      color="#8B5CF6"        onPress={() => router.push({ pathname: '/leads', params: { filter: 'today' } })} />
              <MetricCard icon="calendar-outline"     label="Follow-ups"    value={metrics?.todayFollowUps ?? 0}  color="#F59E0B" />
              <MetricCard icon="home-outline"         label="Visits"        value={metrics?.todayVisits ?? 0}     color="#06B6D4" />
            </MetricGrid>

            {/* KPI cards */}
            <View style={styles.kpiRow}>
              <LinearGradient colors={[Colors.primary, '#0A7A52']} style={styles.kpiCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kpiLabel}>CONVERSION</Text>
                  <Text style={styles.kpiValue}>{metrics?.conversionRate ?? 0}%</Text>
                  <Text style={styles.kpiSub}>{metrics?.totalClosed ?? 0} closed deals</Text>
                </View>
                <Ionicons name="trending-up-outline" size={32} color="rgba(255,255,255,0.22)" />
              </LinearGradient>
              <LinearGradient colors={['#7C3AED', '#5B21B6']} style={styles.kpiCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kpiLabel}>CPL</Text>
                  <Text style={styles.kpiValue}>₹{metrics?.cpl ?? 0}</Text>
                  <Text style={styles.kpiSub}>Cost Per Lead</Text>
                </View>
                <Ionicons name="analytics-outline" size={32} color="rgba(255,255,255,0.22)" />
              </LinearGradient>
            </View>

            {/* Alert */}
            {(metrics?.missedFollowUps ?? 0) > 0 && (
              <TouchableOpacity
                style={styles.alertBanner}
                onPress={() => router.push({ pathname: '/notifications', params: { tab: 'missed' } })}
                activeOpacity={0.85}
              >
                <View style={styles.alertIconWrap}>
                  <Ionicons name="warning" size={15} color="#B45309" />
                </View>
                <Text style={styles.alertText}>{metrics?.missedFollowUps} missed follow-ups across team</Text>
                <Ionicons name="chevron-forward" size={14} color="#B45309" />
              </TouchableOpacity>
            )}

            {/* Leads by source */}
            <SectionLabel title="Leads by Source" />
            <View style={styles.sourceGrid}>
              <SourceCard label="Meta Acc 1" icon="logo-facebook"     value={metrics?.metaAccount1 ?? 0}                 color="#1877F2" cardBasis={sourceColBasis} />
              <SourceCard label="Meta Acc 2" icon="logo-facebook"     value={metrics?.metaAccount2 ?? 0}                 color="#1565C0" cardBasis={sourceColBasis} />
              <SourceCard label="Meta Acc 3" icon="logo-facebook"     value={metrics?.metaAccount3 ?? 0}                 color="#0D47A1" cardBasis={sourceColBasis} />
              <SourceCard label="Google"     icon="logo-google"       value={metrics?.leadsBySource?.google ?? 0}        color="#EA4335" cardBasis={sourceColBasis} />
              <SourceCard label="Uploaded"   icon="cloud-upload-outline" value={metrics?.leadsBySource?.uploaded ?? 0}   color="#F59E0B" cardBasis={sourceColBasis} />
              <SourceCard label="WhatsApp"   icon="logo-whatsapp"     value={metrics?.leadsBySource?.whatsapp ?? 0}      color="#25D366" cardBasis={sourceColBasis} />
            </View>

            {/* Manage Users CTA */}
            <TouchableOpacity
              style={styles.ctaCard}
              onPress={() => router.push('/team/users' as any)}
              activeOpacity={0.8}
            >
              <View style={styles.ctaIconWrap}>
                <Ionicons name="people" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>Manage Users</Text>
                <Text style={styles.ctaSub}>Add, edit & view credentials for all roles</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
            </TouchableOpacity>

            {/* Managers */}
            <SectionLabel title="Managers" />
            {managers.map(mgr => (
              <TouchableOpacity
                key={mgr.uid}
                style={styles.managerRow}
                onPress={() => router.push({ pathname: '/team/[managerId]', params: { managerId: mgr.uid } })}
                activeOpacity={0.75}
              >
                <View style={styles.mgrAvatar}>
                  <Text style={styles.mgrAvatarText}>{mgr.displayName.charAt(0)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.mgrName}>{mgr.displayName}</Text>
                  <Text style={styles.mgrSub}>{mgr.region} · {mgr.totalAgents} agents</Text>
                </View>
                <Stat label="leads"  value={mgr.totalLeads} />
                <Stat label="closed" value={mgr.closures}   color={Colors.primary} />
                <Ionicons name="chevron-forward" size={14} color={Colors.gray200} style={{ marginLeft: 4 }} />
              </TouchableOpacity>
            ))}

          </>}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── MANAGER DASHBOARD ────────────────────────────────────────────────────────
function ManagerDashboard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isMobile } = useResponsive();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try { setMetrics(await getAdminDashboardMetrics(user?.uid)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); setRefreshing(false); }
  };
  useFocusEffect(useCallback(() => { load(); }, [user?.uid]));

  return (
    <View style={styles.screen}>
      <LinearGradient colors={[Colors.navy, '#1A2F45']} style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerLeft}>
          <View style={styles.rolePill}>
            <Text style={styles.rolePillText}>MANAGER</Text>
          </View>
          <Text style={styles.userName}>{user?.displayName?.split(' ')[0]}</Text>
          <Text style={styles.dateText}>{format(new Date(), 'EEEE, MMM d')}</Text>
        </View>
        <View style={styles.convBadge}>
          <Text style={styles.convLabel}>Conv.</Text>
          <Text style={styles.convValue}>{metrics?.conversionRate ?? 0}%</Text>
        </View>
      </LinearGradient>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={Colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={webContainer}>
          {loading ? <ActivityIndicator color={Colors.primary} style={styles.loader} /> : <>

            <SectionLabel title="Team Overview" />
            <MetricGrid isMobile={isMobile}>
              <MetricCard icon="people-outline"       label="Total Leads"  value={metrics?.totalLeads ?? 0}      color={Colors.primary} onPress={() => router.push('/leads')} />
              <MetricCard icon="calendar-outline"     label="Follow-ups"   value={metrics?.todayFollowUps ?? 0}  color="#F59E0B" />
              <MetricCard icon="home-outline"         label="Visits"       value={metrics?.todayVisits ?? 0}     color="#06B6D4" />
              <MetricCard icon="alert-circle-outline" label="Missed"       value={metrics?.missedFollowUps ?? 0} color={Colors.danger} onPress={() => router.push({ pathname: '/notifications', params: { tab: 'missed' } })} />
            </MetricGrid>

            <View style={styles.kpiRow}>
              <LinearGradient colors={[Colors.primary, '#0A7A52']} style={styles.kpiCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kpiLabel}>CLOSED</Text>
                  <Text style={styles.kpiValue}>{metrics?.totalClosed ?? 0}</Text>
                  <Text style={styles.kpiSub}>{metrics?.conversionRate ?? 0}% rate</Text>
                </View>
                <Ionicons name="checkmark-circle-outline" size={32} color="rgba(255,255,255,0.22)" />
              </LinearGradient>
              <LinearGradient colors={['#7C3AED', '#5B21B6']} style={styles.kpiCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.kpiLabel}>REVENUE</Text>
                  <Text style={styles.kpiValue}>{formatCurrency(metrics?.totalRevenue ?? 0)}</Text>
                  <Text style={styles.kpiSub}>Team total</Text>
                </View>
                <Ionicons name="cash-outline" size={32} color="rgba(255,255,255,0.22)" />
              </LinearGradient>
            </View>

            <TouchableOpacity style={styles.ctaCard} onPress={() => router.push('/team')} activeOpacity={0.8}>
              <View style={styles.ctaIconWrap}>
                <Ionicons name="people-circle-outline" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>My Team Performance</Text>
                <Text style={styles.ctaSub}>View all agents and their stats</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.ctaCard} onPress={() => router.push('/reports')} activeOpacity={0.8}>
              <View style={[styles.ctaIconWrap, { backgroundColor: '#7C3AED18' }]}>
                <Ionicons name="bar-chart-outline" size={20} color="#7C3AED" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ctaTitle}>Team Reports</Text>
                <Text style={styles.ctaSub}>AI insights, conversion & lead source breakdown</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
            </TouchableOpacity>

          </>}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function MetricGrid({ children, isMobile }: { children: React.ReactNode; isMobile: boolean }) {
  const cards = React.Children.toArray(children);
  if (!isMobile) {
    return <View style={styles.metricGridWide}>{cards}</View>;
  }
  return (
    <View style={styles.metricGridNarrow}>
      <View style={styles.metricRow}>{cards.slice(0, 2)}</View>
      <View style={styles.metricRow}>{cards.slice(2, 4)}</View>
    </View>
  );
}

function MetricCard({ icon, label, value, color, onPress }: {
  icon: string; label: string; value: number; color: string; onPress?: () => void;
}) {
  return (
    <TouchableOpacity style={styles.metricCard} onPress={onPress} activeOpacity={onPress ? 0.75 : 1}>
      <View style={styles.metricCardTop}>
        <Text style={styles.metricLabel}>{label}</Text>
        {onPress && <Ionicons name="chevron-forward" size={11} color={Colors.gray200} />}
      </View>
      <Text style={styles.metricValue}>{value}</Text>
      <View style={[styles.metricIconBadge, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={16} color={color} />
      </View>
    </TouchableOpacity>
  );
}

function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{title}</Text>
    </View>
  );
}

function SourceCard({ label, icon, value, color, cardBasis }: {
  label: string; icon: string; value: number; color: string; cardBasis?: string;
}) {
  return (
    <View style={[styles.sourceCard, { borderTopColor: color }, cardBasis !== undefined && { flexBasis: cardBasis as any }]}>
      <View style={[styles.sourceIconWrap, { backgroundColor: color + '18' }]}>
        <Ionicons name={icon as any} size={14} color={color} />
      </View>
      <Text style={styles.sourceValue}>{value}</Text>
      <Text style={styles.sourceLabel}>{label}</Text>
    </View>
  );
}

function QuickAction({ icon, label, color, onPress }: {
  icon: string; label: string; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.qaBtn} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.qaIcon, { backgroundColor: color + '18' }]}>
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

function BreakdownRow({ label, sublabel, value, total, color }: {
  label: string; sublabel: string; value: number; total: number; color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <View style={styles.breakdownItem}>
      <View style={styles.breakdownItemHeader}>
        <View style={[styles.breakdownDot, { backgroundColor: color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.breakdownLabel}>{label}</Text>
          <Text style={styles.breakdownSublabel}>{sublabel}</Text>
        </View>
        <Text style={styles.breakdownValue}>{value}</Text>
        <Text style={styles.breakdownPct}>{pct}%</Text>
      </View>
      <View style={styles.breakdownBarBg}>
        <View style={[styles.breakdownBarFill, { width: `${pct}%` as any, backgroundColor: color }]} />
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  scroll: { flex: 1 },
  loader: { marginTop: 60 },

  // ── Header ──
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
  },
  headerLeft: { flex: 1 },
  rolePill: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.primary + '28',
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    marginBottom: Spacing.sm,
  },
  rolePillText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
    letterSpacing: 1.2,
  },
  greeting: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 3,
  },
  userName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    marginBottom: 3,
  },
  dateText: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.45)',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },
  avatarLetter: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  convBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginLeft: Spacing.md,
  },
  convLabel: { fontSize: FontSize.xs, color: 'rgba(255,255,255,0.55)', marginBottom: 2 },
  convValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.white },

  // ── Section label ──
  sectionLabel: {
    marginHorizontal: Spacing.base,
    marginTop: Platform.OS === 'web' ? Spacing.sm : Spacing.xl,
    marginBottom: Platform.OS === 'web' ? Spacing.xs : Spacing.md,
  },
  sectionLabelText: {
    fontSize: Platform.OS === 'web' ? FontSize.sm : FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray800,
  },

  // ── Alert banner ──
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFBEB',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    padding: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertText: {
    flex: 1,
    color: '#92400E',
    fontWeight: FontWeight.medium,
    fontSize: FontSize.sm,
  },

  // ── Metric grid ──
  metricGridWide: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  metricGridNarrow: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },

  // ── Metric card ──
  metricCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.gray100,
    minHeight: 110,
    justifyContent: 'space-between',
  },
  metricCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    fontWeight: FontWeight.medium,
    flex: 1,
    lineHeight: 16,
  },
  metricValue: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
    marginVertical: Spacing.xs,
    lineHeight: 36,
  },
  metricIconBadge: {
    alignSelf: 'flex-start',
    width: 30,
    height: 30,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Featured card (month closures) ──
  featuredCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
  },
  featuredLeft: { flex: 1 },
  featuredLabel: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  featuredValue: {
    fontSize: FontSize['4xl'],
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: 44,
  },
  featuredSub: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 3,
  },

  // ── Total assigned leads card ──
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  totalCardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomColor: 'transparent',
  },
  totalCardLeft: { flex: 1 },
  totalLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    fontWeight: FontWeight.medium,
    marginBottom: 3,
  },
  totalValue: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
  },
  chevronCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevronCircleActive: {
    backgroundColor: Colors.primaryLight,
  },

  // ── Breakdown panel ──
  breakdownPanel: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: Colors.gray100,
    borderBottomLeftRadius: Radius.xl,
    borderBottomRightRadius: Radius.xl,
    padding: Spacing.base,
    gap: Spacing.md,
  },
  breakdownItem: { gap: 6 },
  breakdownItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    flexShrink: 0,
  },
  breakdownLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray800,
  },
  breakdownSublabel: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginTop: 1,
  },
  breakdownValue: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
    minWidth: 32,
    textAlign: 'right',
  },
  breakdownPct: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    minWidth: 32,
    textAlign: 'right',
  },
  breakdownBarBg: {
    height: 4,
    backgroundColor: Colors.gray100,
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: 4,
    borderRadius: 2,
  },

  // ── Quick actions ──
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  qaBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  qaIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: 10,
    fontWeight: FontWeight.semibold,
    color: Colors.gray500,
  },

  // ── KPI cards (admin / manager) ──
  kpiRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  kpiCard: {
    flex: 1,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 94,
  },
  kpiLabel: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1,
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  kpiSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 3,
  },

  // ── Source cards ──
  sourceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: Spacing.base,
    gap: Spacing.sm,
  },
  sourceCard: {
    flexBasis: '30%',
    flexGrow: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    alignItems: 'center',
    gap: 4,
    borderTopWidth: 2,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  sourceIconWrap: {
    width: 26,
    height: 26,
    borderRadius: Radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceValue: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
  },
  sourceLabel: {
    fontSize: 9,
    color: Colors.gray400,
    fontWeight: FontWeight.medium,
  },

  // ── CTA card ──
  ctaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '28',
  },
  ctaIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray800,
  },
  ctaSub: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginTop: 2,
  },

  // ── Manager rows ──
  managerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  mgrAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mgrAvatarText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.primary,
  },
  mgrName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray800,
  },
  mgrSub: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginTop: 1,
  },
  statBox: {
    alignItems: 'center',
    minWidth: 42,
  },
  statVal: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.gray800,
  },
  statLbl: {
    fontSize: 9,
    color: Colors.gray400,
  },
});

// ─── Sales Dashboard Styles ───────────────────────────────────────────────────
const sStyles = StyleSheet.create({
  // ── Mobile header ──
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.lg,
    gap: Spacing.sm,
  },
  hamburgerBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileHeaderCenter: {
    flex: 1,
  },
  headerGreeting: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    marginBottom: 2,
  },
  headerDate: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.55)',
  },
  avatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetterText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },

  // ── Web desktop header ──
  webHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    zIndex: 200,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 0 #e5e7eb',
      overflow: 'visible',
    } as any : {}),
  },
  webGreeting: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
  },
  webDate: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginTop: 2,
  },
  webHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  webIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notifDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  notifDotText: {
    fontSize: 9,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.primary,
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 9,
  },
  newBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },

  // ── Alert banner ──
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: '#FFFBEB',
    marginHorizontal: Spacing.base,
    marginTop: Platform.OS === 'web' ? Spacing.sm : Spacing.base,
    padding: Platform.OS === 'web' ? Spacing.sm : Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  alertText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: '#92400E',
  },
  alertSub: {
    fontSize: FontSize.xs,
    color: '#B45309',
    marginTop: 1,
  },

  // ── Metric grids ──
  metricGridWeb: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    gap: Spacing.sm,
  },
  metricGridMobile: {
    paddingHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  metricRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  metricCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    padding: Platform.OS === 'web' ? Spacing.md : Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray100,
    minHeight: Platform.OS === 'web' ? 86 : 120,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    } as any : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    }),
  },
  metricTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  metricLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    fontWeight: FontWeight.medium,
    flex: 1,
    marginRight: 6,
  },
  metricIconWrap: {
    width: Platform.OS === 'web' ? 30 : 36,
    height: Platform.OS === 'web' ? 30 : 36,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  metricValue: {
    fontSize: Platform.OS === 'web' ? 26 : 36,
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
    lineHeight: Platform.OS === 'web' ? 32 : 44,
    marginTop: 2,
  },

  // ── Big cards (closures + assigned) ──
  bigRow: {
    flexDirection: 'row',
    marginHorizontal: Spacing.base,
    marginTop: Platform.OS === 'web' ? Spacing.base : Spacing.sm,
    gap: Spacing.sm,
  },
  bigRowMobile: {
    flexDirection: 'column',
    marginTop: Spacing.sm,
  },
  closuresCard: {
    flex: 1.4,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    paddingVertical: Platform.OS === 'web' ? Spacing.md : Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: Platform.OS === 'web' ? 90 : 120,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 2px 8px rgba(16,185,129,0.25)',
    } as any : {}),
  },
  closuresCardFull: {
    flex: 0,
  },
  closuresLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  closuresValue: {
    fontSize: Platform.OS === 'web' ? 32 : 44,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: Platform.OS === 'web' ? 38 : 52,
  },
  closuresSub: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  assignedCard: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.base,
    paddingVertical: Platform.OS === 'web' ? Spacing.md : Spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray100,
    minHeight: Platform.OS === 'web' ? 90 : 120,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    } as any : {}),
  },
  assignedCardFull: {
    flex: 0,
  },
  assignedLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    fontWeight: FontWeight.medium,
    marginBottom: 4,
  },
  assignedValue: {
    fontSize: Platform.OS === 'web' ? 30 : 40,
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
    lineHeight: Platform.OS === 'web' ? 36 : 48,
  },
  assignedIconWrap: {
    width: Platform.OS === 'web' ? 40 : 48,
    height: Platform.OS === 'web' ? 40 : 48,
    borderRadius: Platform.OS === 'web' ? 20 : 24,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Profile context menu ──
  profileMenuWrap: {
    position: 'relative',
    zIndex: 300,
  },
  profileMenuBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.gray100,
    borderRadius: Radius.full,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  profileInitialsCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.navy,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitialsText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    letterSpacing: 0.5,
  },
  menuBackdrop: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9998,
  },
  profileDropdown: {
    position: 'absolute',
    top: 44,
    right: 0,
    width: 220,
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray100,
    zIndex: 9999,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
    } as any : {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 8,
    }),
  },
  dropdownHeader: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  signedInAs: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginBottom: 4,
  },
  dropdownName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.gray900,
  },
  dropdownEmail: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
    marginTop: 2,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: Colors.gray100,
    marginVertical: Spacing.xs,
  },
  dropdownItem: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  dropdownItemText: {
    fontSize: FontSize.sm,
    color: Colors.gray700,
    fontWeight: FontWeight.medium,
  },

  // ── Quick actions ──
  quickCard: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    paddingVertical: Platform.OS === 'web' ? Spacing.md : Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray100,
    ...(Platform.OS === 'web' ? {
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
    } as any : {}),
  },
  qaBtn: {
    alignItems: 'center',
    gap: Platform.OS === 'web' ? 6 : 8,
    flex: 1,
  },
  qaIcon: {
    width: Platform.OS === 'web' ? 44 : 56,
    height: Platform.OS === 'web' ? 44 : 56,
    borderRadius: Platform.OS === 'web' ? 12 : 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray600,
  },
});
