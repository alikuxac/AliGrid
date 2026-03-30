import { sqliteTable, text, real, primaryKey, integer, foreignKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const nodeTemplates = sqliteTable('node_templates', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    icon: text('icon'),
    radius: integer('radius'),
    resource_type: text('resource_type'),
    input_type: text('input_type'),
    input_rates: text('input_rates'),
    output_type: text('output_type'),
    conversion_rate: text('conversion_rate'),
    initial_rate: text('initial_rate'),
    power_demand: text('power_demand'),
    upgrade_cost_config: text('upgrade_cost_config'),
    upgrade_benefit_config: text('upgrade_benefit_config'),
    style_bg: text('style_bg'),
    style_header: text('style_header'),
    requires_power: integer('requires_power').default(1),
    base_power_demand: text('base_power_demand')
});

export const gameVersions = sqliteTable('game_versions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    version: text('version').notNull().unique(),
    releasedAt: text('released_at').default(sql`CURRENT_TIMESTAMP`)
});

export const items = sqliteTable('items', {
    id: text('id').notNull(),
    sinceVersionId: integer('since_version_id').notNull().references(() => gameVersions.id),
    untilVersionId: integer('until_version_id').references(() => gameVersions.id),
    name: text('name').notNull(),
    type: text('type').notNull(), // solid/liquid/gas
    icon: text('icon'),
    color: text('color'),
    unit: text('unit'),
    isUploadAvailable: integer('is_upload_available').default(1),
}, (table) => ({
    pk: primaryKey({ columns: [table.id, table.sinceVersionId] })
}));

export const recipes = sqliteTable('recipes', {
    id: text('id').notNull(),
    sinceVersionId: integer('since_version_id').notNull().references(() => gameVersions.id),
    untilVersionId: integer('until_version_id').references(() => gameVersions.id),
    name: text('name').notNull(),
    durationSeconds: real('duration_seconds').default(1.0),
    powerDemand: real('power_demand').default(0.0)
}, (table) => ({
    pk: primaryKey({ columns: [table.id, table.sinceVersionId] })
}));

export const recipeIngredients = sqliteTable('recipe_ingredients', {
    recipeId: text('recipe_id').notNull(),
    sinceVersionId: integer('since_version_id').notNull(),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull(),
    usageType: text('usage_type').default('MATERIAL')
}, (table) => ({
    pk: primaryKey({ columns: [table.recipeId, table.sinceVersionId, table.itemId] }),
    recipeReference: foreignKey({
        columns: [table.recipeId, table.sinceVersionId],
        foreignColumns: [recipes.id, recipes.sinceVersionId]
    })
}));

export const recipeOutputs = sqliteTable('recipe_outputs', {
    recipeId: text('recipe_id').notNull(),
    sinceVersionId: integer('since_version_id').notNull(),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.recipeId, table.sinceVersionId, table.itemId] }),
    recipeReference: foreignKey({
        columns: [table.recipeId, table.sinceVersionId],
        foreignColumns: [recipes.id, recipes.sinceVersionId]
    })
}));

export const saveStates = sqliteTable('save_states', {
    id: text('id').primaryKey(),
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    gameVersionId: integer('game_version_id').notNull().references(() => gameVersions.id),
    saveData: text('save_data').notNull(),
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const customRecipes = sqliteTable('custom_recipes', {
    id: text('id').primaryKey(),
    saveStateId: text('save_state_id').notNull().references(() => saveStates.id),
    nodeId: text('node_id').notNull(),
    machineType: text('machine_type').notNull(),
    durationSeconds: real('duration_seconds'),
    powerDemand: real('power_demand')
});

export const customRecipeIngredients = sqliteTable('custom_recipe_ingredients', {
    customRecipeId: text('custom_recipe_id').notNull().references(() => customRecipes.id),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.customRecipeId, table.itemId] })
}));

export const customRecipeOutputs = sqliteTable('custom_recipe_outputs', {
    customRecipeId: text('custom_recipe_id').notNull().references(() => customRecipes.id),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.customRecipeId, table.itemId] })
}));

export const nodeRecipes = sqliteTable('node_recipes', {
    nodeTemplateId: text('node_template_id').notNull().references(() => nodeTemplates.id),
    recipeId: text('recipe_id').notNull(),
    recipeVersionId: integer('recipe_version_id').notNull(),
}, (table) => ({
    pk: primaryKey({ columns: [table.nodeTemplateId, table.recipeId, table.recipeVersionId] }),
    recipeReference: foreignKey({
        columns: [table.recipeId, table.recipeVersionId],
        foreignColumns: [recipes.id, recipes.sinceVersionId]
    })
}));

export const edgeUpgradeCosts = sqliteTable('edge_upgrade_costs', {
    matter: text('matter').notNull(),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.matter, table.itemId] })
}));
