import { sqliteTable, text, real, primaryKey, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const nodeTemplates = sqliteTable('node_templates', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(), // 'generator', 'processor', 'storage', 'logistics'
    icon: text('icon'),
    resource_type: text('resource_type'),
    input_type: text('input_type'),
    input_rates: text('input_rates'),
    output_type: text('output_type'),
    conversion_rate: text('conversion_rate'),
    initial_rate: text('initial_rate'),
    power_demand: text('power_demand'),
    style_bg: text('style_bg'),
    style_header: text('style_header')
});

// --- NEW TABLES FOR VERSIONING AND CLOUD SAVES ---

export const gameVersions = sqliteTable('game_versions', {
    id: integer('id').primaryKey({ autoIncrement: true }),
    version: text('version').notNull().unique(), // e.g., '0.1.0'
    releasedAt: text('released_at').default(sql`CURRENT_TIMESTAMP`)
});

export const items = sqliteTable('items', {
    id: text('id').notNull(),
    sinceVersionId: integer('since_version_id').notNull(), // introduced version
    untilVersionId: integer('until_version_id'), // can be NULL (active)
    name: text('name').notNull(),
    type: text('type').notNull(), // SOLID, LIQUID, GAS, POWER
    icon: text('icon'),
}, (table) => ({
    pk: primaryKey({ columns: [table.id, table.sinceVersionId] })
}));

export const recipes = sqliteTable('recipes', {
    id: text('id').notNull(),
    sinceVersionId: integer('since_version_id').notNull(),
    untilVersionId: integer('until_version_id'),
    name: text('name').notNull(),
    durationSeconds: real('duration_seconds').default(1.0),
    powerDemand: real('power_demand').default(0.0)
}, (table) => ({
    pk: primaryKey({ columns: [table.id, table.sinceVersionId] })
}));

export const recipeIngredients = sqliteTable('recipe_ingredients', {
    recipeId: text('recipe_id').notNull(),
    sinceVersionId: integer('since_version_id').notNull(), // matches recipe.sinceVersionId
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.recipeId, table.sinceVersionId, table.itemId] })
}));

export const recipeOutputs = sqliteTable('recipe_outputs', {
    recipeId: text('recipe_id').notNull(),
    sinceVersionId: integer('since_version_id').notNull(), // matches recipe.sinceVersionId
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.recipeId, table.sinceVersionId, table.itemId] })
}));

export const saveStates = sqliteTable('save_states', {
    id: text('id').primaryKey(),
    playerId: text('player_id').notNull(),
    name: text('name').notNull(),
    gameVersion: text('game_version').notNull(), // Tracks save version compatibility
    saveData: text('save_data').notNull(), // JSON Blob of the network graph
    updatedAt: text('updated_at').default(sql`CURRENT_TIMESTAMP`)
});

export const customRecipes = sqliteTable('custom_recipes', {
    id: text('id').primaryKey(), // references Node Instance GUID or custom ID
    saveStateId: text('save_state_id').notNull(),
    nodeId: text('node_id').notNull(), // specific machine ID on graph
    machineType: text('machine_type').notNull(),
    durationSeconds: real('duration_seconds'),
    powerDemand: real('power_demand')
});

export const customRecipeIngredients = sqliteTable('custom_recipe_ingredients', {
    customRecipeId: text('custom_recipe_id').notNull(),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.customRecipeId, table.itemId] })
}));

export const customRecipeOutputs = sqliteTable('custom_recipe_outputs', {
    customRecipeId: text('custom_recipe_id').notNull(),
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.customRecipeId, table.itemId] })
}));

export const nodeRecipes = sqliteTable('node_recipes', {
    nodeTemplateId: text('node_template_id').notNull(),
    recipeId: text('recipe_id').notNull(),
    recipeVersionId: integer('recipe_version_id').notNull(), // references sinceVersionId
}, (table) => ({
    pk: primaryKey({ columns: [table.nodeTemplateId, table.recipeId, table.recipeVersionId] })
}));

export const edgeUpgradeCosts = sqliteTable('edge_upgrade_costs', {
    matter: text('matter').notNull(), // 'solid', 'liquid', 'gas', 'power'
    itemId: text('item_id').notNull(),
    amount: real('amount').notNull()
}, (table) => ({
    pk: primaryKey({ columns: [table.matter, table.itemId] })
}));
