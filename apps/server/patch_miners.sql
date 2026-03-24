-- apps/server/patch_miners.sql
-- Run: npx wrangler d1 execute aligrid-db --local --file=patch_miners.sql

UPDATE node_templates SET resource_type = 'iron_ore' WHERE id = 'ironGenerator';
UPDATE node_templates SET resource_type = 'copper_ore' WHERE id = 'copperGenerator';
