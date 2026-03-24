import { Decimal } from '@aligrid/engine';

export const createCloudSlice = (set: any, get: any) => ({
    cloudStorage: {},
    cloudLevel: 1,

    upgradeCloudLevel: () => {
        const level = get().cloudLevel;
        const cost = {
            iron: new Decimal(100).times(Math.pow(3, level - 1)),
            copper: new Decimal(100).times(Math.pow(3, level - 1)),
        };

        if (!get().canAfford(cost)) {
            return;
        }

        get().deductMaterials(cost);
        set((state: any) => ({ cloudLevel: state.cloudLevel + 1 }));
    },

    canAfford: (cost: Partial<Record<string, Decimal>>) => {
        const cloud = get().cloudStorage;
        for (const [res, amt] of Object.entries(cost)) {
            const current = cloud[res] || new Decimal(0);
            if (current.lt(amt as Decimal)) return false;
        }
        return true;
    },

    deductMaterials: (cost: Partial<Record<string, Decimal>>) => {
        set((state: any) => {
            const nextCloud = { ...state.cloudStorage };
            for (const [res, amt] of Object.entries(cost)) {
                const current = nextCloud[res] || new Decimal(0);
                nextCloud[res] = current.minus(amt as Decimal);
            }
            return { cloudStorage: nextCloud };
        });
    },
});
