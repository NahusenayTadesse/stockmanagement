CREATE TABLE `pos_cart` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`user_id` varchar(255),
	`shift_id` int,
	`label` varchar(80),
	`customer_id` int,
	`cart` text NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pos_cart_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `pos_shift` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`location_id` int NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`opened_at` timestamp NOT NULL DEFAULT (now()),
	`opening_float` decimal(14,2) NOT NULL DEFAULT 0,
	`closed_at` datetime,
	`closed_by` varchar(255),
	`expected_cash` decimal(14,2),
	`counted_cash` decimal(14,2),
	`note` varchar(255),
	CONSTRAINT `pos_shift_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_list` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`note` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `price_list_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `price_list_item` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`price_list_id` int NOT NULL,
	`item_id` int NOT NULL,
	`uom_id` int,
	`price` decimal(14,2) NOT NULL,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `price_list_item_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`number` varchar(40),
	`status` enum('draft','sent','accepted','converted','expired','cancelled') NOT NULL DEFAULT 'draft',
	`quote_date` date NOT NULL,
	`valid_until` date,
	`customer_id` int,
	`buyer_name` varchar(160),
	`buyer_tin` varchar(20),
	`buyer_phone` varchar(40),
	`location_id` int,
	`reference` varchar(80),
	`note` text,
	`terms` text,
	`sale_id` int,
	`sent_at` datetime,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `quote_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `quote_line` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`quote_id` int NOT NULL,
	`item_id` int NOT NULL,
	`uom_id` int NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`unit_price` decimal(18,4) NOT NULL,
	`list_price` decimal(18,4),
	`note` varchar(255),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `quote_line_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `max_discount_percent` decimal(5,2);--> statement-breakpoint
ALTER TABLE `customer` ADD `price_list_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `document_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `shift_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `quote_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `shift_id` int;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `list_price` decimal(18,4);--> statement-breakpoint
ALTER TABLE `pos_cart` ADD CONSTRAINT `pos_cart_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_cart` ADD CONSTRAINT `pos_cart_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_cart` ADD CONSTRAINT `pos_cart_shift_id_pos_shift_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `pos_shift`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_cart` ADD CONSTRAINT `pos_cart_customer_id_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_shift` ADD CONSTRAINT `pos_shift_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_shift` ADD CONSTRAINT `pos_shift_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_shift` ADD CONSTRAINT `pos_shift_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_shift` ADD CONSTRAINT `pos_shift_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `pos_shift` ADD CONSTRAINT `pos_shift_closed_by_user_id_fk` FOREIGN KEY (`closed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list` ADD CONSTRAINT `price_list_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list` ADD CONSTRAINT `price_list_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list` ADD CONSTRAINT `price_list_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list` ADD CONSTRAINT `price_list_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list_item` ADD CONSTRAINT `price_list_item_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list_item` ADD CONSTRAINT `price_list_item_price_list_id_price_list_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `price_list`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list_item` ADD CONSTRAINT `price_list_item_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list_item` ADD CONSTRAINT `price_list_item_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `price_list_item` ADD CONSTRAINT `price_list_item_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_customer_id_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_sale_id_stock_document_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `stock_document`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote` ADD CONSTRAINT `quote_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_line` ADD CONSTRAINT `quote_line_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_line` ADD CONSTRAINT `quote_line_quote_id_quote_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quote`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_line` ADD CONSTRAINT `quote_line_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_line` ADD CONSTRAINT `quote_line_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `quote_line` ADD CONSTRAINT `quote_line_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `pos_shift_org_status_idx` ON `pos_shift` (`org_id`,`status`,`user_id`);--> statement-breakpoint
CREATE INDEX `price_list_item_list_idx` ON `price_list_item` (`price_list_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `quote_org_status_idx` ON `quote` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `quote_line_quote_idx` ON `quote_line` (`quote_id`);--> statement-breakpoint
ALTER TABLE `customer` ADD CONSTRAINT `customer_price_list_id_price_list_id_fk` FOREIGN KEY (`price_list_id`) REFERENCES `price_list`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_document_id_stock_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `stock_document`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_shift_id_pos_shift_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `pos_shift`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_quote_id_quote_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quote`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_shift_id_pos_shift_id_fk` FOREIGN KEY (`shift_id`) REFERENCES `pos_shift`(`id`) ON DELETE set null ON UPDATE no action;