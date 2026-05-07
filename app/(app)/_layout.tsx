import { Tabs, Redirect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Platform, View, TouchableOpacity, useWindowDimensions } from 'react-native';
import { WebSidebar } from '@/components/ui/WebSidebar';
import { collection, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Lead } from '@/types';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { registerForPushNotifications, addNotificationListener, sendLocalNotification } from '@/services/notificationService';

export default function AppLayout() {
  const { user, isAuthenticated } = useAuthStore();
  const { width } = useWindowDimensions();
  const router = useRouter();
  const isDesktop = Platform.OS === 'web' && width >= 1024;

  const lastSyncRef = useRef<number>(0);

  // ── Push notification registration + listener ──────────────────────────────
  useEffect(() => {
    if (!user?.uid) return;
    registerForPushNotifications(user.uid);
    const sub = addNotificationListener(
      (n) => console.log('Notification received:', n.request.content.title),
      (r) => console.log('Notification tapped:', r.notification.request.content.data)
    );
    return () => sub.remove();
  }, [user?.uid]);

  // ── Trigger Meta sync when app comes to foreground ─────────────────────────
  // This ensures new leads appear immediately when the user opens the app,
  // without waiting for the next 1-minute scheduled function tick.
  useEffect(() => {
    if (!user?.uid) return;

    const isAdminOrManager = user.role === 'admin' || user.role === 'manager';
    if (!isAdminOrManager) return; // only admin/manager can trigger sync

    const handleAppState = async (next: AppStateStatus) => {
      if (next !== 'active') return;

      // Throttle: don't sync more than once every 90 seconds
      const now = Date.now();
      if (now - lastSyncRef.current < 90_000) return;
      lastSyncRef.current = now;

      try {
        const fns = getFunctions();
        const trigger = httpsCallable(fns, 'triggerMetaSync');
        await trigger({});
        console.log('[AppState] Meta sync triggered on foreground');
      } catch (err) {
        console.warn('[AppState] Meta sync failed:', err);
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [user?.uid, user?.role]);

  const [missedCount, setMissedCount] = useState(0);

  // ── Single leads subscription: missed badge + foreground new-lead alert ───────
  useEffect(() => {
    if (!user?.uid || !user?.role || !isAuthenticated) return;

    const isAdminUser = user.role === 'admin' || user.role === 'manager';
    const q = isAdminUser
      ? user.role === 'manager'
        ? query(collection(db, 'leads'), where('managerId', '==', user.uid), orderBy('createdAt', 'desc'))
        : query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'leads'), where('assignedTo', '==', user.uid), orderBy('createdAt', 'desc'));

    const TEN_MIN = 10 * 60 * 1000;
    // useRef so the flag survives re-renders without resetting
    const initialLoadRef = { current: true };

    const unsub = onSnapshot(q, snap => {
      // ── Missed badge count ──────────────────────────────────────────────────
      const now = Date.now();
      const missed = snap.docs.filter(d => {
        const l = d.data() as Lead;
        if (!l.assignedTo) return false;
        if (['Booked', 'EOICustomer', 'invalid'].includes(l.status)) return false;
        const ref = l.updatedAt ?? l.createdAt;
        return now - new Date(ref).getTime() > TEN_MIN;
      }).length;
      setMissedCount(missed);

      // ── New-lead foreground alert ───────────────────────────────────────────
      if (initialLoadRef.current) { initialLoadRef.current = false; return; }

      snap.docChanges().forEach(change => {
        if (change.type !== 'added') return;
        const l = change.doc.data() as Lead;

        // Only alert for leads created in the last 2 minutes (debounce batch syncs)
        const age = now - new Date(l.createdAt).getTime();
        if (age > 2 * 60 * 1000) return;

        const src = l.metaAccount ? `Meta Acc ${l.metaAccount}`
          : l.source === 'google' ? 'Google Ads'
          : l.source === 'whatsapp' ? 'WhatsApp'
          : l.source ?? 'New Lead';

        const body = [l.metaCampaignName, l.requirements, l.phone]
          .filter(Boolean).join(' · ');

        sendLocalNotification(
          `🔔 New Lead: ${l.name}`,
          `${src} · ${body}`,
          { type: 'new_lead', leadId: change.doc.id },
          'new_leads'
        );
      });
    }, () => setMissedCount(0));

    return () => unsub();
  }, [user?.uid, user?.role, isAuthenticated]);

  if (!isAuthenticated || !user) return <Redirect href="/(auth)/login" />;

  const tabs = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.gray400,
        tabBarStyle: isDesktop
          ? { display: 'none' } as any
          : {
              backgroundColor: Colors.white,
              borderTopColor: Colors.gray100,
              height: Platform.OS === 'ios' ? 85 : 65,
              paddingBottom: Platform.OS === 'ios' ? 25 : 10,
              paddingTop: 8,
            },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="dashboard/index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="leads/index"
        options={{
          title: 'Leads',
          tabBarIcon: ({ color, size }) => <Ionicons name="people-outline" size={size} color={color} />,
        }}
      />
      {/* FAB centre button */}
      <Tabs.Screen
        name="more/index"
        options={{
          title: '',
          tabBarButton: () => (
            <TouchableOpacity
              onPress={() => router.push('/leads/new')}
              style={{
                top: -14,
                width: 54,
                height: 54,
                borderRadius: 27,
                backgroundColor: Colors.primary,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
                elevation: 8,
              }}
              activeOpacity={0.85}
            >
              <Ionicons name="add" size={28} color="#fff" />
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications/index"
        options={{
          title: 'Activities',
          tabBarBadge: missedCount > 0 ? missedCount : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10 },
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings/index"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" size={size} color={color} />,
        }}
      />
      {/* Hidden from tab bar */}
      <Tabs.Screen name="team/index"            options={{ href: null }} />
      <Tabs.Screen name="reports/index"         options={{ href: null }} />
      <Tabs.Screen name="pipeline/index"        options={{ href: null }} />
      <Tabs.Screen name="settings/projects"     options={{ href: null }} />
      <Tabs.Screen name="settings/pipeline"     options={{ href: null }} />
      <Tabs.Screen name="settings/sources"      options={{ href: null }} />
      <Tabs.Screen name="leads/[id]"            options={{ href: null }} />
      <Tabs.Screen name="leads/new"             options={{ href: null }} />
      <Tabs.Screen name="properties/index"      options={{ href: null }} />
      <Tabs.Screen name="properties/[id]"       options={{ href: null }} />
      <Tabs.Screen name="properties/new"        options={{ href: null }} />
      <Tabs.Screen name="team/[managerId]"      options={{ href: null }} />
      <Tabs.Screen name="team/users"            options={{ href: null }} />
      <Tabs.Screen name="team/agent/[agentId]"  options={{ href: null }} />
    </Tabs>
  );

  if (isDesktop) {
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <WebSidebar />
        <View style={{ flex: 1 }}>{tabs}</View>
      </View>
    );
  }

  return tabs;
}
