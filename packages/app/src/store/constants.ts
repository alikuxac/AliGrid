import { Decimal, ResourceType } from '@aligrid/engine';

export const EDGE_UPGRADE_COSTS: Record<string, Partial<Record<ResourceType, Decimal>>> = {
    solid: { iron: new Decimal(100) },
    liquid: { iron: new Decimal(200), water: new Decimal(200) },
    gas: { iron: new Decimal(300) },
    power: { iron: new Decimal(500) }
};

export const GENERATOR_TYPES = ['waterGenerator', 'ironGenerator', 'copperGenerator', 'coalGenerator', 'lavaPump', 'tree'];
export const PROCESSOR_TYPES = [
    'hydroGenerator', 'cobbleGen', 'autoHammerGravel', 'autoHammerSand', 'autoSieve',
    'smelter', 'sawmill', 'composter', 'greenhouse', 'bioplasticMixer'
];

export const CLOUD_BASE_CAPACITY = 5000;
export const CLOUD_CAPACITY_GROWTH = 2.5;
export const CLOUD_UPGRADE_COST_GROWTH = 2.2;
