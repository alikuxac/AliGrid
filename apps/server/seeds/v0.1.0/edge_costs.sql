-- apps/server/seeds/v0.1.0/edge_costs.sql

INSERT OR REPLACE INTO edge_upgrade_costs (matter, item_id, amount) VALUES 
('solid', 'iron', 100),
('liquid', 'iron', 200),
('liquid', 'water', 200),
('gas', 'iron', 300),
('power', 'iron', 500);
