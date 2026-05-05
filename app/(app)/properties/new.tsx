import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Toast from 'react-native-toast-message';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useCreateProperty } from '@/hooks/useProperties';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { Header } from '@/components/ui/Header';
import { Colors } from '@/constants/colors';
import { FontSize, FontWeight, Radius, Spacing, PROPERTY_TYPES } from '@/constants/theme';
import { PropertyType } from '@/types';

const schema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters'),
  type: z.enum(['apartment', 'villa', 'townhouse', 'plot', 'commercial', 'office'] as const),
  price: z.string().min(1, 'Price is required'),
  location: z.string().min(3, 'Location is required'),
  area: z.string().min(1, 'Area is required'),
  bedrooms: z.string().optional(),
  bathrooms: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

export default function NewPropertyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { mutateAsync: createProperty, isPending } = useCreateProperty();

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'apartment' },
  });

  const selectedType = watch('type');

  const onSubmit = async (data: FormData) => {
    try {
      const propId = await createProperty({
        title: data.title,
        type: data.type,
        status: 'available',
        price: parseFloat(data.price),
        location: data.location,
        area: parseFloat(data.area),
        bedrooms: data.bedrooms ? parseInt(data.bedrooms) : undefined,
        bathrooms: data.bathrooms ? parseInt(data.bathrooms) : undefined,
        description: data.description || undefined,
      });
      Toast.show({ type: 'success', text1: 'Property Created', text2: `${data.title} added successfully` });
      router.replace(`/(app)/properties/${propId}`);
    } catch {
      Toast.show({ type: 'error', text1: 'Error', text2: 'Failed to create property' });
    }
  };

  return (
    <View style={styles.screen}>
      <Header title="New Property" showBack />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>Property Type</Text>
        <View style={styles.typeGrid}>
          {PROPERTY_TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              onPress={() => setValue('type', t.key)}
              style={[styles.typeBtn, selectedType === t.key && styles.typeBtnActive]}
            >
              <Ionicons name={t.icon as any} size={22} color={selectedType === t.key ? Colors.primary : Colors.gray400} />
              <Text style={[styles.typeLabel, selectedType === t.key && styles.typeLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Property Details</Text>
        <Controller control={control} name="title"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input label="Property Title" placeholder="e.g. Marina Heights 2BR" value={value} onChangeText={onChange} onBlur={onBlur} leftIcon="home-outline" error={errors.title?.message} required />
          )}
        />
        <Controller control={control} name="location"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input label="Location" placeholder="e.g. Dubai Marina, Dubai" value={value} onChangeText={onChange} onBlur={onBlur} leftIcon="location-outline" error={errors.location?.message} required />
          )}
        />
        <Controller control={control} name="price"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input label="Price (AED)" placeholder="e.g. 1500000" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="numeric" leftIcon="cash-outline" error={errors.price?.message} required />
          )}
        />
        <Controller control={control} name="area"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input label="Area (sq ft)" placeholder="e.g. 1200" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="numeric" leftIcon="square-outline" error={errors.area?.message} required />
          )}
        />

        <View style={styles.row}>
          <View style={styles.halfInput}>
            <Controller control={control} name="bedrooms"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Bedrooms" placeholder="e.g. 2" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="numeric" leftIcon="bed-outline" />
              )}
            />
          </View>
          <View style={styles.halfInput}>
            <Controller control={control} name="bathrooms"
              render={({ field: { value, onChange, onBlur } }) => (
                <Input label="Bathrooms" placeholder="e.g. 2" value={value} onChangeText={onChange} onBlur={onBlur} keyboardType="numeric" leftIcon="water-outline" />
              )}
            />
          </View>
        </View>

        <Controller control={control} name="description"
          render={({ field: { value, onChange, onBlur } }) => (
            <Input label="Description" placeholder="Describe the property..." value={value} onChangeText={onChange} onBlur={onBlur} multiline numberOfLines={4} leftIcon="document-text-outline" />
          )}
        />

        <Button title="Create Property" onPress={handleSubmit(onSubmit)} loading={isPending} fullWidth size="lg" icon="checkmark-outline" style={styles.submitBtn} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.gray50 },
  content: { padding: Spacing.base },
  sectionTitle: { fontSize: FontSize.base, fontWeight: FontWeight.bold, color: Colors.navy, marginTop: Spacing.base, marginBottom: Spacing.md },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.base },
  typeBtn: { width: '30%', alignItems: 'center', paddingVertical: Spacing.md, borderRadius: Radius.md, backgroundColor: Colors.white, borderWidth: 1.5, borderColor: Colors.gray200 },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: Colors.primaryLight },
  typeLabel: { fontSize: FontSize.xs, color: Colors.gray500, marginTop: 4 },
  typeLabelActive: { color: Colors.primary, fontWeight: FontWeight.semibold },
  row: { flexDirection: 'row', gap: Spacing.sm },
  halfInput: { flex: 1 },
  submitBtn: { marginTop: Spacing.lg },
});
