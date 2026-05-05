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
import { Header } from '@/components/ui/Header';
import { Card } from '@/components/ui/Card';
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

  // Meta OAuth connection state
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
      if (!partial) return; // user cancelled

      const full: MetaConnection = {
        ...partial,
        connectedByUserId: user?.uid ?? '',
        connectedByName: user?.displayName ?? '',
      };
      await saveMetaConnection(full);
      setMetaConnection(full);

      // Immediately sync leads from the newly connected pages
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
      // Alert.alert onPress callbacks are unreliable on web — use native confirm instead
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
    <View style={styles.screen}>
      <Header title="Settings" showBack />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.profileAvatar}>
            <Text style={styles.avatarText}>{user?.displayName?.charAt(0) ?? 'U'}</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>{user?.displayName}</Text>
            <Text style={styles.profileEmail}>{user?.email}</Text>
            <View style={[styles.roleBadge, { backgroundColor: roleColor + '20' }]}>
              <Text style={[styles.roleText, { color: roleColor }]}>{roleLabel}</Text>
            </View>
          </View>
        </Card>

        {/* Account Section */}
        <SectionHeader title="Account" />
        <Card padding="none" style={styles.menuCard}>
          <MenuItem icon="person-outline" label="Edit Profile" onPress={() => {}} />
          <MenuItem icon="lock-closed-outline" label="Change Password" onPress={() => {}} divider />
          <MenuItem icon="notifications-outline" label="Notifications" onPress={() => {}} divider />
        </Card>

        {/* CRM Settings */}
        <SectionHeader title="CRM Settings" />
        <Card padding="none" style={styles.menuCard}>
          <MenuItem
            icon="people-outline"
            label="Manage Team"
            onPress={() => router.push('/team/users' as any)}
            access={['admin']}
            userRole={user?.role}
          />
          <MenuItem
            icon="business-outline"
            label="Projects & Lead Routing"
            onPress={() => router.push('/settings/projects' as any)}
            access={['admin']}
            userRole={user?.role}
            divider
          />
          <MenuItem
            icon="funnel-outline"
            label="Pipeline Stages"
            onPress={() => router.push('/settings/pipeline' as any)}
            access={['admin', 'manager']}
            userRole={user?.role}
            divider
          />
          <MenuItem
            icon="tag-outline"
            label="Lead Sources"
            onPress={() => router.push('/settings/sources' as any)}
            access={['admin']}
            userRole={user?.role}
            divider
          />
        </Card>

        {/* Meta Ads Account */}
        {isAdminOrManager && (
          <>
            <SectionHeader title="Meta Ads Account" />
            <MetaConnectionCard
              connection={metaConnection}
              connecting={connecting}
              disconnecting={disconnecting}
              onConnect={handleConnectMeta}
              onDisconnect={handleDisconnectMeta}
            />
          </>
        )}

        {/* WhatsApp Accounts */}
        <View style={styles.sectionRow}>
          <SectionHeader title="WhatsApp Accounts" inline />
          <TouchableOpacity onPress={verifyBothAccounts} style={styles.refreshBtn} disabled={verifying}>
            {verifying
              ? <ActivityIndicator size="small" color={Colors.primary} />
              : <Ionicons name="refresh-outline" size={14} color={Colors.primary} />}
            <Text style={styles.refreshText}>{verifying ? 'Checking…' : 'Refresh'}</Text>
          </TouchableOpacity>
        </View>

        <WhatsAppAccountCard
          label="Account 1 (Primary)"
          phoneNumberId={WHATSAPP_ACCOUNTS[1].phoneNumberId}
          businessId={WHATSAPP_ACCOUNTS[1].businessAccountId}
          pageId={WHATSAPP_ACCOUNTS[1].pageId}
          metaAppId={WHATSAPP_ACCOUNTS[1].metaAppId}
          isActive={accounts[0].isActive}
          verifyState={acc1Status}
          accountNum={1}
        />

        <WhatsAppAccountCard
          label="Account 2 (Secondary)"
          phoneNumberId={WHATSAPP_ACCOUNTS[2].phoneNumberId}
          businessId={WHATSAPP_ACCOUNTS[2].businessAccountId}
          pageId={WHATSAPP_ACCOUNTS[2].pageId}
          metaAppId={WHATSAPP_ACCOUNTS[2].metaAppId}
          isActive={accounts[1].isActive}
          verifyState={acc2Status}
          accountNum={2}
        />

        {/* Meta Leads Sync */}
        {isAdminOrManager && (
          <>
            <View style={styles.sectionRow}>
              <SectionHeader title="Meta Leads Sync" inline />
            </View>
            <Card style={styles.syncCard}>
              <Text style={styles.syncNote}>
                {metaConnection?.connected
                  ? `Connected as ${metaConnection.connectedByName || 'Meta User'} · ${metaConnection.pages.length} page${metaConnection.pages.length !== 1 ? 's' : ''}. Leads sync automatically.`
                  : 'Connect your Meta Ads account above to start fetching leads automatically.'}
              </Text>

              <View style={styles.syncTimestamps}>
                <SyncRow label="Account 1 last sync" value={syncStatus.acc1} />
                <SyncRow label="Account 2 last sync" value={syncStatus.acc2} />
              </View>

              <TouchableOpacity
                onPress={handleSyncNow}
                disabled={syncing}
                style={[styles.syncBtn, syncing && styles.syncBtnDisabled]}
                activeOpacity={0.8}
              >
                {syncing
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Ionicons name="sync-outline" size={16} color={Colors.white} />
                }
                <Text style={styles.syncBtnText}>{syncing ? 'Syncing…' : 'Sync Now'}</Text>
              </TouchableOpacity>

              {syncResult && (
                <View style={[styles.syncResult, syncResult.startsWith('Sync failed') ? styles.syncResultError : styles.syncResultOk]}>
                  <Text style={styles.syncResultText}>{syncResult}</Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleTestMeta}
                disabled={testing}
                style={[styles.syncBtn, { backgroundColor: '#6B7280', marginTop: 8 }, testing && styles.syncBtnDisabled]}
                activeOpacity={0.8}
              >
                {testing
                  ? <ActivityIndicator size="small" color={Colors.white} />
                  : <Ionicons name="wifi-outline" size={16} color={Colors.white} />
                }
                <Text style={styles.syncBtnText}>{testing ? 'Testing…' : 'Test Meta API'}</Text>
              </TouchableOpacity>

              {testResult && (
                <View style={[styles.syncResult, testResult.includes('ERROR') || testResult.includes('failed') ? styles.syncResultError : styles.syncResultOk]}>
                  <Text style={styles.syncResultText}>{testResult}</Text>
                </View>
              )}
            </Card>
          </>
        )}

        {/* Integration Status */}
        <SectionHeader title="Other Integrations" />
        <Card style={styles.integrations}>
          <IntegrationStatus icon="logo-google" label="Firebase / Firestore" status="connected" color="#EA4335" />
          <IntegrationStatus icon="mail-outline" label="Gmail SMTP" status="setup_required" color="#EA4335" />
          <IntegrationStatus icon="sparkles-outline" label="Gemini AI (Lead Scoring)" status="setup_required" color="#4285F4" />
        </Card>

        {/* About */}
        <SectionHeader title="About" />
        <Card padding="none" style={styles.menuCard}>
          <MenuItem icon="information-circle-outline" label="Version 1.0.0" onPress={() => {}} chevron={false} />
          <MenuItem icon="document-text-outline" label="Privacy Policy" onPress={() => {}} divider />
          <MenuItem icon="shield-checkmark-outline" label="Terms of Service" onPress={() => {}} divider />
        </Card>

        {/* Logout */}
        <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={styles.footer}>Relazo CRM · Firebase + Expo + Gemini AI</Text>
      </ScrollView>
    </View>
  );
}

// ─── Meta Connection Card ─────────────────────────────────────────────────────
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
    <Card style={styles.metaCard}>
      {/* Header */}
      <View style={styles.metaHeader}>
        <View style={styles.metaIconWrap}>
          <Ionicons name="logo-facebook" size={22} color="#1877F2" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.metaTitle}>Meta Ads</Text>
          {isConnected && connection?.connectedByName ? (
            <Text style={styles.metaSubtitle}>{connection.connectedByName}</Text>
          ) : null}
        </View>
        <View style={[styles.metaStatusDot, { backgroundColor: isConnected ? Colors.success : Colors.gray300 }]} />
        <Text style={[styles.metaStatusLabel, { color: isConnected ? Colors.success : Colors.gray400 }]}>
          {isConnected ? 'Connected' : 'Not connected'}
        </Text>
      </View>

      {/* Connected pages list */}
      {isConnected && connection!.pages.length > 0 && (
        <View style={styles.metaPages}>
          {connection!.pages.map(p => (
            <View key={p.id} style={styles.metaPageRow}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
              <Text style={styles.metaPageName} numberOfLines={1}>{p.name}</Text>
              <Text style={styles.metaPageCategory}>{p.category}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Note when not connected */}
      {!isConnected && (
        <Text style={styles.metaNote}>
          Log in with your Meta Business account to automatically import leads from all your Meta Ad campaigns.
        </Text>
      )}

      {/* Action button */}
      {isConnected ? (
        <TouchableOpacity
          onPress={onDisconnect}
          disabled={disconnecting}
          style={[styles.metaBtn, styles.metaBtnDanger, disconnecting && styles.metaBtnDisabled]}
          activeOpacity={0.8}
        >
          {disconnecting
            ? <ActivityIndicator size="small" color={Colors.danger} />
            : <Ionicons name="log-out-outline" size={15} color={Colors.danger} />}
          <Text style={[styles.metaBtnText, { color: Colors.danger }]}>
            {disconnecting ? 'Disconnecting…' : 'Disconnect'}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={onConnect}
          disabled={connecting}
          style={[styles.metaBtn, styles.metaBtnPrimary, connecting && styles.metaBtnDisabled]}
          activeOpacity={0.8}
        >
          {connecting
            ? <ActivityIndicator size="small" color={Colors.white} />
            : <Ionicons name="logo-facebook" size={15} color={Colors.white} />}
          <Text style={[styles.metaBtnText, { color: Colors.white }]}>
            {connecting ? 'Opening Meta Login…' : 'Connect Meta Ads Account'}
          </Text>
        </TouchableOpacity>
      )}
    </Card>
  );
}

// ─── WhatsApp Account Card ─────────────────────────────────────────────────────
function WhatsAppAccountCard({
  label, phoneNumberId, businessId, pageId, metaAppId,
  isActive, verifyState, accountNum,
}: {
  label: string;
  phoneNumberId: string;
  businessId: string;
  pageId: string;
  metaAppId: string;
  isActive: boolean;
  verifyState: VerifyState;
  accountNum: 1 | 2;
}) {
  const statusColor =
    verifyState.status === 'connected' ? Colors.success
    : verifyState.status === 'error' ? Colors.danger
    : Colors.gray400;

  const statusLabel =
    verifyState.status === 'connected' ? 'Connected'
    : verifyState.status === 'error' ? 'Error'
    : verifyState.status === 'checking' ? 'Checking...'
    : 'Unknown';

  return (
    <Card style={styles.waCard}>
      {/* Header row */}
      <View style={styles.waCardHeader}>
        <View style={styles.waIconWrap}>
          <Ionicons name="logo-whatsapp" size={20} color="#25D366" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.waCardLabel}>{label}</Text>
          {verifyState.displayName && (
            <Text style={styles.waDisplayName}>{verifyState.displayName}</Text>
          )}
        </View>
        {isActive && (
          <View style={styles.activeBadge}>
            <Text style={styles.activeBadgeText}>ACTIVE</Text>
          </View>
        )}
        {verifyState.status === 'checking' ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        )}
        <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
      </View>

      {/* Phone number if verified */}
      {verifyState.phoneNumber && (
        <View style={styles.waPhoneRow}>
          <Ionicons name="call-outline" size={14} color={Colors.gray500} />
          <Text style={styles.waPhoneText}>{verifyState.phoneNumber}</Text>
        </View>
      )}

      {/* Error message */}
      {verifyState.status === 'error' && verifyState.error && (
        <View style={styles.waErrorRow}>
          <Ionicons name="alert-circle-outline" size={14} color={Colors.danger} />
          <Text style={styles.waErrorText}>{verifyState.error}</Text>
        </View>
      )}

      {/* IDs */}
      <View style={styles.waIds}>
        <IdRow label="Phone ID" value={phoneNumberId} />
        <IdRow label="WABA ID" value={businessId} />
        <IdRow label="Page ID" value={pageId} />
        <IdRow label="App ID" value={metaAppId} />
      </View>
    </Card>
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
      <Text style={styles.syncTimestampLabel}>{label}:</Text>
      <Text style={styles.syncTimestampValue}>{formatted}</Text>
    </View>
  );
}

// ─── Shared Components ────────────────────────────────────────────────────────
function SectionHeader({ title, inline = false }: { title: string; inline?: boolean }) {
  return (
    <View style={[styles.sectionHeader, inline && { marginBottom: 0 }]}>
      <Text style={styles.sectionTitle}>{title}</Text>
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
    <TouchableOpacity onPress={onPress} style={[styles.menuItem, divider && styles.menuItemBorder]} activeOpacity={0.7}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon as any} size={18} color={Colors.primary} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      {chevron && <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />}
    </TouchableOpacity>
  );
}

function IntegrationStatus({ icon, label, status, color }: {
  icon: string; label: string;
  status: 'connected' | 'setup_required' | 'error'; color: string;
}) {
  return (
    <View style={styles.integrationItem}>
      <Ionicons name={icon as any} size={18} color={color} />
      <Text style={styles.integrationLabel}>{label}</Text>
      <View style={[styles.integrationBadge, {
        backgroundColor: status === 'connected' ? Colors.successLight : Colors.warningLight,
      }]}>
        <Text style={[styles.integrationBadgeText, {
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
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: Spacing.base },

  profileCard: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.base },
  profileAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  avatarText: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.white },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.navy },
  profileEmail: { fontSize: FontSize.sm, color: Colors.gray500, marginVertical: 3 },
  roleBadge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  roleText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },

  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: Spacing.xs, marginTop: Spacing.sm },
  sectionHeader: { paddingVertical: Spacing.xs, marginTop: Spacing.sm },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray500, textTransform: 'uppercase', letterSpacing: 0.5 },
  refreshBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: Spacing.sm, backgroundColor: Colors.primaryLight, borderRadius: Radius.md },
  refreshText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: FontWeight.medium },

  menuCard: { marginBottom: Spacing.xs },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  menuItemBorder: { borderTopWidth: 1, borderTopColor: Colors.gray100 },
  menuIconWrap: { width: 32, height: 32, borderRadius: 8, backgroundColor: Colors.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: Spacing.md },
  menuLabel: { flex: 1, fontSize: FontSize.base, color: Colors.gray800 },

  // Meta connection card
  metaCard: { marginBottom: Spacing.sm },
  metaHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  metaIconWrap: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E7F0FD', alignItems: 'center', justifyContent: 'center' },
  metaTitle: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy },
  metaSubtitle: { fontSize: FontSize.xs, color: Colors.gray500 },
  metaStatusDot: { width: 8, height: 8, borderRadius: 4 },
  metaStatusLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  metaPages: { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: Spacing.sm, marginBottom: Spacing.sm, gap: 6 },
  metaPageRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaPageName: { flex: 1, fontSize: FontSize.xs, color: Colors.gray700 },
  metaPageCategory: { fontSize: FontSize.xs, color: Colors.gray400 },
  metaNote: { fontSize: FontSize.xs, color: Colors.gray500, lineHeight: 18, marginBottom: Spacing.sm },
  metaBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm, borderRadius: Radius.md, borderWidth: 1 },
  metaBtnPrimary: { backgroundColor: '#1877F2', borderColor: '#1877F2' },
  metaBtnDanger: { backgroundColor: Colors.dangerLight, borderColor: Colors.danger },
  metaBtnDisabled: { opacity: 0.6 },
  metaBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold },

  // WhatsApp account cards
  waCard: { marginBottom: Spacing.sm },
  waCardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  waIconWrap: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E8FFF0', alignItems: 'center', justifyContent: 'center' },
  waCardLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy },
  waDisplayName: { fontSize: FontSize.xs, color: Colors.gray500 },
  activeBadge: { backgroundColor: Colors.primaryLight, paddingHorizontal: 6, paddingVertical: 2, borderRadius: Radius.full },
  activeBadgeText: { fontSize: 9, fontWeight: FontWeight.bold, color: Colors.primary, letterSpacing: 0.5 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
  waPhoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  waPhoneText: { fontSize: FontSize.sm, color: Colors.gray600 },
  waErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  waErrorText: { fontSize: FontSize.xs, color: Colors.danger, flex: 1 },
  waIds: { borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: Spacing.sm, gap: 4 },
  idRow: { flexDirection: 'row', alignItems: 'center' },
  idLabel: { fontSize: FontSize.xs, color: Colors.gray500, width: 70 },
  idValue: { fontSize: FontSize.xs, color: Colors.gray700, fontFamily: 'monospace', flex: 1 },

  // Meta Sync
  syncCard: { marginBottom: Spacing.xs, gap: Spacing.sm },
  syncNote: { fontSize: FontSize.xs, color: Colors.gray500, lineHeight: 18 },
  syncTimestamps: { gap: 4 },
  syncTimestampRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  syncTimestampLabel: { fontSize: FontSize.xs, color: Colors.gray500, width: 140 },
  syncTimestampValue: { fontSize: FontSize.xs, color: Colors.gray700, fontWeight: FontWeight.medium },
  syncBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: Spacing.sm, backgroundColor: Colors.primary, borderRadius: Radius.md },
  syncBtnDisabled: { opacity: 0.6 },
  syncBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.white },
  syncResult: { borderRadius: Radius.sm, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md },
  syncResultOk: { backgroundColor: Colors.successLight },
  syncResultError: { backgroundColor: Colors.dangerLight },
  syncResultText: { fontSize: FontSize.xs, color: Colors.gray700 },

  integrations: { marginBottom: Spacing.xs, gap: Spacing.sm },
  integrationItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  integrationLabel: { flex: 1, fontSize: FontSize.sm, color: Colors.gray700 },
  integrationBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.full },
  integrationBadgeText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, backgroundColor: Colors.dangerLight, borderRadius: Radius.lg, marginTop: Spacing.md },
  logoutText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.danger },
  footer: { textAlign: 'center', fontSize: FontSize.xs, color: Colors.gray400, marginTop: Spacing.xl },
});
