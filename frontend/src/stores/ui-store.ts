import { create } from 'zustand';

/**
 * UI State Interface.
 */
interface UIState {
    // Sidebar state
    sidebarOpen: boolean;
    sidebarCollapsed: boolean;

    // Actions
    setSidebarOpen: (open: boolean) => void;
    toggleSidebar: () => void;
    setSidebarCollapsed: (collapsed: boolean) => void;
    isTvMode: boolean;
    setIsTvMode: (isTvMode: boolean) => void;
}

/**
 * UI Store.
 * 
 * Zustand store for UI state (sidebar, modals, etc.).
 */
export const useUIStore = create<UIState>()((set) => ({
    // Initial state
    sidebarOpen: true,
    sidebarCollapsed: false,

    // Actions
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
    setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
    isTvMode: false,
    setIsTvMode: (isTvMode) => set({ isTvMode }),
}));
