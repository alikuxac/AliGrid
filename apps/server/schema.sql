-- apps/server/schema.sql

DROP TABLE IF EXISTS node_templates;

CREATE TABLE node_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT NOT NULL, -- 'generator', 'processor', 'storage', 'logistics'
    icon TEXT,
    resource_type TEXT,  -- for generators 
    input_type TEXT,     -- for processors 
    output_type TEXT,    -- for processors 
    conversion_rate TEXT, -- decimal string
    initial_rate TEXT,    -- decimal string
    power_demand TEXT,    -- decimal string 
    style_bg TEXT,       -- hex color 
    style_header TEXT    -- hex color
);

-- Seed with current game nodes for zero-downtime refactor
INSERT INTO node_templates (id, name, category, icon, resource_type, initial_rate, power_demand, style_bg)
VALUES 
('waterGenerator', 'Water Pump', 'generator', '💧', 'water', '2.5', '0', '#064e3b'),
('ironGenerator', 'Iron Miner', 'generator', '⛏️', 'iron_ore', '1.0', '2', '#1e1b4b'),
('copperGenerator', 'Copper Miner', 'generator', '⚒️', 'copper_ore', '1.0', '2', '#431407'),
('coalGenerator', 'Coal Miner', 'generator', '🔥', 'coal', '1.5', '2', '#111827'),
('lavaPump', 'Lava Pump', 'generator', '🌋', 'lava', '2.5', '0', '#450a0a');

INSERT INTO node_templates (id, name, category, icon, input_type, output_type, conversion_rate, style_bg)
VALUES 
('hydroGenerator', 'Fluid Generator', 'processor', '⚡', 'water,lava', 'electricity', '0.333,5.0', '#1e3a8a');

INSERT INTO node_templates (id, name, category, icon, style_bg)
VALUES 
('storage', 'Storage', 'storage', '📦', '#065f46'),
('merger', 'Merger', 'logistics', '🔀', '#374151'),
('splitter', 'Splitter', 'logistics', '↗️', '#374151'),
('antenna', 'Uploader', 'logistics', '📡', '#134e4a'),
('downloader', 'Downloader', 'logistics', '📥', '#134e4a'),
('powerTransmitter', 'Power Transmitter', 'power', '🔋', '#1e3a8a'),
('powerReceiver', 'Power Receiver', 'power', '🔌', '#1e3a8a');

-- SkyFactory Production Nodes
INSERT INTO node_templates (id, name, category, icon, resource_type, initial_rate, power_demand, style_bg)
VALUES 
('tree', 'Tree', 'generator', '🌳', 'wood_log', '1.0', '0', '#065f46');

-- SkyFactory Processing Nodes
INSERT INTO node_templates (id, name, category, icon, input_type, output_type, conversion_rate, style_bg)
VALUES 
('cobbleGen', 'Cobblestone Gen', 'processor', '🧱', 'water,lava,electricity', 'cobblestone', '1.0', '#4b5563'),
('autoHammerGravel', 'Auto Hammer (Gravel)', 'processor', '🔨', 'cobblestone,electricity', 'gravel', '1.0', '#374151'),
('autoHammerSand', 'Auto Hammer (Sand)', 'processor', '🔨', 'gravel,electricity', 'sand', '1.0', '#374151'),
('autoSieve', 'Auto Sieve', 'processor', '🕸️', 'gravel,electricity', 'iron_piece', '0.25', '#1e1b4b');

-- Edge Upgrade Costs
DROP TABLE IF EXISTS edge_upgrade_costs;

CREATE TABLE edge_upgrade_costs (
    matter TEXT NOT NULL,
    item_id TEXT NOT NULL,
    amount REAL NOT NULL,
    PRIMARY KEY (matter, item_id)
);

INSERT INTO edge_upgrade_costs (matter, item_id, amount) VALUES 
('solid', 'iron', 100),
('liquid', 'iron', 200),
('liquid', 'water', 200),
('gas', 'iron', 300),
('power', 'iron', 500);
