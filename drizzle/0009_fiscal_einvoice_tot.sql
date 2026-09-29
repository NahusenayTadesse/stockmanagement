CREATE TABLE `fiscal_device` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`branch_id` int,
	`name` varchar(100),
	`kind` enum('manual','datecs_tcp','http_bridge'),
	`machine_code` varchar(30),
	`serial_number` varchar(40),
	`host` varchar(120),
	`port` int,
	`bridge_url` varchar(255),
	`bridge_token` varchar(512),
	`operator_code` varchar(10),
	`operator_password` varchar(512),
	`till_number` int,
	`tax_groups` varchar(120),
	`auto_print` boolean,
	`is_active` boolean,
	`last_status` varchar(255),
	`last_checked_at` datetime,
	`last_z_report_at` datetime,
	`created_at` timestamp DEFAULT (now()),
	`deleted_at` datetime,
	CONSTRAINT `fiscal_device_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `organization` ADD `tot_rate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `organization` ADD `einvoice_mode` enum('sandbox','live');--> statement-breakpoint
ALTER TABLE `organization` ADD `einvoice_endpoint` varchar(255);--> statement-breakpoint
ALTER TABLE `organization` ADD `einvoice_token_url` varchar(255);--> statement-breakpoint
ALTER TABLE `organization` ADD `einvoice_client_id` varchar(120);--> statement-breakpoint
ALTER TABLE `organization` ADD `einvoice_secret` varchar(512);--> statement-breakpoint
ALTER TABLE `item` ADD `tot_rate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `fiscal_device_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `fiscal_receipt_number` varchar(30);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `fiscal_machine_code` varchar(30);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `fiscal_status` enum('pending','printed','manual','failed');--> statement-breakpoint
ALTER TABLE `stock_document` ADD `fiscal_printed_at` datetime;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `fiscal_error` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `einvoice_status` enum('submitted','accepted','rejected','failed','cancelled');--> statement-breakpoint
ALTER TABLE `stock_document` ADD `einvoice_irn` varchar(120);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `einvoice_qr` text;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `einvoice_submitted_at` datetime;--> statement-breakpoint
ALTER TABLE `stock_document` ADD `einvoice_error` varchar(255);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `einvoice_response` text;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `tot_rate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `fiscal_device` ADD CONSTRAINT `fiscal_device_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `fiscal_device` ADD CONSTRAINT `fiscal_device_branch_id_branch_id_fk` FOREIGN KEY (`branch_id`) REFERENCES `branch`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_fiscal_device_id_fiscal_device_id_fk` FOREIGN KEY (`fiscal_device_id`) REFERENCES `fiscal_device`(`id`) ON DELETE set null ON UPDATE no action;