import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuthStore } from '@/store/authStore';
import { useAuth } from '@/hooks/useAuth';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import {
  verifyWhatsAppAccount,
  getAccountsSummary,
  WHATSAPP_ACCOUNTS,
} from '@/services/whatsappService';
import { getMetaSyncStatus, syncConnectedPages } from '@/services/metaLeadsService';
import {
  connectMetaAccount,
  disconnectMeta,
  getMetaConnection,
  saveMetaConnection,
  type MetaConnection,
} from '@/services/metaAuthService';
import { LinearGradient } from 'expo-linear-gradient';

type VerifyState = {
  status: 'idle' | 'checking' | 'connected' | 'error';
  phoneNumber?: string;
  displayName?: string;
  error?: string;
};

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const { logout } = useAuth();
  const router = useRouter();

  const [acc1Status, setAcc1Status] = useState<VerifyState>({ status: 'idle' });
  const [acc2Status, setAcc2Status] = useState<VerifyState>({ status: 'idle' });
  const [verifying, setVerifying] = useState(false);

  const [syncStatus, setSyncStatus] = useState<{ acc1: string | null; acc2: string | null }>({ acc1: null, acc2: null });
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const [metaConnection, setMetaConnection] = useState<MetaConnection | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const accounts = getAccountsSummary();
  const isAdminOrManager = user?.role === 'admin' || user?.role === 'manager';

  useEffect(() => {
    verifyBothAccounts();
    loadSyncStatus();
    loadMetaConnection();
  }, []);

  const loadMetaConnection = async () => {
    try {
      const conn = await getMetaConnection();
      setMetaConnection(conn);
    } catch {}
  };

  const handleConnectMeta = async () => {
    setConnecting(true);
    try {
      const partial = await connectMetaAccount();
      if (!partial) return;

      const full: MetaConnection = {
        ...partial,
        connectedByUserId: user?.uid ?? '',
        connectedByName: user?.displayName ?? '',
      };
      await saveMetaConnection(full);
      setMetaConnection(full);

      setSyncing(true);
      setSyncResult(null);
      try {
        const results = await syncConnectedPages();
        const total = results.reduce((s, r) => s + r.newLeads, 0);
        setSyncResult(`Connected! Fetched ${total} new lead${total !== 1 ? 's' : ''} from Meta Ads.`);
        await loadSyncStatus();
      } catch (err: any) {
        setSyncResult(`Connected but sync failed: ${err?.message ?? err}`);
      } finally {
        setSyncing(false);
      }
    } catch (err: any) {
      Alert.alert('Connection failed', err?.message ?? String(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnectMeta = () => {
    Alert.alert(
      'Disconnect Meta Ads',
      'This will remove the Meta Ads connection. Existing leads will not be deleted. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: async () => {
            setDisconnecting(true);
            try {
              await disconnectMeta();
              setMetaConnection(null);
            } catch (err: any) {
              Alert.alert('Error', err?.message ?? String(err));
            } finally {
              setDisconnecting(false);
            }
          },
        },
      ],
    );
  };

  const loadSyncStatus = async () => {
    try {
      const status = await getMetaSyncStatus();
      setSyncStatus({ acc1: status.account1LastSync, acc2: status.account2LastSync });
    } catch (_) {}
  };

  const handleSyncNow = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const results = await syncConnectedPages();
      const total = results.reduce((s, r) => s + r.newLeads, 0);
      const errors = results.flatMap(r => r.errors);
      if (errors.length > 0) {
        setSyncResult(`Sync done — ${total} new lead${total !== 1 ? 's' : ''}. Warning: ${errors[0]}`);
      } else {
        setSyncResult(`Synced! ${total} new lead${total !== 1 ? 's' : ''} fetched from Meta Ads.`);
      }
      await loadSyncStatus();
    } catch (err: any) {
      setSyncResult(`Sync failed: ${err?.message ?? err}`);
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleTestMeta = useCallback(async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const fns = getFunctions();
      const test = httpsCallable<unknown, Record<string, {
        ok: boolean; forms: { id: string; name: string; status: string }[];
        totalLeads: number; error: string | null;
      }>>(fns, 'testMetaConnection');
      const { data } = await test({});

      const lines: string[] = [];
      for (const key of ['account1', 'account2'] as const) {
        const r = data[key];
        const accNum = key === 'account1' ? 1 : 2;
        if (r.error) {
          lines.push(`Acc ${accNum}: ERROR — ${r.error}`);
        } else {
          const activeForms = r.forms.filter(f => f.status === 'ACTIVE').length;
          lines.push(`Acc ${accNum}: OK — ${r.forms.length} forms (${activeForms} active), ~${r.totalLeads} recent leads`);
        }
      }
      setTestResult(lines.join('\n'));
    } catch (err: any) {
      setTestResult(`Test failed: ${err?.message ?? err}`);
    } finally {
      setTesting(false);
    }
  }, []);

  const verifyBothAccounts = async () => {
    setVerifying(true);
    setAcc1Status({ status: 'checking' });
    setAcc2Status({ status: 'checking' });
    try {
      const [result1, result2] = await Promise.all([
        verifyWhatsAppAccount(1),
        verifyWhatsAppAccount(2),
      ]);
      setAcc1Status(
        result1.valid
          ? { status: 'connected', phoneNumber: result1.phoneNumber, displayName: result1.displayName }
          : { status: 'error', error: result1.error }
      );
      setAcc2Status(
        result2.valid
          ? { status: 'connected', phoneNumber: result2.phoneNumber, displayName: result2.displayName }
          : { status: 'error', error: result2.error }
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      const confirmed = window.confirm('Sign Out?\n\nAre you sure you want to sign out?');
      if (confirmed) logout();
    } else {
      Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => logout() },
      ]);
    }
  };

  const roleLabel =
    user?.role === 'admin' ? 'Administrator'
    : user?.role === 'manager' ? 'Manager'
    : 'Agent';
  const roleColor =
    user?.role === 'admin' ? Colors.danger
    : user?.role === 'manager' ? Colors.accent
    : Colors.primary;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      {/* ── Header ── */}
      <LinearGradient colors={[Colors.navy, '#1A2F45']} style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </LinearGradient>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 48 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Profile ── */}
        <View style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.avatarText}>{user?.displayName?.charAt(0)?.toUpperCase() ?? 'U'}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor + '18' }]}>
              <View style={[styles.roleDot, { backgroundColor: roleColor }]} />
              <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => router.push('/settings')} style={styles.editBtn} activeOpacity={0.7}>
            <Ionicons name="pencil-outline" size={16} color={Colors.gray400} />
          </TouchableOpacity>
        </View>

        {/* ── Account ── */}
        <SectionLabel title="Account" />
        <View style={styles.menuGroup}>
          <MenuItem icon="person-outline" label="Edit Profile" onPress={() => {}} />
          <MenuItem icon="lock-closed-outline" label="Change Password" onPress={() => {}} divider />
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => {}} divider />
        </View>

        {/* ── Meta Ads Account ── */}
        {isAdminOrManager && (
          <>
            <SectionLabel title="Meta Ads" />
            <MetaConnectionCard
              connection={metaConnection}
              connecting={connecting}
              disconnecting={disconnecting}
              onConnect={handleConnectMeta}
              onDisconnect={handleDisconnectMeta}
            />
          </>
        )}

        {/* ── Meta Leads Sync ── */}
        {isAdminOrManager && (
          <>
            <SectionLabel title="Meta Leads Sync" />
            <View style={styles.syncCard}>
              <Text style={styles.syncNote}>
                {metaConnection?.connected
                  ? `Connected as ${metaConnection.connectedByName || 'Meta User'} · ${metaConnection.pages.length} page${metaConnection.pages.length !== 1 ? 's' : ''}. Leads sync automatically.`
                  : 'Connect your Meta Ads account above to start fetching leads automatically.'}
              </Text>

              <View style={styles.syncTimestamps}>
                <SyncRow label="Account 1" value={syncStatus.acc1} />
                <SyncRow label="Account 2" value={syncStatus.acc2} />
              </View>

              <View style={styles.syncActions}>
                <TouchableOpacity
                  onPress={handleSyncNow}
                  disabled={syncing}
                  style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
                  activeOpacity={0.8}
                >
                  {syncing
                    ? <ActivityIndicator size="small" color={Colors.white} />
                    : <Ionicons name="sync-outline" size={15} color={Colors.white} />
                  }
                  <Text style={styles.syncBtnText}>{syncing ? 'Syncing…' : 'Sync Now'}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleTestMeta}
                  disabled={testing}
                  style={[styles.syncBtnSecondary, testing && styles.syncBtnDisabled]}
                  activeOpacity={0.8}
                >
                  {testing
                    ? <ActivityIndicator size="small" color={Colors.gray600} />
                    : <Ionicons name="wifi-outline" size={15} color={Colors.gray600} />
                  }
                  <Text style={styles.syncBtnSecondaryText}>{testing ? 'Testing…' : 'Test API'}</Text>
                </TouchableOpacity>
              </View>

              {syncResult && (
                <View style={[styles.resultBanner, syncResult.startsWith('Sync failed') ? styles.resultBannerError : styles.resultBannerOk]}>
                  <Ionicons
                    name={syncResult.startsWith('Sync failed') ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                    size={14}
                    color={syncResult.startsWith('Sync failed') ? Colors.danger : Colors.success}
                  />
                  <Text style={[styles.resultBannerText, { color: syncResult.startsWith('Sync failed') ? Colors.danger : Colors.success }]}>
                    {syncResult}
                  </Text>
                </View>
              )}

              {testResult && (
                <View style={[styles.resultBanner, testResult.includes('ERROR') || testResult.includes('failed') ? styles.resultBannerError : styles.resultBannerOk]}>
                  <Ionicons
                    name={testResult.includes('ERROR') || testResult.includes('failed') ? 'alert-circle-outline' : 'checkmark-circle-outline'}
                    size={14}
                    color={testResult.includes('ERROR') || testResult.includes('failed') ? Colors.danger : Colors.success}
                  />
                  <Text style={[styles.resultBannerText, { color: testResult.includes('ERROR') || testResult.includes('failed') ? Colors.danger : Colors.success }]}>
                    {testResult}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── About ── */}
        <SectionLabel title="About" />
        <View style={styles.menuGroup}>
          <MenuItem icon="information-circle-outline" label="Version 1.0.0" onPress={() => {}} chevron={false} />
          <MenuItem icon="document-text-outline" label="Privacy Policy" onPress={() => {}} divider />
          <MenuItem icon="shield-checkmark-outline" label="Terms of Service" onPress={() => {}} divider />
        </View>

        {/* ── Sign Out ── */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Relazo CRM · v1.0.0</Text>
      </ScrollView>
    </View>
  );
}

// ─── Meta Connection Card ──────────────────────────────────────────────────────
function MetaConnectionCard({
  connection, connecting, disconnecting, onConnect, onDisconnect,
}: {
  connection: MetaConnection | null;
  connecting: boolean;
  disconnecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}) {
  const isConnected = connection?.connected && (connection.pages?.length ?? 0) > 0;

  return (
    <View style={styles.integrationCard}>
      <View style={styles.integrationHeader}>
        <View style={styles.integrationIconWrap}>
          <Ionicons name="logo-facebook" size={20} color="#1877F2" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.integrationTitle}>Meta Ads</Text>
          {isConnected && connection?.connectedByName ? (
            <Text style={styles.integrationSubtitle}>{connection.connectedByName}</Text>
          ) : (
            <Text style={styles.integrationSubtitle}>Facebook & Instagram Ads</Text>
          )}
        </View>
        <View style={[styles.statusPill, { backgroundColor: isConnected ? Colors.successLight : Colors.gray100 }]}>
          <View style={[styles.statusDot, { backgroundColor: isConnected ? Colors.success : Colors.gray400 }]} />
          <Text style={[styles.statusPillText, { color: isConnected ? Colors.success : Colors.gray500 }]}>
            {isConnected ? 'Connected' : 'Not set up'}
          </Text>
        </View>
      </View>

      {isConnected && connection!.pages.length > 0 && (
        <View style={styles.pagesList}>
          {connection!.pages.map(p => (
            <View key={p.id} style={styles.pageRow}>
              <Ionicons name="checkmark-circle" size={13} color={Colors.success} />
              <Text style={styles.pageName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.pageCategory}>{p.category}</Text>
            </View>
          ))}
        </View>
      )}

      {!isConnected && (
        <Text style={styles.integrationNote}>
          Log in with your Meta Business account to automatically import leads from all your Meta Ad campaigns.
        </Text>
      )}

      {isConnected ? (
        <TouchableOpacity
          onPress={onDisconnect}
          disabled={disconnecting}
          style={[styles.integrationBtnOutline, disconnecting && styles.disabledBtn]}
          activeOpacity={0.8}
        >
          {disconnecting
            ? <ActivityIndicator size="small" color={Colors.danger} />
            : <Ionicons name="log-out-outline" size={14} color={Colors.danger} />}
          <Text style={[styles.integrationBtnOutlineText, { color: Colors.danger }]}>
            {disconnecting ? 'Disconnecting…' : 'Disconnect Account'}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onConnect}
          disabled={connecting}
          style={[styles.integrationBtnFill, connecting && styles.disabledBtn]}
          activeOpacity={0.8}
        >
          {connecting
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="logo-facebook" size={14} color={Colors.white} />}
          <Text style={styles.integrationBtnFillText}>
            {connecting ? 'Opening Meta Login…' : 'Connect Meta Ads Account'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function IdRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.idRow}>
      <Text style={styles.idLabel}>{label}:</Text>
      <Text style={styles.idValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function SyncRow({ label, value }: { label: string; value: string | null }) {
  const formatted = value
    ? new Date(value).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })
    : 'Never';
  return (
    <View style={styles.syncTimestampRow}>
      <Text style={styles.syncTimestampLabel}>{label}</Text>
      <Text style={styles.syncTimestampValue}>{formatted}</Text>
    </View>
  );
}

// ─── Shared sub-components ────────────────────────────────────────────────────
function SectionLabel({ title }: { title: string }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{title}</Text>
    </View>
  );
}

function MenuItem({
  icon, label, onPress, divider = false, chevron = true,
  access, userRole,
}: {
  icon: string; label: string; onPress: () => void;
  divider?: boolean; chevron?: boolean;
  access?: string[]; userRole?: string;
}) {
  if (access && userRole && !access.includes(userRole)) return null;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.menuItem, divider && styles.menuItemDivider]}
      activeOpacity={0.6}
    >
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon as any} size={17} color={Colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {chevron && <Ionicons name="chevron-forward" size={15} color={Colors.gray300} />}
    </TouchableOpacity>
  );
}

function IntegrationStatus({ icon, label, status, color }: {
  icon: string; label: string;
  status: 'connected' | 'setup_required' | 'error'; color: string;
}) {
  return (
    <View style={styles.integrationStatusItem}>
      <Ionicons name={icon as any} size={17} color={color} />
      <Text style={styles.integrationStatusLabel}>{label}</Text>
      <View style={[styles.integrationStatusBadge, {
        backgroundColor: status === 'connected' ? Colors.successLight : Colors.warningLight,
      }]}>
        <Text style={[styles.integrationStatusBadgeText, {
          color: status === 'connected' ? Colors.success : Colors.warning,
        }]}>
          {status === 'connected' ? 'Connected' : 'Setup Required'}
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.gray50,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },

  content: {
    paddingTop: Spacing.lg,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  profileAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  profileInfo: {
    flex: 1,
    gap: 3,
  },
  profileName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray900,
  },
  profileEmail: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
    marginTop: 2,
  },
  roleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  roleText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Section labels (Notion style)
  sectionLabel: {
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xl,
    marginBottom: Spacing.sm,
  },
  sectionLabelText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray400,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },

  // Menu group
  menuGroup: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: 14,
    gap: Spacing.md,
  },
  menuItemDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray200,
  },
  menuIconWrap: {
    width: 30,
    height: 30,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.gray700,
  },

  // Integration card (Meta Ads)
  integrationCard: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.gray100,
    gap: Spacing.md,
  },
  integrationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  integrationIconWrap: {
    width: 38,
    height: 38,
    borderRadius: Radius.md,
    backgroundColor: '#E8F0FE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  integrationTitle: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray900,
  },
  integrationSubtitle: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginTop: 1,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: Radius.full,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusPillText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
  pagesList: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    padding: Spacing.sm,
    gap: Spacing.xs,
  },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: 2,
  },
  pageName: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.gray700,
  },
  pageCategory: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
  },
  integrationNote: {
    fontSize: FontSize.sm,
    color: Colors.gray500,
    lineHeight: 20,
  },
  integrationBtnFill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: '#1877F2',
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
  },
  integrationBtnFillText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  integrationBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.danger + '40',
    backgroundColor: Colors.dangerLight,
  },
  integrationBtnOutlineText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
  },
  disabledBtn: {
    opacity: 0.5,
  },

  // Sync card
  syncCard: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    borderRadius: Radius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.gray100,
    gap: Spacing.md,
  },
  syncNote: {
    fontSize: FontSize.sm,
    color: Colors.gray500,
    lineHeight: 20,
  },
  syncTimestamps: {
    backgroundColor: Colors.gray50,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: Spacing.xs,
  },
  syncTimestampRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  syncTimestampLabel: {
    fontSize: FontSize.xs,
    color: Colors.gray500,
  },
  syncTimestampValue: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    color: Colors.gray700,
  },
  syncActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  syncBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
  },
  syncBtnDisabled: {
    opacity: 0.5,
  },
  syncBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.white,
  },
  syncBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    backgroundColor: Colors.gray100,
    paddingVertical: Spacing.md,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  syncBtnSecondaryText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray600,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.xs,
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  resultBannerOk: {
    backgroundColor: Colors.successLight,
  },
  resultBannerError: {
    backgroundColor: Colors.dangerLight,
  },
  resultBannerText: {
    flex: 1,
    fontSize: FontSize.xs,
    lineHeight: 18,
  },

  // Logout
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: Radius.xl,
    backgroundColor: Colors.dangerLight,
    borderWidth: 1,
    borderColor: Colors.danger + '30',
  },
  logoutText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.danger,
  },

  footer: {
    textAlign: 'center',
    fontSize: FontSize.xs,
    color: Colors.gray300,
    marginTop: Spacing.xl,
  },

  // IDs (WhatsApp — kept for commented-out section)
  idRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: 3,
  },
  idLabel: {
    fontSize: 10,
    color: Colors.gray400,
    width: 64,
    flexShrink: 0,
  },
  idValue: {
    flex: 1,
    fontSize: 10,
    color: Colors.gray600,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },

  // Integration status list (kept for commented-out section)
  integrationStatusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  integrationStatusLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    color: Colors.gray700,
  },
  integrationStatusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  integrationStatusBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
  },
});
