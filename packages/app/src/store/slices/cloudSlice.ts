import { Decimal } from '@aligrid/engine';

export const createCloudSlice = (set: any, get: any) => ({
    cloudStorage: {} as Record<string, Decimal | string>,
    cloudLevel: 1,

    getCloudAmount: (res: string): Decimal => {
        const val = get().cloudStorage[res] || 0;
        return val instanceof Decimal ? val : new Decimal(val as any);
    },

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
            const raw = cloud[res] || 0;
            const current = raw instanceof Decimal ? raw : new Decimal(raw as any);
            if (current.lt(amt as Decimal)) return false;
        }
        return true;
    },

    deductMaterials: (cost: Partial<Record<string, Decimal>>) => {
        set((state: any) => {
            const nextCloud = { ...state.cloudStorage };
            for (const [res, amt] of Object.entries(cost)) {
                const raw = nextCloud[res] || 0;
                const current = raw instanceof Decimal ? raw : new Decimal(raw as any);
                nextCloud[res] = current.minus(amt as Decimal);
            }
            return { cloudStorage: nextCloud };
        });
    },
});
