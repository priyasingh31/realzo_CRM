/**
 * Push Notification Service
 * - Registers device for push notifications
 * - Stores Expo push token in Firestore user profile
 * - Handles foreground notification display
 * - Custom ringtone for new lead notifications
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';

// Only true in Expo Go — preview/production builds have executionEnvironment = 'standalone'
const isExpoGo = Constants.executionEnvironment === 'storeClient';

// Bundled notification sound (declared in app.json → expo-notifications → sounds)
const ALERT_SOUND = 'mixkit-software-interface-back-2575.wav';

// Configure how notifications appear when app is in foreground (works in Expo Go too)
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const isNewLead = notification.request.content.data?.type === 'new_lead' ||
                      notification.request.content.data?.type === 'lead_assigned';
    return {
      shouldShowAlert: true,
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      priority: isNewLead
        ? Notifications.AndroidNotificationPriority.MAX
        : Notifications.AndroidNotificationPriority.DEFAULT,
    };
  },
});

// ─── Register for push notifications ─────────────────────────────────────────
export async function registerForPushNotifications(uid: string): Promise<string | null> {
  // Expo Go does not support FCM/remote push tokens — local notifications still work
  if (isExpoGo) return null;

  if (!Device.isDevice) return null;

  // Set up Android notification channels (works without FCM)
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('new_leads', {
      name: 'New Lead Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500, 250, 500],
      lightColor: '#1A9B6C',
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      sound: ALERT_SOUND,
    });
    await Notifications.setNotificationChannelAsync('escalations', {
      name: 'Lead Escalations',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 1000, 500, 1000],
      lightColor: '#EF4444',
      sound: ALERT_SOUND,
    });
    await Notifications.setNotificationChannelAsync('general', {
      name: 'General Notifications',
      importance: Notifications.AndroidImportance.DEFAULT,
      sound: ALERT_SOUND,
    });
  }

  // Project ID: prefer env var, fall back to app.json extra (always available in builds)
  const projectId =
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ||
    (Constants.expoConfig?.extra?.eas?.projectId as string | undefined);

  if (!projectId) {
    console.warn('[Push] No EAS project ID found — push token not registered');
    return null;
  }

  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[Push] Permission denied');
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;
    console.log('[Push] Token registered:', token);

    await updateDoc(doc(db, 'users', uid), {
      pushToken: token,
      updatedAt: new Date().toISOString(),
    });
    return token;
  } catch (err) {
    console.warn('[Push] Token registration failed:', err);
    return null;
  }
}

// ─── Send push directly to an Expo push token — NO Cloud Function hop, instant ─
// Calls the Expo Push API from the client. Acceptable for admin-only actions
// (assign lead) where the caller is already authenticated.
export async function sendExpoPushDirect(
  pushToken: string,
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = 'new_leads'
): Promise<void> {
  if (!pushToken?.startsWith('ExponentPushToken')) {
    console.warn('[Push] sendExpoPushDirect: invalid token:', pushToken);
    return;
  }
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        to:        pushToken,
        title,
        body,
        data:      data ?? {},
        sound:     ALERT_SOUND,
        priority:  'high',
        channelId,
      }),
    });
    const json = await res.json() as { data?: { status: string; message?: string } };
    if (json.data?.status === 'error') {
      console.warn('[Push] Expo push error:', json.data.message);
    } else {
      console.log('[Push] Sent to', pushToken.slice(0, 30) + '…');
    }
  } catch (e) {
    console.warn('[Push] sendExpoPushDirect failed:', e);
  }
}

// ─── Send local notification — works in Expo Go and dev builds ───────────────
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  channelId = 'general'
): Promise<void> {
  try {
    // Request permission if not already granted (required on iOS)
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      await Notifications.requestPermissionsAsync();
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        // Custom sound only works in standalone/dev build, not Expo Go
        ...(isExpoGo ? {} : { sound: ALERT_SOUND }),
        ...(Platform.OS === 'android' && !isExpoGo && { channelId }),
      },
      trigger: null, // immediate
    });
  } catch (e) {
    console.warn('[LocalNotif] Failed:', e);
  }
}

// ─── Schedule escalation local reminder (10 min) ──────────────────────────────
export async function scheduleEscalationReminder(
  leadId: string,
  leadName: string,
  delaySeconds = 600  // 10 minutes
): Promise<string> {
  if (isExpoGo) return '';
  const id = await Notifications.scheduleNotificationAsync({
    content: {
      title: '⚠️ Lead Not Responded!',
      body: `${leadName} hasn't been contacted yet. Respond now!`,
      data: { type: 'lead_escalation', leadId },
      sound: ALERT_SOUND,
      ...(Platform.OS === 'android' && { channelId: 'escalations' }),
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds },
  });
  return id;
}

// ─── Cancel escalation reminder ───────────────────────────────────────────────
export async function cancelEscalationReminder(notificationId: string): Promise<void> {
  if (isExpoGo) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

// ─── Add notification listener ───────────────────────────────────────────────
export function addNotificationListener(
  onReceive: (notification: Notifications.Notification) => void,
  onResponse: (response: Notifications.NotificationResponse) => void
): { remove: () => void } {
  if (isExpoGo) return { remove: () => {} };
  const receiveSub = Notifications.addNotificationReceivedListener(onReceive);
  const responseSub = Notifications.addNotificationResponseReceivedListener(onResponse);
  return {
    remove: () => {
      receiveSub.remove();
      responseSub.remove();
    },
  };
}

// ─── Get badge count ──────────────────────────────────────────────────────────
export async function getBadgeCount(): Promise<number> {
  if (isExpoGo) return 0;
  return await Notifications.getBadgeCountAsync();
}

export async function setBadgeCount(count: number): Promise<void> {
  if (isExpoGo) return;
  await Notifications.setBadgeCountAsync(count);
}

export async function clearBadge(): Promise<void> {
  if (isExpoGo) return;
  await Notifications.setBadgeCountAsync(0);
}
