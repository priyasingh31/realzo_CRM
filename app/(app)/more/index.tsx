import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Spacing, Radius } from '@/constants/theme';

const MENU_ITEMS: { label: string; icon: string; href: string; roles?: string[] }[] = [
  { label: 'Settings',  icon: 'settings-outline',       href: '/settings', roles: ['admin', 'manager', 'mis'] },
  { label: 'Team',      icon: 'people-circle-outline',  href: '/team',     roles: ['admin', 'manager'] },
  { label: 'Reports',   icon: 'bar-chart-outline',      href: '/reports',  roles: ['admin', 'mis'] },
  { label: 'Pipeline',  icon: 'git-branch-outline',     href: '/pipeline', roles: ['sales'] },
  { label: 'Profile',   icon: 'person-circle-outline',  href: '/settings', roles: ['sales'] },
];

export default function MoreScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuthStore();
  const role = user?.role ?? '';
  const firstLetter = user?.displayName?.charAt(0)?.toUpperCase() ?? '?';

  const visibleItems = MENU_ITEMS.filter(
    item => !item.roles || item.roles.includes(role)
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>More</Text>
      </View>

      {/* User card */}
      <TouchableOpacity style={styles.userCard} onPress={() => router.push('/settings')} activeOpacity={0.8}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{firstLetter}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.userName}>{user?.displayName ?? 'User'}</Text>
          <Text style={styles.userEmail}>{user?.email ?? ''}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.gray400} />
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}>
        <View style={styles.section}>
          {visibleItems.map(item => (
            <TouchableOpacity
              key={item.label}
              style={styles.menuItem}
              onPress={() => router.push(item.href as any)}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconWrap}>
                <Ionicons name={item.icon as any} size={20} color={Colors.primary} />
              </View>
              <Text style={styles.menuLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  header: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  title: { fontSize: FontSize.xl, fontWeight: FontWeight.bold, color: Colors.gray900 },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    padding: Spacing.base,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray100,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.white },
  userName: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.gray800 },
  userEmail: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 2 },
  section: {
    backgroundColor: Colors.white,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray100,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: Radius.md,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium, color: Colors.gray800 },
});
