import Decimal from "break_infinity.js";
import { nanoid } from "nanoid";
import { ResourceType } from "./baseGenerator";

export interface ProcessorRecipe {
    inputType: ResourceType;
    outputType: ResourceType;
    conversionRate: Decimal; // output per 1 input consumed (e.g. 0.33 = 3 water → 1 electricity)
}

export interface BaseProcessorData {
    id: string;
    type: "processor";
    processorName: string;
    recipe?: ProcessorRecipe;
    recipes?: ProcessorRecipe[];
}

export const createBaseProcessor = (
    processorName: string,
    recipe: ProcessorRecipe | ProcessorRecipe[]
): BaseProcessorData => {
    return {
        id: nanoid(),
        type: "processor",
        processorName,
        recipe: Array.isArray(recipe) ? undefined : recipe,
        recipes: Array.isArray(recipe) ? recipe : undefined,
    };
};

export const createMultiInputProcessor = (
    processorName: string,
    recipeMap: Record<string, string>, // { copper: 'copper_ingot', iron: 'iron_ingot' }
    commonRate: Decimal | string | number
): BaseProcessorData => {
    const rate = typeof commonRate === 'object' && commonRate instanceof Decimal ? commonRate : new Decimal(commonRate as any);
    const recipes: ProcessorRecipe[] = Object.entries(recipeMap).map(([input, output]) => ({
        inputType: input as ResourceType,
        outputType: output as ResourceType,
        conversionRate: rate
    }));
    return createBaseProcessor(processorName, recipes);
};
