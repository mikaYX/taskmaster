import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface InitialPreferences {
    todolistEnabled: boolean;
}

/**
 * Setup Wizard State Interface.
 */
interface SetupState {
    // Setup completion status
    isSetupComplete: boolean;
    currentStep: number;

    // Step data
    adminPasswordSet: boolean;
    preferencesSet: boolean;
    /** Preferences chosen in step 1, sent to backend when creating admin */
    initialPreferences: InitialPreferences;

    // Actions
    setStep: (step: number) => void;
    nextStep: () => void;
    prevStep: () => void;
    completeStep: (step: 'admin' | 'preferences') => void;
    setInitialPreferences: (prefs: Partial<InitialPreferences>) => void;
    completeSetup: () => void;
    resetSetup: () => void;
}

export const SETUP_STEPS = [
    { id: 1, name: 'Preferences', description: 'Application preferences' },
    { id: 2, name: 'Administrator Account', description: 'Create admin identity' },
    { id: 3, name: 'Summary', description: 'Review & complete' },
] as const;

/**
 * Setup Store.
 * 
 * Zustand store for onboarding wizard state.
 */
export const useSetupStore = create<SetupState>()(
    persist(
        (set) => ({
            // Initial state
            isSetupComplete: false,
            currentStep: 1,
            adminPasswordSet: false,
            preferencesSet: false,
            initialPreferences: { todolistEnabled: true },

            // Actions
            setStep: (step) => set({ currentStep: step }),

            nextStep: () =>
                set((state) => ({
                    currentStep: Math.min(state.currentStep + 1, SETUP_STEPS.length),
                })),

            prevStep: () =>
                set((state) => ({
                    currentStep: Math.max(state.currentStep - 1, 1),
                })),

            completeStep: (step) => {
                switch (step) {
                    case 'admin':
                        set({ adminPasswordSet: true });
                        break;
                    case 'preferences':
                        set({ preferencesSet: true });
                        break;
                }
            },

            setInitialPreferences: (prefs) =>
                set((state) => ({
                    initialPreferences: { ...state.initialPreferences, ...prefs },
                })),

            completeSetup: () => set({ isSetupComplete: true }),

            resetSetup: () =>
                set({
                    isSetupComplete: false,
                    currentStep: 1,
                    adminPasswordSet: false,
                    preferencesSet: false,
                    initialPreferences: { todolistEnabled: true },
                }),
        }),
        {
            name: 'taskmaster-setup',
        }
    )
);

export const useIsSetupComplete = () => useSetupStore((state) => state.isSetupComplete);
