import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Deal } from '@/types';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, Shadow, formatCurrency } from '@/constants/theme';

interface DealCardProps {
  deal: Deal;
  onPress?: () => void;
  onStageChange?: (deal: Deal) => void;
}

export function DealCard({ deal, onPress, onStageChange }: DealCardProps) {
  const probColor = deal.probability != null
    ? deal.probability >= 75 ? Colors.success
    : deal.probability >= 50 ? Colors.warning
    : Colors.danger
    : Colors.gray300;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.card}>
      {/* Title */}
      <Text style={styles.title} numberOfLines={2}>{deal.title}</Text>

      {/* Lead name */}
      <View style={styles.row}>
        <Ionicons name="person-outline" size={12} color={Colors.gray400} />
        <Text style={styles.meta} numberOfLines={1}>{deal.leadName}</Text>
      </View>

      {/* Property */}
      {deal.propertyName && (
        <View style={styles.row}>
          <Ionicons name="home-outline" size={12} color={Colors.gray400} />
          <Text style={styles.meta} numberOfLines={1}>{deal.propertyName}</Text>
        </View>
      )}

      {/* Value + Probability */}
      <View style={styles.bottomRow}>
        <Text style={styles.value}>{formatCurrency(deal.value)}</Text>
        {deal.probability != null && (
          <View style={[styles.probChip, { backgroundColor: probColor + '15' }]}>
            <Text style={[styles.probText, { color: probColor }]}>{deal.probability}%</Text>
          </View>
        )}
      </View>

      {/* Agent */}
      <Text style={styles.agent} numberOfLines={1}>{deal.assignedAgentName}</Text>

      {/* Expected close */}
      {deal.expectedCloseDate && (
        <View style={styles.closeRow}>
          <Ionicons name="calendar-outline" size={11} color={Colors.gray400} />
          <Text style={styles.closeDate}>
            {new Date(deal.expectedCloseDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray100,
    ...Shadow.sm,
    width: 220,
  },
  title: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semibold,
    color: Colors.navy,
    marginBottom: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 3,
  },
  meta: { fontSize: FontSize.xs, color: Colors.gray500, flex: 1 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.xs,
  },
  value: { fontSize: FontSize.sm, fontWeight: FontWeight.bold, color: Colors.navy },
  probChip: {
    paddingHorizontal: Spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: Radius.full,
  },
  probText: { fontSize: FontSize.xs, fontWeight: FontWeight.semibold },
  agent: { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 4 },
  closeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3 },
  closeDate: { fontSize: FontSize.xs, color: Colors.gray400 },
});
