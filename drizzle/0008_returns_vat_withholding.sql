ALTER TABLE `serial_unit` MODIFY COLUMN `status` enum('in_stock','issued','leased','maintenance','disposed','returned') NOT NULL DEFAULT 'in_stock';--> statement-breakpoint
ALTER TABLE `stock_document` MODIFY COLUMN `type` enum('receipt','issue','transfer','adjustment','sales_return','purchase_return') NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_movement` MODIFY COLUMN `kind` enum('receipt','issue','transfer_out','transfer_in','adjustment_in','adjustment_out','sales_return','purchase_return') NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `vat_registered` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `vat_rate` decimal(5,2) DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `withholding_agent` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `withholding_rate` decimal(5,2) DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE `organization` ADD `withholding_threshold` decimal(14,2) DEFAULT 10000 NOT NULL;--> statement-breakpoint
ALTER TABLE `supplier` ADD `vat_registered` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `customer` ADD `withholds_tax` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `item` ADD `tax_code` enum('standard','zero','exempt') DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `withheld` decimal(14,2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `transactions` ADD `withholding_receipt` varchar(60);--> statement-breakpoint
ALTER TABLE `stock_document` ADD `return_of_id` int;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `vat_rate` decimal(5,2);--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `return_of_line_id` int;--> statement-breakpoint
ALTER TABLE `stock_document` ADD CONSTRAINT `stock_document_return_of_id_stock_document_id_fk` FOREIGN KEY (`return_of_id`) REFERENCES `stock_document`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD CONSTRAINT `stock_document_line_return_of_line_id_stock_document_line_id_fk` FOREIGN KEY (`return_of_line_id`) REFERENCES `stock_document_line`(`id`) ON DELETE restrict ON UPDATE no action;