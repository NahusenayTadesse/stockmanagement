CREATE TABLE `supplier` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(40) NOT NULL,
	`email` varchar(160),
	`address` varchar(255),
	`tin` varchar(20),
	`contact_person` varchar(120),
	`note` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `supplier_id` PRIMARY KEY(`id`),
	CONSTRAINT `supplier_org_name_idx` UNIQUE(`org_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `item` ADD `supplier_id` int;--> statement-breakpoint
ALTER TABLE `transactions` ADD `supplier_id` int;--> statement-breakpoint
ALTER TABLE `lot` ADD `supplier_id` int;--> statement-breakpoint
ALTER TABLE `serial_unit` ADD `supplier_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `supplier_id` int;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD `supplier_id` int;--> statement-breakpoint
ALTER TABLE `supplier` ADD CONSTRAINT `supplier_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier` ADD CONSTRAINT `supplier_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier` ADD CONSTRAINT `supplier_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `supplier` ADD CONSTRAINT `supplier_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `supplier_org_phone_idx` ON `supplier` (`org_id`,`phone`);--> statement-breakpoint
ALTER TABLE `item` ADD CONSTRAINT `item_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `lot` ADD CONSTRAINT `lot_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `serial_unit` ADD CONSTRAINT `serial_unit_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movement` ADD CONSTRAINT `stock_movement_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `transactions_supplier_idx` ON `transactions` (`supplier_id`);--> statement-breakpoint
CREATE INDEX `stock_movement_supplier_idx` ON `stock_movement` (`supplier_id`,`kind`);