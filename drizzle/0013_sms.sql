CREATE TABLE `sms_message` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`phone` varchar(20) NOT NULL,
	`body` text NOT NULL,
	`kind` varchar(30) NOT NULL,
	`status` enum('sent','failed','skipped','dry_run') NOT NULL,
	`error` varchar(255),
	`units` int,
	`customer_id` int,
	`supplier_id` int,
	`link` varchar(120),
	`created_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sms_message_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `sms_enabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `sms_sales` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `sms_payments` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `sms_alert_phones` varchar(255);--> statement-breakpoint
ALTER TABLE `organization` ADD `sms_signature` varchar(40);--> statement-breakpoint
ALTER TABLE `sms_message` ADD CONSTRAINT `sms_message_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_message` ADD CONSTRAINT `sms_message_customer_id_customer_id_fk` FOREIGN KEY (`customer_id`) REFERENCES `customer`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_message` ADD CONSTRAINT `sms_message_supplier_id_supplier_id_fk` FOREIGN KEY (`supplier_id`) REFERENCES `supplier`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sms_message` ADD CONSTRAINT `sms_message_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `sms_message_org_idx` ON `sms_message` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sms_message_customer_idx` ON `sms_message` (`customer_id`);