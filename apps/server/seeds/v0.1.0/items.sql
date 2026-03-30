-- apps/server/seeds/v0.1.0/items.sql
-- Baseline Items Metadata for AliGrid v0.1.0

INSERT OR REPLACE INTO items (id, since_version_id, name, type, icon, color, unit, is_upload_available)
VALUES 
('water', 1, 'Water', 'liquid', '💧', '#3b82f6', 'm³', 1),
('iron_ore', 1, 'Iron Ore', 'solid', '🪨', '#94a3b8', NULL, 1),
('copper_ore', 1, 'Copper Ore', 'solid', '🪨', '#d97706', NULL, 1),
('iron', 1, 'Iron Ingot', 'solid', '🛡️', '#cbd5e1', NULL, 1),
('copper', 1, 'Copper Ingot', 'solid', '🪙', '#b45309', NULL, 1),
('coal', 1, 'Coal', 'solid', '🔥', '#334155', NULL, 1),
('lava', 1, 'Lava', 'liquid', '🌋', '#ea580c', 'm³', 1),
('electricity', 1, 'Electricity', 'power', '⚡', '#facc15', 'W', 0),
('wood_log', 1, 'Wood Log', 'solid', '🪵', '#8b5a2b', NULL, 1),
('leaf', 1, 'Leaf', 'solid', '🍁', '#16a34a', NULL, 1),
('wood_plank', 1, 'Wood Plank', 'solid', '🪜', '#b45309', NULL, 1),
('compost', 1, 'Compost', 'solid', '🧫', '#451a03', NULL, 1),
('plant_fiber', 1, 'Plant Fiber', 'solid', '🌾', '#84cc16', NULL, 1),
('bioplastic', 1, 'Bio-Plastic', 'solid', '🟢', '#22c55e', NULL, 1),
('cobblestone', 1, 'Cobblestone', 'solid', '🪨', '#6b7280', NULL, 1),
('gravel', 1, 'Gravel', 'solid', '🪨', '#9ca3af', NULL, 1),
('sand', 1, 'Sand', 'solid', '🏖️', '#fef08a', NULL, 1),
('dust', 1, 'Dust', 'solid', '🌫️', '#e5e7eb', NULL, 1);
