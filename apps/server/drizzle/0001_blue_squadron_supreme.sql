CREATE TABLE `edge_upgrade_costs` (
	`matter` text NOT NULL,
	`item_id` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`matter`, `item_id`)
);
--> statement-breakpoint
ALTER TABLE `node_templates` ADD `radius` integer;--> statement-breakpoint
ALTER TABLE `node_templates` ADD `input_rates` text;--> statement-breakpoint
ALTER TABLE `node_templates` ADD `upgrade_cost_config` text;--> statement-breakpoint
ALTER TABLE `node_templates` ADD `upgrade_benefit_config` text;