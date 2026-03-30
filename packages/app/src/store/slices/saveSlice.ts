import { deserializeSaveData, processOfflineProgress, ENABLE_CLOUD_SAVE } from '../helpers';

const API_BASE_URL = (import.meta as any).env.VITE_API_BASE_URL || 'http://localhost:8787';

export const createSaveSlice = (set: any, get: any) => ({
    saveState: () => {
        const state = get();
        const data = {
            nodes: state.nodes,
            edges: state.edges,
            cloudStorage: state.cloudStorage,
            cloudLevel: state.cloudLevel || 1,
            downloaderTier: state.downloaderTier || 0,
            edgeTiers: state.edgeTiers || { solid: 0, liquid: 0, gas: 0, power: 0 },
            settings: state.settings,
            lastTick: Date.now()
        };
        localStorage.setItem('aligrid_save', JSON.stringify(data));
    },

    loadState: () => {
        const saved = localStorage.getItem('aligrid_save');
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            const { nodes, edges, cloud, cloudLevel, edgeTiers, lastTick } = deserializeSaveData(data);
            const downloaderTier = data.downloaderTier || 0;
            const settings = data.settings;
            set({ nodes, edges, cloudStorage: cloud, cloudLevel, edgeTiers, downloaderTier, ...(settings ? { settings } : {}) });
            processOfflineProgress(lastTick, get());
        } catch (err) {
            console.error("Load save failed", err);
        }
    },

    saveStateToServer: async () => {
        if (!ENABLE_CLOUD_SAVE) return;
        const state = get();
        const API_KEY = (import.meta as any).env.VITE_API_KEY || '';
        const data = {
            nodes: state.nodes,
            edges: state.edges,
            cloudStorage: state.cloudStorage,
            cloudLevel: state.cloudLevel || 1,
            downloaderTier: state.downloaderTier || 0,
            edgeTiers: state.edgeTiers || { solid: 0, liquid: 0, gas: 0, power: 0 },
            settings: state.settings,
            lastTick: Date.now()
        };
        try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
            const res = await fetch(`${API_BASE_URL}/api/save`, {
                method: "POST",
                headers,
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error("Save error");
            console.log("Cloud save successful");
        } catch (err) {
            console.error("Cloud save failed", err);
        }
    },

    loadStateFromServer: async () => {
        if (!ENABLE_CLOUD_SAVE) return;
        const API_KEY = (import.meta as any).env.VITE_API_KEY || '';
        try {
            const headers: Record<string, string> = {};
            if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
            const res = await fetch(`${API_BASE_URL}/api/load`, { headers });
            if (!res.ok) throw new Error("Load error");
            const data = await res.json();
            const { nodes, edges, cloud, cloudLevel, edgeTiers, lastTick } = deserializeSaveData(data);
            const downloaderTier = data.downloaderTier || 0;
            set({ nodes, edges, cloudStorage: cloud, cloudLevel, edgeTiers, downloaderTier });
            processOfflineProgress(lastTick, get());
            console.log("Cloud load successful");
        } catch (err) {
            console.error("Cloud load failed", err);
        }
    },
    resetAllData: () => {
        localStorage.removeItem('aligrid_save');
        set({
            nodes: [],
            edges: [],
            cloudStorage: {},
            cloudLevel: 1
        });
    }
});
