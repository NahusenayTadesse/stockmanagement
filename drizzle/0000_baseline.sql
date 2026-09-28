CREATE TABLE `account` (
	`id` varchar(255) NOT NULL,
	`account_id` varchar(255) NOT NULL,
	`provider_id` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` datetime,
	`refresh_token_expires_at` datetime,
	`scope` text,
	`password` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `account_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_provider_account_idx` UNIQUE(`provider_id`,`account_id`)
);
--> statement-breakpoint
CREATE TABLE `organization` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`tin` varchar(20),
	`phone` varchar(30),
	`address` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `organization_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`description` varchar(255),
	`is_owner` boolean NOT NULL DEFAULT false,
	`is_active` boolean NOT NULL DEFAULT true,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `roles_org_name_idx` UNIQUE(`org_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `session` (
	`id` varchar(255) NOT NULL,
	`token` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`expires_at` datetime NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`impersonated_by` varchar(255),
	CONSTRAINT `session_id` PRIMARY KEY(`id`),
	CONSTRAINT `session_token_unique` UNIQUE(`token`)
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`email_verified` boolean NOT NULL DEFAULT false,
	`image` text,
	`org_id` int NOT NULL,
	`role_id` int NOT NULL,
	`branch_id` int,
	`is_active` boolean NOT NULL DEFAULT true,
	`role` varchar(64),
	`banned` boolean DEFAULT false,
	`ban_reason` text,
	`ban_expires` datetime,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `user_id` PRIMARY KEY(`id`),
	CONSTRAINT `user_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification` (
	`id` varchar(255) NOT NULL,
	`identifier` varchar(255) NOT NULL,
	`value` text NOT NULL,
	`expires_at` datetime NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `verification_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(50) NOT NULL,
	`description` varchar(255),
	CONSTRAINT `permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `permissions_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`role_id` int NOT NULL,
	`permission_id` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `role_permission_idx` UNIQUE(`role_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `special_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`permission_id` int NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `special_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `special_permission_idx` UNIQUE(`user_id`,`permission_id`)
);
--> statement-breakpoint
CREATE TABLE `branch` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`code` varchar(10) NOT NULL,
	`phone` varchar(30),
	`address` varchar(255),
	`status` boolean NOT NULL DEFAULT true,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `branch_id` PRIMARY KEY(`id`),
	CONSTRAINT `branch_org_name_idx` UNIQUE(`org_id`,`name`),
	CONSTRAINT `branch_org_code_idx` UNIQUE(`org_id`,`code`)
);
--> statement-breakpoint
CREATE TABLE `location` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`kind` enum('storage','sales','cold','quarantine') NOT NULL DEFAULT 'storage',
	`status` boolean NOT NULL DEFAULT true,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `location_id` PRIMARY KEY(`id`),
	CONSTRAINT `location_branch_name_idx` UNIQUE(`branch_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `barcode` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`code` varchar(64) NOT NULL,
	`uom_id` int,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `barcode_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `category` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(100) NOT NULL,
	`name_am` varchar(100),
	`expiry_warning_days` int NOT NULL DEFAULT 90,
	`status` boolean NOT NULL DEFAULT true,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `category_id` PRIMARY KEY(`id`),
	CONSTRAINT `category_org_name_idx` UNIQUE(`org_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `item` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`sku` varchar(40) NOT NULL,
	`name` varchar(160) NOT NULL,
	`name_am` varchar(160),
	`category_id` int,
	`base_uom_id` int NOT NULL,
	`description` text,
	`stock_tracked` boolean NOT NULL DEFAULT true,
	`track_lots` boolean NOT NULL DEFAULT false,
	`track_expiry` boolean NOT NULL DEFAULT false,
	`track_serials` boolean NOT NULL DEFAULT false,
	`sellable` boolean NOT NULL DEFAULT true,
	`purchasable` boolean NOT NULL DEFAULT true,
	`leasable` boolean NOT NULL DEFAULT false,
	`consumable` boolean NOT NULL DEFAULT false,
	`perishable` boolean NOT NULL DEFAULT false,
	`prescription_only` boolean NOT NULL DEFAULT false,
	`controlled_substance` boolean NOT NULL DEFAULT false,
	`storage_condition` enum('ambient','cool','cold','frozen') NOT NULL DEFAULT 'ambient',
	`reorder_level` decimal(18,4),
	`sale_price` decimal(14,2),
	`avg_cost` decimal(18,4) NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `item_id` PRIMARY KEY(`id`),
	CONSTRAINT `item_org_sku_idx` UNIQUE(`org_id`,`sku`)
);
--> statement-breakpoint
CREATE TABLE `item_unit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`uom_id` int NOT NULL,
	`factor` decimal(18,6) NOT NULL,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `item_unit_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `uom` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(40) NOT NULL,
	`symbol` varchar(12) NOT NULL,
	`status` boolean NOT NULL DEFAULT true,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `uom_id` PRIMARY KEY(`id`),
	CONSTRAINT `uom_org_name_idx` UNIQUE(`org_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `payment_method` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(60) NOT NULL,
	`kind` enum('cash','mobile_money','bank','cheque','other') NOT NULL DEFAULT 'other',
	`account_number` varchar(60),
	`status` boolean NOT NULL DEFAULT true,
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `payment_method_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_method_org_name_idx` UNIQUE(`org_id`,`name`)
);
--> statement-breakpoint
CREATE TABLE `transaction_attachment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`transaction_id` int NOT NULL,
	`file_name` varchar(100) NOT NULL,
	`original_name` varchar(255),
	`mime_type` varchar(60),
	`size_bytes` int,
	`uploaded_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `transaction_attachment_id` PRIMARY KEY(`id`),
	CONSTRAINT `transaction_attachment_file_idx` UNIQUE(`file_name`)
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int,
	`direction` enum('in','out') NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`occurred_on` date NOT NULL,
	`payment_method_id` int,
	`purpose` enum('purchase','sale','expense','other_income','other') NOT NULL DEFAULT 'other',
	`receipt_number` varchar(60),
	`reference` varchar(100),
	`party` varchar(160),
	`description` varchar(255),
	`status` enum('recorded','verified','void') NOT NULL DEFAULT 'recorded',
	`verified_by` varchar(255),
	`verified_at` datetime,
	`void_reason` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `lot` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`lot_number` varchar(60) NOT NULL,
	`expiry_date` date,
	`status` enum('available','quarantine','recalled') NOT NULL DEFAULT 'available',
	`note` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `lot_id` PRIMARY KEY(`id`),
	CONSTRAINT `lot_item_number_idx` UNIQUE(`item_id`,`lot_number`)
);
--> statement-breakpoint
CREATE TABLE `number_sequence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int NOT NULL,
	`doc_type` varchar(20) NOT NULL,
	`fiscal_year` int NOT NULL,
	`last_number` int NOT NULL DEFAULT 0,
	CONSTRAINT `number_sequence_id` PRIMARY KEY(`id`),
	CONSTRAINT `number_sequence_key_idx` UNIQUE(`branch_id`,`doc_type`,`fiscal_year`)
);
--> statement-breakpoint
CREATE TABLE `serial_unit` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`item_id` int NOT NULL,
	`serial_number` varchar(80) NOT NULL,
	`lot_id` int,
	`status` enum('in_stock','issued','leased','maintenance','disposed') NOT NULL DEFAULT 'in_stock',
	`location_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `serial_unit_id` PRIMARY KEY(`id`),
	CONSTRAINT `serial_item_number_idx` UNIQUE(`item_id`,`serial_number`)
);
--> statement-breakpoint
CREATE TABLE `stock_balance` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`location_id` int NOT NULL,
	`item_id` int NOT NULL,
	`lot_id` int,
	`lot_key` int NOT NULL DEFAULT 0,
	`quantity` decimal(18,4) NOT NULL DEFAULT 0,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `stock_balance_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_balance_key_idx` UNIQUE(`location_id`,`item_id`,`lot_key`)
);
--> statement-breakpoint
CREATE TABLE `stock_document` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`type` enum('receipt','issue','transfer','adjustment') NOT NULL,
	`status` enum('draft','posted','cancelled') NOT NULL DEFAULT 'draft',
	`number` varchar(40),
	`branch_id` int NOT NULL,
	`doc_date` date NOT NULL,
	`from_location_id` int,
	`to_location_id` int,
	`reference` varchar(80),
	`party` varchar(160),
	`reason` enum('count','damage','expiry','found','other'),
	`note` text,
	`transaction_id` int,
	`posted_at` datetime,
	`posted_by` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `stock_document_id` PRIMARY KEY(`id`),
	CONSTRAINT `stock_document_number_idx` UNIQUE(`org_id`,`number`)
);
--> statement-breakpoint
CREATE TABLE `stock_document_line` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`document_id` int NOT NULL,
	`item_id` int NOT NULL,
	`uom_id` int NOT NULL,
	`quantity` decimal(18,4) NOT NULL,
	`unit_cost` decimal(18,4),
	`lot_id` int,
	`lot_number` varchar(60),
	`expiry_date` date,
	`serials` text,
	`note` varchar(255),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `stock_document_line_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movement` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`kind` enum('receipt','issue','transfer_out','transfer_in','adjustment_in','adjustment_out') NOT NULL,
	`item_id` int NOT NULL,
	`location_id` int NOT NULL,
	`lot_id` int,
	`serial_unit_id` int,
	`quantity` decimal(18,4) NOT NULL,
	`unit_cost` decimal(18,4) NOT NULL,
	`document_id` int NOT NULL,
	`document_line_id` int,
	`doc_date` date NOT NULL,
	`created_by` varchar(255),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `stock_movement_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` varchar(255),
	`action` varchar(20) NOT NULL,
	`table_name` varchar(64) NOT NULL,
	`record_id` varchar(64) NOT NULL,
	`changes` longtext,
	`ip_address` varchar(45),
	`branch_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `audit_log_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account` ADD CONSTRAINT `account_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roles` ADD CONSTRAINT `roles_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `roles` ADD CONSTRAINT `roles_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `session` ADD CONSTRAINT `session_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user` ADD CONSTRAINT `user_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user` ADD CONSTRAINT `user_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user` ADD CONSTRAINT `user_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_roles_id_fk` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `special_permissions` ADD CONSTRAINT `special_permissions_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `special_permissions` ADD CONSTRAINT `special_permissions_permission_id_permissions_id_fk` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `special_permissions` ADD CONSTRAINT `special_permissions_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `special_permissions` ADD CONSTRAINT `special_permissions_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `special_permissions` ADD CONSTRAINT `special_permissions_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch` ADD CONSTRAINT `branch_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `branch` ADD CONSTRAINT `branch_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location` ADD CONSTRAINT `location_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location` ADD CONSTRAINT `location_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `location` ADD CONSTRAINT `location_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barcode` ADD CONSTRAINT `barcode_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barcode` ADD CONSTRAINT `barcode_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barcode` ADD CONSTRAINT `barcode_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `barcode` ADD CONSTRAINT `barcode_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category` ADD CONSTRAINT `category_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `category` ADD CONSTRAINT `category_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_category_id_category_id_fk` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_base_uom_id_uom_id_fk` FOREIGN KEY (`base_uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_unit` ADD CONSTRAINT `item_unit_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_unit` ADD CONSTRAINT `item_unit_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_unit` ADD CONSTRAINT `item_unit_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `item_unit` ADD CONSTRAINT `item_unit_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `uom` ADD CONSTRAINT `uom_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `uom` ADD CONSTRAINT `uom_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_method` ADD CONSTRAINT `payment_method_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `payment_method` ADD CONSTRAINT `payment_method_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_attachment` ADD CONSTRAINT `transaction_attachment_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_attachment` ADD CONSTRAINT `transaction_attachment_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_attachment` ADD CONSTRAINT `transaction_attachment_uploaded_by_user_id_fk` FOREIGN KEY (`uploaded_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transaction_attachment` ADD CONSTRAINT `transaction_attachment_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_payment_method_id_payment_method_id_fk` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_method`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_verified_by_user_id_fk` FOREIGN KEY (`verified_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lot` ADD CONSTRAINT `lot_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lot` ADD CONSTRAINT `lot_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `number_sequence` ADD CONSTRAINT `number_sequence_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `number_sequence` ADD CONSTRAINT `number_sequence_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `serial_unit` ADD CONSTRAINT `serial_unit_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `serial_unit` ADD CONSTRAINT `serial_unit_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `serial_unit` ADD CONSTRAINT `serial_unit_lot_id_lot_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lot`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `serial_unit` ADD CONSTRAINT `serial_unit_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_balance` ADD CONSTRAINT `stock_balance_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_balance` ADD CONSTRAINT `stock_balance_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_balance` ADD CONSTRAINT `stock_balance_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_balance` ADD CONSTRAINT `stock_balance_lot_id_lot_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lot`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_from_location_id_location_id_fk` FOREIGN KEY (`from_location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_to_location_id_location_id_fk` FOREIGN KEY (`to_location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_transaction_id_transactions_id_fk` FOREIGN KEY (`transaction_id`) REFERENCES `transactions`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_posted_by_user_id_fk` FOREIGN KEY (`posted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_document_id_stock_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `stock_document`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_uom_id_uom_id_fk` FOREIGN KEY (`uom_id`) REFERENCES `uom`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_lot_id_lot_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lot`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_item_id_item_id_fk` FOREIGN KEY (`item_id`) REFERENCES `item`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_location_id_location_id_fk` FOREIGN KEY (`location_id`) REFERENCES `location`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_lot_id_lot_id_fk` FOREIGN KEY (`lot_id`) REFERENCES `lot`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_serial_unit_id_serial_unit_id_fk` FOREIGN KEY (`serial_unit_id`) REFERENCES `serial_unit`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_document_id_stock_document_id_fk` FOREIGN KEY (`document_id`) REFERENCES `stock_document`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_document_line_id_stock_document_line_id_fk` FOREIGN KEY (`document_line_id`) REFERENCES `stock_document_line`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `audit_log` ADD CONSTRAINT `audit_log_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `account_user_id_idx` ON `account` (`user_id`);--> statement-breakpoint
CREATE INDEX `session_user_id_idx` ON `session` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_org_idx` ON `user` (`org_id`);--> statement-breakpoint
CREATE INDEX `verification_identifier_idx` ON `verification` (`identifier`);--> statement-breakpoint
CREATE INDEX `barcode_org_code_idx` ON `barcode` (`org_id`,`code`);--> statement-breakpoint
CREATE INDEX `item_org_name_idx` ON `item` (`org_id`,`name`);--> statement-breakpoint
CREATE INDEX `item_unit_item_idx` ON `item_unit` (`item_id`);--> statement-breakpoint
CREATE INDEX `transaction_attachment_txn_idx` ON `transaction_attachment` (`transaction_id`);--> statement-breakpoint
CREATE INDEX `transactions_org_date_idx` ON `transactions` (`org_id`,`occurred_on`);--> statement-breakpoint
CREATE INDEX `transactions_org_reference_idx` ON `transactions` (`org_id`,`reference`);--> statement-breakpoint
CREATE INDEX `lot_org_expiry_idx` ON `lot` (`org_id`,`expiry_date`);--> statement-breakpoint
CREATE INDEX `stock_balance_org_item_idx` ON `stock_balance` (`org_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `stock_document_org_status_idx` ON `stock_document` (`org_id`,`status`,`type`);--> statement-breakpoint
CREATE INDEX `stock_document_line_doc_idx` ON `stock_document_line` (`document_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_item_idx` ON `stock_movement` (`org_id`,`item_id`,`id`);--> statement-breakpoint
CREATE INDEX `stock_movement_location_idx` ON `stock_movement` (`location_id`,`item_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_document_idx` ON `stock_movement` (`document_id`);--> statement-breakpoint
CREATE INDEX `audit_table_record_idx` ON `audit_log` (`table_name`,`record_id`);