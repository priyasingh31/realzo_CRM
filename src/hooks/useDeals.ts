import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import {
  fetchDeals, getDeal, createDeal, updateDeal, updateDealStage,
} from '@/services/dealsService';
import { DealFormData, DealStage } from '@/types';

export const DEALS_QUERY_KEY = ['deals'] as const;
export const DEAL_QUERY_KEY = (id: string) => ['deal', id] as const;

export function useDeals() {
  const { user } = useAuthStore();

  return useQuery({
    queryKey: DEALS_QUERY_KEY,
    queryFn: () => fetchDeals({ agentId: user?.uid, role: user?.role }),
    staleTime: 30_000,
    enabled: !!user,
  });
}

export function useDeal(id: string) {
  return useQuery({
    queryKey: DEAL_QUERY_KEY(id),
    queryFn: () => getDeal(id),
    enabled: !!id,
  });
}

export function useCreateDeal() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: (data: DealFormData) =>
      createDeal(data, user!.uid, user!.displayName),
    onSuccess: () => qc.invalidateQueries({ queryKey: DEALS_QUERY_KEY }),
  });
}

export function useUpdateDeal() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<import('@/types').Deal> }) =>
      updateDeal(id, data),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: DEALS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: DEAL_QUERY_KEY(id) });
    },
  });
}

export function useUpdateDealStage() {
  const qc = useQueryClient();
  const { user } = useAuthStore();

  return useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: DealStage }) =>
      updateDealStage(id, stage, user!.uid),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: DEALS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: DEAL_QUERY_KEY(id) });
    },
  });
}

// ─── Kanban Grouped ───────────────────────────────────────────────────────────
export function useKanbanDeals() {
  const { data: deals = [], ...rest } = useDeals();

  const stages = ['new', 'contacted', 'site_visit', 'negotiation', 'Booked', 'closed_lost'] as DealStage[];

  const grouped = stages.reduce((acc, stage) => {
    acc[stage] = deals.filter((d) => d.stage === stage);
    return acc;
  }, {} as Record<DealStage, typeof deals>);

  const totalValue = deals
    .filter((d) => d.stage !== 'closed_lost')
    .reduce((sum, d) => sum + d.value, 0);

  return { grouped, totalValue, deals, ...rest };
}
