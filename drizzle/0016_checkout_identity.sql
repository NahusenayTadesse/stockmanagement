CREATE TABLE `pos_checkout` (
  `id` int AUTO_INCREMENT NOT NULL,
  `org_id` int NOT NULL,
  `request_key` varchar(36) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  `payload_hash` varchar(64) NOT NULL,
  `result` text,
  `created_at` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `pos_checkout_id` PRIMARY KEY (`id`),
  CONSTRAINT `pos_checkout_request_idx` UNIQUE (`org_id`, `request_key`),
  CONSTRAINT `pos_checkout_org_fk` FOREIGN KEY (`org_id`) REFERENCES `organization` (`id`) ON DELETE CASCADE,
  CONSTRAINT `pos_checkout_user_fk` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE RESTRICT
);
