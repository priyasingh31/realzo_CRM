import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { format } from 'date-fns';
import { Lead } from '@/types';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, Shadow, formatCurrency, getAIScoreColor } from '@/constants/theme';
import { LeadStatusBadge, LeadSourceBadge } from '@/components/ui/Badge';

interface LeadCardProps {
  lead: Lead;
  onPress?: () => void;
}

export function LeadCard({ lead, onPress }: LeadCardProps) {
  const router = useRouter();

  const handlePress = () => {
    if (onPress) onPress();
    else router.push(`/(app)/leads/${lead.id}`);
  };

  const scoreColor = lead.aiScore ? getAIScoreColor(lead.aiScore) : Colors.gray300;

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.85} style={styles.card}>
      {/* Header Row */}
      <View style={styles.headerRow}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{lead.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.name} numberOfLines={1}>{lead.name}</Text>
          <Text style={styles.phone}>{lead.phone}</Text>
        </View>
        {lead.aiScore != null && (
          <View style={[styles.scoreChip, { backgroundColor: scoreColor + '18' }]}>
            <Ionicons name="sparkles" size={11} color={scoreColor} />
            <Text style={[styles.scoreText, { color: scoreColor }]}>{lead.aiScore}/10</Text>
          </View>
        )}
      </View>

      {/* Badges */}
      <View style={styles.badgeRow}>
        <LeadStatusBadge status={lead.status} />
        <View style={styles.badgeGap} />
        <LeadSourceBadge source={lead.source} />
      </View>

      {/* Info Row */}
      <View style={styles.infoRow}>
        {lead.budget ? (
          <View style={styles.infoItem}>
            <Ionicons name="cash-outline" size={13} color={Colors.gray400} />
            <Text style={styles.infoText}>{formatCurrency(lead.budget)}</Text>
          </View>
        ) : null}
        {(lead.preferredLocation || lead.location) ? (
          <View style={styles.infoItem}>
            <Ionicons name="location-outline" size={13} color={Colors.gray400} />
            <Text style={styles.infoText} numberOfLines={1}>{lead.preferredLocation || lead.location}</Text>
          </View>
        ) : null}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.date}>
          {format(new Date(lead.createdAt), 'dd MMM yyyy')}
        </Text>
        {lead.assignedToName && (
          <Text style={styles.agent}>
            <Ionicons name="person-outline" size={11} /> {lead.assignedToName}
          </Text>
        )}
        <Ionicons name="chevron-forward" size={16} color={Colors.gray300} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray100,
    ...Shadow.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: Colors.primaryLight,
    alignItems: 'center', justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  avatarText: { fontSize: FontSize.md, fontWeight: FontWeight.bold, color: Colors.primary },
  headerInfo: { flex: 1 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.navy },
  phone: { fontSize: FontSize.sm, color: Colors.gray500, marginTop: 2 },
  scoreChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: Spacing.sm, paddingVertical: 3,
    borderRadius: Radius.full,
  },
  scoreText: { fontSize: FontSize.xs, fontWeight: FontWeight.bold },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: Spacing.sm },
  badgeGap: { width: Spacing.xs },
  infoRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.sm },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  infoText: { fontSize: FontSize.xs, color: Colors.gray500 },
  footer: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: Colors.gray100, paddingTop: Spacing.sm },
  date: { fontSize: FontSize.xs, color: Colors.gray400, flex: 1 },
  agent: { fontSize: FontSize.xs, color: Colors.gray500, marginRight: Spacing.sm },
});
