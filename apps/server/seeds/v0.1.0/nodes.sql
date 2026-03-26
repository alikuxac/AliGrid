-- apps/server/seeds/v0.1.0/nodes.sql
-- Comprehensive seeding for AliGrid v0.1.0 Node Templates

INSERT OR REPLACE INTO node_templates (id, name, category, icon, resource_type, initial_rate, power_demand, upgrade_cost_config, upgrade_benefit_config, style_bg)
VALUES 
('waterGenerator', 'Water Pump', 'generator', '💧', 'water', '2.5', '0', NULL, NULL, '#064e3b'),
('ironGenerator', 'Iron Miner', 'generator', '⛏️', 'iron_ore', '1.0', '2', NULL, NULL, '#1e1b4b'),
('copperGenerator', 'Copper Miner', 'generator', '⚒️', 'copper_ore', '1.0', '2', NULL, NULL, '#431407'),
('coalGenerator', 'Coal Miner', 'generator', '🔥', 'coal', '1.5', '2', NULL, NULL, '#111827'),
('lavaPump', 'Lava Pump', 'generator', '🌋', 'lava', '2.5', '0', NULL, NULL, '#450a0a'),
('tree', 'Tree', 'generator', '🌳', 'wood_log,leaf', '1.0', '0', NULL, NULL, '#065f46');

INSERT OR REPLACE INTO node_templates (id, name, category, icon, input_type, output_type, conversion_rate, power_demand, style_bg)
VALUES 
('hydroGenerator', 'Fluid Generator', 'processor', '⚡', 'water,lava', 'electricity', '0.333,5.0', '0', '#1e3a8a'),
('smelter', 'Smelter', 'processor', '🔥', 'iron_ore,coal', 'iron', '1.0', '0', '#ff4444'),
('composter', 'Composter', 'processor', '🧫', 'leaf,water', 'compost', '1.0', '2', '#451a03'),
('greenhouse', 'Greenhouse', 'processor', '🏛️', 'compost,water', 'plant_fiber', '1.0', '2', '#16a34a'),
('bioplasticMixer', 'Bioplastic Mixer', 'processor', '🧪', 'plant_fiber,water', 'bioplastic', '1.0', '2', '#15803d'),
('sawmill', 'Sawmill', 'processor', '🪚', 'wood_log', 'wood_plank', '2.0', '2', '#8b5a2b'),
('cobbleGen', 'Cobblestone Gen', 'processor', '🧱', 'water,lava,electricity', 'cobblestone', '1.0', '2', '#4b5563');

INSERT OR REPLACE INTO node_templates (id, name, category, icon, input_type, output_type, conversion_rate, power_demand, style_bg)
VALUES 
('autoHammerGravel', 'Auto Hammer (Gravel)', 'processor', '🔨', 'cobblestone,electricity', 'gravel', '1.0', '5', '#374151'),
('autoHammerSand', 'Auto Hammer (Sand)', 'processor', '🔨', 'gravel,electricity', 'sand', '1.0', '5', '#374151'),
('autoSieve', 'Auto Sieve', 'processor', '🕸️', 'gravel,electricity', 'iron_piece', '0.25', '10', '#1e1b4b');

INSERT OR REPLACE INTO node_templates (id, name, category, icon, radius, style_bg)
VALUES 
('accumulator', 'Accumulator', 'storage', '🔋', 200, '#047857'),
('powerTransmitter', 'Power Transmitter', 'power', '📡', 200, '#1e3a8a'),
('powerReceiver', 'Power Receiver', 'power', '🔌', 200, '#1e3a8a'),
('powerPole', 'Power Pole', 'power', '🗼', 200, '#1e1b4b'),
('amplifier', 'Amplifier', 'power', '🚀', 150, '#312e81');

INSERT OR REPLACE INTO node_templates (id, name, category, icon, style_bg)
VALUES 
('storage', 'Storage', 'storage', '📦', '#065f46'),
('woodenStorage', 'Wooden Storage', 'storage', '📦', '#78350f'),
('merger', 'Merger', 'logistics', '🔀', '#374151'),
('splitter', 'Splitter', 'logistics', '↗️', '#374151'),
('antenna', 'Uploader', 'logistics', '📡', '#134e4a'),
('downloader', 'Downloader', 'logistics', '📥', '#134e4a'),
('sink', 'Recycler', 'storage', '🗑️', '#1e3a8a');

-- ═══ VERSIONING SEED ═══
INSERT OR REPLACE INTO game_versions (id, version) VALUES (1, '0.1.0');

-- ═══ RECIPES SEED ═══
-- Smelter Recipes
INSERT OR REPLACE INTO recipes (id, since_version_id, name, duration_seconds) VALUES ('smelter_iron', 1, 'Iron Ingot', 1.0);
INSERT OR REPLACE INTO recipes (id, since_version_id, name, duration_seconds) VALUES ('smelter_copper', 1, 'Copper Ingot', 1.0);

-- Fluid Generator Recipes
INSERT OR REPLACE INTO recipes (id, since_version_id, name, duration_seconds) VALUES ('fluid_gen_water', 1, 'Water Power', 1.0);
INSERT OR REPLACE INTO recipes (id, since_version_id, name, duration_seconds) VALUES ('fluid_gen_lava', 1, 'Lava Power', 1.0);

-- ═══ RECIPE INGREDIENTS ═══
-- Smelter: Iron
INSERT OR REPLACE INTO recipe_ingredients (recipe_id, since_version_id, item_id, amount) VALUES ('smelter_iron', 1, 'iron_ore', 1.0);
INSERT OR REPLACE INTO recipe_ingredients (recipe_id, since_version_id, item_id, amount) VALUES ('smelter_iron', 1, 'coal', 1.0);
-- Smelter: Copper
INSERT OR REPLACE INTO recipe_ingredients (recipe_id, since_version_id, item_id, amount) VALUES ('smelter_copper', 1, 'copper_ore', 1.0);
INSERT OR REPLACE INTO recipe_ingredients (recipe_id, since_version_id, item_id, amount) VALUES ('smelter_copper', 1, 'coal', 1.0);
-- Fluid Gen: Water
INSERT OR REPLACE INTO recipe_ingredients (recipe_id, since_version_id, item_id, amount) VALUES ('fluid_gen_water', 1, 'water', 3.0);
-- Fluid Gen: Lava
INSERT OR REPLACE INTO recipe_ingredients (recipe_id, since_version_id, item_id, amount) VALUES ('fluid_gen_lava', 1, 'lava', 1.0);

-- ═══ RECIPE OUTPUTS ═══
-- Smelter: Iron
INSERT OR REPLACE INTO recipe_outputs (recipe_id, since_version_id, item_id, amount) VALUES ('smelter_iron', 1, 'iron', 1.0);
-- Smelter: Copper
INSERT OR REPLACE INTO recipe_outputs (recipe_id, since_version_id, item_id, amount) VALUES ('smelter_copper', 1, 'copper', 1.0);
-- Fluid Gen: Water (Electricity)
INSERT OR REPLACE INTO recipe_outputs (recipe_id, since_version_id, item_id, amount) VALUES ('fluid_gen_water', 1, 'electricity', 1.0);
-- Fluid Gen: Lava (Electricity)
INSERT OR REPLACE INTO recipe_outputs (recipe_id, since_version_id, item_id, amount) VALUES ('fluid_gen_lava', 1, 'electricity', 5.0);

-- ═══ NODE RECIPE MAPPING ═══
INSERT OR REPLACE INTO node_recipes (node_template_id, recipe_id, recipe_version_id) VALUES ('smelter', 'smelter_iron', 1);
INSERT OR REPLACE INTO node_recipes (node_template_id, recipe_id, recipe_version_id) VALUES ('smelter', 'smelter_copper', 1);
INSERT OR REPLACE INTO node_recipes (node_template_id, recipe_id, recipe_version_id) VALUES ('hydroGenerator', 'fluid_gen_water', 1);
INSERT OR REPLACE INTO node_recipes (node_template_id, recipe_id, recipe_version_id) VALUES ('hydroGenerator', 'fluid_gen_lava', 1);

