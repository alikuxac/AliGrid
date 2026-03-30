import Decimal from "break_infinity.js";

export interface ResourceConfig {
    id: string;
    label: string;
    icon: string;
    color: string;
    isUploadAvailable: boolean;
    type?: 'solid' | 'liquid' | 'gas' | 'power';
    unit?: string;
}

export type ResourceType = string;

// Dynamically hydrated from database
export let RESOURCE_REGISTRY: Record<string, ResourceConfig> = {};

export const setResourceRegistry = (data: Record<string, ResourceConfig>) => {
    RESOURCE_REGISTRY = data;
};

export const updateResourceConfig = (id: string, config: Partial<ResourceConfig>) => {
    if (RESOURCE_REGISTRY[id]) {
        RESOURCE_REGISTRY[id] = { ...RESOURCE_REGISTRY[id], ...config };
    } else {
        RESOURCE_REGISTRY[id] = { id, label: id, icon: '❓', color: '#ffffff', isUploadAvailable: true, ...config };
    }
};

export const NODE_COSTS: Record<string, Partial<Record<string, Decimal>>> = {
    waterGenerator: {},
    ironGenerator: { wood_plank: new Decimal(10), water: new Decimal(5) },
    copperGenerator: { wood_plank: new Decimal(10), water: new Decimal(5) },
    coalGenerator: { wood_plank: new Decimal(15), water: new Decimal(10) },
    lavaPump: { iron: new Decimal(50), copper: new Decimal(30) },
    storage: { iron: new Decimal(20), copper: new Decimal(10) },
    merger: {},
    splitter: {},
    antenna: {},
    downloader: { iron: new Decimal(40), copper: new Decimal(20) },
    hydroGenerator: { water: new Decimal(10) },
    coalPowerPlant: { iron: new Decimal(100), copper: new Decimal(50) },
    smelter: { wood_plank: new Decimal(30), water: new Decimal(10) },
    powerPole: { iron: new Decimal(10), copper: new Decimal(10) },
    accumulator: { iron: new Decimal(20), copper: new Decimal(20) },
    tree: { water: new Decimal(5) },
    composter: { wood_plank: new Decimal(20) },
    greenhouse: { wood_plank: new Decimal(40) },
    bioplasticMixer: { iron: new Decimal(20), copper: new Decimal(10) },
    sawmill: { wood_log: new Decimal(20), water: new Decimal(5) },
};

export const getUpgradeCost = (type: string, level: number, template?: any): Partial<Record<string, Decimal>> => {
    let baseCost: Record<string, any> = NODE_COSTS[type] || {};
    let exponent = 2.5;

    // --- Dynamic Configuration from Template ---
    if (template?.upgrade_cost_config) {
        try {
            const config = typeof template.upgrade_cost_config === 'string'
                ? JSON.parse(template.upgrade_cost_config)
                : template.upgrade_cost_config;

            if (config.base) baseCost = config.base;
            if (config.multiplier !== undefined) exponent = config.multiplier;
        } catch (e) {
            console.error("Failed to parse upgrade_cost_config for", type, e);
        }
    } else {
        // Fallback hardcoded logic
        if (type === 'waterGenerator' || type === 'lavaPump') {
            baseCost = { iron: 20, copper: 10 };
        } else if (!baseCost || Object.keys(baseCost).length === 0) {
            baseCost = { iron: 10 };
        }
    }

    const cost: Partial<Record<string, Decimal>> = {};
    const multiplier = Math.pow(exponent, level);

    for (const [res, amt] of Object.entries(baseCost)) {
        cost[res] = new Decimal(amt as any).times(multiplier).round();
    }

    // --- Dynamic resource diversity (Hardcoded secondary costs for backward compat) ---
    if (level >= 3 && !template?.upgrade_cost_config) {
        cost['coal'] = new Decimal(25).times(Math.pow(1.7, level - 3)).round();
    }

    if (level >= 5 && !template?.upgrade_cost_config) {
        if (['lavaPump', 'hydroGenerator', 'coalPowerPlant'].includes(type)) {
            cost['lava'] = new Decimal(5).times(Math.pow(1.5, level - 5)).round();
        }
    }

    if (level >= 10 && !template?.upgrade_cost_config) {
        cost['iron'] = (cost['iron'] || new Decimal(0)).plus(new Decimal(5).times(Math.pow(1.4, level - 10)).round());
        cost['copper'] = (cost['copper'] || new Decimal(0)).plus(new Decimal(5).times(Math.pow(1.4, level - 10)).round());
    }

    return cost;
};
