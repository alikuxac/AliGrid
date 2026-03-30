import { Decimal, RESOURCE_REGISTRY } from '@aligrid/engine';
import { CLOUD_BASE_CAPACITY, CLOUD_CAPACITY_GROWTH, CLOUD_UPGRADE_COST_GROWTH } from '../constants';
import { RFState, ItemDefinition } from '../types';
import { safeDecimal } from './tick/helpers';

export const createCloudSlice = (set: any, get: any) => ({
    cloudStorage: {} as Partial<Record<string, string | Decimal>>,
    cloudLevel: 1,
    itemRegistry: {} as Record<string, ItemDefinition>,

    loadItems: async () => {
        const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:8787';
        const API_KEY = (import.meta as any).env?.VITE_API_KEY || '';
        try {
            const headers: Record<string, string> = {};
            if (API_KEY) headers['Authorization'] = `Bearer ${API_KEY}`;
            const res = await fetch(`${API_BASE_URL}/api/items`, { headers });
            if (!res.ok) throw new Error("Load error");
            const items = await res.json();

            const registry: Record<string, ItemDefinition> = {};
            const engineRegistry: Record<string, any> = {};

            items.forEach((item: any) => {
                const type = (item.type || 'solid').toLowerCase();

                registry[item.id] = {
                    id: item.id,
                    name: item.name,
                    type: type,
                    icon: item.icon
                };

                engineRegistry[item.id] = {
                    id: item.id,
                    label: item.name,
                    icon: item.icon,
                    color: item.color || '#cbd5e1',
                    isUploadAvailable: item.isUploadAvailable !== 0,
                    type: type,
                    unit: item.unit
                };
            });

            const { setResourceRegistry } = await import('@aligrid/engine');
            setResourceRegistry(engineRegistry);
            set({ itemRegistry: registry });
        } catch (err) {
            console.warn("Load items from server failed. Simulation might be broken without registry.", err);
            set({ itemRegistry: {} });
        }
    },

    getCloudCapacity: (level?: number): Decimal => {
        const lv = level ?? get().cloudLevel;
        return new Decimal(CLOUD_BASE_CAPACITY).times(Math.pow(CLOUD_CAPACITY_GROWTH, lv - 1)).round();
    },

    getCloudAmount: (res: string): Decimal => {
        return safeDecimal(get().cloudStorage[res] || 0);
    },

    getCloudUpgradeCost: (level?: number): Record<string, Decimal> => {
        const lv = level ?? get().cloudLevel;
        return {
            iron: new Decimal(100).times(Math.pow(CLOUD_UPGRADE_COST_GROWTH, lv - 1)).round(),
            copper: new Decimal(100).times(Math.pow(CLOUD_UPGRADE_COST_GROWTH, lv - 1)).round(),
        };
    },

    upgradeCloudLevel: () => {
        const cost = get().getCloudUpgradeCost();

        if (!get().canAfford(cost)) {
            return;
        }

        get().deductMaterials(cost);
        set((state: RFState) => ({ cloudLevel: state.cloudLevel + 1 }));
    },

    canAfford: (cost: Partial<Record<string, Decimal>>) => {
        const cloud = get().cloudStorage;
        for (const [res, amt] of Object.entries(cost)) {
            const current = safeDecimal(cloud[res] || 0);
            if (current.lt(amt as Decimal)) return false;
        }
        return true;
    },

    deductMaterials: (cost: Partial<Record<string, Decimal>>) => {
        set((state: RFState) => {
            const nextCloud = { ...state.cloudStorage };
            for (const [res, amt] of Object.entries(cost)) {
                const current = safeDecimal(nextCloud[res] || 0);
                // DEFENSIVE: Never allow UI deductions to drive inventory negative
                nextCloud[res] = Decimal.max(0, current.minus(amt as Decimal)).toString();
            }
            return { cloudStorage: nextCloud };
        });
    },
});
