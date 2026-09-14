CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"prompt" text NOT NULL,
	"payload" jsonb NOT NULL,
	"prompt_hash" text NOT NULL,
	"input_hash" text NOT NULL,
	"model" text NOT NULL,
	"params" jsonb NOT NULL,
	"latency_ms" integer NOT NULL,
	"cost_cents" integer,
	"purge_after" timestamp NOT NULL,
	"cache_key" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_prompt_prompts_id_fk" FOREIGN KEY ("prompt") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "runs_purge_after_idx" ON "runs" USING btree ("purge_after");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_owner_cache_key_idx" ON "runs" USING btree ("owner","cache_key");