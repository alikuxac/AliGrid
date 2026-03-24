import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { drizzle } from 'drizzle-orm/d1';
import { nodeTemplates, edgeUpgradeCosts } from './db/schema';

export interface Env {
    ALIGRID_KV: KVNamespace;
    ALIGRID_DB: D1Database;
}

const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors());

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

// Get Node Templates
app.get('/api/nodes', async (c) => {
    try {
        const db = drizzle(c.env.ALIGRID_DB);
        const results = await db.select().from(nodeTemplates);
        return c.json(results);
    } catch (err: any) {
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

export default app;
