import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Header } from '@/components/ui/Header';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { LEAD_SOURCES } from '@/constants/theme';
import { LeadSource } from '@/types';

export default function LeadSourcesScreen() {
  const insets = useSafeAreaInsets();
  const [counts, setCounts]   = useState<Partial<Record<LeadSource, number>>>({});
  const [total, setTotal]     = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getDocs(query(collection(db, 'leads')))
      .then(snap => {
        const c: Partial<Record<LeadSource, number>> = {};
        snap.docs.forEach(d => {
          const src = d.data().source as LeadSource;
          if (src) c[src] = (c[src] ?? 0) + 1;
        });
        setCounts(c);
        setTotal(snap.size);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <View style={styles.screen}>
      <Header title="Lead Sources" showBack />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.description}>
          All channels through which leads enter your CRM. Lead counts below are live from Firestore.
        </Text>

        {loading ? (
          <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.card}>
            {LEAD_SOURCES.map((src, idx) => {
              const count = counts[src.key as LeadSource] ?? 0;
              const pct   = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <View key={src.key} style={[styles.row, idx > 0 && styles.rowBorder]}>
                  {/* Icon */}
                  <View style={[styles.iconCircle, { backgroundColor: src.color + '18' }]}>
                    <Ionicons name={src.icon as any} size={18} color={src.color} />
                  </View>

                  {/* Label + bar */}
                  <View style={styles.info}>
                    <View style={styles.labelRow}>
                      <Text style={styles.label}>{src.label}</Text>
                      <Text style={styles.countText}>{count} lead{count !== 1 ? 's' : ''}</Text>
                    </View>
                    <View style={styles.barTrack}>
                      <View style={[styles.barFill, { width: `${Math.max(pct, count > 0 ? 2 : 0)}%` as any, backgroundColor: src.color }]} />
                    </View>
                    <Text style={styles.pctText}>{pct}% of total</Text>
                  </View>
                </View>
              );
            })}

            {/* Total row */}
            <View style={[styles.totalRow]}>
              <Ionicons name="layers-outline" size={16} color={Colors.gray500} />
              <Text style={styles.totalLabel}>Total leads</Text>
              <Text style={styles.totalCount}>{total}</Text>
            </View>
          </View>
        )}

        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.accent} />
          <Text style={styles.infoText}>
            Meta Ads and Facebook leads are synced automatically. Use "Upload Leads" on the leads page to bulk-import from Excel/CSV.
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

  card:        { backgroundColor: Colors.white, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.gray100, overflow: 'hidden' },
  row:         { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, padding: Spacing.base },
  rowBorder:   { borderTopWidth: 1, borderTopColor: Colors.gray100 },
  iconCircle:  { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  info:        { flex: 1 },
  labelRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  label:       { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.navy },
  countText:   { fontSize: FontSize.xs, color: Colors.gray500, fontWeight: FontWeight.medium },
  barTrack:    { height: 4, backgroundColor: Colors.gray100, borderRadius: 2, overflow: 'hidden' },
  barFill:     { height: 4, borderRadius: 2 },
  pctText:     { fontSize: FontSize.xs, color: Colors.gray400, marginTop: 3 },

  totalRow:    { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, padding: Spacing.base, borderTopWidth: 2, borderTopColor: Colors.gray100, backgroundColor: Colors.gray50 },
  totalLabel:  { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.semibold, color: Colors.gray600 },
  totalCount:  { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },

  infoBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: Colors.accentLight, borderRadius: Radius.md, padding: Spacing.md },
  infoText:    { flex: 1, fontSize: FontSize.xs, color: Colors.accent, lineHeight: 18 },
});
