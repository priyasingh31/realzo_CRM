import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Property } from '@/types';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, Shadow, formatCurrency } from '@/constants/theme';
import { PropertyStatusBadge } from '@/components/ui/Badge';

interface PropertyCardProps {
  property: Property;
  compact?: boolean;
}

export function PropertyCard({ property, compact = false }: PropertyCardProps) {
  const router = useRouter();

  return (
    <TouchableOpacity
      onPress={() => router.push(`/(app)/properties/${property.id}`)}
      activeOpacity={0.88}
      style={[styles.card, compact && styles.compact]}
    >
      {/* Image */}
      <View style={[styles.imageWrap, compact && styles.compactImage]}>
        {(property.images?.length ?? 0) > 0 ? (
          <Image source={{ uri: property.images![0] }} style={styles.image} resizeMode="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Ionicons name="home-outline" size={compact ? 24 : 36} color={Colors.gray300} />
          </View>
        )}
        <View style={styles.statusOverlay}>
          <PropertyStatusBadge status={property.status} />
        </View>
      </View>

      {/* Info */}
      <View style={[styles.info, compact && styles.compactInfo]}>
        <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={compact ? 1 : 2}>
          {property.title}
        </Text>

        <View style={styles.locationRow}>
          <Ionicons name="location-outline" size={12} color={Colors.gray400} />
          <Text style={styles.location} numberOfLines={1}>{property.location}</Text>
        </View>

        <Text style={[styles.price, compact && styles.priceCompact]}>
          {formatCurrency(property.price)}
        </Text>

        {!compact && (
          <View style={styles.specsRow}>
            {property.bedrooms != null && (
              <View style={styles.spec}>
                <Ionicons name="bed-outline" size={13} color={Colors.gray500} />
                <Text style={styles.specText}>{property.bedrooms}</Text>
              </View>
            )}
            {property.bathrooms != null && (
              <View style={styles.spec}>
                <Ionicons name="water-outline" size={13} color={Colors.gray500} />
                <Text style={styles.specText}>{property.bathrooms}</Text>
              </View>
            )}
            <View style={styles.spec}>
              <Ionicons name="square-outline" size={13} color={Colors.gray500} />
              <Text style={styles.specText}>{property.area?.toLocaleString() ?? '—'} sqft</Text>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.white,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray100,
    marginBottom: Spacing.md,
    ...Shadow.md,
  },
  compact: {
    flexDirection: 'row',
    height: 90,
  },
  imageWrap: { height: 160, width: '100%' },
  compactImage: { width: 90, height: 90 },
  image: { width: '100%', height: '100%' },
  imagePlaceholder: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.gray100,
  },
  statusOverlay: { position: 'absolute', top: Spacing.sm, left: Spacing.sm },
  info: { padding: Spacing.md },
  compactInfo: { flex: 1, padding: Spacing.sm, justifyContent: 'center' },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semibold, color: Colors.navy, marginBottom: 4 },
  titleCompact: { fontSize: FontSize.sm },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 4 },
  location: { fontSize: FontSize.xs, color: Colors.gray500, flex: 1 },
  price: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.primary, marginBottom: 6 },
  priceCompact: { fontSize: FontSize.sm },
  specsRow: { flexDirection: 'row', gap: Spacing.md },
  spec: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  specText: { fontSize: FontSize.xs, color: Colors.gray500 },
});
