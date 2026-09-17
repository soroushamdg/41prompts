CREATE TABLE "publish_events" (
	"id" text PRIMARY KEY NOT NULL,
	"prompt" text NOT NULL,
	"version" text,
	"version_n" integer NOT NULL,
	"build_hash" text NOT NULL,
	"kind" text NOT NULL,
	"actor" text,
	"reason" text,
	"gate" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "published_artifacts" (
	"key" text PRIMARY KEY NOT NULL,
	"content_type" text NOT NULL,
	"cache_control" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "environment" text DEFAULT 'live' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "admin_only_publish" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "publish_events" ADD CONSTRAINT "publish_events_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_events" ADD CONSTRAINT "publish_events_version_prompt_versions_id_fk" FOREIGN KEY ("version") REFERENCES "public"."prompt_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_events" ADD CONSTRAINT "publish_events_actor_users_id_fk" FOREIGN KEY ("actor") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "publish_events_prompt_created_idx" ON "publish_events" USING btree ("prompt","created_at");