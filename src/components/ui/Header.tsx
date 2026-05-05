import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Spacing, Shadow } from '@/constants/theme';

interface HeaderProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  rightAction?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void; badge?: number };
  rightAction2?: { icon: keyof typeof Ionicons.glyphMap; onPress: () => void };
  transparent?: boolean;
}

export function Header({
  title,
  subtitle,
  showBack = false,
  rightAction,
  rightAction2,
  transparent = false,
}: HeaderProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[
      styles.header,
      !transparent && styles.solidHeader,
      { paddingTop: Platform.OS === 'android' ? insets.top + 8 : insets.top || 12 },
    ]}>
      <View style={styles.row}>
        {/* Left */}
        <View style={styles.left}>
          {showBack ? (
            <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
              <Ionicons name="arrow-back" size={22} color={transparent ? Colors.white : Colors.navy} />
            </TouchableOpacity>
          ) : (
            <View style={styles.logo}>
              <Text style={styles.logoText}>R</Text>
            </View>
          )}
        </View>

        {/* Center */}
        <View style={styles.center}>
          <Text style={[styles.title, transparent && styles.titleLight]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle && (
            <Text style={[styles.subtitle, transparent && styles.subtitleLight]} numberOfLines={1}>
              {subtitle}
            </Text>
          )}
        </View>

        {/* Right */}
        <View style={styles.right}>
          {rightAction2 && (
            <TouchableOpacity onPress={rightAction2.onPress} style={styles.iconBtn}>
              <Ionicons name={rightAction2.icon} size={22} color={transparent ? Colors.white : Colors.navy} />
            </TouchableOpacity>
          )}
          {rightAction && (
            <TouchableOpacity onPress={rightAction.onPress} style={styles.iconBtn}>
              <Ionicons name={rightAction.icon} size={22} color={transparent ? Colors.white : Colors.navy} />
              {rightAction.badge != null && rightAction.badge > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {rightAction.badge > 99 ? '99+' : rightAction.badge}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
    zIndex: 10,
  },
  solidHeader: {
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray100,
    ...Shadow.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  left: { width: 44, alignItems: 'flex-start' },
  center: { flex: 1, alignItems: 'center' },
  right: { width: 80, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  logo: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  logoText: { color: Colors.white, fontSize: FontSize.md, fontWeight: FontWeight.bold },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.navy },
  titleLight: { color: Colors.white },
  subtitle: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 1 },
  subtitleLight: { color: Colors.white + 'CC' },
  badge: {
    position: 'absolute', top: 2, right: 2,
    backgroundColor: Colors.danger,
    borderRadius: 8, minWidth: 16, height: 16,
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: Colors.white, fontSize: 9, fontWeight: FontWeight.bold },
});
