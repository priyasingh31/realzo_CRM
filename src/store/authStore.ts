import { create } from 'zustand';
import { User } from '@/types';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  setUser: (user) =>
    set({ user, isAuthenticated: !!user, isLoading: false }),

  setLoading: (isLoading) => set({ isLoading }),

  logout: () =>
    set({ user: null, isAuthenticated: false, isLoading: false }),
}));

// Role check helpers
export const useIsAdmin = () => useAuthStore((s) => s.user?.role === 'admin');
export const useIsManager = () =>
  useAuthStore((s) => s.user?.role === 'admin' || s.user?.role === 'manager');
export const useCurrentUser = () => useAuthStore((s) => s.user);
export const useUserRole = () => useAuthStore((s) => s.user?.role ?? 'agent');
