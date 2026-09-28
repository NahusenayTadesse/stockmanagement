CREATE TABLE `purchase_order` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`supplier_id` int NOT NULL,
	`number` varchar(40),
	`status` enum('draft','ordered','partially_received','received','closed','cancelled') NOT NULL DEFAULT 'draft',
	`order_date` date NOT NULL,
	`expected_date` date,
	`location_id` int NOT NULL,
	`reference` varchar(80),
	`note` text,
	`ordered_at` datetime,
	`ordered_by` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `purchase_order_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_order_number_idx` UNIQUE(`org_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `purchase_order_line` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`purchase_order_id` int NOT NULL,
	`item_id` int NOT NULL,
	`uom_id` int NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`unit_price` decimal(18,4),
	`note` varchar(255),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `purchase_order_line_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_count` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`location_id` int NOT NULL,
	`category_id` int,
	`count_date` date NOT NULL,
	`status` enum('open','posted','cancelled') NOT NULL DEFAULT 'open',
	`blind` boolean NOT NULL DEFAULT true,
	`note` text,
	`adjustment_id` int,
	`posted_at` datetime,
	`posted_by` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `stock_count_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_count_line` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`count_id` int NOT NULL,
	`item_id` int NOT NULL,
	`lot_id` int,
	`lot_key` int NOT NULL DEFAULT 0,
	`expected` decimal(18,4) NOT NULL,
	`counted` decimal(18,4),
	`added_during_count` boolean NOT NULL DEFAULT false,
	`note` varchar(255),
	`counted_by` varchar(255),
	CONSTRAINT `stock_count_line_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_count_line_key_idx` UNIQUE(`count_id`,`item_id`,`lot_key`)
);
--> statement-breakpoint
ALTER TABLE `stock_document` ADD `purchase_order_id` int;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `purchase_order_line_id` int;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_ordered_by_user_id_fk` FOREIGN KEY (`ordered_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order` ADD CONSTRAINT `purchase_order_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD CONSTRAINT `purchase_order_line_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD CONSTRAINT `purchase_order_line_purchase_order_id_purchase_order_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD CONSTRAINT `purchase_order_line_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD CONSTRAINT `purchase_order_line_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `purchase_order_line` ADD CONSTRAINT `purchase_order_line_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_adjustment_id_stock_document_id_fk` FOREIGN KEY (`adjustment_id`) REFERENCES `stock_document`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_posted_by_user_id_fk` FOREIGN KEY (`posted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count` ADD CONSTRAINT `stock_count_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_line` ADD CONSTRAINT `stock_count_line_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_line` ADD CONSTRAINT `stock_count_line_count_id_stock_count_id_fk` FOREIGN KEY (`count_id`) REFERENCES `stock_count`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_line` ADD CONSTRAINT `stock_count_line_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_line` ADD CONSTRAINT `stock_count_line_lot_id_lot_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lot`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_count_line` ADD CONSTRAINT `stock_count_line_counted_by_user_id_fk` FOREIGN KEY (`counted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `purchase_order_org_status_idx` ON `purchase_order` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `purchase_order_supplier_idx` ON `purchase_order` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `purchase_order_line_po_idx` ON `purchase_order_line` (`purchase_order_id`);--> statement-breakpoint
CREATE INDEX `stock_count_org_status_idx` ON `stock_count` (`org_id`,`status`);--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_purchase_order_id_purchase_order_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_po_line_fk` FOREIGN KEY (`purchase_order_line_id`) REFERENCES `purchase_order_line`(`id`) ON DELETE restrict ON UPDATE no action;