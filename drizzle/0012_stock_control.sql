CREATE TABLE `user_branch` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`branch_id` int NOT NULL,
	CONSTRAINT `user_branch_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_branch_key_idx` UNIQUE(`user_id`,`branch_id`)
);
--> statement-breakpoint
CREATE TABLE `kit_component` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`kit_item_id` int NOT NULL,
	`component_item_id` int NOT NULL,
	`uom_id` int NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `kit_component_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cost_layer` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`movement_id` int,
	`doc_date` date NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`remaining` decimal(18,4) NOT NULL,
	`unit_cost` decimal(18,4) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `cost_layer_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `landed_cost` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`document_id` int NOT NULL,
	`kind` enum('freight','insurance','duty','excise','surtax','clearing','transport','other') NOT NULL,
	`description` varchar(160),
	`amount` decimal(14,2) NOT NULL,
	`method` enum('value','quantity','weight') NOT NULL DEFAULT 'value',
	`supplier_id` int,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `landed_cost_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `reorder_rule` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`min_quantity` decimal(18,4) NOT NULL,
	`max_quantity` decimal(18,4),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reorder_rule_id` PRIMARY KEY(`id`),
	CONSTRAINT `reorder_rule_key_idx` UNIQUE(`location_id`,`item_id`)
);
--> statement-breakpoint
CREATE TABLE `stock_reservation` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`quote_id` int,
	`requisition_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`created_by` varchar(255),
	CONSTRAINT `stock_reservation_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `approval_request` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`kind` enum('adjustment','count','purchase_order') NOT NULL,
	`status` enum('pending','approved','rejected','withdrawn') NOT NULL DEFAULT 'pending',
	`document_id` int,
	`count_id` int,
	`purchase_order_id` int,
	`value` decimal(14,2) NOT NULL,
	`reason` varchar(255) NOT NULL,
	`requested_by` varchar(255),
	`requested_at` timestamp NOT NULL DEFAULT (now()),
	`decided_by` varchar(255),
	`decided_at` datetime,
	`decision_note` varchar(255),
	CONSTRAINT `approval_request_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requisition` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`number` varchar(40),
	`status` enum('draft','submitted','approved','rejected','issued','cancelled') NOT NULL DEFAULT 'draft',
	`department` varchar(120) NOT NULL,
	`request_date` date NOT NULL,
	`needed_by` date,
	`location_id` int NOT NULL,
	`note` text,
	`submitted_at` datetime,
	`submitted_by` varchar(255),
	`decided_at` datetime,
	`decided_by` varchar(255),
	`decision_note` varchar(255),
	`issue_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `requisition_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `requisition_line` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`requisition_id` int NOT NULL,
	`item_id` int NOT NULL,
	`uom_id` int NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`approved_quantity` decimal(18,4),
	`note` varchar(255),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `requisition_line_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `location` MODIFY COLUMN `kind` enum('storage','sales','cold','quarantine','transit') NOT NULL DEFAULT 'storage';--> statement-breakpoint
ALTER TABLE `stock_document` MODIFY COLUMN `status` enum('draft','in_transit','posted','cancelled') NOT NULL DEFAULT 'draft';--> statement-breakpoint
ALTER TABLE `stock_document` MODIFY COLUMN `reason` enum('count','damage','expiry','found','opening','other');--> statement-breakpoint
ALTER TABLE `stock_movement` MODIFY COLUMN `kind` enum('receipt','issue','transfer_out','transfer_in','adjustment_in','adjustment_out','sales_return','purchase_return','transit_loss') NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `costing_method` enum('average','fifo');--> statement-breakpoint
ALTER TABLE `organization` ADD `reserve_stock` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `approve_adjustments_over` decimal(14,2);--> statement-breakpoint
ALTER TABLE `organization` ADD `approve_write_offs` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `approve_counts_over` decimal(14,2);--> statement-breakpoint
ALTER TABLE `organization` ADD `approve_orders_over` decimal(14,2);--> statement-breakpoint
ALTER TABLE `supplier` ADD `lead_time_days` int;--> statement-breakpoint
ALTER TABLE `category` ADD `min_shelf_life_days` int;--> statement-breakpoint
ALTER TABLE `category` ADD `refuse_short_shelf_life` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `item` ADD `parent_item_id` int;--> statement-breakpoint
ALTER TABLE `item` ADD `variant_label` varchar(80);--> statement-breakpoint
ALTER TABLE `item` ADD `is_kit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `item` ADD `warranty_months` int;--> statement-breakpoint
ALTER TABLE `item` ADD `weight_kg` decimal(12,3);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `requisition_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `driver_name` varchar(120);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `vehicle_plate` varchar(20);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `transit_location_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `received_at` datetime;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `received_by` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `currency` varchar(3);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `exchange_rate` decimal(14,6);--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `foreign_unit_cost` decimal(18,4);--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `landed_cost` decimal(18,4);--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `received_quantity` decimal(18,4);--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `received_serials` text;--> statement-breakpoint
ALTER TABLE `user_branch` ADD CONSTRAINT `user_branch_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_branch` ADD CONSTRAINT `user_branch_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_branch` ADD CONSTRAINT `user_branch_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_component` ADD CONSTRAINT `kit_component_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_component` ADD CONSTRAINT `kit_component_kit_item_id_item_id_fk` FOREIGN KEY (`kit_item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_component` ADD CONSTRAINT `kit_component_component_item_id_item_id_fk` FOREIGN KEY (`component_item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_component` ADD CONSTRAINT `kit_component_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `kit_component` ADD CONSTRAINT `kit_component_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_layer` ADD CONSTRAINT `cost_layer_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_layer` ADD CONSTRAINT `cost_layer_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `cost_layer` ADD CONSTRAINT `cost_layer_movement_id_stock_movement_id_fk` FOREIGN KEY (`movement_id`) REFERENCES `stock_movement`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `landed_cost` ADD CONSTRAINT `landed_cost_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `landed_cost` ADD CONSTRAINT `landed_cost_document_id_stock_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `stock_document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `landed_cost` ADD CONSTRAINT `landed_cost_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `landed_cost` ADD CONSTRAINT `landed_cost_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reorder_rule` ADD CONSTRAINT `reorder_rule_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reorder_rule` ADD CONSTRAINT `reorder_rule_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `reorder_rule` ADD CONSTRAINT `reorder_rule_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservation` ADD CONSTRAINT `stock_reservation_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservation` ADD CONSTRAINT `stock_reservation_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservation` ADD CONSTRAINT `stock_reservation_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservation` ADD CONSTRAINT `stock_reservation_quote_id_quote_id_fk` FOREIGN KEY (`quote_id`) REFERENCES `quote`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservation` ADD CONSTRAINT `stock_reservation_requisition_id_requisition_id_fk` FOREIGN KEY (`requisition_id`) REFERENCES `requisition`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_reservation` ADD CONSTRAINT `stock_reservation_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_request` ADD CONSTRAINT `approval_request_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_request` ADD CONSTRAINT `approval_request_document_id_stock_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `stock_document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_request` ADD CONSTRAINT `approval_request_count_id_stock_count_id_fk` FOREIGN KEY (`count_id`) REFERENCES `stock_count`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_request` ADD CONSTRAINT `approval_request_purchase_order_id_purchase_order_id_fk` FOREIGN KEY (`purchase_order_id`) REFERENCES `purchase_order`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_request` ADD CONSTRAINT `approval_request_requested_by_user_id_fk` FOREIGN KEY (`requested_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `approval_request` ADD CONSTRAINT `approval_request_decided_by_user_id_fk` FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_submitted_by_user_id_fk` FOREIGN KEY (`submitted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_decided_by_user_id_fk` FOREIGN KEY (`decided_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_issue_id_stock_document_id_fk` FOREIGN KEY (`issue_id`) REFERENCES `stock_document`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition` ADD CONSTRAINT `requisition_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition_line` ADD CONSTRAINT `requisition_line_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition_line` ADD CONSTRAINT `requisition_line_requisition_id_requisition_id_fk` FOREIGN KEY (`requisition_id`) REFERENCES `requisition`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition_line` ADD CONSTRAINT `requisition_line_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition_line` ADD CONSTRAINT `requisition_line_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `requisition_line` ADD CONSTRAINT `requisition_line_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `kit_component_kit_idx` ON `kit_component` (`kit_item_id`);--> statement-breakpoint
CREATE INDEX `cost_layer_item_idx` ON `cost_layer` (`org_id`,`item_id`,`remaining`);--> statement-breakpoint
CREATE INDEX `landed_cost_document_idx` ON `landed_cost` (`document_id`);--> statement-breakpoint
CREATE INDEX `stock_reservation_key_idx` ON `stock_reservation` (`location_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `approval_request_org_status_idx` ON `approval_request` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `requisition_org_status_idx` ON `requisition` (`org_id`,`status`);--> statement-breakpoint
CREATE INDEX `requisition_line_req_idx` ON `requisition_line` (`requisition_id`);--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_parent_item_id_item_id_fk` FOREIGN KEY (`parent_item_id`) REFERENCES `item`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_requisition_id_requisition_id_fk` FOREIGN KEY (`requisition_id`) REFERENCES `requisition`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_transit_location_id_location_id_fk` FOREIGN KEY (`transit_location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_received_by_user_id_fk` FOREIGN KEY (`received_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;