CREATE TABLE `contact_message` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`email` varchar(255) NOT NULL,
	`phone` varchar(30),
	`company` varchar(120),
	`subject` varchar(150) NOT NULL,
	`message` text NOT NULL,
	`locale` varchar(5),
	`status` enum('new','handled') NOT NULL DEFAULT 'new',
	`admin_note` varchar(500),
	`handled_by` varchar(255),
	`handled_at` datetime,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `contact_message_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `platform_bank_account` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bank_name` varchar(80) NOT NULL,
	`account_name` varchar(120) NOT NULL,
	`account_number` varchar(40) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `platform_bank_account_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `package` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(60) NOT NULL,
	`slug` varchar(60) NOT NULL,
	`description` varchar(255),
	`price` decimal(12,2) NOT NULL,
	`billing_months` int NOT NULL DEFAULT 1,
	`max_users` int,
	`max_branches` int,
	`trial_days` int NOT NULL DEFAULT 14,
	`highlights` longtext,
	`is_featured` boolean NOT NULL DEFAULT false,
	`sort_order` int NOT NULL DEFAULT 0,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_by` varchar(255),
	`updated_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	`deleted_at` datetime,
	`deleted_by` varchar(255),
	CONSTRAINT `package_id` PRIMARY KEY(`id`),
	CONSTRAINT `package_name_idx` UNIQUE(`name`),
	CONSTRAINT `package_slug_idx` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `subscription` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`package_id` int NOT NULL,
	`started_on` date NOT NULL,
	`trial_ends_on` date,
	`paid_until` date NOT NULL,
	`complimentary` boolean NOT NULL DEFAULT false,
	`suspended_at` datetime,
	`suspended_reason` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `subscription_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_org_idx` UNIQUE(`org_id`)
);
--> statement-breakpoint
CREATE TABLE `subscription_payment` (
	`id` int AUTO_INCREMENT NOT NULL,
	`org_id` int NOT NULL,
	`package_id` int NOT NULL,
	`amount` decimal(12,2) NOT NULL,
	`months` int NOT NULL,
	`method` enum('chapa','bank','manual') NOT NULL,
	`status` enum('pending','paid','failed','rejected','cancelled') NOT NULL DEFAULT 'pending',
	`tx_ref` varchar(64),
	`bank_account_id` int,
	`receipt_file` varchar(100),
	`payer_reference` varchar(100),
	`note` varchar(255),
	`period_start` date,
	`period_end` date,
	`paid_at` datetime,
	`reviewed_by` varchar(255),
	`reviewed_at` datetime,
	`review_note` varchar(255),
	`created_by` varchar(255),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP(3) on update CURRENT_TIMESTAMP(3),
	CONSTRAINT `subscription_payment_id` PRIMARY KEY(`id`),
	CONSTRAINT `subscription_payment_tx_ref_idx` UNIQUE(`tx_ref`)
);
--> statement-breakpoint
ALTER TABLE `user` ADD `site_admin` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `contact_message` ADD CONSTRAINT `contact_message_handled_by_user_id_fk` FOREIGN KEY (`handled_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_bank_account` ADD CONSTRAINT `platform_bank_account_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_bank_account` ADD CONSTRAINT `platform_bank_account_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_bank_account` ADD CONSTRAINT `platform_bank_account_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `package` ADD CONSTRAINT `package_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `package` ADD CONSTRAINT `package_updated_by_user_id_fk` FOREIGN KEY (`updated_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `package` ADD CONSTRAINT `package_deleted_by_user_id_fk` FOREIGN KEY (`deleted_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription` ADD CONSTRAINT `subscription_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription` ADD CONSTRAINT `subscription_package_id_package_id_fk` FOREIGN KEY (`package_id`) REFERENCES `package`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payment` ADD CONSTRAINT `subscription_payment_org_id_organization_id_fk` FOREIGN KEY (`org_id`) REFERENCES `organization`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payment` ADD CONSTRAINT `subscription_payment_package_id_package_id_fk` FOREIGN KEY (`package_id`) REFERENCES `package`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payment` ADD CONSTRAINT `subscription_payment_reviewed_by_user_id_fk` FOREIGN KEY (`reviewed_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payment` ADD CONSTRAINT `subscription_payment_created_by_user_id_fk` FOREIGN KEY (`created_by`) REFERENCES `user`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subscription_payment` ADD CONSTRAINT `subscription_payment_bank_account_fk` FOREIGN KEY (`bank_account_id`) REFERENCES `platform_bank_account`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `contact_message_status_idx` ON `contact_message` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `subscription_payment_org_idx` ON `subscription_payment` (`org_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `subscription_payment_status_idx` ON `subscription_payment` (`status`);