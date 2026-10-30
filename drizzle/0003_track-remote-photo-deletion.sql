ALTER TABLE `api_usage` ADD `deleted_at` integer;--> statement-breakpoint
CREATE INDEX `api_usage_cleanup_idx` ON `api_usage` (`deleted_at`,`created_at`);