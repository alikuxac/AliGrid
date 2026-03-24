import Decimal from "break_infinity.js";
import { createBaseProcessor, BaseProcessorData } from "./baseProcessor";

/** Fluid Generator: consumes Water or Lava → produces Electricity at different rates */
export const createHydroGenerator = (): BaseProcessorData => {
    return createBaseProcessor('Fluid Generator', [
        {
            inputType: 'water',
            outputType: 'electricity',
            conversionRate: new Decimal('0.333'), // 1 electricity per 3 water
        },
        {
            inputType: 'lava',
            outputType: 'electricity',
            conversionRate: new Decimal('5'), // 5 electricity per 1 lava
        }
    ]);
};

/** Smelter: applies independent identical heating conversion rates across items */
import { createMultiInputProcessor } from "./baseProcessor";

export const createSmelter = (): BaseProcessorData => {
    return createMultiInputProcessor('Smelter', {
        copper: 'copper_ingot',
        iron: 'iron_ingot'
    }, '1.0'); // 1 output per 1 input
};
