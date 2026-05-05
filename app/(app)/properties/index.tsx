import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProperties } from '@/hooks/useProperties';
import { PropertyCard } from '@/components/properties/PropertyCard';
import { Header } from '@/components/ui/Header';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing } from '@/constants/theme';
import { PropertyStatus, PropertyType } from '@/types';
import { PROPERTY_TYPES } from '@/constants/theme';

const STATUS_FILTERS: { key: PropertyStatus | 'all'; label: string; color: string }[] = [
  { key: 'all', label: 'All', color: Colors.navy },
  { key: 'available', label: 'Available', color: Colors.success },
  { key: 'under_offer', label: 'Under Offer', color: Colors.warning },
  { key: 'sold', label: 'Sold', color: Colors.danger },
  { key: 'reserved', label: 'Reserved', color: '#7C3AED' },
];

export default function PropertiesScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<PropertyStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<PropertyType | 'all'>('all');
  const [view, setView] = useState<'list' | 'grid'>('list');

  const { data: properties = [], isLoading, refetch } = useProperties();

  const filtered = useMemo(() => {
    let result = properties;
    if (statusFilter !== 'all') result = result.filter((p) => p.status === statusFilter);
    if (typeFilter !== 'all') result = result.filter((p) => p.type === typeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((p) =>
        p.title.toLowerCase().includes(q) ||
        p.location.toLowerCase().includes(q)
      );
    }
    return result;
  }, [properties, statusFilter, typeFilter, search]);

  const availableCount = properties.filter((p) => p.status === 'available').length;

  return (
    <View style={styles.screen}>
      <Header
        title="Properties"
        subtitle={`${availableCount} available`}
        rightAction={{ icon: 'add-circle-outline', onPress: () => router.push('/(app)/properties/new') }}
        rightAction2={{ icon: view === 'list' ? 'grid-outline' : 'list-outline', onPress: () => setView(view === 'list' ? 'grid' : 'list') }}
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={18} color={Colors.gray400} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by title or location..."
            placeholderTextColor={Colors.gray400}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={Colors.gray400} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Status Filter */}
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            onPress={() => setStatusFilter(f.key)}
            style={[
              styles.filterChip,
              statusFilter === f.key && { backgroundColor: f.color + '15', borderColor: f.color },
            ]}
          >
            <Text style={[styles.filterLabel, statusFilter === f.key && { color: f.color, fontWeight: FontWeight.semibold }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Type Filter */}
      <View style={styles.typeRow}>
        <TouchableOpacity
          onPress={() => setTypeFilter('all')}
          style={[styles.typeChip, typeFilter === 'all' && styles.typeChipActive]}
        >
          <Text style={[styles.typeLabel, typeFilter === 'all' && styles.typeLabelActive]}>All Types</Text>
        </TouchableOpacity>
        {PROPERTY_TYPES.map((t) => (
          <TouchableOpacity
            key={t.key}
            onPress={() => setTypeFilter(typeFilter === t.key ? 'all' : t.key)}
            style={[styles.typeChip, typeFilter === t.key && styles.typeChipActive]}
          >
            <Ionicons name={t.icon as any} size={12} color={typeFilter === t.key ? Colors.white : Colors.gray500} />
            <Text style={[styles.typeLabel, typeFilter === t.key && styles.typeLabelActive]}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Count */}
      <View style={styles.countRow}>
        <Text style={styles.countText}>{filtered.length} propert{filtered.length !== 1 ? 'ies' : 'y'}</Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <PropertyCard property={item} compact={view === 'list'} />}
        numColumns={view === 'grid' ? 2 : 1}
        key={view} // Re-render on view change
        columnWrapperStyle={view === 'grid' ? { gap: Spacing.sm } : undefined}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 80 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor={Colors.primary} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="home-outline" size={48} color={Colors.gray200} />
            <Text style={styles.emptyTitle}>No properties found</Text>
            <Text style={styles.emptySubtext}>
              {search ? 'Try a different search' : 'Add your first property listing'}
            </Text>
          </View>
        }
      />

      <TouchableOpacity
        onPress={() => router.push('/(app)/properties/new')}
        style={[styles.fab, { bottom: insets.bottom + 80 }]}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  searchWrap: { paddingHorizontal: Spacing.base, paddingVertical: Spacing.sm },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.white, borderRadius: Radius.full, paddingHorizontal: Spacing.md, borderWidth: 1, borderColor: Colors.gray200, height: 44 },
  searchInput: { flex: 1, fontSize: FontSize.base, color: Colors.gray800 },
  filterRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.xs, marginBottom: Spacing.xs },
  filterChip: { paddingHorizontal: Spacing.sm, paddingVertical: 5, borderRadius: Radius.full, backgroundColor: Colors.gray100, borderWidth: 1, borderColor: Colors.gray100 },
  filterLabel: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, color: Colors.gray600 },
  typeRow: { flexDirection: 'row', paddingHorizontal: Spacing.base, gap: Spacing.xs, marginBottom: Spacing.sm, flexWrap: 'wrap' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full, backgroundColor: Colors.white, borderWidth: 1, borderColor: Colors.gray200 },
  typeChipActive: { backgroundColor: Colors.navy, borderColor: Colors.navy },
  typeLabel: { fontSize: FontSize.xs, color: Colors.gray500 },
  typeLabelActive: { color: Colors.white, fontWeight: FontWeight.medium },
  countRow: { paddingHorizontal: Spacing.base, paddingBottom: Spacing.xs },
  countText: { fontSize: FontSize.sm, color: Colors.gray500 },
  list: { paddingHorizontal: Spacing.base, paddingTop: 4 },
  empty: { alignItems: 'center', paddingVertical: Spacing['4xl'] },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: FontWeight.semibold, color: Colors.gray600, marginTop: Spacing.base },
  emptySubtext: { fontSize: FontSize.sm, color: Colors.gray400, marginTop: Spacing.xs },
  fab: { position: 'absolute', right: Spacing.lg, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8 },
});
