CREATE TABLE "provider_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"provider" text NOT NULL,
	"sealed" text NOT NULL,
	"key_id" text NOT NULL,
	"last_four" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"rotated_at" timestamp,
	"last_used_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "provider_keys_owner_provider_idx" ON "provider_keys" USING btree ("owner","provider");