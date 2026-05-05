import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, Dimensions, ActivityIndicator, TouchableOpacity, Linking } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useProperty } from '@/hooks/useProperties';
import { Header } from '@/components/ui/Header';
import { PropertyStatusBadge } from '@/components/ui/Badge';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, formatCurrency } from '@/constants/theme';
import { PROPERTY_TYPES } from '@/constants/theme';

const { width } = Dimensions.get('window');

export default function PropertyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { data: property, isLoading } = useProperty(id);

  if (isLoading || !property) {
    return (
      <View style={[styles.screen, styles.centered]}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  const typeInfo = PROPERTY_TYPES.find((t) => t.key === property.type);

  return (
    <View style={styles.screen}>
      <Header title={property.title} showBack rightAction={{ icon: 'share-outline', onPress: () => {} }} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Images */}
        {(property.images?.length ?? 0) > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageScroll}>
            {property.images!.map((img, i) => (
              <Image key={i} source={{ uri: img }} style={styles.image} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="home-outline" size={48} color={Colors.gray300} />
            <Text style={styles.noImageText}>No images uploaded</Text>
          </View>
        )}

        {/* Status & Price */}
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.price}>{formatCurrency(property.price)}</Text>
            <View style={styles.typeRow}>
              <Ionicons name={typeInfo?.icon as any ?? 'home-outline'} size={14} color={Colors.gray500} />
              <Text style={styles.type}>{typeInfo?.label ?? property.type}</Text>
            </View>
          </View>
          <PropertyStatusBadge status={property.status} />
        </View>

        {/* Location */}
        <View style={styles.locationCard}>
          <Ionicons name="location-outline" size={18} color={Colors.primary} />
          <Text style={styles.location}>{property.location}</Text>
        </View>

        {/* Specs */}
        <View style={styles.specsCard}>
          {property.area != null && <SpecItem icon="square-outline" label="Area" value={`${property.area.toLocaleString()} sqft`} />}
          {property.bedrooms != null && (
            <SpecItem icon="bed-outline" label="Bedrooms" value={String(property.bedrooms)} />
          )}
          {property.bathrooms != null && (
            <SpecItem icon="water-outline" label="Bathrooms" value={String(property.bathrooms)} />
          )}
          <SpecItem icon="pricetag-outline" label="Status" value={property.status.replace(/_/g, ' ')} />
        </View>

        {/* Description */}
        {property.description && (
          <View style={styles.descCard}>
            <Text style={styles.descTitle}>Description</Text>
            <Text style={styles.descText}>{property.description}</Text>
          </View>
        )}

        {/* Amenities */}
        {property.amenities && property.amenities.length > 0 && (
          <View style={styles.descCard}>
            <Text style={styles.descTitle}>Amenities</Text>
            <View style={styles.amenitiesGrid}>
              {property.amenities.map((a, i) => (
                <View key={i} style={styles.amenityChip}>
                  <Ionicons name="checkmark-circle" size={14} color={Colors.primary} />
                  <Text style={styles.amenityText}>{a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.primary }]}>
            <Ionicons name="share-outline" size={18} color={Colors.white} />
            <Text style={styles.actionBtnText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtn, { backgroundColor: Colors.accent }]}>
            <Ionicons name="calendar-outline" size={18} color={Colors.white} />
            <Text style={styles.actionBtnText}>Book Visit</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function SpecItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.specItem}>
      <Ionicons name={icon as any} size={20} color={Colors.primary} />
      <Text style={styles.specValue}>{value}</Text>
      <Text style={styles.specLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  content: { gap: Spacing.sm },
  imageScroll: { marginBottom: Spacing.xs },
  image: { width: width - Spacing.base * 2, height: 220, borderRadius: Radius.lg, marginLeft: Spacing.base, marginRight: Spacing.xs },
  imagePlaceholder: { height: 180, backgroundColor: Colors.gray100, borderRadius: Radius.lg, marginHorizontal: Spacing.base, alignItems: 'center', justifyContent: 'center' },
  noImageText: { fontSize: FontSize.sm, color: Colors.gray400, marginTop: Spacing.xs },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.base, paddingTop: Spacing.sm },
  price: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, color: Colors.navy },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  type: { fontSize: FontSize.sm, color: Colors.gray500 },
  locationCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.white, marginHorizontal: Spacing.base, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray100 },
  location: { fontSize: FontSize.base, color: Colors.gray700, flex: 1 },
  specsCard: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: Colors.white, marginHorizontal: Spacing.base, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray100 },
  specItem: { alignItems: 'center', gap: 4 },
  specValue: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy },
  specLabel: { fontSize: FontSize.xs, color: Colors.gray500 },
  descCard: { backgroundColor: Colors.white, marginHorizontal: Spacing.base, borderRadius: Radius.md, padding: Spacing.md, borderWidth: 1, borderColor: Colors.gray100 },
  descTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy, marginBottom: Spacing.sm },
  descText: { fontSize: FontSize.sm, color: Colors.gray700, lineHeight: 22 },
  amenitiesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  amenityChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primaryLight, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: Radius.full },
  amenityText: { fontSize: FontSize.xs, color: Colors.primary },
  actionsRow: { flexDirection: 'row', gap: Spacing.sm, paddingHorizontal: Spacing.base, paddingTop: Spacing.xs },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.md, borderRadius: Radius.lg },
  actionBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.white },
});
