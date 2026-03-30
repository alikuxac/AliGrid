import { z } from "zod";

export const SaveGameSchema = z.object({
    id: z.string(),
    money: z.string(), // representation for Decimal
    nodes: z.array(z.any()),
    edges: z.array(z.any()),
});

export const NodeTemplateSchema = z.object({
    id: z.string(),
    name: z.string(),
    category: z.string(),
    icon: z.string().optional().nullable(),
    radius: z.number().optional().nullable(),
    resource_type: z.string().optional().nullable(),
    input_type: z.string().optional().nullable(),
    output_type: z.string().optional().nullable(),
    conversion_rate: z.string().optional().nullable(),
    initial_rate: z.string().optional().nullable(),
    power_demand: z.string().optional().nullable(),
    style_bg: z.string().optional().nullable(),
    style_header: z.string().optional().nullable(),
    maxBuffer: z.union([z.string(), z.number()]).optional().nullable(),
    upgrade_cost_config: z.string().optional().nullable(),
    upgrade_benefit_config: z.string().optional().nullable(),
    requires_power: z.number().optional().nullable(),
    base_power_demand: z.string().optional().nullable(),
});

export const RecipeIngredientSchema = z.object({
    recipeId: z.string(),
    itemId: z.string(),
    amount: z.number(),
    usageType: z.enum(['MATERIAL', 'FUEL']).default('MATERIAL'),
});

export const RecipeSchema = z.object({
    id: z.string(),
    name: z.string(),
    durationSeconds: z.number(),
    powerDemand: z.number().optional(),
    ingredients: z.array(RecipeIngredientSchema).optional(),
});

export type NodeTemplate = z.infer<typeof NodeTemplateSchema>;
export type SaveGame = z.infer<typeof SaveGameSchema>;
export { z };
