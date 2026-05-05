import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, Shadow } from '@/constants/theme';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  trend?: { value: number; label: string };
  color?: string;
  gradient?: [string, string];
  style?: ViewStyle;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  color = Colors.primary,
  gradient,
  style,
}: MetricCardProps) {
  const isPositiveTrend = trend && trend.value >= 0;
  const trendColor = isPositiveTrend ? Colors.success : Colors.danger;
  const trendIcon = isPositiveTrend ? 'trending-up' : 'trending-down';

  const content = (
    <>
      {/* Icon */}
      <View style={[styles.iconCircle, { backgroundColor: color + '20' }]}>
        <Ionicons name={icon} size={22} color={gradient ? Colors.white : color} />
      </View>

      {/* Value */}
      <Text style={[styles.value, gradient && styles.valueLight]}>{value}</Text>

      {/* Title */}
      <Text style={[styles.title, gradient && styles.titleLight]} numberOfLines={1}>{title}</Text>

      {/* Subtitle */}
      {subtitle && (
        <Text style={[styles.subtitle, gradient && styles.subtitleLight]} numberOfLines={1}>
          {subtitle}
        </Text>
      )}

      {/* Trend */}
      {trend && (
        <View style={styles.trendRow}>
          <Ionicons name={trendIcon} size={12} color={gradient ? Colors.white + 'CC' : trendColor} />
          <Text style={[styles.trendText, gradient ? { color: Colors.white + 'CC' } : { color: trendColor }]}>
            {isPositiveTrend ? '+' : ''}{trend.value}% {trend.label}
          </Text>
        </View>
      )}
    </>
  );

  if (gradient) {
    return (
      <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.card, styles.gradientCard, style]}>
        {content}
      </LinearGradient>
    );
  }

  return (
    <View style={[styles.card, style]}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray100,
    ...Shadow.md,
  },
  gradientCard: {
    borderWidth: 0,
  },
  iconCircle: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  value: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: Colors.navy,
    marginBottom: 2,
  },
  valueLight: { color: Colors.white },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: Colors.gray500,
  },
  titleLight: { color: Colors.white + 'CC' },
  subtitle: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 2 },
  subtitleLight: { color: Colors.white + '99' },
  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: Spacing.xs },
  trendText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },
});
