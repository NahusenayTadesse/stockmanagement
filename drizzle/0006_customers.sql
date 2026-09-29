CREATE TABLE `customer` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`name` varchar(160) NOT NULL,
	`phone` varchar(40),
	`email` varchar(160),
	`address` varchar(255),
	`tin` varchar(20),
	`note` varchar(255),
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `customer_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `sells_to_customers` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `customer_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `customer_id` int;--> statement-breakpoint
ALTER TABLE `customer` ADD CONSTRAINT `customer_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer` ADD CONSTRAINT `customer_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer` ADD CONSTRAINT `customer_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `customer` ADD CONSTRAINT `customer_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `customer_org_name_idx` ON `customer` (`org_id`,`name`);--> statement-breakpoint
CREATE INDEX `customer_org_phone_idx` ON `customer` (`org_id`,`phone`);--> statement-breakpoint
ALTER TABLE `transactions` ADD CONSTRAINT `transactions_customer_id_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_customer_id_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `transactions_customer_idx` ON `transactions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `stock_document_customer_idx` ON `stock_document` (`customer_id`);