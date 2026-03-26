import { Decimal, ResourceType } from '@aligrid/engine';

export const RESOURCE_STATES: Record<string, 'solid' | 'liquid' | 'gas' | 'power'> = {
    iron: 'solid', copper: 'solid', coal: 'solid',
    iron_ingot: 'solid', copper_ingot: 'solid',
    water: 'liquid', lava: 'liquid',
    electricity: 'power'
};

export const EDGE_UPGRADE_COSTS: Record<string, Partial<Record<ResourceType, Decimal>>> = {
    solid: { iron: new Decimal(100) },
    liquid: { iron: new Decimal(200), water: new Decimal(200) },
    gas: { iron: new Decimal(300) },
    power: { iron: new Decimal(500) }
};

export const GENERATOR_TYPES = ['waterGenerator', 'ironGenerator', 'copperGenerator', 'coalGenerator', 'lavaPump'];
export const PROCESSOR_TYPES = ['hydroGenerator', 'cobbleGen', 'autoHammerGravel', 'autoHammerSand', 'autoSieve', 'smelter'];
