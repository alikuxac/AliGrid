-- apps/server/seeds/v0.1.0/nodes.sql
-- Example seeding for v0.1.0 nodes

INSERT OR REPLACE INTO node_templates (id, name, category, icon, resource_type, initial_rate, power_demand, style_bg)
VALUES 
('waterGenerator', 'Water Pump (v0.1.0)', 'generator', '💧', 'water', '2.5', '0', '#064e3b'),
('ironGenerator', 'Iron Miner (v0.1.0)', 'generator', '⛏️', 'iron', '1.0', '2', '#1e1b4b');
