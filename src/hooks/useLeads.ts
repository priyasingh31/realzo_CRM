import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import {
  fetchLeads, getLead, createLead, updateLead, updateLeadStatus,
  deleteLead, fetchLeadActivities, addLeadActivity, assignLead,
} from '@/services/leadsService';
import { LeadFormData, LeadStatus, LeadActivity } from '@/types';

export const LEADS_QUERY_KEY = ['leads'] as const;
export const LEAD_QUERY_KEY = (id: string) => ['lead', id] as const;
export const LEAD_ACTIVITIES_KEY = (id: string) => ['lead-activities', id] as const;

export function useLeads() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: LEADS_QUERY_KEY,
    queryFn: () =>
      fetchLeads({ agentId: user?.uid, role: user?.role }),
    staleTime: 30_000,
    enabled: !!user,
  });
}

export function useLead(id: string) {
  return useQuery({
    queryKey: LEAD_QUERY_KEY(id),
    queryFn: () => getLead(id),
    staleTime: 60_000,
    enabled: !!id,
  });
}

export function useLeadActivities(leadId: string) {
  return useQuery({
    queryKey: LEAD_ACTIVITIES_KEY(leadId),
    queryFn: () => fetchLeadActivities(leadId),
    staleTime: 15_000,
    enabled: !!leadId,
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: (data: LeadFormData) =>
      createLead(data, user!.uid),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY }),
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<import('@/types').Lead> }) =>
      updateLead(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: LEAD_QUERY_KEY(id) });
    },
  });
}

export function useUpdateLeadStatus() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: LeadStatus }) =>
      updateLeadStatus(id, status),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: LEAD_QUERY_KEY(id) });
    },
  });
}

export function useDeleteLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteLead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY }),
  });
}

export function useAddLeadActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId,
      activity,
    }: {
      leadId: string;
      activity: Omit<LeadActivity, 'id' | 'leadId' | 'createdAt'>;
    }) => addLeadActivity(leadId, activity),
    onSuccess: (_data, { leadId }) => {
      qc.invalidateQueries({ queryKey: LEAD_ACTIVITIES_KEY(leadId) });
      qc.invalidateQueries({ queryKey: LEAD_QUERY_KEY(leadId) });
    },
  });
}

export function useAssignLead() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      leadId, agentId, agentName,
    }: { leadId: string; agentId: string; agentName: string }) =>
      assignLead(leadId, agentId, agentName),
    onSuccess: () => qc.invalidateQueries({ queryKey: LEADS_QUERY_KEY }),
  });
}
