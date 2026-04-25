CREATE TABLE IF NOT EXISTS `printer` (
	`id` text PRIMARY KEY NOT NULL,
	`outlet_id` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`type` text DEFAULT 'cashier' NOT NULL,
	`connection` text DEFAULT 'usb' NOT NULL,
	`address` text,
	`paper_width` integer DEFAULT 32 NOT NULL,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`synced_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`outlet_id`) REFERENCES `outlet`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `printer_outlet_idx` ON `printer` (`outlet_id`);
