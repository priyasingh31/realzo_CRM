import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, usePathname } from 'expo-router';
import { useAuthStore } from '@/store/authStore';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Spacing, Radius } from '@/constants/theme';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const logoImg = require('../../../assets/relazo_white_bg_logo.png') as number;

const NAV_ITEMS: { label: string; icon: string; match: string; href: string | null; roles?: string[] }[] = [
  { label: 'Dashboard',  icon: 'grid-outline',          match: 'dashboard',     href: '/(app)/dashboard' },
  { label: 'Leads',      icon: 'people-outline',        match: 'leads',         href: '/(app)/leads' },
  { label: 'Activities', icon: 'notifications-outline', match: 'notifications', href: '/(app)/notifications' },
  { label: 'Calendar',   icon: 'calendar-outline',      match: 'calendar',      href: null },
  { label: 'Reports',    icon: 'bar-chart-outline',     match: 'reports',       href: '/(app)/reports',  roles: ['admin', 'manager', 'mis'] },
  { label: 'Settings',   icon: 'settings-outline',      match: 'settings',      href: '/(app)/settings', roles: ['admin', 'manager', 'mis'] },
];

export function WebSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const role = user?.role ?? '';

  const visibleItems = NAV_ITEMS.filter(
    item => !item.roles || item.roles.includes(role)
  );

  return (
    <View style={[styles.sidebar, collapsed && styles.sidebarCollapsed]}>

      {/* ── Top: logo + toggle ── */}
      <View style={[styles.logoRow, collapsed && styles.logoRowCollapsed]}>
        {!collapsed && (
          <Image source={logoImg} style={styles.logoImage} resizeMode="contain" />
        )}
        {collapsed && (
          <View style={styles.logoIconFallback}>
            <Text style={styles.logoIconLetter}>r</Text>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setCollapsed(c => !c)}
          style={styles.toggleBtn}
          activeOpacity={0.7}
        >
          <Ionicons name="menu-outline" size={18} color={Colors.gray500} />
        </TouchableOpacity>
      </View>

      {/* ── Nav items ── */}
      <View style={styles.nav}>
        {visibleItems.map(item => {
          const isActive = pathname.includes(item.match);
          const disabled = item.href === null;
          return (
            <TouchableOpacity
              key={item.label}
              style={[
                styles.navItem,
                isActive && styles.navItemActive,
                collapsed && styles.navItemCollapsed,
              ]}
              onPress={() => { if (item.href) router.push(item.href as any); }}
              activeOpacity={disabled ? 1 : 0.7}
            >
              <Ionicons
                name={item.icon as any}
                size={18}
                color={isActive ? Colors.primary : disabled ? Colors.gray300 : Colors.gray500}
              />
              {!collapsed && (
                <Text style={[
                  styles.navLabel,
                  isActive && styles.navLabelActive,
                  disabled && styles.navLabelDisabled,
                ]}>
                  {item.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Bottom: Profile + Sign Out ── */}
      {collapsed ? (
        <View style={styles.bottomSection}>
          <TouchableOpacity style={styles.signOutCollapsed} onPress={() => router.push('/(app)/settings')} activeOpacity={0.8}>
            <Ionicons name="person-circle-outline" size={22} color={Colors.gray500} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.signOutCollapsed} onPress={logout} activeOpacity={0.7}>
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.bottomSection}>
          <TouchableOpacity style={styles.menuRowBtn} onPress={() => router.push('/(app)/settings')} activeOpacity={0.75}>
            <Ionicons name="person-circle-outline" size={20} color={Colors.gray600} />
            <Text style={styles.menuRowText}>Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.signOutBtn} onPress={logout} activeOpacity={0.75}>
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            <Text style={styles.signOutText}>Sign Out</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: 220,
    backgroundColor: Colors.white,
    borderRightWidth: 1,
    borderRightColor: Colors.gray100,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'column',
  },
  sidebarCollapsed: {
    width: 64,
  },

  // ── Logo row ──
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xl,
  },
  logoRowCollapsed: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  logoGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoIcon: {
    width: 34,
    height: 34,
    borderRadius: Radius.md,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 120,
    height: 40,
  },
  logoIconFallback: {
    width: 32,
    height: 32,
    borderRadius: Radius.md,
    backgroundColor: '#2B2D8E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIconLetter: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: Colors.white,
    lineHeight: 22,
  },
  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: Radius.sm,
    backgroundColor: Colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Nav ──
  nav: {
    flex: 1,
    paddingHorizontal: Spacing.sm,
    gap: 2,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.lg,
  },
  navItemActive: {
    backgroundColor: Colors.primaryLight,
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
  },
  navLabel: {
    fontSize: FontSize.sm,
    color: Colors.gray600,
    fontWeight: FontWeight.medium,
  },
  navLabelActive: {
    color: Colors.primary,
    fontWeight: FontWeight.semibold,
  },
  navLabelDisabled: {
    color: Colors.gray300,
  },

  // ── Profile (expanded) ──
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
  },
  // ── Profile (collapsed) ──
  profileCollapsed: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  profileAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileAvatarText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: Colors.white,
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.gray800,
  },
  profileEmail: {
    fontSize: FontSize.xs,
    color: Colors.gray400,
    marginTop: 1,
  },
  bottomSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.gray100,
    marginTop: Spacing.sm,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.sm,
    marginBottom: Spacing.sm,
    borderRadius: Radius.lg,
  },
  signOutText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.danger,
  },
  signOutCollapsed: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  menuRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginHorizontal: Spacing.sm,
    borderRadius: Radius.lg,
  },
  menuRowText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semibold,
    color: Colors.gray700,
  },
});
