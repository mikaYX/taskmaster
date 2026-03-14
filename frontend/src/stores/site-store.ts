import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserSite } from '@/api/types';

interface SiteState {
    currentSiteId: number | null;
    availableSites: UserSite[];

    setCurrentSiteId: (siteId: number | null) => void;
    initFromUserSites: (sites: UserSite[]) => void;
    reset: () => void;
}

export const useSiteStore = create<SiteState>()(
    persist(
        (set, get) => ({
            currentSiteId: null,
            availableSites: [],

            setCurrentSiteId: (siteId) => set({ currentSiteId: siteId }),

            initFromUserSites: (sites) => {
                const current = get().currentSiteId;
                const validIds = sites.map((s) => s.siteId);

                set({ availableSites: sites });

                if (current && validIds.includes(current)) return;

                const defaultSite = sites.find((s) => s.isDefault);
                set({ currentSiteId: defaultSite?.siteId || sites[0]?.siteId || null });
            },

            reset: () => set({ currentSiteId: null, availableSites: [] }),
        }),
        {
            name: 'taskmaster-site',
            partialize: (state) => ({
                currentSiteId: state.currentSiteId,
            }),
        }
    )
);
