ALTER TABLE `order_item` ADD `voided_at` text;--> statement-breakpoint
ALTER TABLE `order_item` ADD `voided_by` text;--> statement-breakpoint
ALTER TABLE `order_item` ADD `voided_by_name` text;--> statement-breakpoint
ALTER TABLE `order_item` ADD `void_reason` text;--> statement-breakpoint
CREATE INDEX `order_item_voided_idx` ON `order_item` (`voided_at`);--> statement-breakpoint
ALTER TABLE `product` ADD `hpp_cached` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `user` ADD `username` text;--> statement-breakpoint
ALTER TABLE `user` ADD `display_username` text;--> statement-breakpoint
CREATE UNIQUE INDEX `user_username_unique` ON `user` (`username`);