ALTER TABLE `customer` ADD `credit_limit` decimal(14,2);--> statement-breakpoint
ALTER TABLE `customer` ADD `credit_days` int DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE `stock_document_line` ADD `unit_price` decimal(18,4);