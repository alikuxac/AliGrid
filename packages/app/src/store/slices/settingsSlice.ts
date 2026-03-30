import { RFState, SettingsState } from '../types';

const DEFAULT_SETTINGS: SettingsState = {
    fpsLimit: 60,
    animationsEnabled: true,
    showDebugInfo: false,
    autoSaveInterval: 60,
    compactMode: false,
};

export const createSettingsSlice = (set: (fn: (state: RFState) => Partial<RFState> | RFState) => void, get: () => RFState) => ({
    settings: DEFAULT_SETTINGS,
    isSettingsOpen: false,
    setIsSettingsOpen: (val: boolean) => set((state) => ({ ...state, isSettingsOpen: val })),
    updateSettings: (newSettings: Partial<SettingsState>) => {
        set((state) => ({
            ...state,
            settings: {
                ...state.settings,
                ...newSettings,
            },
        }));
    },
});
