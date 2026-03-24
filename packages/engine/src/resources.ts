import Decimal from "break_infinity.js";

export interface ResourceConfig {
    id: string;
    label: string;
    icon: string;
    color: string;
    isUploadAvailable: boolean;
    type?: 'solid' | 'liquid' | 'gas';
    unit?: string;
}

export type ResourceType = string;

export const RESOURCE_REGISTRY: Record<string, ResourceConfig> = {
    water: { id: 'water', label: 'Water', icon: '💧', color: '#3b82f6', isUploadAvailable: true, type: 'liquid', unit: 'm³' },
    iron_ore: { id: 'iron_ore', label: 'Iron Ore', icon: '🪨', color: '#94a3b8', isUploadAvailable: true, type: 'solid' },
    copper_ore: { id: 'copper_ore', label: 'Copper Ore', icon: '🪨', color: '#d97706', isUploadAvailable: true, type: 'solid' },
    iron: { id: 'iron', label: 'Iron', icon: '🛡️', color: '#cbd5e1', isUploadAvailable: true, type: 'solid' },
    copper: { id: 'copper', label: 'Copper', icon: '🪙', color: '#b45309', isUploadAvailable: true, type: 'solid' },
    coal: { id: 'coal', label: 'Coal', icon: '🔥', color: '#334155', isUploadAvailable: true, type: 'solid' },
    lava: { id: 'lava', label: 'Lava', icon: '🌋', color: '#ea580c', isUploadAvailable: true, type: 'liquid', unit: 'm³' },
    electricity: { id: 'electricity', label: 'Electricity', icon: '⚡', color: '#facc15', isUploadAvailable: false, unit: 'W' },
    wood_log: { id: 'wood_log', label: 'Wood Log', icon: '🪵', color: '#8b5a2b', isUploadAvailable: true, type: 'solid' },
    cobblestone: { id: 'cobblestone', label: 'Cobblestone', icon: '🪨', color: '#6b7280', isUploadAvailable: true, type: 'solid' },
    gravel: { id: 'gravel', label: 'Gravel', icon: '🪨', color: '#9ca3af', isUploadAvailable: true, type: 'solid' },
    sand: { id: 'sand', label: 'Sand', icon: '🏖️', color: '#fef08a', isUploadAvailable: true, type: 'solid' },
    dust: { id: 'dust', label: 'Dust', icon: '🌫️', color: '#e5e7eb', isUploadAvailable: true, type: 'solid' },
};

export const NODE_COSTS: Record<string, Partial<Record<string, Decimal>>> = {
    waterGenerator: {},
    ironGenerator: { water: new Decimal(5) },
    copperGenerator: { water: new Decimal(5) },
    coalGenerator: { water: new Decimal(10) },
    lavaPump: { iron: new Decimal(20), copper: new Decimal(10) },
    storage: { iron: new Decimal(20), copper: new Decimal(10) },
    merger: {},
    splitter: {},
    antenna: {},
    downloader: { iron: new Decimal(20), copper: new Decimal(10) },
    hydroGenerator: { water: new Decimal(10) },
    coalPowerPlant: { iron: new Decimal(15), copper: new Decimal(15) },
    smelter: { iron: new Decimal(30), copper: new Decimal(20) },
    powerPole: { iron: new Decimal(10), copper: new Decimal(10) },
    accumulator: { iron: new Decimal(20), copper: new Decimal(20) },
};

export const getUpgradeCost = (type: string, level: number): Partial<Record<string, Decimal>> => {
    let baseCost = NODE_COSTS[type] || {};
    if (type === 'waterGenerator' || type === 'lavaPump') {
        baseCost = { iron: new Decimal(20), copper: new Decimal(10) };
    } else if (!baseCost || Object.keys(baseCost).length === 0) {
        baseCost = { iron: new Decimal(10) };
    }

    const cost: Partial<Record<string, Decimal>> = {};
    const multiplier = Math.pow(2.5, level);

    for (const [res, amt] of Object.entries(baseCost)) {
        cost[res] = (amt as Decimal).times(multiplier).round();
    }

    // --- Dynamic resource diversity ---
    if (level >= 3) {
        cost['coal'] = new Decimal(25).times(Math.pow(1.7, level - 3)).round();
    }

    if (level >= 5) {
        if (['lavaPump', 'hydroGenerator', 'coalPowerPlant'].includes(type)) {
            cost['lava'] = new Decimal(5).times(Math.pow(1.5, level - 5)).round();
        }
    }

    if (level >= 10) {
        cost['iron_ingot'] = new Decimal(5).times(Math.pow(1.4, level - 10)).round();
        cost['copper_ingot'] = new Decimal(5).times(Math.pow(1.4, level - 10)).round();
    }

    return cost;
};
