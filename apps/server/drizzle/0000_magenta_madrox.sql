CREATE TABLE `custom_recipe_ingredients` (
	`custom_recipe_id` text NOT NULL,
	`item_id` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`custom_recipe_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `custom_recipe_outputs` (
	`custom_recipe_id` text NOT NULL,
	`item_id` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`custom_recipe_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `custom_recipes` (
	`id` text PRIMARY KEY NOT NULL,
	`save_state_id` text NOT NULL,
	`node_id` text NOT NULL,
	`machine_type` text NOT NULL,
	`duration_seconds` real,
	`power_demand` real
);
--> statement-breakpoint
CREATE TABLE `game_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`version` text NOT NULL,
	`released_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text NOT NULL,
	`since_version_id` integer NOT NULL,
	`until_version_id` integer,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`icon` text,
	PRIMARY KEY(`id`, `since_version_id`)
);
--> statement-breakpoint
CREATE TABLE `node_recipes` (
	`node_template_id` text NOT NULL,
	`recipe_id` text NOT NULL,
	`recipe_version_id` integer NOT NULL,
	PRIMARY KEY(`node_template_id`, `recipe_id`, `recipe_version_id`)
);
--> statement-breakpoint
CREATE TABLE `node_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`icon` text,
	`resource_type` text,
	`input_type` text,
	`output_type` text,
	`conversion_rate` text,
	`initial_rate` text,
	`power_demand` text,
	`style_bg` text,
	`style_header` text
);
--> statement-breakpoint
CREATE TABLE `recipe_ingredients` (
	`recipe_id` text NOT NULL,
	`since_version_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`recipe_id`, `since_version_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `recipe_outputs` (
	`recipe_id` text NOT NULL,
	`since_version_id` integer NOT NULL,
	`item_id` text NOT NULL,
	`amount` real NOT NULL,
	PRIMARY KEY(`recipe_id`, `since_version_id`, `item_id`)
);
--> statement-breakpoint
CREATE TABLE `recipes` (
	`id` text NOT NULL,
	`since_version_id` integer NOT NULL,
	`until_version_id` integer,
	`name` text NOT NULL,
	`duration_seconds` real DEFAULT 1,
	`power_demand` real DEFAULT 0,
	PRIMARY KEY(`id`, `since_version_id`)
);
--> statement-breakpoint
CREATE TABLE `save_states` (
	`id` text PRIMARY KEY NOT NULL,
	`player_id` text NOT NULL,
	`name` text NOT NULL,
	`game_version` text NOT NULL,
	`save_data` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE UNIQUE INDEX `game_versions_version_unique` ON `game_versions` (`version`);