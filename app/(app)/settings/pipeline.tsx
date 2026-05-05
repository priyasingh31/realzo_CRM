import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header } from '@/components/ui/Header';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { DEAL_STAGES } from '@/constants/theme';

export default function PipelineStagesScreen() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <Header title="Pipeline Stages" showBack />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.description}>
          Leads move through these stages as your sales team progresses each opportunity. Stages are applied across all projects.
        </Text>

        {/* Visual flow */}
        <View style={styles.flowCard}>
          {DEAL_STAGES.map((stage, idx) => (
            <View key={stage.key}>
              <View style={styles.stageRow}>
                {/* Number badge */}
                <View style={[styles.numBadge, { backgroundColor: stage.color }]}>
                  <Text style={styles.numText}>{idx + 1}</Text>
                </View>

                {/* Icon circle */}
                <View style={[styles.iconCircle, { backgroundColor: stage.color + '18' }]}>
                  <Ionicons name={stage.icon as any} size={20} color={stage.color} />
                </View>

                {/* Stage info */}
                <View style={styles.stageInfo}>
                  <Text style={styles.stageLabel}>{stage.label}</Text>
                  <Text style={styles.stageKey}>{stage.key}</Text>
                </View>

                {/* Color swatch */}
                <View style={[styles.colorSwatch, { backgroundColor: stage.color }]} />
              </View>

              {/* Connector arrow (not after last) */}
              {idx < DEAL_STAGES.length - 1 && (
                <View style={styles.connector}>
                  <View style={[styles.connectorLine, { backgroundColor: DEAL_STAGES[idx + 1].color + '40' }]} />
                  <Ionicons name="chevron-down" size={12} color={Colors.gray300} style={styles.connectorArrow} />
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
          <Text style={styles.infoText}>
            Pipeline stages are shared across all projects. Leads automatically progress as sales persons update their status.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen:      { flex: 1, backgroundColor: Colors.gray50 },
  content:     { padding: Spacing.base, gap: Spacing.base },
  description: { fontSize: FontSize.sm, color: Colors.gray500, lineHeight: 20 },

  flowCard:    { backgroundColor: Colors.white, borderRadius: Radius.lg, padding: Spacing.base, borderWidth: 1, borderColor: Colors.gray100 },

  stageRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  numBadge:    { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  numText:     { fontSize: FontSize.xs, fontWeight: FontWeight.bold, color: Colors.white },
  iconCircle:  { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  stageInfo:   { flex: 1 },
  stageLabel:  { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.navy },
  stageKey:    { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 1, fontFamily: 'monospace' },
  colorSwatch: { width: 16, height: 16, borderRadius: 8 },

  connector:       { flexDirection: 'column', alignItems: 'center', paddingVertical: 2, marginLeft: 10 },
  connectorLine:   { width: 2, height: 10, borderRadius: 1 },
  connectorArrow:  { marginTop: -2 },

  infoBox:   { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.accentLight, borderRadius: Radius.md, padding: Spacing.md },
  infoText:  { flex: 1, fontSize: FontSize.xs, color: Colors.accent, lineHeight: 18 },
});
