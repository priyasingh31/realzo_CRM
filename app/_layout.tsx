import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@/store/authStore';
import { subscribeToAuthState } from '@/services/authService';
import { syncConnectedPages } from '@/services/metaLeadsService';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
});

// Minimum gap between background syncs (5 minutes)
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export default function RootLayout() {
  const { setUser, isAuthenticated } = useAuthStore();
  const lastSyncRef = useRef<number>(0);

  // Run a background Meta leads sync (silently — no UI feedback)
  const triggerBackgroundSync = async () => {
    if (!isAuthenticated) return;
    const now = Date.now();
    if (now - lastSyncRef.current < MIN_SYNC_INTERVAL_MS) return;
    lastSyncRef.current = now;
    try {
      await syncConnectedPages();
    } catch {
      // Background sync failures are silent
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((user) => {
      setUser(user);
    });
    return unsubscribe;
  }, []);

  // Sync on app foreground
  useEffect(() => {
    // Initial sync on mount (slight delay so auth state can settle)
    const initialTimer = setTimeout(triggerBackgroundSync, 3000);

    const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state === 'active') {
        triggerBackgroundSync();
      }
    });

    return () => {
      clearTimeout(initialTimer);
      subscription.remove();
    };
  }, [isAuthenticated]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
          <StatusBar style="auto" />
          <Toast />
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
