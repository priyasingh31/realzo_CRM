import { create } from 'zustand';
import { AppNotification as Notification } from '@/types';

interface AppState {
  notifications: Notification[];
  unreadCount: number;
  isOnline: boolean;
  searchQuery: string;
  selectedFilter: string | null;

  addNotification: (n: Notification) => void;
  markNotificationRead: (id: string) => void;
  markAllRead: () => void;
  setOnline: (online: boolean) => void;
  setSearchQuery: (q: string) => void;
  setFilter: (f: string | null) => void;
  clearSearch: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOnline: true,
  searchQuery: '',
  selectedFilter: null,

  addNotification: (n) =>
    set((state) => ({
      notifications: [n, ...state.notifications].slice(0, 50),
      unreadCount: state.unreadCount + (n.read ? 0 : 1),
    })),

  markNotificationRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),

  markAllRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, read: true })),
      unreadCount: 0,
    })),

  setOnline: (isOnline) => set({ isOnline }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setFilter: (selectedFilter) => set({ selectedFilter }),
  clearSearch: () => set({ searchQuery: '', selectedFilter: null }),
}));
