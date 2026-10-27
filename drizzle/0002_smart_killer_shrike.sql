CREATE TABLE `oauth_accounts` (
	`provider` text NOT NULL,
	`provider_user_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`provider`, `provider_user_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `oauth_accounts_user_idx` ON `oauth_accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `photos` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`iv` text NOT NULL,
	`data` blob NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `photos_user_idx` ON `photos` (`user_id`,`kind`);--> statement-breakpoint
CREATE TABLE `youcam_files` (
	`file_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `youcam_files_user_idx` ON `youcam_files` (`user_id`);--> statement-breakpoint
DROP INDEX "api_usage_user_idx";--> statement-breakpoint
DROP INDEX "api_usage_task_idx";--> statement-breakpoint
DROP INDEX "saved_checks_user_idx";--> statement-breakpoint
DROP INDEX "sessions_user_idx";--> statement-breakpoint
DROP INDEX "users_email_idx";--> statement-breakpoint
ALTER TABLE `users` ALTER COLUMN "password_hash" TO "password_hash" text;--> statement-breakpoint
CREATE INDEX `api_usage_user_idx` ON `api_usage` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `api_usage_task_idx` ON `api_usage` (`task_id`);--> statement-breakpoint
CREATE INDEX `saved_checks_user_idx` ON `saved_checks` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);--> statement-breakpoint
ALTER TABLE `users` ADD `email_verified` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `store_photos` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `photo_key` text;--> statement-breakpoint
ALTER TABLE `api_usage` ADD `result_url` text;