import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import {
  fetchProperties, getProperty, createProperty, updateProperty, updatePropertyStatus,
} from '@/services/propertiesService';
import { PropertyFormData, PropertyStatus } from '@/types';

export const PROPERTIES_QUERY_KEY = ['properties'] as const;
export const PROPERTY_QUERY_KEY = (id: string) => ['property', id] as const;

export function useProperties() {
  return useQuery({
    queryKey: PROPERTIES_QUERY_KEY,
    queryFn: () => fetchProperties(),
    staleTime: 60_000,
  });
}

export function useAvailableProperties() {
  return useQuery({
    queryKey: [...PROPERTIES_QUERY_KEY, 'available'],
    queryFn: () => fetchProperties({ status: 'available' }),
    staleTime: 60_000,
  });
}

export function useProperty(id: string) {
  return useQuery({
    queryKey: PROPERTY_QUERY_KEY(id),
    queryFn: () => getProperty(id),
    enabled: !!id,
  });
}

export function useCreateProperty() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: (data: PropertyFormData) =>
      createProperty(data, user!.uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROPERTIES_QUERY_KEY }),
  });
}

export function useUpdateProperty() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<import('@/types').Property> }) =>
      updateProperty(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: PROPERTIES_QUERY_KEY });
      qc.invalidateQueries({ queryKey: PROPERTY_QUERY_KEY(id) });
    },
  });
}

export function useUpdatePropertyStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: PropertyStatus }) =>
      updatePropertyStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: PROPERTIES_QUERY_KEY }),
  });
}
