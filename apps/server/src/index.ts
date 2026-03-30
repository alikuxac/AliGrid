import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bearerAuth } from 'hono/bearer-auth';
import { drizzle } from 'drizzle-orm/d1';
import { nodeTemplates, nodeRecipes, recipes, recipeIngredients, recipeOutputs, edgeUpgradeCosts, items } from './db/schema';

export interface Env {
    ALIGRID_KV: KVNamespace;
    ALIGRID_DB: D1Database;
    API_KEY: string;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors());

// Bearer Auth for all API routes
app.use('/api/*', async (c, next) => {
    const auth = bearerAuth({ token: c.env.API_KEY });
    return auth(c, next);
});

const SAVE_KEY = "SINGLE_PLAYER_SAVE";

// Save Game
app.post('/api/save', async (c) => {
    try {
        const body = await c.req.text();
        JSON.parse(body); // Verify valid JSON
        await c.env.ALIGRID_KV.put(SAVE_KEY, body);
        return c.json({ success: true, timestamp: Date.now() });
    } catch (err) {
        return c.json({ error: "Invalid JSON payload" }, 400);
    }
});

// Load Game
app.get('/api/load', async (c) => {
    const data = await c.env.ALIGRID_KV.get(SAVE_KEY);
    if (!data) {
        return c.json({ error: "No save found" }, 404);
    }
    // Parse before returning to ensure application/json contentType
    return c.json(JSON.parse(data));
});

// Get Node Templates with Joined Recipes
app.get('/api/nodes', async (c) => {
    try {
        const db = drizzle(c.env.ALIGRID_DB);

        // 1. Fetch tables
        const templates = await db.select().from(nodeTemplates).all();
        const nrMap = await db.select().from(nodeRecipes).all();
        const rList = await db.select().from(recipes).all();
        const rIngredients = await db.select().from(recipeIngredients).all();
        const rOutputs = await db.select().from(recipeOutputs).all();

        // 2. Assemble in memory
        const assembled = templates.map(t => {
            // Find recipes for this node
            const myRecipes = nrMap
                .filter(nr => nr.nodeTemplateId === t.id)
                .map(nr => {
                    const recipe = rList.find(r => r.id === nr.recipeId && r.sinceVersionId === nr.recipeVersionId);
                    if (!recipe) return null;

                    const ingredients = rIngredients
                        .filter(ri => ri.recipeId === recipe.id && ri.sinceVersionId === recipe.sinceVersionId)
                        .map(ri => ({
                            itemId: ri.itemId,
                            amount: ri.amount,
                            usageType: ri.usageType || 'MATERIAL'
                        }));

                    const output = rOutputs.find(ro => ro.recipeId === recipe.id && ro.sinceVersionId === recipe.sinceVersionId);

                    return {
                        id: recipe.id,
                        name: recipe.name,
                        ingredients, // New structured format
                        inputType: ingredients.map(i => i.itemId).join(','), // Maintain backward compatibility for simple UI
                        outputType: output?.itemId || '',
                        conversionRate: output?.amount || 1,
                        duration: recipe.durationSeconds,
                        powerDemand: recipe.powerDemand
                    };
                })
                .filter(Boolean);

            return {
                ...t,
                recipes: myRecipes.length > 0 ? myRecipes : undefined
            };
        });

        return c.json(assembled);
    } catch (err: any) {
        console.error("Fetch nodes error:", err);
        return c.json({ error: err.message }, 500);
    }
});

// Get Edge Upgrade Costs
app.get('/api/edge-costs', async (c) => {
    try {
        const db = drizzle(c.env.ALIGRID_DB);
        const results = await db.select().from(edgeUpgradeCosts);
        return c.json(results);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

// Get Item Definitions
app.get('/api/items', async (c) => {
    try {
        const db = drizzle(c.env.ALIGRID_DB);
        const results = await db.select().from(items);
        return c.json(results);
    } catch (err: any) {
        return c.json({ error: err.message }, 500);
    }
});

export default app;
