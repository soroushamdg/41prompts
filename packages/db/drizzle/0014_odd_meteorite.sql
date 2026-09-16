ALTER TABLE "provider_keys" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD COLUMN "test_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD COLUMN "last_tested_at" timestamp;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD COLUMN "last_test_ok" boolean;--> statement-breakpoint
ALTER TABLE "provider_keys" ADD COLUMN "last_test_detail" text;